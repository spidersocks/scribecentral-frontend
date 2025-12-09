import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useDemoConsultation } from "./hooks/useDemoConsultation";
import { TranscriptPanel } from "./components/Transcript/TranscriptPanel";
import { NoteEditor } from "./components/Notes/NoteEditor";
import { getAssetPath } from "./utils/helpers";
import styles from "./MedicalScribeDemo.module.css";
import {
  SAMPLE_TRANSCRIPTS,
  getSampleTranscriptById,
  LANGUAGE_LABELS,
} from "./data/sampleTranscripts";

export default function MedicalScribeDemo() {
  const {
    consultation,
    updateConsultation,
    resetConsultation,
    finalizeConsultationTimestamp,
    setConsultationsLikeList,
    loadSampleEncounter,
    setLanguage,
  } = useDemoConsultation();

  const transcriptEndRef = useRef(null);
  const [mode, setMode] = useState("sample"); // "sample" | "record"
  const [selectedSampleId, setSelectedSampleId] = useState(
    SAMPLE_TRANSCRIPTS[0]?.id ?? ""
  );

  const selectedSample = useMemo(
    () => getSampleTranscriptById(selectedSampleId),
    [selectedSampleId]
  );

  const helperBanner = useMemo(
    () =>
      mode === "sample"
        ? {
            icon: "💡",
            text: "Load the sample above to populate the live transcript instantly.",
          }
        : {
            icon: "🎙️",
            text: "Select language and press 'Start Recording' to begin live transcription.",
          },
    [mode]
  );

  const {
    startSession,
    stopSession,
    handlePause,
    handleResume,
    handleGenerateNote,
  } = useAudioRecording(
    consultation,
    consultation?.id,
    updateConsultation,
    resetConsultation,
    setConsultationsLikeList,
    finalizeConsultationTimestamp
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consultation?.transcriptSegments, consultation?.interimTranscript]);

  const handleModeChange = (nextMode) => {
    if (mode === nextMode) return;
    setMode(nextMode);
    if (nextMode === "record" && consultation) {
      resetConsultation(consultation.id, {
        preserveLanguage: true,
        preservePatientProfile: true,
        preserveSpeakerRoles: true,
      });
    }
  };

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
  };

  const handleLoadSample = useCallback(() => {
    if (!selectedSample) return;
    loadSampleEncounter(selectedSample);
  }, [loadSampleEncounter, selectedSample]);

  const handleSpeakerRoleToggle = useCallback(
    (speakerId) => {
      if (!speakerId || !consultation) return;
      const cycle = [undefined, "Clinician", "Patient"];
      const currentRole = consultation.speakerRoles?.[speakerId];
      const nextRole = cycle[(cycle.indexOf(currentRole) + 1) % cycle.length];
      updateConsultation(consultation.id, {
        speakerRoles: {
          ...consultation.speakerRoles,
          [speakerId]: nextRole,
        },
      });
    },
    [consultation, updateConsultation]
  );

  const getStatusDisplay = useCallback(() => {
    if (!consultation) return null;
    if (consultation.connectionStatus === "error") {
      return (
        <span className="status-text status-error">Connection Error</span>
      );
    }
    switch (consultation.sessionState) {
      case "recording":
        return (
          <>
            <div className="recording-indicator" />
            <span className="status-text">Recording</span>
          </>
        );
      case "paused":
        return (
          <>
            <div className="recording-indicator paused" />
            <span className="status-text">Paused</span>
          </>
        );
      case "stopped":
        return <span className="status-text">Session ended</span>;
      case "connecting":
        return <span className="status-text">Connecting…</span>;
      default:
        return <span className="status-text">Ready</span>;
    }
  }, [consultation]);

  const handleStopAndGenerate = useCallback(async () => {
    await stopSession();
    if (consultation?.transcriptSegments?.size > 0) {
      await handleGenerateNote("standard");
      updateConsultation(consultation.id, { activeTab: "note" });
    }
  }, [consultation, handleGenerateNote, stopSession, updateConsultation]);

  const handleGenerateStandardNote = useCallback(async () => {
    if (!consultation?.transcriptSegments?.size) return;
    await handleGenerateNote("standard");
    updateConsultation(consultation.id, { activeTab: "note" });
  }, [consultation, handleGenerateNote, updateConsultation]);

  const renderActionButtons = useCallback(() => {
    if (!consultation) return null;
    const { sessionState } = consultation;

    const commonGenerateButton =
      consultation.transcriptSegments.size > 0 ? (
        <button
          key="generate"
          className="button button-secondary"
          onClick={handleGenerateStandardNote}
          disabled={consultation.loading}
        >
          Generate Standard Note
        </button>
      ) : null;

    if (mode === "sample") {
      return (
        <div className="action-buttons">
          <button
            className="button button-primary"
            onClick={handleLoadSample}
            disabled={consultation.loading}
          >
            Load Sample Transcript
          </button>
          {commonGenerateButton}
        </div>
      );
    }

    const primary = () => {
      switch (sessionState) {
        case "idle":
        case "stopped":
          return (
            <button
              onClick={startSession}
              className="button button-primary"
              disabled={consultation.connectionStatus === "connecting"}
            >
              {sessionState === "idle" ? "Start Recording" : "New Recording"}
            </button>
          );
        case "recording":
          return (
            <button onClick={handlePause} className="button button-primary">
              Pause
            </button>
          );
        case "paused":
          return (
            <button onClick={handleResume} className="button button-primary">
              Resume
            </button>
          );
        case "connecting":
          return (
            <button className="button button-primary" disabled>
              Connecting…
            </button>
          );
        default:
          return null;
      }
    };

    return (
      <div className="action-buttons">
        {primary()}
        {(sessionState === "recording" || sessionState === "paused") && (
          <button
            onClick={handleStopAndGenerate}
            className="button button-secondary"
          >
            Stop &amp; Generate Note
          </button>
        )}
        {sessionState === "stopped" && commonGenerateButton}
      </div>
    );
  }, [
    consultation,
    handleGenerateStandardNote,
    handleLoadSample,
    handlePause,
    handleResume,
    handleStopAndGenerate,
    mode,
    startSession,
  ]);

  const handleSetNotes = useCallback(
    (newNotes) => {
      updateConsultation(consultation.id, { notes: newNotes });
    },
    [consultation?.id, updateConsultation]
  );

  const handleNoteTypeChange = useCallback(
    (newType) => {
      updateConsultation(consultation.id, { noteType: newType });
    },
    [consultation?.id, updateConsultation]
  );

  const handleRegenerate = useCallback(
    (noteTypeOverride) => {
      handleGenerateNote(noteTypeOverride);
    },
    [handleGenerateNote]
  );

  return (
    <div className={styles.demoShell}>
      <header className={styles.demoTopBar}>
        <div className={styles.topBarLeft}>
          <img
            src={getAssetPath("/stethoscribe_icon.png")}
            alt="StethoscribeAI icon"
            className={styles.topBarLogo}
          />
          <div className={styles.topBarText}>
            <h1 className={styles.topBarTitle}>StethoscribeAI demo workspace</h1>
            <p className={styles.topBarSubtitle}>
              Limited preview of the live transcript stream and clinical note builder.
            </p>
          </div>
        </div>
        <div className={styles.topBarActions}>
          <span className={styles.demoBadge}>Demo</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.history.back()}
          >
            ← Back to site
          </button>
        </div>
      </header>

      <main className={styles.demoMain}>
        <section className={`panel ${styles.demoPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Live transcript</h2>
              <p className={styles.panelSubtitle}>
                Record audio with your microphone or try a sample transcript below.
              </p>
            </div>
            <div className={styles.modeSwitch} role="group" aria-label="Demo mode">
              <button
                type="button"
                className={`${styles.modeButton} ${
                  mode === "sample" ? styles.modeButtonActive : ""
                }`}
                onClick={() => handleModeChange("sample")}
                aria-pressed={mode === "sample"}
              >
                Samples
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${
                  mode === "record" ? styles.modeButtonActive : ""
                }`}
                onClick={() => handleModeChange("record")}
                aria-pressed={mode === "record"}
              >
                Microphone
              </button>
            </div>
          </div>

          <div className={styles.controlSection}>
            {mode === "record" ? (
              <div className={styles.controlGroup}>
                <label htmlFor="demo-language" className={styles.controlLabel}>
                  Primary language
                </label>
                <select
                  id="demo-language"
                  value={consultation.language}
                  onChange={handleLanguageChange}
                  className={`${styles.selectControl} language-selector`}
                  disabled={consultation.sessionState === "recording"}
                >
                  <option value="en-US">English</option>
                  <option value="zh-HK">Cantonese (粵語)</option>
                  <option value="zh-TW">Mandarin Traditional (國語)</option>
                </select>
              </div>
            ) : (
              selectedSample && (
                <div className={styles.controlGroup}>
                  <span className={styles.controlLabel}>Language</span>
                  <span className={styles.valuePill}>
                    {LANGUAGE_LABELS[selectedSample.language] ??
                      selectedSample.language}
                  </span>
                </div>
              )
            )}

            {mode === "sample" && (
              <>
                <div className={styles.controlGroup}>
                  <label htmlFor="sample-select" className={styles.controlLabel}>
                    Sample encounter
                  </label>
                  <select
                    id="sample-select"
                    value={selectedSampleId}
                    onChange={(event) => setSelectedSampleId(event.target.value)}
                    className={styles.selectControl}
                  >
                    {SAMPLE_TRANSCRIPTS.map((sample) => (
                      <option key={sample.id} value={sample.id}>
                        {sample.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedSample?.description && (
                  <p className={styles.sampleDescription}>
                    {selectedSample.description}
                  </p>
                )}
              </>
            )}
          </div>

          <div className={styles.helperBanner} role="note">
            <span className={styles.helperIcon} aria-hidden="true">
              {helperBanner.icon}
            </span>
            <span>{helperBanner.text}</span>
          </div>

          <div className={styles.transcriptSurface}>
            <TranscriptPanel
              activeConsultation={consultation}
              transcriptEndRef={transcriptEndRef}
              onSpeakerRoleToggle={handleSpeakerRoleToggle}
              renderActionButtons={renderActionButtons}
              getStatusDisplay={getStatusDisplay}
              updateConsultation={updateConsultation}
              activeConsultationId={consultation.id}
              showLanguageSelector={false}
            />
          </div>
        </section>

        <section className={`panel ${styles.demoPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Clinical note workspace</h2>
              <p className={styles.panelSubtitle}>
                Generate and edit structured notes.
              </p>
            </div>
          </div>

          <div className={styles.noteWorkspace}>
            <div className="notes-content">
              <NoteEditor
                notes={consultation.notes}
                setNotes={handleSetNotes}
                loading={consultation.loading}
                error={consultation.error}
                noteType={consultation.noteType}
                onNoteTypeChange={handleNoteTypeChange}
                onRegenerate={handleRegenerate}
                transcriptSegments={consultation.transcriptSegments}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}