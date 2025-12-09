import { useRef, useCallback } from 'react';
import { BACKEND_WS_URL, BACKEND_API_URL, ENABLE_BACKGROUND_SYNC } from '../utils/constants';
import { getAssetPath, getFriendlySpeakerLabel, calculateAge, to16BitPCM } from '../utils/helpers';
import { apiClient } from "../utils/apiClient";

/**
 * Custom hook for audio recording and real-time transcription
 */
export const useAudioRecording = (
  activeConsultation,
  activeConsultationId,
  updateConsultation,
  resetConsultation,
  setConsultations,
  finalizeConsultationTimestamp
) => {
  const websocketRef = useRef(null);
  const audioContextRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const sessionStateRef = useRef('idle');
  const ownerUserIdRef = useRef(null);

  // Track how many segments we believe are persisted server-side (best effort)
  const persistedCountRef = useRef(0);

  if (activeConsultation?.ownerUserId) {
    ownerUserIdRef.current = activeConsultation.ownerUserId;
  }
  if (activeConsultation) {
    sessionStateRef.current = activeConsultation.sessionState;
  }

  // Persist a finalized segment to the backend (no entities)
  const persistFinalSegment = useCallback(async (segment, sequenceNumber, detectedLanguage) => {
    try {
      const payload = {
        sequence_number: sequenceNumber,
        speaker_label: segment.speaker ?? null,
        original_text: segment.text ?? "",
        translated_text: segment.translatedText ?? null,
        detected_language: detectedLanguage ?? null,
        start_time_ms: segment.startTimeMs ?? null,
        end_time_ms: segment.endTimeMs ?? null,
      };

      console.info("[useAudioRecording] Persisting segment payload", {
        consultationId: activeConsultationId,
        payload
      });

      const res = await apiClient.createTranscriptSegment({
        token: undefined,
        consultationId: activeConsultationId,
        payload
      });

      if (!res.ok) {
        console.error("[useAudioRecording] Persist segment FAILED", {
          consultationId: activeConsultationId,
          status: res.status,
          errorMessage: res.error?.message,
          responseData: res.data // <- backend 422 detail should be visible now
        });
        return false;
      }
      console.info("[useAudioRecording] Persist segment OK", {
        consultationId: activeConsultationId,
        sequenceNumber,
        id: segment.id,
        segment_id: res.data?.segment_id
      });
      persistedCountRef.current += 1;
      return true;
    } catch (e) {
      console.error("[useAudioRecording] Failed to persist transcript segment:", e);
      return false;
    }
  }, [activeConsultationId]);

  // Persist a full set of segments (backfill), ordered by sequence
  const persistAllSegments = useCallback(async () => {
    if (!activeConsultation) return { attempted: 0, succeeded: 0 };
    const ordered = Array.from(activeConsultation.transcriptSegments.values()).map((seg, idx) => ({
      seg,
      seq: idx
    }));

    console.info("[useAudioRecording] Backfill persist: starting", {
      consultationId: activeConsultationId,
      count: ordered.length
    });

    let success = 0;
    for (const { seg, seq } of ordered) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await persistFinalSegment(seg, seq, activeConsultation.language || "en-US");
      if (ok) success += 1;
    }

    console.info("[useAudioRecording] Backfill persist: completed", {
      consultationId: activeConsultationId,
      attempted: ordered.length,
      succeeded: success
    });

    return { attempted: ordered.length, succeeded: success };
  }, [activeConsultation, activeConsultationId, persistFinalSegment]);

  const prepareSegmentForUi = useCallback((raw) => {
    if (!raw) return null;
    return {
      id: raw.id,
      speaker: raw.speaker || null,
      text: raw.text || "",
      displayText: raw.displayText || raw.text || "",
      translatedText: raw.translatedText || null,
      entities: Array.isArray(raw.entities) ? raw.entities : [],
    };
  }, []);

  const finalizeInterimSegment = useCallback(async () => {
    if (!activeConsultation) return;
    const text = (activeConsultation.interimTranscript || '').trim();
    if (!text) return;

    const id = `local-final-${Date.now()}`;
    const baseIndex = activeConsultation.transcriptSegments.size;

    const finalSegment = {
      id,
      speaker: activeConsultation.interimSpeaker,
      text,
      entities: [],
      translatedText: null,
      displayText: text
    };

    const newSegments = new Map(activeConsultation.transcriptSegments);
    newSegments.set(id, finalSegment);

    updateConsultation(activeConsultationId, {
      transcriptSegments: newSegments,
      interimTranscript: '',
      interimSpeaker: null
    });

    // Persist via backend API (no entities)
    await persistFinalSegment(finalSegment, baseIndex, activeConsultation.language || "en-US");
  }, [activeConsultation, activeConsultationId, updateConsultation, persistFinalSegment]);

  const startMicrophone = useCallback(async () => {
    if (!activeConsultation) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      const context = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = context;
      await context.audioWorklet.addModule(getAssetPath('/audio-processor.js'));
      const source = context.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(context, 'audio-downsampler-processor');
      audioWorkletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (
          sessionStateRef.current === 'recording' &&
          websocketRef.current?.readyState === WebSocket.OPEN
        ) {
          websocketRef.current.send(to16BitPCM(new Float32Array(event.data)));
        }
      };

      source.connect(workletNode);
      updateConsultation(activeConsultationId, { sessionState: 'recording' });
      persistedCountRef.current = 0;
    } catch (err) {
      console.error('[useAudioRecording] Microphone Error:', err);
      updateConsultation(activeConsultationId, {
        error: 'Could not access microphone. Please check browser permissions.',
        connectionStatus: 'error'
      });
      stopSession(false);
    }
  }, [activeConsultation, activeConsultationId, updateConsultation]);

  const startSession = useCallback(async () => {
    if (!activeConsultation) return;
    resetConsultation(activeConsultationId);
    updateConsultation(activeConsultationId, {
      sessionState: 'connecting',
      connectionStatus: 'connecting',
      activeTab: 'transcript'
    });

    try {
      const ws = new WebSocket(
        `ws://localhost:8000/transcribe/alibaba`
        //`${BACKEND_WS_URL}?language_code=${encodeURIComponent(activeConsultation.language)}`
      );
      websocketRef.current = ws;

      ws.onopen = () => {
        console.info("[useAudioRecording] WebSocket connection established");
        updateConsultation(activeConsultationId, { connectionStatus: 'connected' });
        startMicrophone();
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          const results = data.Transcript?.Results ?? [];
          if (!results.length) return;

          console.log(
            '[DEBUG WS] ResultIds:',
            (data.Transcript?.Results ?? []).map(r => r.ResultId),
            'IsPartial:',
            (data.Transcript?.Results ?? []).map(r => r.IsPartial),
            'Debug:',
            data._debug || null
          );

          const segmentsToPersist = [];

          setConsultations((prevConsultations) => {
            const consultation = prevConsultations.find((c) => c.id === activeConsultationId);
            if (!consultation) return prevConsultations;

            let interimTranscript = consultation.interimTranscript || '';
            let interimSpeaker = consultation.interimSpeaker || null;
            let hasShownHint = consultation.hasShownHint;
            const newSegments = new Map(consultation.transcriptSegments || []);
            const baseIndex = newSegments.size;

            results.forEach((result, idx) => {
              const alt = result.Alternatives?.[0];
              if (!alt) return;

              const transcriptText = alt.Transcript;
              const firstWord = alt.Items?.find((i) => i.Type === 'pronunciation');
              const currentSpeaker = firstWord ? firstWord.Speaker : null;
              const startTimeMs = result.StartTimeMs ?? null;
              const endTimeMs = result.EndTimeMs ?? null;

              if (result.IsPartial) {
                interimTranscript = transcriptText;
                interimSpeaker = currentSpeaker;
                return;
              }

              const uiSegment = prepareSegmentForUi({
                id: result.ResultId,
                speaker: currentSpeaker,
                text: transcriptText,
                entities: Array.isArray(data.ComprehendEntities) ? data.ComprehendEntities : [],
                translatedText: data.TranslatedText || null,
                displayText: data.DisplayText || transcriptText,
                startTimeMs,
                endTimeMs,
              });

              newSegments.set(uiSegment.id, uiSegment);

              segmentsToPersist.push({
                ui: uiSegment,
                sequenceNumber: baseIndex + idx,
                detectedLanguage: result.LanguageCode || activeConsultation.language || "en-US"
              });

              interimTranscript = '';
              interimSpeaker = null;
              if (currentSpeaker) hasShownHint = true;
            });

            return prevConsultations.map((c) =>
              c.id === activeConsultationId
                ? {
                    ...c,
                    transcriptSegments: newSegments,
                    interimTranscript,
                    interimSpeaker,
                    hasShownHint,
                  }
                : c
            );
          });

          // Persist finalized segments (no entities) via backend API
          for (const { ui, sequenceNumber, detectedLanguage } of segmentsToPersist) {
            // eslint-disable-next-line no-await-in-loop
            await persistFinalSegment(ui, sequenceNumber, detectedLanguage);
          }
        } catch (e) {
          console.error('[useAudioRecording] Error processing WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[useAudioRecording] WebSocket error:', err);
        updateConsultation(activeConsultationId, {
          error: 'Connection to the transcription service failed.',
          connectionStatus: 'error'
        });
        stopSession(false);
      };

      ws.onclose = () => {
        console.info("[useAudioRecording] WebSocket connection closed");
        updateConsultation(activeConsultationId, { connectionStatus: 'disconnected' });
      };
    } catch (e) {
      console.error('[useAudioRecording] Failed to start session:', e);
      updateConsultation(activeConsultationId, {
        error: 'Could not connect to backend. Is it running?',
        connectionStatus: 'error',
        sessionState: 'idle'
      });
    }
  }, [
    activeConsultation,
    activeConsultationId,
    resetConsultation,
    updateConsultation,
    startMicrophone,
    setConsultations,
    prepareSegmentForUi,
    persistFinalSegment
  ]);

  const handlePause = useCallback(async () => {
    await finalizeInterimSegment();
    updateConsultation(activeConsultationId, { sessionState: 'paused' });
  }, [activeConsultationId, updateConsultation, finalizeInterimSegment]);

  const handleResume = useCallback(() => {
    updateConsultation(activeConsultationId, { sessionState: 'recording' });
  }, [activeConsultationId, updateConsultation]);

  // ----------- FIX: Move handleGenerateNote above stopSession -----------
  const handleGenerateNote = useCallback(async (noteTypeOverride) => {
    if (!activeConsultation) return;
    const rawSelectedType = noteTypeOverride || activeConsultation.noteType;

    // If the selected type is a template reference (e.g. "template:<uuid>"),
    // extract the template id and use a sensible base note_type (standard) for the prompt module.
    let templateId = null;
    let noteTypeToUse = rawSelectedType;

    if (typeof rawSelectedType === "string" && rawSelectedType.startsWith("template:")) {
      const parts = rawSelectedType.split(":", 2);
      templateId = parts[1] ?? null;
      // choose a base note_type for prompt module — 'standard' is a safe default.
      noteTypeToUse = "standard";
    }

    // Build transcript for generation
    let transcript = '';
    Array.from(activeConsultation.transcriptSegments.values()).forEach((seg) => {
      transcript += `[${getFriendlySpeakerLabel(seg.speaker, activeConsultation.speakerRoles)}]: ${seg.displayText}\n`;
    });

    if (!transcript.trim()) {
      console.warn("[useAudioRecording] Generate note requested but transcript is empty.");
      return;
    }

    // Preserve current notes so UI remains usable if generation fails
    const hadExistingNotes = Boolean(activeConsultation.notes);

    // Enter loading state but do not clear existing notes
    updateConsultation(activeConsultationId, { loading: true, error: null });

    try {
      // Prefer the consultation's createdAt (the timestamp logged when recording finished).
      // Fall back to notesCreatedAt or current time if not available.
      const encounterTime =
        activeConsultation.createdAt ||
        activeConsultation.notesCreatedAt ||
        new Date().toISOString();

      // Build patient_info object for the backend/prompt
      const profile = activeConsultation.patientProfile || {};
      const patientInfo = {};

      if (profile.name) patientInfo.name = profile.name;
      if (profile.sex) patientInfo.sex = profile.sex;
      if (profile.dateOfBirth) {
        // calculateAge returns number or null; prompt expects an age string/number
        try {
          const ageVal = calculateAge(profile.dateOfBirth);
          if (ageVal !== null && ageVal !== undefined) {
            // convert to string to keep payload simple (backend accepts either)
            patientInfo.age = String(ageVal);
          }
        } catch (e) {
          // ignore if date parsing fails
        }
      }
      if (profile.referringPhysician) patientInfo.referring_physician = profile.referringPhysician;
      if (activeConsultation.additionalContext) patientInfo.additional_context = activeConsultation.additionalContext;

      const requestBody = {
        full_transcript: transcript,
        note_type: noteTypeToUse,
        encounter_time: encounterTime,
      };

      // attach template id if selecting a custom template
      if (templateId) requestBody.template_id = templateId;

      // attach patient_info only if we have any meaningful keys
      if (Object.keys(patientInfo).length > 0) {
        requestBody.patient_info = patientInfo;
      }

      const resp = await fetch(`${BACKEND_API_URL}/generate-final-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = data?.detail || `${resp.status} ${resp.statusText}`;
        throw new Error(detail);
      }

      updateConsultation(activeConsultationId, {
        notes: data.notes,
        noteType: rawSelectedType, // preserve the literal selected type in UI state (so template:... remains)
        noteId: activeConsultationId,
        notesCreatedAt: new Date().toISOString(),
        notesUpdatedAt: new Date().toISOString(),
        loading: false
      });

      if (finalizeConsultationTimestamp) {
        finalizeConsultationTimestamp(activeConsultationId);
      }
    } catch (err) {
      console.error("[useAudioRecording] Failed to generate final note:", err);
      updateConsultation(activeConsultationId, {
        loading: false
      });

      if (!hadExistingNotes) {
        console.info("[useAudioRecording] No prior notes; showing empty note state after failed generation.");
      }
    }
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeConsultationTimestamp]);
  // ----------- END FIXED POSITION -----------

  const stopSession = useCallback(async (closeSocket = true) => {
    if (!activeConsultation) return;
    if (activeConsultation.sessionState === 'stopped' || activeConsultation.sessionState === 'idle') {
      return;
    }

    updateConsultation(activeConsultationId, { sessionState: 'stopped' });

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((t) => t.stop());
      microphoneStreamRef.current = null;
    }
    if (audioContextRef.current?.state !== 'closed') {
      try { await audioContextRef.current?.close(); } catch {}
    }

    let finalized = false;

    if (closeSocket && websocketRef.current?.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(new ArrayBuffer(0));
        await new Promise((r) => setTimeout(r, 700));
        finalized = !activeConsultation.interimTranscript;
      } catch {}
      try { websocketRef.current?.close(); websocketRef.current = null; } catch {}
    }

    if (!finalized) {
      await finalizeInterimSegment();
    }

    // Generate note ONLY ONCE, right after segments are finalized
    try {
      if (activeConsultation.transcriptSegments.size > 0) {
        await handleGenerateNote();
      }
    } catch (err) {
      console.error("[useAudioRecording] Note generation failed (patch order):", err);
    }

    // Safety net: if we persisted 0 (or suspiciously few) segments during the session, backfill all
    try {
      const localCount = activeConsultation.transcriptSegments.size;
      console.info("[useAudioRecording] Stop session: persistedCount vs localCount", {
        persistedCount: persistedCountRef.current,
        localCount
      });

      if (localCount > 0) {
        const res = await apiClient.listTranscriptSegments({
          token: undefined,
          consultationId: activeConsultationId,
          signal: undefined
        });
        const serverCount = res.ok && Array.isArray(res.data) ? res.data.length : 0;
        console.info("[useAudioRecording] Server segment count at stop", {
          consultationId: activeConsultationId,
          serverCount
        });

        if (serverCount < localCount) {
          console.warn("[useAudioRecording] Detected missing server segments. Backfilling…", {
            consultationId: activeConsultationId,
            serverCount,
            localCount
          });
          await persistAllSegments();
        }
      }
    } catch (err) {
      console.error("[useAudioRecording] Backfill check failed:", err);
    }

    // Fire-and-forget enrichment cache to speed up subsequent loads
    try {
      console.info("[useAudioRecording] Kicking off enrichment cache for consultation", {
        consultationId: activeConsultationId
      });
      apiClient
        .enrichTranscriptSegments({ consultationId: activeConsultationId, force: false })
        .then((r) => {
          console.info("[useAudioRecording] Enrichment cache request completed", {
            consultationId: activeConsultationId,
            status: r?.status,
            ok: r?.ok
          });
        })
        .catch((e) => {
          console.warn("[useAudioRecording] Enrichment cache request failed", e);
        });
    } catch (e) {
      console.warn("[useAudioRecording] Failed to start enrichment caching", e);
    }
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeInterimSegment, persistAllSegments, handleGenerateNote]);

  // Optional dev debug
  const debugTranscriptSegments = useCallback(() => {}, []);

  return {
    startSession,
    stopSession,
    handlePause,
    handleResume,
    handleGenerateNote,
    finalizeInterimSegment,
    debugTranscriptSegments
  };
};