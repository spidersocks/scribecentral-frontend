/**
 * Shared data contracts for the Medical Scribe frontend.
 * Adjust as you move to TypeScript or change persisted schema.
 */

/**
 * @typedef {Object} PatientProfile
 * @property {string} name
 * @property {string} dateOfBirth
 * @property {string} sex
 * @property {string} medicalRecordNumber
 * @property {string} referringPhysician
 * @property {string} email
 * @property {string} phoneNumber
 */

/**
 * @typedef {Object} PatientRecord
 * @property {string} id
 * @property {string} ownerUserId
 * @property {string} displayName
 * @property {PatientProfile} profile
 * @property {string} createdAt
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ConsultationRecord
 * @property {string} id
 * @property {string} ownerUserId
 * @property {string} patientId
 * @property {string} patientName
 * @property {string} title
 * @property {string} noteType
 * @property {string} language
 * @property {string} additionalContext
 * @property {Record<string,string>} speakerRoles
 * @property {("idle"|"recording"|"stopped")} sessionState
 * @property {("connected"|"disconnecting"|"disconnected")} connectionStatus
 * @property {boolean} hasShownHint
 * @property {boolean} customNameSet
 * @property {("patient"|"transcript"|"note")} activeTab
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} EntityTrait
 * @property {string} Name
 * @property {number} Score
 */

/**
 * @typedef {Object} TranscriptEntity
 * @property {number} BeginOffset
 * @property {number} EndOffset
 * @property {string} Category
 * @property {string} Type
 * @property {EntityTrait[]} [Traits]
 */

/**
 * @typedef {Object} ScreenTranscriptSegment
 * @property {string} id
 * @property {string|null} speaker
 * @property {string} text
 * @property {string} displayText
 * @property {string|null} translatedText
 * @property {TranscriptEntity[]} entities
 */

/**
 * @typedef {ScreenTranscriptSegment & {
 *   consultationId: string;
 *   segmentIndex: number;
 * }} PersistedTranscriptSegment
 */

export {
  /* Intentionally empty: we only need the typedefs for JSDoc tooling. */
};