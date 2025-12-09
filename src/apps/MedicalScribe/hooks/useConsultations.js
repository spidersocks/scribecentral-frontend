import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { DEFAULT_CONSULTATION, ENABLE_BACKGROUND_SYNC } from "../utils/constants";
import { generatePatientId, generatePatientName } from "../utils/helpers";
import { syncService } from "../utils/syncService";
import { hydrateAll } from "../utils/hydrationService";
import { apiClient } from "../utils/apiClient";

/**
 * LocalStorage keys used by the consultations hook.
 */
const STORAGE_KEYS = {
  consultations: "consultations",
  activeConsultationId: "activeConsultationId",
  patients: "patients",
  lastSyncTimestamp: "lastSyncTimestamp",
  syncVersion: "syncVersion",
};

/**
 * Convert various transcriptSegments shapes into a Map<string, Segment>
 */
const toTranscriptMap = (value) => {
  if (!value) return new Map();
  if (value instanceof Map) return value;
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
    return new Map(value);
  }
  if (typeof value === "object") {
    return new Map(Object.entries(value));
  }
  console.warn("[useConsultations] Unrecognized transcript segment format:", value);
  return new Map();
};

/**
 * Serialize a consultation for localStorage (convert Map -> Array)
 */
const serializeConsultationForStorage = (consultation) => {
  if (!consultation) return null;
  const transcriptSegments = Array.from(
    toTranscriptMap(consultation.transcriptSegments).entries()
  );
  return { ...consultation, transcriptSegments };
};

/**
 * Deserialize a consultation from localStorage
 */
const deserializeConsultationFromStorage = (raw, ownerUserId) => {
  if (!raw) return { ...DEFAULT_CONSULTATION };
  const name = raw?.name ?? raw?.title ?? DEFAULT_CONSULTATION.name;
  return {
    ...DEFAULT_CONSULTATION,
    ...raw,
    name,
    title: raw?.title ?? name,
    ownerUserId: raw?.ownerUserId ?? ownerUserId ?? null,
    patientProfile:
      raw?.patientProfile ??
      (DEFAULT_CONSULTATION.patientProfile
        ? { ...DEFAULT_CONSULTATION.patientProfile }
        : {}),
    transcriptSegments: toTranscriptMap(raw?.transcriptSegments),
    transcriptLoading: Boolean(raw?.transcriptLoading) || false,
    transcriptLoaded: Boolean(raw?.transcriptLoaded) || false,
  };
};

/**
 * Deserialize a patient from localStorage
 */
const deserializePatientFromStorage = (raw, ownerUserId) => {
  if (!raw) return null;
  const name = raw?.name ?? raw?.displayName ?? "";
  return {
    ...raw,
    name,
    displayName: raw?.displayName ?? name,
    ownerUserId: raw?.ownerUserId ?? ownerUserId ?? null,
  };
};

/**
 * Map API segments -> UI shape and return as Map
 */
const mapSegmentsToUiMap = (consultationId, items) => {
  const mapped = (items || [])
    .map((seg) => {
      const wireId = seg.segment_id ?? seg.id;
      const id = wireId ? String(wireId) : `${consultationId}-seq-${seg.sequence_number ?? 0}`;
      const speaker = seg.speaker_label ?? null;
      const original = seg.original_text ?? "";
      const translated = seg.translated_text ?? null;
      const entities = Array.isArray(seg.entities) ? seg.entities : [];
      return {
        id,
        speaker,
        text: original,
        displayText: original,
        translatedText: translated,
        entities,
        _sequence: typeof seg.sequence_number === "number" ? seg.sequence_number : 0,
      };
    })
    .sort((a, b) => a._sequence - b._sequence);

  const segmentMap = new Map();
  mapped.forEach((s) => {
    segmentMap.set(s.id, {
      id: s.id,
      speaker: s.speaker || null,
      text: s.text || "",
      displayText: s.displayText || s.text || "",
      translatedText: s.translatedText || null,
      entities: Array.isArray(s.entities) ? s.entities : [],
    });
  });
  return segmentMap;
};

/**
 * Custom hook for managing medical consultations, patients, and persistence
 */
