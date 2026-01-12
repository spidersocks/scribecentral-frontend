import React, { useEffect, useRef } from "react";
import { TranscriptSegment } from "./TranscriptSegment";
import { getFriendlySpeakerLabel } from "../../utils/helpers";
import { LoadingAnimation } from "../shared/LoadingAnimation";
import styles from "./TranscriptPanel.module.css";

export const TranscriptPanel = ({
  activeConsultation,
  transcriptEndRef, // This ref is still useful for initial load or manual scroll to bottom
  onSpeakerRoleToggle,
  renderActionButtons,
  getStatusDisplay,
  updateConsultation,
  activeConsultationId,
}) => {
  const containerRef = useRef(null);
  const noSegmentsYet = activeConsultation.transcriptSegments.size === 0;
  const isIdleOrStopped = ["idle", "stopped"].includes(activeConsultation.sessionState);
  const isActiveSession = ["recording", "paused", "connecting"].includes(
    activeConsultation.sessionState
  );

  // Auto-scroll logic
  useEffect(() => {
    // Only auto-scroll if session is active or we just loaded a transcript
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Check if user is near bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    // Always scroll on first load of content
    if (activeConsultation.transcriptSegments.size > 0 && isNearBottom) {
       container.scrollTop = container.scrollHeight;
    }
  }, [activeConsultation.transcriptSegments, activeConsultation.interimTranscript]);

  return (
    <>
      {activeConsultation.sessionState === "idle" && (
        <div className={styles.inTranscriptControls}>
          {/* Language selector removed since Alibaba path auto-detects language */}
          {renderActionButtons()}
        </div>
      )}
      {activeConsultation.sessionState !== "idle" && (
        <div className={styles.recordingControlsBar}>
          <div className={styles.statusDisplay}>{getStatusDisplay()}</div>
          {renderActionButtons()}
        </div>
      )}
      <div className={styles.transcriptBox} ref={containerRef}>
        {activeConsultation.transcriptLoading && !isActiveSession ? (
          <div className={styles.loadingContainer}>
            <LoadingAnimation message="Loading transcript..." />
          </div>
        ) : noSegmentsYet && isIdleOrStopped ? (
          <div className={styles.emptyTranscript}>
            <h4>No transcript yet</h4>
            <p>Start a recording to see the live transcript here.</p>
          </div>
        ) : activeConsultation.transcriptSegments.size > 0 ||
          ["recording", "paused", "connecting"].includes(
            activeConsultation.sessionState
          ) ? (
          <>
            {Array.from(activeConsultation.transcriptSegments.values()).map(
              (seg) => (
                <TranscriptSegment
                  key={seg.id}
                  segment={seg}
                  speakerRoles={activeConsultation.speakerRoles}
                  onSpeakerRoleToggle={onSpeakerRoleToggle}
                />
              )
            )}
            {activeConsultation.interimTranscript && (
              <p className={styles.interimTranscript}>
                [
                {getFriendlySpeakerLabel(
                  activeConsultation.interimSpeaker,
                  activeConsultation.speakerRoles
                )}
                ]: {activeConsultation.interimTranscript}
              </p>
            )}
            {/* Keeping the ref here for external control if needed, but scrolling is primarily handled by containerRef */}
            <div ref={transcriptEndRef} style={{ float: "left", clear: "both" }} />
          </>
        ) : null}
      </div>
    </>
  );
};