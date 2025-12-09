import React, { useState, useRef, useEffect } from "react";
import "./App.css";
import { useAuth } from "./AuthGate";
import { getAssetPath } from "./utils/helpers";
import { MenuIcon } from "./components/shared/Icons";
import { useConsultations } from "./hooks/useConsultations";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { TranscriptPanel } from "./components/Transcript/TranscriptPanel";
import { PatientInfoPanel } from "./components/Patient/PatientInfoPanel";
import { NewPatientModal } from "./components/Patient/NewPatientModal";
import { NoteEditor } from "./components/Notes/NoteEditor";
import { CommandBar } from "./components/Notes/CommandBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ENABLE_BACKGROUND_SYNC } from "./utils/constants";
import { syncService } from "./utils/syncService";
import { ensureAwsCredentials } from "./utils/awsClients"; // NEW
import { LoadingAnimation } from "./components/shared/LoadingAnimation";
import './utils/debugUtils';

// Extracted components for better organization
const EmptyStateView = ({ onAddNewPatient }) => (
  <div className="panel start-screen-panel">
    <img
      src={getAssetPath("/stethoscribe_icon.png")}
      alt="StethoscribeAI Icon"
      className="start-logo"
    />
    <h2 className="start-screen-title">Select a consultation</h2>
    <p className="start-screen-subtitle">
      Choose a patient from the sidebar or add a new one
    </p>
    <button
      className="button button-primary start-button"
      onClick={onAddNewPatient}
    >
      + Add New Patient
    </button>
  </div>
);

const WelcomeScreen = ({ onAddNewPatient }) => (
  <div className="panel start-screen-panel">
    <img
      src={getAssetPath("/stethoscribe_icon.png")}
      alt="StethoscribeAI Icon"
      className="start-logo"
    />
    <h2 className="start-screen-title">Welcome to StethoscribeAI</h2>
    <p className="start-screen-subtitle">
      Add your first patient to get started
    </p>
    <button
      className="button button-primary start-button"
      onClick={onAddNewPatient}
    >
      + Add New Patient
    </button>
  </div>
);

const HydrationErrorOverlay = ({ error, onRetry }) => (
  <div className="hydration-error-overlay">
    <div className="hydration-error-content">
      <h3>Data Sync Error</h3>
      <p>There was a problem syncing your data: {error}</p>
      <button onClick={onRetry} className="button button-primary">
        Retry
      </button>
    </div>
  </div>
);

