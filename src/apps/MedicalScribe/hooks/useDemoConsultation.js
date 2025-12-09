import { useCallback, useMemo, useState } from "react";
import { DEFAULT_CONSULTATION } from "../utils/constants";

const toMap = (value) => {
  if (!value) return new Map();
  if (value instanceof Map) return new Map(value);
  if (Array.isArray(value)) return new Map(value);
  return new Map(Object.entries(value));
};

const normalizeConsultation = (consultation) => {
  if (!consultation) return consultation;
  return {
    ...consultation,
    transcriptSegments: toMap(consultation.transcriptSegments),
    speakerRoles: { ...(consultation.speakerRoles || {}) },
    patientProfile: { ...(consultation.patientProfile || {}) },
    noteType: consultation.noteType || "standard",
  };
};

const buildInitialConsultation = () => {
  const base = normalizeConsultation(DEFAULT_CONSULTATION || {});
  return normalizeConsultation({
    ...base,
    id: "demo-consultation",
    name: "Interactive Demo Consultation",
    patientId: "demo-patient",
    patientName: base.patientName || "Demo Patient",
    patientProfile: {
      name: base.patientProfile?.name || "Demo Patient",
      sex: base.patientProfile?.sex || "",
      dateOfBirth: base.patientProfile?.dateOfBirth || "",
      referringPhysician: base.patientProfile?.referringPhysician || "",
    },
    transcriptSegments: new Map(),
    interimTranscript: "",
    interimSpeaker: null,
    notes: null,
    error: null,
    loading: false,
    sessionState: "idle",
    connectionStatus: "disconnected",
    language: base.language || "en-US",
    activeTab: "transcript",
    hasShownHint: true,
    createdAt: null,
    updatedAt: new Date().toISOString(),
  });
};

export const useDemoConsultation = () => {
  const initialConsultation = useMemo(() => buildInitialConsultation(), []);
  const [consultation, setConsultation] = useState(initialConsultation);

  const updateConsultation = useCallback((id, updates = {}) => {
    setConsultation((prev) => {
      if (!prev || (id && id !== prev.id)) return prev;

      const next = {
        ...prev,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      if (updates.transcriptSegments !== undefined) {
        next.transcriptSegments = toMap(updates.transcriptSegments);
      }
      if (updates.speakerRoles) {
        next.speakerRoles = {
          ...prev.speakerRoles,
          ...updates.speakerRoles,
        };
      }
      if (updates.patientProfile) {
        next.patientProfile = {
          ...prev.patientProfile,
          ...updates.patientProfile,
        };
      }
      if (updates.resetError) {
        next.error = null;
      }

      return normalizeConsultation(next);
    });
  }, []);

  const resetConsultation = useCallback(
    (id, options = {}) => {
      const {
        preserveLanguage = true,
        preservePatientProfile = true,
        preserveSpeakerRoles = true,
      } = options;

      setConsultation((prev) => {
        if (!prev || (id && id !== prev.id)) return prev;

        const base = buildInitialConsultation();
        const next = {
          ...base,
          language: preserveLanguage ? prev.language : base.language,
          patientProfile: preservePatientProfile
            ? { ...prev.patientProfile }
            : base.patientProfile,
          speakerRoles: preserveSpeakerRoles
            ? { ...prev.speakerRoles }
            : base.speakerRoles,
          noteType: prev.noteType || "standard",
        };

        return normalizeConsultation(next);
      });
    },
    []
  );

  const finalizeConsultationTimestamp = useCallback((id) => {
    setConsultation((prev) => {
      if (!prev || (id && id !== prev.id)) return prev;
      if (prev.createdAt) return prev;
      return normalizeConsultation({
        ...prev,
        createdAt: new Date().toISOString(),
      });
    });
  }, []);

  const setConsultationsLikeList = useCallback((updater) => {
    setConsultation((prev) => {
      const prevArr = prev ? [prev] : [];
      const result =
        typeof updater === "function" ? updater(prevArr) : updater;

      if (!Array.isArray(result) || result.length === 0) {
        return prev;
      }
      return normalizeConsultation(result[0]);
    });
  }, []);

  const loadSampleEncounter = useCallback((sample) => {
    if (!sample) return;

    const segmentsMap = new Map(
      sample.segments.map((segment, index) => {
        const segmentId = segment.id || `sample-${sample.id}-${index}`;
        return [
          segmentId,
          {
            id: segmentId,
            speaker: segment.speaker,
            text: segment.text,
            displayText: segment.displayText || segment.text,
            entities: segment.entities || [],
            translatedText:
              segment.translatedText !== undefined
                ? segment.translatedText
                : null,
          },
        ];
      })
    );

    setConsultation((prev) =>
      normalizeConsultation({
        ...prev,
        transcriptSegments: segmentsMap,
        interimTranscript: "",
        interimSpeaker: null,
        sessionState: "stopped",
        connectionStatus: "disconnected",
        language: sample.language || prev.language,
        speakerRoles: sample.speakerRoles
          ? { ...sample.speakerRoles }
          : prev.speakerRoles,
        patientProfile: sample.patientProfile
          ? { ...prev.patientProfile, ...sample.patientProfile }
          : prev.patientProfile,
        patientName: sample.patientProfile?.name || prev.patientName,
        notes: null,
        error: null,
        activeTab: "transcript",
      })
    );
  }, []);

  const setLanguage = useCallback((languageCode) => {
    setConsultation((prev) =>
      normalizeConsultation({
        ...prev,
        language: languageCode,
      })
    );
  }, []);

  return {
    consultation,
    updateConsultation,
    resetConsultation,
    finalizeConsultationTimestamp,
    setConsultationsLikeList,
    loadSampleEncounter,
    setLanguage,
  };
};