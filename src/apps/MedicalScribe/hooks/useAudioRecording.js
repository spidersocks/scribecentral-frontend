import { useRef, useCallback, useEffect } from 'react';
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

  const persistedCountRef = useRef(0);

  if (activeConsultation?.ownerUserId) {
    ownerUserIdRef.current = activeConsultation.ownerUserId;
  }
  if (activeConsultation) {
    sessionStateRef.current = activeConsultation.sessionState;
  }

  // Persist a finalized segment to the backend (no entities)
  // FIXED: Now swaps the temporary WebSocket ID with the permanent Backend ID on success.
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
          responseData: res.data
        });
        return false;
      }

      // --- ID SWAP LOGIC START ---
      // The segment currently exists in our local Map under `segment.id` (WS ResultId).
      // The backend has just returned the authoritative ID (UUID).
      // We must update the local Map to use the authoritative ID so that polling updates (Diarization)
      // can correctly find and update this segment later.
      const backendId = res.data?.id ?? res.data?.segment_id;
      
      if (backendId && String(backendId) !== String(segment.id)) {
        setConsultations((prev) => prev.map((c) => {
          if (c.id !== activeConsultationId) return c;
          const oldMap = c.transcriptSegments;
          if (!oldMap.has(segment.id)) return c;

          // Rebuild the map to preserve insertion order (critical for transcript display flow)
          const newMap = new Map();
          for (const [key, val] of oldMap) {
            if (key === segment.id) {
              // Replace key with backendId, and update the object's ID field
              const updatedVal = { ...val, id: String(backendId) };
              newMap.set(String(backendId), updatedVal);
            } else {
              newMap.set(key, val);
            }
          }
          return { ...c, transcriptSegments: newMap };
        }));
      }
      // --- ID SWAP LOGIC END ---

      persistedCountRef.current += 1;
      return true;
    } catch (e) {
      console.error("[useAudioRecording] Failed to persist transcript segment:", e);
      return false;
    }
  }, [activeConsultationId, setConsultations]);

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
    // Ensure local final segments have a sequence too (though usually this path is fallback)
    finalSegment._sequence = baseIndex;

    const newSegments = new Map(activeConsultation.transcriptSegments);
    newSegments.set(id, finalSegment);

    updateConsultation(activeConsultationId, {
      transcriptSegments: newSegments,
      interimTranscript: '',
      interimSpeaker: null
    });

    await persistFinalSegment(finalSegment, baseIndex, activeConsultation.language || "en-US");
  }, [activeConsultation, activeConsultationId, updateConsultation, persistFinalSegment]);

  // MOVE UP: persistAllSegments must be initialized before stopSession uses it
  const persistAllSegments = useCallback(async () => {
    if (!activeConsultation) return { attempted: 0, succeeded: 0 };
    const ordered = Array.from(activeConsultation.transcriptSegments.values()).map((seg, idx) => ({
      seg,
      seq: idx
    }));

    let success = 0;
    for (const { seg, seq } of ordered) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await persistFinalSegment(seg, seq, activeConsultation.language || "en-US");
      if (ok) success += 1;
    }
    return { attempted: ordered.length, succeeded: success };
  }, [activeConsultation, activeConsultationId, persistFinalSegment]);

  // MOVE UP: stopSession must be available for startMicrophone catch
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

    try {
      if (activeConsultation.transcriptSegments.size > 0) {
        await handleGenerateNote();
      }
    } catch (err) {
      console.error("[useAudioRecording] Note generation failed (patch order):", err);
    }

    try {
      const localCount = activeConsultation.transcriptSegments.size;

      if (localCount > 0) {
        const res = await apiClient.listTranscriptSegments({
          token: undefined,
          consultationId: activeConsultationId,
          signal: undefined
        });
        const serverCount = res.ok && Array.isArray(res.data) ? res.data.length : 0;

        if (serverCount < localCount) {
          await persistAllSegments();
        }
      }
    } catch (err) {
      console.error("[useAudioRecording] Backfill check failed:", err);
    }

    try {
      apiClient
        .enrichTranscriptSegments({ consultationId: activeConsultationId, force: false })
        .then(() => {})
        .catch((e) => {
          console.warn("[useAudioRecording] Enrichment cache request failed", e);
        });
    } catch (e) {}
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeInterimSegment, persistAllSegments]);

  // Now safe: references stopSession in catch
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
      // Safe now: stopSession is initialized
      stopSession(false);
    }
  }, [activeConsultation, activeConsultationId, updateConsultation, stopSession]);

  const startSession = useCallback(async () => {
    if (!activeConsultation) return;
    resetConsultation(activeConsultationId);
    updateConsultation(activeConsultationId, {
      sessionState: 'connecting',
      connectionStatus: 'connecting',
      activeTab: 'transcript'
    });

    try {
      // Build WS URL: prefer env var; otherwise derive from API URL with correct protocol.
      const buildWsUrl = () => {
        if (BACKEND_WS_URL) return BACKEND_WS_URL;
        if (BACKEND_API_URL) {
          const api = new URL(BACKEND_API_URL);
          const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${wsProto}//${api.host}/client-transcribe`;
        }
        // Fallback (dev): localhost client-transcribe
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProto}//localhost:8000/client-transcribe`;
      };

      const url = new URL(buildWsUrl());
      if (activeConsultation.language) {
        url.searchParams.set('language_code', activeConsultation.language);
      }

      const ws = new WebSocket(url.toString());
      websocketRef.current = ws;

      ws.onopen = () => {
        console.info("[useAudioRecording] WebSocket connection established", url.toString());
        updateConsultation(activeConsultationId, { connectionStatus: 'connected' });
        startMicrophone();
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          const results = data.Transcript?.Results ?? [];
          if (!results.length) return;

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

              // Tag with sequence for fallback matching
              const sequenceNumber = baseIndex + idx;
              uiSegment._sequence = sequenceNumber;

              newSegments.set(uiSegment.id, uiSegment);

              segmentsToPersist.push({
                ui: uiSegment,
                sequenceNumber: sequenceNumber,
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
    persistFinalSegment,
    stopSession
  ]);

  const handlePause = useCallback(async () => {
    await finalizeInterimSegment();
    updateConsultation(activeConsultationId, { sessionState: 'paused' });
  }, [activeConsultationId, updateConsultation, finalizeInterimSegment]);

  const handleResume = useCallback(() => {
    updateConsultation(activeConsultationId, { sessionState: 'recording' });
  }, [activeConsultationId, updateConsultation]);

  const handleGenerateNote = useCallback(async (noteTypeOverride) => {
    if (!activeConsultation) return;
    const rawSelectedType = noteTypeOverride || activeConsultation.noteType;

    let templateId = null;
    let noteTypeToUse = rawSelectedType;

    if (typeof rawSelectedType === "string" && rawSelectedType.startsWith("template:")) {
      const parts = rawSelectedType.split(":", 2);
      templateId = parts[1] ?? null;
      noteTypeToUse = "standard";
    }

    let transcript = '';
    Array.from(activeConsultation.transcriptSegments.values()).forEach((seg) => {
      transcript += `[${getFriendlySpeakerLabel(seg.speaker, activeConsultation.speakerRoles)}]: ${seg.displayText}\n`;
    });

    if (!transcript.trim()) {
      console.warn("[useAudioRecording] Generate note requested but transcript is empty.");
      return;
    }

    const hadExistingNotes = Boolean(activeConsultation.notes);

    updateConsultation(activeConsultationId, { loading: true, error: null });

    try {
      const encounterTime =
        activeConsultation.createdAt ||
        activeConsultation.notesCreatedAt ||
        new Date().toISOString();

      const profile = activeConsultation.patientProfile || {};
      const patientInfo = {};

      if (profile.name) patientInfo.name = profile.name;
      if (profile.sex) patientInfo.sex = profile.sex;
      if (profile.dateOfBirth) {
        try {
          const ageVal = calculateAge(profile.dateOfBirth);
          if (ageVal !== null && ageVal !== undefined) {
            patientInfo.age = String(ageVal);
          }
        } catch {}
      }
      if (profile.referringPhysician) patientInfo.referring_physician = profile.referringPhysician;
      if (activeConsultation.additionalContext) patientInfo.additional_context = activeConsultation.additionalContext;

      const requestBody = {
        full_transcript: transcript,
        note_type: noteTypeToUse,
        encounter_time: encounterTime,
      };
      if (templateId) requestBody.template_id = templateId;
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
        noteType: rawSelectedType,
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

  const debugTranscriptSegments = useCallback(() => {}, []);

  // NEW: expose a helper used by App.jsx debug button
  const syncAllTranscriptSegments = useCallback(async () => {
    return await persistAllSegments();
  }, [persistAllSegments]);

  // Polling for speaker diarization updates (Semantic Diarization)
  useEffect(() => {
    const isSessionActive = 
      activeConsultation?.sessionState === 'recording' || 
      activeConsultation?.sessionState === 'paused';

    if (!activeConsultationId || !isSessionActive) return;

    const POLL_INTERVAL = 5000; // 5 seconds

    const poll = async () => {
      try {
        // Fetch latest segments to get updated speaker labels
        const res = await apiClient.listTranscriptSegments({
          consultationId: activeConsultationId,
          includeEntities: false 
        });

        if (res.ok && Array.isArray(res.data)) {
          // Log sample of first remote segment to verify property names
          if (res.data.length > 0) {
            console.debug("[useAudioRecording][poll] Sample remote segment:", {
              segment_id: res.data[0].segment_id,
              id: res.data[0].id,
              sequence_number: res.data[0].sequence_number,
              speaker_role: res.data[0].speaker_role,
              speaker_label: res.data[0].speaker_label,
              speaker: res.data[0].speaker,
              has_text: !!res.data[0].original_text || !!res.data[0].text
            });
          }

          let polledCount = 0;
          let matchedCount = 0;
          let updatedCount = 0;
          let unmatchedSegments = [];

          setConsultations(prevConsultations => {
            return prevConsultations.map(c => {
              if (c.id !== activeConsultationId) return c;

              const localMap = c.transcriptSegments;
              let hasChanges = false;
              // Clone map to allow mutation
              const newMap = new Map(localMap);

              // Build a sequence lookup for fallback matching
              // This is critical because live segments (WebSocket) usually have a different ID 
              // than backend segments until the swap happens. 
              // _sequence is the robust invariant.
              const seqToId = new Map();
              for (const [id, seg] of newMap.entries()) {
                if (typeof seg._sequence === 'number') {
                  seqToId.set(seg._sequence, id);
                }
              }

              res.data.forEach(remoteSeg => {
                polledCount++;

                // Backend might return snake_case or different ID fields
                const rawId = remoteSeg.segment_id ?? remoteSeg.id;
                
                // Skip if ID is missing
                if (!rawId) {
                  console.warn("[useAudioRecording][poll] Remote segment missing ID:", remoteSeg);
                  return;
                }
                
                // Convert to string to match local segment ID format (same as mapSegmentsToUiMap)
                const remoteId = String(rawId);
                
                // 1. Try matching by ID (Backend ID)
                // This works if the "ID swap" in persistFinalSegment has already happened.
                let localId = newMap.has(remoteId) ? remoteId : null;
                let matchMethod = localId ? 'id' : null;

                // 2. Fallback: Try matching by sequence number
                // This handles cases where ID swap hasn't happened yet or we have a WebSocket ID.
                if (!localId && typeof remoteSeg.sequence_number === 'number') {
                  localId = seqToId.get(remoteSeg.sequence_number);
                  if (localId) matchMethod = 'sequence';
                }

                if (localId) {
                  matchedCount++;
                  const localSeg = newMap.get(localId);
                  
                  // Prefer speaker_role (e.g. "Doctor"), fall back to speaker_label, then speaker
                  const remoteSpeaker = remoteSeg.speaker_role ?? remoteSeg.speaker_label ?? remoteSeg.speaker ?? null;
                  
                  // If remote has a label and it's different from local, update it
                  if (remoteSpeaker && remoteSpeaker !== localSeg.speaker) {
                    console.debug("[useAudioRecording][poll] Updating speaker:", {
                      localId,
                      matchMethod,
                      oldSpeaker: localSeg.speaker,
                      newSpeaker: remoteSpeaker,
                      remoteId,
                      sequence: remoteSeg.sequence_number
                    });
                    newMap.set(localId, {
                      ...localSeg,
                      speaker: remoteSpeaker
                    });
                    hasChanges = true;
                    updatedCount++;
                  }
                } else {
                  // Track unmatched segments for debugging
                  unmatchedSegments.push({
                    remoteId,
                    sequence: remoteSeg.sequence_number,
                    speaker: remoteSeg.speaker_role ?? remoteSeg.speaker_label ?? remoteSeg.speaker
                  });
                }
              });

              if (!hasChanges) return c;
              
              return {
                ...c,
                transcriptSegments: newMap
              };
            });
          });

          // Log summary of polling result
          console.info(`[useAudioRecording][poll] Summary: Polled ${polledCount} segments, matched ${matchedCount}, updated ${updatedCount}`);
          
          // Log details about unmatched segments if any
          if (unmatchedSegments.length > 0) {
            console.debug("[useAudioRecording][poll] Unmatched segments:", {
              count: unmatchedSegments.length,
              samples: unmatchedSegments.slice(0, 3),
              reason: "These remote segments could not be matched to local segments by ID or sequence number"
            });
          }
        } else if (!res.ok) {
          console.warn("[useAudioRecording][poll] Failed to fetch segments:", {
            status: res.status,
            error: res.error?.message
          });
        }
      } catch (err) {
        console.debug("[useAudioRecording] Speaker poll error", err);
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [activeConsultationId, activeConsultation?.sessionState, setConsultations]);

  return {
    startSession,
    stopSession,
    handlePause,
    handleResume,
    handleGenerateNote,
    finalizeInterimSegment,
    debugTranscriptSegments,
    syncAllTranscriptSegments
  };
};