export default function MedicalScribeApp() {
  const { user, signOut } = useAuth();
  const ownerUserId = user?.attributes?.sub ?? user?.username ?? user?.userId ?? null;

  const {
    consultations,
    patients,
    activeConsultation,
    activeConsultationId,
    setActiveConsultationId,
    addNewPatient,
    addConsultationForPatient,
    updateConsultation,
    deleteConsultation,
    deletePatient,
    resetConsultation,
    finalizeConsultationTimestamp,
    setConsultations,
    hydrationState,
    forceHydrate,
    ensureSegmentsLoaded,
  } = useConsultations(ownerUserId);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);

  // Refs
  const transcriptEndRef = useRef(null);
  
  // Audio recording control
  const {
    startSession,
    stopSession,
    handlePause,
    handleResume,
    handleGenerateNote,
    debugTranscriptSegments,
    syncAllTranscriptSegments, // Using the new function
  } = useAudioRecording(
    activeConsultation,
    activeConsultationId,
    updateConsultation,
    resetConsultation,
    setConsultations,
    finalizeConsultationTimestamp
  );

  // Handle sign out with a final background flush (no UI needed)
  const handleSignOut = async () => {
    if (ENABLE_BACKGROUND_SYNC) {
      try {
        await syncService.flushAll("sign-out");
      } catch (error) {
        console.error("[MedicalScribeApp] Final sync before sign-out failed:", error);
      }
    }
    await signOut();
  };

  // Warm AWS creds only when this app is mounted and user is signed in
  useEffect(() => {
    if (!ENABLE_BACKGROUND_SYNC) return;
    if (!user) return;
    ensureAwsCredentials({ silentIfSignedOut: true }).catch(() => {});
  }, [user]);
  // Core application state

  // NOTE: Removed automatic scroll-to-bottom on transcript tab to prevent page jumping.
  // If needed later, we can restore a scoped auto-scroll inside the transcript box only.

  // Flush queue regularly (silent) to keep background sync moving
  useEffect(() => {
    if (!ENABLE_BACKGROUND_SYNC) return undefined;

    const FLUSH_INTERVAL_MS = 4000;

    const flush = async (reason) => {
      try {
        await syncService.flushAll(reason);
      } catch (error) {
        console.error(`[MedicalScribeApp] Background sync flush failed (${reason}):`, error);
      }
    };

    const intervalId = window.setInterval(() => flush("interval"), FLUSH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) flush("visibilitychange");
    };
    const handleOnline = () => flush("online");
    const handleFocus = () => flush("focus");
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);

    flush("mount");

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!activeConsultationId || !activeConsultation) return;
    if (activeConsultation.activeTab === "transcript") {
      // Quick load then enrich in background (deduped inside hook)
      ensureSegmentsLoaded(activeConsultationId, true);
    } else {
      ensureSegmentsLoaded(activeConsultationId, false);
    }
  }, [activeConsultationId, activeConsultation?.activeTab, ensureSegmentsLoaded]);

  // Keep the current tab when switching between consultations of the SAME patient
  const handleConsultationSelectSamePatientAware = (nextConsultationId) => {
    if (!nextConsultationId) return;
    const current = activeConsultation;
    const next = consultations.find((c) => c.id === nextConsultationId);
    if (
      current &&
      next &&
      current.patientId &&
      next.patientId &&
      current.patientId === next.patientId
    ) {
      const currentTab = current.activeTab;
      if (currentTab && next.activeTab !== currentTab) {
        // Update the next consultation's tab to match the current one
        updateConsultation(nextConsultationId, { activeTab: currentTab });
      }
    }
    setActiveConsultationId(nextConsultationId);
  };

  // User interaction handlers
  const handleRenameConsultation = (id, newName) => {
    updateConsultation(id, { name: newName, customNameSet: true });
  };

  const handleDeleteConsultation = (id) => {
    deleteConsultation(id);
  };

  const handleDeletePatient = (patientId) => {
    deletePatient(patientId);
  };

  const handleTabChange = (tab) => {
    if (!activeConsultation) return;
    updateConsultation(activeConsultationId, { activeTab: tab });
  };

  const handleSpeakerRoleToggle = (speakerId) => {
    if (!speakerId || !activeConsultation) return;
    const currentRole = activeConsultation.speakerRoles[speakerId];
    const cycle = [undefined, "Clinician", "Patient"];
    const nextRole = cycle[(cycle.indexOf(currentRole) + 1) % cycle.length];
    updateConsultation(activeConsultationId, {
      speakerRoles: { ...activeConsultation.speakerRoles, [speakerId]: nextRole },
    });
  };

  const handleNoteTypeChange = (newNoteType) => {
    if (!activeConsultation) return;
    updateConsultation(activeConsultationId, { noteType: newNoteType });
  };

  // Prioritize note generation as soon as session stops
  const handleStopAndGenerate = async () => {
    await stopSession();
    if (ENABLE_BACKGROUND_SYNC) {
      try {
        await syncService.flushAll("post-generate");
      } catch (e) {
        console.warn("Background flush after generate failed", e);
      }
    }
  };

  const handleAddNewPatient = (patientData) => {
    addNewPatient(patientData);
    setShowNewPatientModal(false);
    setSidebarOpen(false);
  };

  // Debugging function that now syncs ALL transcript segments
  const triggerTranscriptTest = () => {
    console.info("Triggering transcript segments sync test...");
    
    if (!activeConsultation) {
      console.warn("No active consultation to test!");
      return;
    }
    
    console.info(`Attempting to sync ALL segments for consultation: ${activeConsultationId}`);
    
    // Use syncAllTranscriptSegments to sync ALL existing segments
    const result = syncAllTranscriptSegments();
    
    console.info("Full transcript sync completed", result);
    
    // Force sync flush to check for any errors
    console.info("Forcing sync flush to check for errors...");
    syncService.flushAll("debug").then(() => {
      console.info("Sync flush completed successfully");
    }).catch(err => {
      console.error("Sync flush failed:", err);
    });
  };

  // Status display helper
  const getStatusDisplay = () => {
    if (!activeConsultation) return null;
    if (activeConsultation.connectionStatus === "error")
      return <span className="status-text status-error">Connection Error</span>;
    
    switch (activeConsultation.sessionState) {
      case "recording":
        return (
          <>
            <div className="recording-indicator"></div>{" "}
            <span className="status-text">Recording</span>
          </>
        );
      case "paused":
        return (
          <>
            <div className="recording-indicator paused"></div>{" "}
            <span className="status-text">Paused</span>
          </>
        );
      case "stopped":
        return <span className="status-text">Recording Ended</span>;
      case "connecting":
        return <span className="status-text">Connecting...</span>;
      default:
        return <span className="status-text">Ready</span>;
    }
  };

  // Action buttons generator
  const renderActionButtons = () => {
    if (!activeConsultation) return null;
    
    // Primary action button based on state
    const renderPrimaryButton = () => {
      switch (activeConsultation.sessionState) {
        case "idle":
        case "stopped":
          return (
            <button onClick={startSession} className="button button-primary">
              {activeConsultation.sessionState === "idle"
                ? "Start Recording"
                : "New Recording"}
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
              Connecting...
            </button>
          );
        default:
          return null;
      }
    };
    
    return (
      <div className="action-buttons">
        {renderPrimaryButton()}
        {(activeConsultation.sessionState === "recording" ||
          activeConsultation.sessionState === "paused") && (
          <button
            onClick={handleStopAndGenerate}
            className="button button-secondary"
          >
            Stop Session
          </button>
        )}
      </div>
    );
  };

  // Main render
  return (
    <div className="app-shell">
      <Sidebar
        consultations={consultations}
        patients={patients}
        activeConsultationId={activeConsultationId}
        onConsultationSelect={handleConsultationSelectSamePatientAware}
        onAddConsultationForPatient={addConsultationForPatient}
        onAddNewPatient={() => setShowNewPatientModal(true)}
        onRenameConsultation={handleRenameConsultation}
        onDeleteConsultation={handleDeleteConsultation}
        onDeletePatient={handleDeletePatient}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        isHydrating={hydrationState?.status === "loading"}
        // NEW: allow sign-out from sidebar on mobile
        onSignOut={handleSignOut}
      />

      <button
        type="button"
        className="global-signout-button"
        onClick={handleSignOut}
        aria-label="Sign out of StethoscribeAI"
      >
        Sign out
      </button>

      <div className="app-main">
        <button
          className="mobile-menu-button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>

        {hydrationState?.status === "error" && (
          <HydrationErrorOverlay 
            error={hydrationState.error}
            onRetry={forceHydrate}
          />
        )}

        <main className="workspace">
          {hydrationState?.status === "loading" ? (
            <div className="panel start-screen-panel">
              <LoadingAnimation message={hydrationState.message || "Fetching patients..."} />
            </div>
          ) : consultations.length === 0 && patients.length === 0 ? (
            <WelcomeScreen onAddNewPatient={() => setShowNewPatientModal(true)} />
          ) : activeConsultation ? (
            <div className="panel">
              <div className="panel-header-sticky">
                <div className="tabs-container">
                  <button
                    className={`tab-link ${
                      activeConsultation.activeTab === "patient" ? "active" : ""
                    }`}
                    onClick={() => handleTabChange("patient")}
                  >
                    Patient Information
                  </button>

                  <button
                    className={`tab-link ${
                      activeConsultation.activeTab === "transcript" ? "active" : ""
                    }`}
                    onClick={() => handleTabChange("transcript")}
                  >
                    Live Transcript
                  </button>

                  <button
                    className={`tab-link ${
                      activeConsultation.activeTab === "note" ? "active" : ""
                    }`}
                    onClick={() => handleTabChange("note")}
                  >
                    Clinical Note
                  </button>
                </div>
                
                {hydrationState?.status === "loading" && (
                  <div className="hydration-loading-indicator">
                    <div className="loading-spinner"></div>
                    <span>{hydrationState.message || "Loading data..."}</span>
                  </div>
                )}
              </div>

              <div className="tab-content">
                {activeConsultation.activeTab === "transcript" ? (
                  <TranscriptPanel
                    activeConsultation={activeConsultation}
                    transcriptEndRef={transcriptEndRef}
                    onSpeakerRoleToggle={handleSpeakerRoleToggle}
                    renderActionButtons={renderActionButtons}
                    getStatusDisplay={getStatusDisplay}
                    updateConsultation={updateConsultation}
                    activeConsultationId={activeConsultationId}
                  />
                ) : activeConsultation.activeTab === "patient" ? (
                  <PatientInfoPanel
                    activeConsultation={activeConsultation}
                    updateConsultation={updateConsultation}
                    activeConsultationId={activeConsultationId}
                    onRegenerateNote={handleGenerateNote}
                  />
                ) : (
                  <>
                    <div className="notes-content">
                      <NoteEditor
                        notes={activeConsultation.notes}
                        setNotes={(newNotes) =>
                          updateConsultation(activeConsultationId, {
                            notes: newNotes,
                          })
                        }
                        loading={activeConsultation.loading}
                        error={activeConsultation.error}
                        noteType={activeConsultation.noteType}
                        onNoteTypeChange={handleNoteTypeChange}
                        onRegenerate={handleGenerateNote}
                        transcriptSegments={activeConsultation.transcriptSegments}
                      />
                    </div>
                    <CommandBar
                      notes={activeConsultation.notes}
                      setNotes={(newNotes) =>
                        updateConsultation(activeConsultationId, {
                          notes: newNotes,
                        })
                      }
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            <EmptyStateView onAddNewPatient={() => setShowNewPatientModal(true)} />
          )}
        </main>
      </div>

      {showNewPatientModal && (
        <NewPatientModal
          onClose={() => setShowNewPatientModal(false)}
          onSave={handleAddNewPatient}
        />
      )}
    </div>
  );
}