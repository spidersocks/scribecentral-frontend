import React from "react";
import { getFriendlySpeakerLabel } from "../../utils/helpers";
import { HighlightedText } from "./HighlightedText";
import styles from "./TranscriptSegment.module.css";

export const TranscriptSegment = React.memo(
  ({ segment, speakerRoles, onSpeakerRoleToggle }) => {
    const isEnglishSession = !segment.translatedText;
    const speakerLabel = getFriendlySpeakerLabel(segment.speaker, speakerRoles);

    return (
      <div className={styles.transcriptSegmentContainer}>
        <p
          className={
            isEnglishSession
              ? styles.englishOnlyTranscript
              : styles.originalTranscriptText
          }
        >
          <strong
            className={styles.speakerLabelClickable}
            onClick={() => onSpeakerRoleToggle(segment.speaker)}
            title="Click to change role"
          >
            [{speakerLabel}]:
          </strong>{" "}
          {isEnglishSession ? (
            <HighlightedText text={segment.text} entities={segment.entities} />
          ) : (
            segment.displayText
          )}
        </p>
        {!isEnglishSession && (
          <p className={styles.translatedTranscriptText}>
            <HighlightedText
              text={segment.translatedText}
              entities={segment.entities}
            />
          </p>
        )}
      </div>
    );
  }
);