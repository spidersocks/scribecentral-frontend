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
  accessToken // NEW: Accept access token for authenticated API calls
) => {
  const websocketRef = useRef(null);
  const audioContextRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const sessionStateRef = useRef('idle');
  const ownerUserIdRef = useRef(null);
  const segmentCountRef = useRef(0); // NEW: Track local sequence number

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
      // console.debug("[useAudioRecording] Persisting segment:", { sequenceNumber, id: segment.id, text: segment.text });
      
      const payload = {
        sequence_number: sequenceNumber,
        speaker_label: segment.speaker ?? null,
        original_text: segment.text ?? "",
        translated_text: segment.translatedText ?? null,
        detected_language: detectedLanguage ?? null,
        start_time_ms: segment.startTimeMs ?? null,
        end_time_ms: segment.endTimeMs ?? null,
      };

      // IMMEDIATE POST to backend
      const res = await apiClient.createTranscriptSegment({
        token: accessToken, // Use the token!
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
        // console.debug(`[useAudioRecording] Swapping ID: ${segment.id} -> ${backendId}`);
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
    // Use current ref count for sequence
    const sequenceNumber = segmentCountRef.current;
    segmentCountRef.current += 1;

    const finalSegment = {
      id,
      speaker: activeConsultation.interimSpeaker,
      text,
      entities: [],
      translatedText: null,
      displayText: text,
      _sequence: sequenceNumber // Tag for matching
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

  // MOVE UP: persistAllSegments must be initialized before stopSession uses it
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
    
    // Check if we need to backfill segments (unlikely with immediate persistence, but safe to keep)
    try {
      apiClient.enrichTranscriptSegments({ 
        token: accessToken, 
        consultationId: activeConsultationId, 
        force: false 
      }).catch((e) => {
         console.warn("[useAudioRecording] Enrichment cache request failed", e);
      });
    } catch (e) {}
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeInterimSegment, persistAllSegments, accessToken]);

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

    // Initialize sequence tracking based on existing segments
    segmentCountRef.current = activeConsultation.transcriptSegments.size;

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

          const segmentsToPersist = []; // Collect finalized segments here
          let interimTranscript = '';
          let interimSpeaker = null;
          let hasShownHint = false;

          // 1. Calculate updates OUTSIDE state updater to get segments for immediate persistence
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
              return; // Don't persist partials
            }

            // Finalized segment handling
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

            // Assign sequence number immediately using Ref
            const sequenceNumber = segmentCountRef.current;
            segmentCountRef.current += 1;
            uiSegment._sequence = sequenceNumber;

            // Mark for UI update AND persistence
            segmentsToPersist.push({
              ui: uiSegment,
              sequenceNumber: sequenceNumber,
              detectedLanguage: result.LanguageCode || activeConsultation.language || "en-US"
            });

            if (currentSpeaker) hasShownHint = true;
          });

          // 2. Update UI state with all processed segments (and updated interim)
          setConsultations((prevConsultations) => {
            return prevConsultations.map((c) => {
              if (c.id !== activeConsultationId) return c;

              const newSegments = new Map(c.transcriptSegments || []);
              
              // Add/Update final segments in the map
              segmentsToPersist.forEach(({ ui }) => {
                newSegments.set(ui.id, ui);
              });
              
              // Only update hasShownHint if it changed to true
              const updatedHint = c.hasShownHint || hasShownHint;

              return {
                ...c,
                transcriptSegments: newSegments,
                interimTranscript: interimTranscript || "", // Clear if no partial
                interimSpeaker: interimSpeaker || null,
                hasShownHint: updatedHint,
              };
            });
          });

          // 3. IMMEDIATE PERSISTENCE (Optimistic)
          // Fire API calls immediately. We don't await them blocking the loop; we fire parallel requests.
          segmentsToPersist.forEach(({ ui, sequenceNumber, detectedLanguage }) => {
             // console.debug(`[useAudioRecording] Immediate persist trigger for seq ${sequenceNumber}`);
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
    accessToken // Dependency updated
  ]);

  const handlePause = useCallback(async () => {
    await finalizeInterimSegment();
    updateConsultation(activeConsultationId, { sessionState: 'paused' });
  }, [activeConsultationId, updateConsultation, finalizeInterimSegment]);

  const handleResume = useCallback(() => {
    updateConsultation(activeConsultationId, { sessionState: 'recording' });
  }, [activeConsultationId, updateConsultation]);

  const handleGenerateNote = useCallback(async (noteTypeOverride) => {
    // ... existing generation logic ...
    // Pass accessToken implicitly if apiClient supports it, or check if we need to pass it explicitly?
    // apiClient.js's handleGenerateNote implementation in useAudioRecording currently uses fetch() directly.
    // We should probably update it to use apiClient or at least pass headers.

    if (!activeConsultation) return;
    const rawSelectedType = noteTypeOverride || activeConsultation.noteType;
    // ... setup ...
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
      // ... payload setup ...
      const encounterTime = activeConsultation.createdAt || new Date().toISOString();
      const requestBody = {
        full_transcript: transcript,
        note_type: noteTypeOverride || activeConsultation.noteType || "standard",
        encounter_time: encounterTime,
        // ... other fields
      };
      
      // Update: Use apiClient if available or fetch with auth header
      // For now, patching fetch to include auth
      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const resp = await fetch(`${BACKEND_API_URL}/generate-final-note`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });
      
      // ... rest of response handling ...
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
      // ...
    } catch (err) {
      console.error("[useAudioRecording] Failed to generate final note:", err);
      updateConsultation(activeConsultationId, { loading: false });
    }
  }, [activeConsultation, activeConsultationId, updateConsultation, finalizeConsultationTimestamp, accessToken]);

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

    // Poll frequently (5s) to get near-realtime updates
    const POLL_INTERVAL = 5000; 

    const poll = async () => {
      try {
        // Fetch latest segments to get updated speaker labels
        // NOW USING ACCESS TOKEN
        const res = await apiClient.listTranscriptSegments({
          token: accessToken,
          consultationId: activeConsultationId,
          includeEntities: false 
        });

        if (res.ok && Array.isArray(res.data)) {
          // DEBUG: Log one sample to verify field names (e.g. speaker vs speaker_role)
          if (res.data.length > 0 && Math.random() < 0.05) { 
             console.debug("[useAudioRecording] Diarization poll sample:", res.data[0]);
          }

          setConsultations(prevConsultations => {
            return prevConsultations.map(c => {
              if (c.id !== activeConsultationId) return c;

              const localMap = c.transcriptSegments;
              let hasChanges = false;
              let updateCount = 0;
              
              // Clone map to allow mutation
              const newMap = new Map(localMap);

              // Build a sequence lookup for fallback matching
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
                
                // 1. Try matching by ID (Backend ID)
                let localId = newMap.has(remoteId) ? remoteId : null;

                // 2. Fallback: Try matching by sequence number
                if (!localId && typeof remoteSeg.sequence_number === 'number') {
                  localId = seqToId.get(remoteSeg.sequence_number);
                }

                if (localId) {
                  const localSeg = newMap.get(localId);
                  
                  // Prefer speaker_role, fall back to speaker_label, then speaker
                  const remoteSpeaker = remoteSeg.speaker_role ?? remoteSeg.speaker_label ?? remoteSeg.speaker ?? null;
                  
                  // If remote has a label and it's different from local, update it
                  if (remoteSpeaker && remoteSpeaker !== localSeg.speaker) {
                    // console.debug(`[Diarization] Updating ${localId} (seq ${remoteSeg.sequence_number}): ${localSeg.speaker} -> ${remoteSpeaker}`);
                    newMap.set(localId, {
                      ...localSeg,
                      speaker: remoteSpeaker
                    });
                    hasChanges = true;
                    updateCount++;
                  }
                }
              });

              if (updateCount > 0) {
                 console.info(`[Diarization] Updated ${updateCount} speaker labels.`);
              }

              if (!hasChanges) return c;
              
              return {
                ...c,
                transcriptSegments: newMap
              };
            });
          });
        }
      } catch (err) {
        console.debug("[useAudioRecording] Speaker poll error", err);
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [activeConsultationId, activeConsultation?.sessionState, setConsultations, accessToken]);

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