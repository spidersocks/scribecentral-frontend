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
  finalizeConsultationTimestamp,
  accessToken
) => {
  const websocketRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const sessionStateRef = useRef('idle');
  const segmentCountRef = useRef(0);
  
  // RESTORED MISSING REF
  const persistedCountRef = useRef(0); 
  
  // Track if we are currently in the "tail polling" phase
  const isTailPollingRef = useRef(false);

  // Keep ref up to date
  useEffect(() => {
    if (activeConsultation) {
      sessionStateRef.current = activeConsultation.sessionState;
    }
  }, [activeConsultation]);

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
        token: accessToken,
        consultationId: activeConsultationId,
        payload
      });

      if (!res.ok) {
        console.error("[useAudioRecording] Persist segment FAILED", {
          status: res.status,
          error: res.error?.message
        });
        return false;
      }

      // ID Swap: If backend returned a real UUID, update our local map to use it
      const backendId = res.data?.id ?? res.data?.segment_id;
      if (backendId && String(backendId) !== String(segment.id)) {
        setConsultations((prev) => prev.map((c) => {
          if (c.id !== activeConsultationId) return c;
          const oldMap = c.transcriptSegments;
          if (!oldMap.has(segment.id)) return c;

          const newMap = new Map();
          for (const [key, val] of oldMap) {
            if (key === segment.id) {
              const updatedVal = { ...val, id: String(backendId) };
              newMap.set(String(backendId), updatedVal);
            } else {
              newMap.set(key, val);
            }
          }
          return { ...c, transcriptSegments: newMap };
        }));
      }
      return true;
    } catch (e) {
      console.error("[useAudioRecording] Failed to persist transcript segment:", e);
      return false;
    }
  }, [activeConsultationId, setConsultations, accessToken]);

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
    const sequenceNumber = segmentCountRef.current;
    segmentCountRef.current += 1;

    const finalSegment = {
      id,
      speaker: activeConsultation.interimSpeaker,
      text,
      entities: [],
      translatedText: null,
      displayText: text,
      _sequence: sequenceNumber
    };

    const newSegments = new Map(activeConsultation.transcriptSegments);
    newSegments.set(id, finalSegment);

    updateConsultation(activeConsultationId, {
      transcriptSegments: newSegments,
      interimTranscript: '',
      interimSpeaker: null
    });

    await persistFinalSegment(finalSegment, sequenceNumber, activeConsultation.language || "en-US");
  }, [activeConsultation, activeConsultationId, updateConsultation, persistFinalSegment]);

  const persistAllSegments = useCallback(async () => {
    if (!activeConsultation) return { attempted: 0, succeeded: 0 };
    const ordered = Array.from(activeConsultation.transcriptSegments.values()).map((seg, idx) => ({
      seg,
      seq: typeof seg._sequence === 'number' ? seg._sequence : idx
    }));

    let success = 0;
    for (const { seg, seq } of ordered) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await persistFinalSegment(seg, seq, activeConsultation.language || "en-US");
      if (ok) success += 1;
    }
    return { attempted: ordered.length, succeeded: success };
  }, [activeConsultation, activeConsultationId, persistFinalSegment]);

  // --- SYNC HELPER ---
  const syncRemoteSegments = useCallback(async (bypassCache = false) => {
    if (!activeConsultationId) return;

    try {
      const res = await apiClient.listTranscriptSegments({
        token: accessToken,
        consultationId: activeConsultationId,
        includeEntities: false,
        bypassCache
      });

      if (res.ok && Array.isArray(res.data)) {
        setConsultations(prevConsultations => {
          return prevConsultations.map(c => {
            if (c.id !== activeConsultationId) return c;

            const localMap = c.transcriptSegments;
            let hasChanges = false;
            let updateCount = 0;
            let addCount = 0;
            
            const newMap = new Map(localMap);
            const seqToId = new Map();
            for (const [id, seg] of newMap.entries()) {
              if (typeof seg._sequence === 'number') {
                seqToId.set(seg._sequence, id);
              }
            }

            res.data.forEach(remoteSeg => {
              const rawId = remoteSeg.segment_id ?? remoteSeg.id;
              if (!rawId) return;
              const remoteId = String(rawId);
              
              // Match by ID or Sequence
              let localId = newMap.has(remoteId) ? remoteId : null;
              if (!localId && typeof remoteSeg.sequence_number === 'number') {
                const seqMatch = seqToId.get(remoteSeg.sequence_number);
                if (seqMatch) {
                  // Found by sequence, but ID is different (swap temp ID -> real ID)
                  localId = seqMatch;
                  if (localId !== remoteId) {
                    const existing = newMap.get(localId);
                    newMap.delete(localId);
                    newMap.set(remoteId, { ...existing, id: remoteId });
                    localId = remoteId;
                    hasChanges = true;
                  }
                }
              }

              if (localId) {
                // Update existing segment if data differs
                const localSeg = newMap.get(localId);
                let segChanged = false;
                const newSeg = { ...localSeg }; // clone

                // 1. Speaker
                const remoteSpeaker = remoteSeg.speaker_role ?? remoteSeg.speaker_label ?? remoteSeg.speaker;
                if (remoteSpeaker && remoteSpeaker !== localSeg.speaker) {
                  newSeg.speaker = remoteSpeaker;
                  segChanged = true;
                }
                // 2. Text
                const remoteText = remoteSeg.original_text ?? remoteSeg.text;
                if (remoteText && remoteText !== localSeg.text) {
                  newSeg.text = remoteText;
                  newSeg.displayText = remoteText;
                  segChanged = true;
                }
                // 3. Translation
                const remoteTrans = remoteSeg.translated_text;
                if (remoteTrans !== undefined && remoteTrans !== localSeg.translatedText) {
                  newSeg.translatedText = remoteTrans;
                  segChanged = true;
                }

                if (segChanged) {
                  newMap.set(localId, newSeg);
                  hasChanges = true;
                  updateCount++;
                }
              } else {
                // Add new missing segment (Tail recovery)
                const newUiSeg = {
                  id: remoteId,
                  speaker: remoteSeg.speaker_role ?? remoteSeg.speaker_label ?? remoteSeg.speaker ?? null,
                  text: remoteSeg.original_text ?? remoteSeg.text ?? "",
                  displayText: remoteSeg.original_text ?? remoteSeg.text ?? "",
                  translatedText: remoteSeg.translated_text ?? null,
                  entities: [],
                  _sequence: remoteSeg.sequence_number ?? 9999
                };
                newMap.set(remoteId, newUiSeg);
                hasChanges = true;
                addCount++;
              }
            });

            if (updateCount > 0 || addCount > 0) {
               console.info(`[Diarization] Sync for ${c.id}: Updated ${updateCount}, Added ${addCount}`);
            }

            if (!hasChanges) return c;
            return { ...c, transcriptSegments: newMap };
          });
        });
      }
    } catch (err) {
      console.error("[useAudioRecording] Sync error", err);
    }
  }, [activeConsultationId, accessToken, setConsultations]);

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

    updateConsultation(activeConsultationId, { loading: true, error: null });

    try {
      const encounterTime = activeConsultation.createdAt || new Date().toISOString();
      const profile = activeConsultation.patientProfile || {};
      const patientInfo = {};

      if (profile.name) patientInfo.name = profile.name;
      if (profile.sex) patientInfo.sex = profile.sex;
      if (profile.dateOfBirth) {
        try {
          const ageVal = calculateAge(profile.dateOfBirth);
          if (ageVal) patientInfo.age = String(ageVal);
        } catch {}
      }
      if (profile.referringPhysician) patientInfo.referring_physician = profile.referringPhysician;
      if (activeConsultation.additionalContext) patientInfo.additional_context = activeConsultation.additionalContext;

      const requestBody = {
        consultation_id: activeConsultationId,
        full_transcript: transcript,
        note_type: noteTypeToUse,
        encounter_time: encounterTime,
      };
      if (templateId) requestBody.template_id = templateId;
      if (Object.keys(patientInfo).length > 0) {
        requestBody.patient_info = patientInfo;
      }
      
      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const resp = await fetch(`${BACKEND_API_URL}/generate-final-note`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });
      
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.detail || `${resp.status} ${resp.statusText}`);
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
      updateConsultation(activeConsultationId, { loading: false });
    }
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeConsultationTimestamp, accessToken]);

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
        // Small wait for last backend ack
        await new Promise((r) => setTimeout(r, 500)); 
        finalized = !activeConsultation.interimTranscript;
      } catch {}
      try { websocketRef.current?.close(); websocketRef.current = null; } catch {}
    }

    if (!finalized) {
      await finalizeInterimSegment();
    }

    // Trigger Note Generation immediately
    try {
      if (activeConsultation.transcriptSegments.size > 0) {
        handleGenerateNote();
      }
    } catch (err) {
      console.error("[useAudioRecording] Note generation trigger failed:", err);
    }
    
    // Background tasks: Enrichment & initial sync
    try {
      apiClient.enrichTranscriptSegments({ token: accessToken, consultationId: activeConsultationId, force: false }).catch(() => {});
    } catch (e) {}

    // Fire one immediate sync
    syncRemoteSegments(true);

  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeInterimSegment, syncRemoteSegments, handleGenerateNote, accessToken]);

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
  }, [activeConsultation, activeConsultationId, updateConsultation, stopSession]);

  const startSession = useCallback(async () => {
    if (!activeConsultation) return;
    resetConsultation(activeConsultationId);
    updateConsultation(activeConsultationId, {
      sessionState: 'connecting',
      connectionStatus: 'connecting',
      activeTab: 'transcript'
    });

    segmentCountRef.current = activeConsultation.transcriptSegments.size;

    try {
      const buildWsUrl = () => {
        if (BACKEND_WS_URL) return BACKEND_WS_URL;
        if (BACKEND_API_URL) {
          const api = new URL(BACKEND_API_URL);
          const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${wsProto}//${api.host}/client-transcribe`;
        }
        return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//localhost:8000/client-transcribe`;
      };

      const url = new URL(buildWsUrl());
      if (activeConsultation.language) {
        url.searchParams.set('language_code', activeConsultation.language);
      }
      url.searchParams.set('consultation_id', activeConsultationId);

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
          let interimTranscript = '';
          let interimSpeaker = null;
          let hasShownHint = false;

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

            const sequenceNumber = segmentCountRef.current;
            segmentCountRef.current += 1;
            uiSegment._sequence = sequenceNumber;

            segmentsToPersist.push({
              ui: uiSegment,
              sequenceNumber: sequenceNumber,
              detectedLanguage: result.LanguageCode || activeConsultation.language || "en-US"
            });

            if (currentSpeaker) hasShownHint = true;
          });

          setConsultations((prevConsultations) => {
            return prevConsultations.map((c) => {
              if (c.id !== activeConsultationId) return c;
              const newSegments = new Map(c.transcriptSegments || []);
              segmentsToPersist.forEach(({ ui }) => {
                newSegments.set(ui.id, ui);
              });
              const updatedHint = c.hasShownHint || hasShownHint;
              return {
                ...c,
                transcriptSegments: newSegments,
                interimTranscript: interimTranscript || "",
                interimSpeaker: interimSpeaker || null,
                hasShownHint: updatedHint,
              };
            });
          });

          segmentsToPersist.forEach(({ ui, sequenceNumber, detectedLanguage }) => {
             persistFinalSegment(ui, sequenceNumber, detectedLanguage).catch(err => {
                console.error(`[useAudioRecording] Immediate persist failed for seq ${sequenceNumber}`, err);
             });
          });

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
    stopSession,
    accessToken
  ]);

  const handlePause = useCallback(async () => {
    await finalizeInterimSegment();
    updateConsultation(activeConsultationId, { sessionState: 'paused' });
  }, [activeConsultationId, updateConsultation, finalizeInterimSegment]);

  const handleResume = useCallback(() => {
    updateConsultation(activeConsultationId, { sessionState: 'recording' });
  }, [activeConsultationId, updateConsultation]);

  const debugTranscriptSegments = useCallback(() => {}, []);
  const syncAllTranscriptSegments = useCallback(async () => await persistAllSegments(), [persistAllSegments]);

  // LIVE POLLING: When active
  useEffect(() => {
    const isSessionActive = 
      activeConsultation?.sessionState === 'recording' || 
      activeConsultation?.sessionState === 'paused';

    if (!activeConsultationId || !isSessionActive) {
      return;
    }

    const POLL_INTERVAL = 5000;
    const intervalId = setInterval(() => syncRemoteSegments(false), POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [activeConsultationId, activeConsultation?.sessionState, syncRemoteSegments]);

  // TAIL POLLING: After stop
  // This separate effect ensures we poll aggressively even if the WS closed and stopped logic finished
  useEffect(() => {
    const isStopped = activeConsultation?.sessionState === 'stopped';
    
    if (!activeConsultationId || !isStopped) {
      isTailPollingRef.current = false;
      return;
    }

    // Only start tail polling sequence if we haven't already done it for this session stop
    // (A rough heuristic: if we just switched to stopped, run this)
    
    const runTailSequence = async () => {
      console.info("[useAudioRecording] Starting aggressive tail polling for diarization...");
      
      // Poll at 2s, 5s, 10s, 15s, 30s
      const delays = [2000, 5000, 10000, 15000, 30000];
      
      for (const delay of delays) {
        if (activeConsultationId !== activeConsultation.id) break; // Stop if user switched
        await new Promise(r => setTimeout(r, delay - (delays[delays.indexOf(delay)-1] || 0)));
        // console.debug(`[useAudioRecording] Tail poll at ${delay}ms`);
        await syncRemoteSegments(true);
      }
      console.info("[useAudioRecording] Tail polling complete.");
    };

    runTailSequence();

  }, [activeConsultation?.sessionState, activeConsultationId, syncRemoteSegments]);

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