export const useConsultations = (ownerUserId = null) => {
  console.info("[useConsultations] hook mount ownerUserId =", ownerUserId);
  const safeOwnerUserId = ownerUserId ?? null;

  const [appState, setAppState] = useState(() => {
    try {
      const savedConsultations = localStorage.getItem(STORAGE_KEYS.consultations);
      const savedActiveId = localStorage.getItem(STORAGE_KEYS.activeConsultationId);
      const savedPatients = localStorage.getItem(STORAGE_KEYS.patients);

      const consultations = savedConsultations
        ? JSON.parse(savedConsultations).map((c) =>
            deserializeConsultationFromStorage(c, safeOwnerUserId)
          )
        : [];

      const patients = savedPatients
        ? JSON.parse(savedPatients).map((p) =>
            deserializePatientFromStorage(p, safeOwnerUserId)
          )
        : [];

      return {
        consultations,
        patients,
        activeConsultationId: savedActiveId || null,
        hydrationState: {
          status: "idle",
            error: null,
          lastSynced: null,
          progress: 0,
          message: "",
          syncVersion: parseInt(localStorage.getItem(STORAGE_KEYS.syncVersion) || "0", 10),
        },
      };
    } catch (error) {
      console.error("[useConsultations] Error initializing from localStorage:", error);
      return {
        consultations: [],
        patients: [],
        activeConsultationId: null,
        hydrationState: {
          status: "idle",
          error: null,
          lastSynced: null,
          progress: 0,
          message: "",
          syncVersion: 0,
        },
      };
    }
  });

  const { consultations, patients, activeConsultationId, hydrationState } = appState;

  // Persist to localStorage when state changes
  useEffect(() => {
    try {
      if (consultations?.length >= 0) {
        const toPersist = consultations.map(serializeConsultationForStorage);
        localStorage.setItem(STORAGE_KEYS.consultations, JSON.stringify(toPersist));
      }
      if (patients?.length >= 0) {
        localStorage.setItem(STORAGE_KEYS.patients, JSON.stringify(patients));
      }
      if (activeConsultationId) {
        localStorage.setItem(STORAGE_KEYS.activeConsultationId, activeConsultationId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeConsultationId);
      }
    } catch (error) {
      console.error("[useConsultations] Error persisting state to localStorage:", error);
    }
  }, [consultations, patients, activeConsultationId]);

  /**
   * In-flight de-duplication and cooldown
   */
  const inFlight = useRef(new Map()); // key -> Promise
  const lastFetchAt = useRef(new Map()); // key -> timestamp
  const COOLDOWN_MS = 2000;

  const getConsultationById = useCallback(
    (id) => appState.consultations.find((c) => c.id === id) || null,
    [appState.consultations]
  );

  /**
   * Fetch segments with dedupe and cooldown.
   * Modified: During an active session we avoid replacing in-memory transcript with empty server snapshot.
   */
  const ensureSegmentsLoaded = useCallback(
    async (consultationId, withHighlights = true) => {
      if (!consultationId) return;

      const now = Date.now();
      const baseKey = `${consultationId}|base`;
      const richKey = `${consultationId}|rich`;

      const existing = getConsultationById(consultationId);
      const hasAnySegments = existing?.transcriptSegments && existing.transcriptSegments.size > 0;
      const hasHighlights =
        hasAnySegments &&
        Array.from(existing.transcriptSegments.values()).some(
          (s) => Array.isArray(s.entities) && s.entities.length > 0
        );
      const isActiveSession =
        !!existing &&
        ["recording", "paused", "connecting"].includes(existing.sessionState || "");

      // Active session & we already have local segments: skip remote load to prevent wipe.
      if (isActiveSession && hasAnySegments) {
        return;
      }

      // BASE FETCH: only if we don't have any segments yet (or inactive session)
      if (!hasAnySegments) {
        const last = lastFetchAt.current.get(baseKey) || 0;
        if (now - last > COOLDOWN_MS) {
            if (!inFlight.current.has(baseKey)) {
            setAppState((prev) => ({
              ...prev,
              consultations: prev.consultations.map((c) =>
                c.id === consultationId ? { ...c, transcriptLoading: true } : c
              ),
            }));

            const p = (async () => {
              const res = await apiClient.listTranscriptSegments({
                consultationId,
                includeEntities: false,
              });
              if (res.ok) {
                const segmentMap = mapSegmentsToUiMap(consultationId, res.data);
                setAppState((prev) => {
                  const updated = prev.consultations.map((c) => {
                    if (c.id !== consultationId) return c;
                    const currentMap = toTranscriptMap(c.transcriptSegments);
                    const nextSegments =
                      isActiveSession
                        ? new Map([...currentMap, ...segmentMap]) // merge if active
                        : segmentMap; // replace if idle
                    return {
                      ...c,
                      transcriptSegments: nextSegments,
                      transcriptLoaded: true,
                      transcriptLoading: false,
                    };
                  });
                  return { ...prev, consultations: updated };
                });
              } else {
                console.warn("[useConsultations] Base segment load failed", {
                  consultationId,
                  status: res.status,
                  error: res.error?.message,
                });
                setAppState((prev) => ({
                  ...prev,
                  consultations: prev.consultations.map((c) =>
                    c.id === consultationId
                      ? { ...c, transcriptLoaded: true, transcriptLoading: false }
                      : c
                  ),
                }));
              }
            })()
              .catch((e) => {
                console.error("[useConsultations] Base load exception", e);
                setAppState((prev) => ({
                  ...prev,
                  consultations: prev.consultations.map((c) =>
                    c.id === consultationId
                      ? { ...c, transcriptLoaded: true, transcriptLoading: false }
                      : c
                  ),
                }));
              })
              .finally(() => {
                inFlight.current.delete(baseKey);
                lastFetchAt.current.set(baseKey, Date.now());
              });
            inFlight.current.set(baseKey, p);
          }
          await inFlight.current.get(baseKey);
        }
      } else {
        if (!existing?.transcriptLoaded) {
          setAppState((prev) => ({
            ...prev,
            consultations: prev.consultations.map((c) =>
              c.id === consultationId ? { ...c, transcriptLoaded: true, transcriptLoading: false } : c
            ),
          }));
        }
      }

      if (!withHighlights) return;

      // RICH FETCH: only if we don't already have highlights
      if (!hasHighlights) {
        const last = lastFetchAt.current.get(richKey) || 0;
        if (now - last > COOLDOWN_MS) {
          if (!inFlight.current.has(richKey)) {
            const p = (async () => {
              const res = await apiClient.listTranscriptSegments({
                consultationId,
                includeEntities: true,
              });
              if (res.ok) {
                const segmentMap = mapSegmentsToUiMap(consultationId, res.data);
                setAppState((prev) => {
                  const updated = prev.consultations.map((c) => {
                    if (c.id !== consultationId) return c;
                    const currentMap = toTranscriptMap(c.transcriptSegments);
                    const nextSegments =
                      isActiveSession
                        ? new Map([...currentMap, ...segmentMap]) // merge if active
                        : segmentMap; // replace if idle
                    return { ...c, transcriptSegments: nextSegments };
                  });
                  return { ...prev, consultations: updated };
                });
              } else {
                console.warn("[useConsultations] Highlighted segment load failed", {
                  consultationId,
                  status: res.status,
                  error: res.error?.message,
                });
              }
            })()
              .catch((e) => console.error("[useConsultations] Rich load exception", e))
              .finally(() => {
                inFlight.current.delete(richKey);
                lastFetchAt.current.set(richKey, Date.now());
              });
            inFlight.current.set(richKey, p);
          }
          await inFlight.current.get(richKey);
        }
      }
    },
    [getConsultationById]
  );

  const runHydration = useCallback(async () => {
    if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId) {
      console.info(
        "[useConsultations] Hydration skipped - background sync disabled or no user ID"
      );
      return;
    }

    try {
      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          status: "loading",
          message: "Fetching data...",
          progress: 10,
        },
      }));

      const { patients: remotePatients, consultations: remoteConsultations, clinicalNotes } =
        await hydrateAll(safeOwnerUserId);

      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          progress: 50,
          message: "Processing data...",
        },
      }));

      if ((remotePatients?.length ?? 0) === 0 && (remoteConsultations?.length ?? 0) === 0) {
        console.info("[useConsultations] No remote data to hydrate", { safeOwnerUserId });
        setAppState((prev) => ({
          ...prev,
          hydrationState: {
            ...prev.hydrationState,
            status: "success",
            progress: 100,
            message: "No remote data found",
            lastSynced: new Date().toISOString(),
          },
        }));
        return;
      }

      const notesByConsultation = new Map();
      for (const note of clinicalNotes ?? []) {
        if (!note || !note.consultationId) continue;
        const current = notesByConsultation.get(note.consultationId) ?? null;
        const currentTimestamp = current
          ? new Date(current.updatedAt ?? current.createdAt ?? 0).getTime()
          : -Infinity;
        const nextTimestamp = new Date(
          note.updatedAt ?? note.createdAt ?? 0
        ).getTime();
        if (nextTimestamp >= currentTimestamp) {
          notesByConsultation.set(note.consultationId, note);
        }
      }

      const normalizedPatients = (remotePatients ?? []).map((patient) =>
        deserializePatientFromStorage(patient, safeOwnerUserId)
      );
      const patientProfileLookup = new Map(
        normalizedPatients.map((patient) => [patient.id, patient.profile ?? {}])
      );

      const normalizedConsultations = (remoteConsultations ?? []).map((consultation) => {
        const normalized = deserializeConsultationFromStorage(consultation, safeOwnerUserId);
        const consultationKey = normalized.id ?? normalized.consultationId ?? null;

        if (consultationKey && notesByConsultation.has(consultationKey)) {
          const note = notesByConsultation.get(consultationKey);
          let parsedContent = note.content;
          if (typeof parsedContent === "string") {
            try {
              parsedContent = JSON.parse(parsedContent);
            } catch {
              // leave as string
            }
          }
          normalized.noteId = note.id;
          normalized.noteType = note.noteType ?? normalized.noteType;
          normalized.language = note.language ?? normalized.language;
          normalized.notes = parsedContent;
          normalized.notesSummary = note.summary ?? null;
          normalized.notesStatus = note.status ?? null;
          normalized.notesCreatedAt = note.createdAt ?? note.updatedAt ?? null;
          normalized.notesUpdatedAt = note.updatedAt ?? note.createdAt ?? null;
        }

        if (!normalized.name && normalized.title) normalized.name = normalized.title;
        if (!normalized.title && normalized.name) normalized.title = normalized.name;

        if (
          (!normalized.patientProfile || Object.keys(normalized.patientProfile).length === 0) &&
          normalized.patientId &&
          patientProfileLookup.has(normalized.patientId)
        ) {
          normalized.patientProfile = {
            ...(DEFAULT_CONSULTATION?.patientProfile ?? {}),
            ...patientProfileLookup.get(normalized.patientId),
          };
        }

        normalized.transcriptSegments = new Map();
        return normalized;
      });

      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          progress: 70,
          message: "Merging data...",
        },
      }));

      const mergedPatients = [...patients];
      for (const remotePatient of normalizedPatients) {
        const localIndex = mergedPatients.findIndex((p) => p.id === remotePatient.id);
        if (localIndex >= 0) {
          const localPatient = mergedPatients[localIndex];
          const localUpdated = new Date(localPatient.updatedAt || 0).getTime();
          const remoteUpdated = new Date(remotePatient.updatedAt || 0).getTime();
          mergedPatients[localIndex] = remoteUpdated >= localUpdated ? remotePatient : localPatient;
        } else {
          mergedPatients.push(remotePatient);
        }
      }

      const mergedConsultations = [...consultations];
      for (const remoteConsultation of normalizedConsultations) {
        const localIndex = mergedConsultations.findIndex(
          (c) => c.id === remoteConsultation.id
        );
        if (localIndex >= 0) {
          const localConsultation = mergedConsultations[localIndex];
          const localUpdated = new Date(localConsultation.updatedAt || 0).getTime();
          const remoteUpdated = new Date(remoteConsultation.updatedAt || 0).getTime();

          const merged = remoteUpdated >= localUpdated
            ? { ...remoteConsultation, transcriptSegments: localConsultation.transcriptSegments }
            : { ...localConsultation };

          mergedConsultations[localIndex] = merged;
        } else {
          mergedConsultations.push(remoteConsultation);
        }
      }

      let prioritizedId = activeConsultationId;
      if (!prioritizedId && mergedConsultations.length > 0) {
        const mostRecent = mergedConsultations.reduce((acc, curr) => {
          if (!acc) return curr;
          const accTime = new Date(acc.updatedAt ?? acc.createdAt ?? 0).getTime();
          const currTime = new Date(curr.updatedAt ?? curr.createdAt ?? 0).getTime();
          return currTime > accTime ? curr : acc;
        }, null);
        prioritizedId = mostRecent?.id ?? null;
      }

      const newVersion = hydrationState.syncVersion + 1;
      localStorage.setItem(STORAGE_KEYS.syncVersion, newVersion.toString());
      localStorage.setItem(STORAGE_KEYS.lastSyncTimestamp, new Date().toISOString());

      setAppState((prev) => ({
        ...prev,
        patients: mergedPatients,
        consultations: mergedConsultations,
        activeConsultationId: prioritizedId || prev.activeConsultationId,
        hydrationState: {
          ...prev.hydrationState,
          status: "success",
          progress: 100,
          message: "Sync complete",
          syncVersion: newVersion,
          lastSynced: new Date().toISOString(),
          error: null,
        },
      }));

      console.info("[useConsultations] Remote hydration complete", {
        safeOwnerUserId,
        patients: mergedPatients.length,
        consultations: mergedConsultations.length,
        prioritizedId,
      });
    } catch (error) {
      console.error("[useConsultations] Remote hydration failed", error);
      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          status: "error",
          message: `Sync failed: ${error.message}`,
          error: error.message,
        },
      }));
    }
  }, [
    safeOwnerUserId,
    patients,
    consultations,
    activeConsultationId,
    hydrationState.syncVersion,
    setAppState,
  ]);

  const forceHydrate = useCallback(async () => {
    if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId) return;
    setAppState((prev) => ({
      ...prev,
      hydrationState: {
        ...prev.hydrationState,
        status: "loading",
        message: "Syncing with database...",
        progress: 0,
      },
    }));
    try {
      await runHydration();
      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          status: "success",
          error: null,
          lastSynced: new Date().toISOString(),
          progress: 100,
          message: "Sync complete",
        },
      }));
    } catch (error) {
      console.error("[useConsultations] Force hydration failed:", error);
      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          status: "error",
          error: error.message,
          progress: 0,
          message: "Sync failed",
        },
      }));
    }
  }, [safeOwnerUserId, runHydration]);

  useEffect(() => {
    if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId || hydrationState.status !== "idle") {
      return;
    }
    const lastSyncTimestamp = localStorage.getItem(STORAGE_KEYS.lastSyncTimestamp);
    const now = new Date().getTime();
    const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp).getTime() : 0;
    const syncThreshold = 5 * 60 * 1000;

    if (lastSync > now - syncThreshold && (patients.length > 0 || consultations.length > 0)) {
      console.info("[useConsultations] Skipping hydration - recent sync exists", {
        lastSync: new Date(lastSync).toISOString(),
        timeSinceSync: (now - lastSync) / 1000,
        threshold: syncThreshold / 1000,
      });
      setAppState((prev) => ({
        ...prev,
        hydrationState: {
          ...prev.hydrationState,
          status: "success",
          message: "Using cached data",
          lastSynced: lastSyncTimestamp,
        },
      }));
      return;
    }

    runHydration();
  }, [
    safeOwnerUserId,
    hydrationState.status,
    patients.length,
    consultations.length,
    runHydration,
  ]);

  const queuePatientSync = useCallback(
    (patient) => {
      if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId || !patient?.id) return;
      syncService.enqueuePatientUpsert({
        id: patient.id,
        ownerUserId: safeOwnerUserId,
        displayName: patient.displayName ?? patient.name ?? "",
        profile: patient.profile ?? {},
        createdAt: patient.createdAt ?? patient.updatedAt ?? new Date().toISOString(),
        updatedAt: patient.updatedAt ?? patient.createdAt ?? new Date().toISOString(),
      });
    },
    [safeOwnerUserId]
  );

  const queueConsultationSync = useCallback(
    (consultation) => {
      if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId || !consultation?.id) return;
      if (!consultation.patientId) return;

      const normalized = {
        ...DEFAULT_CONSULTATION,
        ...consultation,
      };

      const createdAt =
        normalized.createdAt ?? normalized.updatedAt ?? new Date().toISOString();

      syncService.enqueueConsultationUpsert({
        id: normalized.id,
        ownerUserId: safeOwnerUserId,
        patientId: normalized.patientId,
        patientName: normalized.patientName ?? "Unknown Patient",
        title: normalized.title ?? normalized.name ?? `Consultation ${normalized.id}`,
        noteType: normalized.noteType ?? "General",
        language: normalized.language ?? "en-US",
        additionalContext: normalized.additionalContext ?? "",
        speakerRoles: normalized.speakerRoles ?? {},
        sessionState: normalized.sessionState ?? "idle",
        connectionStatus: normalized.connectionStatus ?? "disconnected",
        hasShownHint: Boolean(normalized.hasShownHint),
        customNameSet: Boolean(normalized.customNameSet),
        activeTab: normalized.activeTab ?? "transcript",
        createdAt,
        updatedAt: normalized.updatedAt ?? createdAt,
      });
    },
    [safeOwnerUserId]
  );

  const queueClinicalNoteSync = useCallback(
    (note) => {
      if (!ENABLE_BACKGROUND_SYNC || !safeOwnerUserId || !note?.id || !note?.consultationId) {
        return;
      }
      if (
        note.content === undefined ||
        note.content === null ||
        (typeof note.content === "string" && note.content.trim() === "")
      ) {
        return;
      }
      const normalizedContent =
        typeof note.content === "string" ? note.content : JSON.stringify(note.content);

      syncService.enqueueClinicalNote({
        id: note.id,
        ownerUserId: note.ownerUserId ?? safeOwnerUserId,
        consultationId: note.consultationId,
        title: note.title ?? `Consultation ${note.consultationId} Note`,
        noteType: note.noteType ?? "General",
        language: note.language ?? "en-US",
        content: normalizedContent,
        createdAt: note.createdAt ?? new Date().toISOString(),
        updatedAt: note.updatedAt ?? new Date().toISOString(),
        summary: note.summary,
        status: note.status,
        debugLabel: note.debugLabel,
      });
    },
    [safeOwnerUserId]
  );

  const addNewPatient = useCallback(
    (patientProfile) => {
      const patientId = generatePatientId(patientProfile);
      const patientName = generatePatientName(patientProfile);
      const timestamp = new Date().toISOString();
      let patientForSync = null;

      setAppState((prevState) => {
        const prevPatients = prevState.patients;
        const existing = prevPatients.find((p) => p.id === patientId);

        let updatedPatients;
        if (existing) {
          const updatedPatient = {
            ...existing,
            name: patientName,
            displayName: patientName,
            profile: { ...patientProfile },
            updatedAt: timestamp,
            ownerUserId: existing.ownerUserId ?? safeOwnerUserId,
          };
          patientForSync = updatedPatient;
          updatedPatients = prevPatients.map((p) =>
            p.id === patientId ? updatedPatient : p
          );
        } else {
          const newPatient = {
            id: patientId,
            name: patientName,
            displayName: patientName,
            profile: { ...patientProfile },
            createdAt: timestamp,
            updatedAt: timestamp,
            ownerUserId: safeOwnerUserId,
          };
          patientForSync = newPatient;
          updatedPatients = [...prevPatients, newPatient];
        }

        return {
          ...prevState,
          patients: updatedPatients,
          activeConsultationId: null,
        };
      });

      if (patientForSync) queuePatientSync(patientForSync);
    },
    [safeOwnerUserId, queuePatientSync]
  );

  const addConsultationForPatient = useCallback(
    (patientId) => {
      setAppState((prevState) => {
        const patient = prevState.patients.find((p) => p.id === patientId);
        if (!patient) {
          console.warn(`[useConsultations] Patient ${patientId} not found`);
          return prevState;
        }

        const now = new Date().toISOString();
        const newId = Date.now().toString();
        const patientConsultations = prevState.consultations.filter(
          (c) => c.patientId === patientId
        );
        const consultationNumber = patientConsultations.length + 1;

        const newConsultation = {
          ...DEFAULT_CONSULTATION,
          id: newId,
          name: `Consultation ${consultationNumber}`,
          createdAt: null,
          updatedAt: now,
          transcriptSegments: new Map(),
          patientProfile: { ...patient.profile },
          patientId: patient.id,
          patientName: patient.name ?? patient.displayName,
          ownerUserId: patient.ownerUserId ?? safeOwnerUserId,
        };

        setTimeout(() => queueConsultationSync(newConsultation), 0);

        return {
          ...prevState,
          consultations: [...prevState.consultations, newConsultation],
          activeConsultationId: newId,
        };
      });
    },
    [safeOwnerUserId, queueConsultationSync]
  );

  const updateConsultation = useCallback(
    (id, updates) => {
      setAppState((prevState) => {
        const prevConsultations = prevState.consultations;
        const prevPatients = prevState.patients;
        const now = new Date().toISOString();

        let updatedConsultations = prevConsultations.map((consultation) => {
          if (consultation.id !== id) return consultation;

          const nextTranscriptSegments =
            updates.transcriptSegments !== undefined
              ? toTranscriptMap(updates.transcriptSegments)
              : consultation.transcriptSegments;

          const updatedConsultation = {
            ...consultation,
            ...updates,
            transcriptSegments: nextTranscriptSegments,
            updatedAt: now,
            ownerUserId: consultation.ownerUserId ?? safeOwnerUserId,
          };

          return updatedConsultation;
        });

        if (updates.patientProfile) {
          const targetBefore = prevConsultations.find(c => c.id === id);
          const oldPatientId = targetBefore?.patientId ?? null;
          const targetAfter = updatedConsultations.find(c => c.id === id);
          const mergedProfile = {
            ...(targetBefore?.patientProfile ?? {}),
            ...(updates.patientProfile || {}),
          };

          const sharedFields = {
            name: mergedProfile.name ?? "",
            dateOfBirth: mergedProfile.dateOfBirth ?? "",
            sex: mergedProfile.sex ?? "",
            medicalRecordNumber: mergedProfile.medicalRecordNumber ?? "",
            email: mergedProfile.email ?? "",
            phoneNumber: mergedProfile.phoneNumber ?? "",
          };

          const newPatientId = generatePatientId(mergedProfile);
          const newPatientName = generatePatientName(mergedProfile);

          updatedConsultations = updatedConsultations.map(c => {
            if (c.id !== id) return c;
            return {
              ...c,
              patientProfile: {
                ...c.patientProfile,
                ...sharedFields,
                referringPhysician: c.patientProfile?.referringPhysician ?? "",
              },
              patientId: newPatientId,
              patientName: newPatientName,
              updatedAt: now,
            };
          });

          const impactedIds = [];
          updatedConsultations = updatedConsultations.map(c => {
            if (!oldPatientId || c.patientId !== oldPatientId || c.id === id) return c;
            impactedIds.push(c.id);
            return {
              ...c,
              patientProfile: {
                ...c.patientProfile,
                ...sharedFields,
                referringPhysician: c.patientProfile?.referringPhysician ?? "",
              },
              patientId: newPatientId,
              patientName: newPatientName,
              updatedAt: now,
            };
          });

          let updatedPatients = [...prevPatients];
          const existingOld = oldPatientId ? updatedPatients.find(p => p.id === oldPatientId) : null;
            const existingNew = updatedPatients.find(p => p.id === newPatientId);

          const newPatientRecord = {
            id: newPatientId,
            name: newPatientName,
            displayName: newPatientName,
            profile: {
              ...(existingOld?.profile ?? {}),
              ...sharedFields,
            },
            createdAt: existingOld?.createdAt ?? existingNew?.createdAt ?? now,
            updatedAt: now,
            ownerUserId: existingOld?.ownerUserId ?? existingNew?.ownerUserId ?? safeOwnerUserId,
          };

          if (oldPatientId && oldPatientId !== newPatientId) {
            updatedPatients = updatedPatients.filter(p => p.id !== oldPatientId);
          }

          if (existingNew) {
            updatedPatients = updatedPatients.map(p => (p.id === newPatientId ? newPatientRecord : p));
          } else {
            updatedPatients.push(newPatientRecord);
          }

          setTimeout(() => {
            queuePatientSync(newPatientRecord);
            const allImpacted = [id, ...impactedIds];
            allImpacted.forEach(cid => {
              const c = updatedConsultations.find(x => x.id === cid);
              if (c) queueConsultationSync(c);
            });
          }, 0);

          return { ...prevState, consultations: updatedConsultations, patients: updatedPatients };
        }

        if (updates.notes !== undefined) {
          const target = updatedConsultations.find(c => c.id === id);
          if (target) {
            const noteUpdatedAt = now;
            const existingNoteCreatedAt = target.notesCreatedAt ?? null;
            const noteCreatedAt = existingNoteCreatedAt ?? noteUpdatedAt;
            const resolvedNoteId = target.noteId ?? target.id;

            const serializedContent =
              typeof updates.notes === "string"
                ? updates.notes
                : JSON.stringify(updates.notes ?? {});

            updatedConsultations = updatedConsultations.map(c => {
              if (c.id !== id) return c;
              return {
                ...c,
                notesCreatedAt: noteCreatedAt,
                notesUpdatedAt: noteUpdatedAt,
                noteId: resolvedNoteId,
              };
            });

            if (
              serializedContent !== null &&
              serializedContent !== undefined &&
              (typeof serializedContent !== "string" || serializedContent.trim() !== "")
            ) {
              const clinicalNoteForSync = {
                id: resolvedNoteId,
                ownerUserId: target.ownerUserId ?? safeOwnerUserId,
                consultationId: target.id,
                title:
                  target.title ??
                  target.name ??
                  `Consultation ${target.id}`,
                noteType: target.noteType ?? "General",
                language: target.language ?? "en-US",
                content: serializedContent,
                createdAt: noteCreatedAt,
                updatedAt: noteUpdatedAt,
                summary: target.notesSummary ?? null,
                status: target.notesStatus ?? null,
                debugLabel: `consultation:${target.id}`,
              };
              setTimeout(() => syncService.enqueueClinicalNote(clinicalNoteForSync), 0);
            }
          }
        }

        const updatedTarget = updatedConsultations.find(c => c.id === id);
        if (updatedTarget) {
          setTimeout(() => queueConsultationSync(updatedTarget), 0);
        }

        return { ...prevState, consultations: updatedConsultations };
      });
    },
    [safeOwnerUserId, queuePatientSync, queueConsultationSync]
  );

  const deleteConsultation = useCallback(
    (id) => {
      setAppState((prevState) => {
        const consultationToDelete = prevState.consultations.find((c) => c.id === id);
        const filteredConsultations = prevState.consultations.filter((c) => c.id !== id);
        let nextActiveId = prevState.activeConsultationId;

        if (prevState.activeConsultationId === id) {
          nextActiveId = filteredConsultations.length > 0 ? filteredConsultations[0].id : null;
        }

        if (ENABLE_BACKGROUND_SYNC && safeOwnerUserId && consultationToDelete) {
          setTimeout(() => {
            syncService.enqueueConsultationDeletion(id, safeOwnerUserId);
          }, 0);
        }

        return { ...prevState, consultations: filteredConsultations, activeConsultationId: nextActiveId };
      });
    },
    [safeOwnerUserId]
  );

  const deletePatient = useCallback(
    (patientId) => {
      setAppState((prevState) => {
        const patientConsultations = prevState.consultations.filter(
          (c) => c.patientId === patientId
        );
        const filteredConsultations = prevState.consultations.filter(
          (c) => c.patientId !== patientId
        );
        const filteredPatients = prevState.patients.filter((p) => p.id !== patientId);

        let nextActiveId = prevState.activeConsultationId;
        const activeWasDeleted = prevState.consultations.find(
          (c) => c.id === prevState.activeConsultationId && c.patientId === patientId
        );
        if (activeWasDeleted) {
          nextActiveId = filteredConsultations.length > 0 ? filteredConsultations[0].id : null;
        }

        if (ENABLE_BACKGROUND_SYNC && safeOwnerUserId) {
          setTimeout(() => {
            syncService.enqueuePatientDeletion(patientId, safeOwnerUserId);
            patientConsultations.forEach((c) => {
              syncService.enqueueConsultationDeletion(c.id, safeOwnerUserId);
            });
          }, 0);
        }

        return {
          ...prevState,
          consultations: filteredConsultations,
          patients: filteredPatients,
          activeConsultationId: nextActiveId,
        };
      });
    },
    [safeOwnerUserId]
  );

  const resetConsultation = useCallback(
    (id) => {
      setAppState((prevState) => {
        const updatedConsultations = prevState.consultations.map((consultation) => {
          if (consultation.id !== id) return consultation;
          return {
            ...consultation,
            transcriptSegments: new Map(),
            interimTranscript: "",
            interimSpeaker: null,
            notes: null,
            error: null,
            loading: false,
            sessionState: "idle",
            transcriptLoading: false,
            transcriptLoaded: false,
          };
        });
        return { ...prevState, consultations: updatedConsultations };
      });
    },
    []
  );

  const finalizeConsultationTimestamp = useCallback(
    (id) => {
      setAppState((prevState) => {
        const updatedConsultations = prevState.consultations.map((consultation) => {
          if (consultation.id !== id) return consultation;
          if (consultation.createdAt !== null && consultation.createdAt !== undefined) {
            return consultation;
          }
          const now = new Date().toISOString();
          const updatedConsultation = {
            ...consultation,
            createdAt: now,
            updatedAt: now,
          };
          setTimeout(() => queueConsultationSync(updatedConsultation), 0);
          return updatedConsultation;
        });
        return { ...prevState, consultations: updatedConsultations };
      });
    },
    [queueConsultationSync]
  );

  const activeConsultation = useMemo(() => {
    return (
      consultations.find((consultation) => consultation.id === activeConsultationId) || null
    );
  }, [consultations, activeConsultationId]);

  const setActiveConsultationId = useCallback((id) => {
    setAppState((prevState) => ({ ...prevState, activeConsultationId: id }));
  }, []);

  const setConsultations = useCallback((updaterOrValue) => {
    setAppState((prevState) => {
      const newConsultations =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prevState.consultations)
          : updaterOrValue;
      return { ...prevState, consultations: newConsultations };
    });
  }, []);

  return {
    consultations,
    patients,
    activeConsultation,
    activeConsultationId,
    hydrationState,
    setActiveConsultationId,
    setConsultations,
    addNewPatient,
    addConsultationForPatient,
    updateConsultation,
    deleteConsultation,
    deletePatient,
    resetConsultation,
    finalizeConsultationTimestamp,
    queueClinicalNoteSync,
    forceHydrate,
    ensureSegmentsLoaded,
  };
};