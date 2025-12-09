import { syncService } from "./syncService";

/**
 * Sync utilities to handle common sync patterns and avoid duplication
 */

/**
 * Handle cascading deletion of a consultation and its associated resources
 * @param {string} consultationId - ID of the consultation to delete
 * @param {string} ownerUserId - Owner user ID for authentication
 * @param {object} options - Additional options
 * @param {string} [options.noteId] - Optional clinical note ID associated with the consultation
 * @returns {void}
 */
export const syncDeleteConsultation = (consultationId, ownerUserId, options = {}) => {
  if (!consultationId || !ownerUserId) {
    console.warn("[syncOperations] Missing required parameters for syncDeleteConsultation");
    return;
  }

  console.info("[syncOperations] Deleting consultation and related resources", {
    consultationId,
    ownerUserId,
    options
  });
  
  // Delete the consultation
  syncService.enqueueConsultationDeletion(consultationId, ownerUserId);
  
  // Delete associated clinical note if provided
  if (options.noteId) {
    syncService.enqueueClinicalNoteDeletion(options.noteId, ownerUserId);
  }
};

/**
 * Handle cascading deletion of a patient and all their associated consultations
 * @param {string} patientId - ID of the patient to delete
 * @param {string} ownerUserId - Owner user ID for authentication
 * @param {object} options - Additional options
 * @param {Array} [options.patientConsultations] - Patient's consultations to delete
 * @returns {void}
 */
export const syncDeletePatient = (patientId, ownerUserId, options = {}) => {
  if (!patientId || !ownerUserId) {
    console.warn("[syncOperations] Missing required parameters for syncDeletePatient");
    return;
  }

  const { patientConsultations = [] } = options;
  
  console.info("[syncOperations] Deleting patient and related resources", {
    patientId,
    ownerUserId,
    consultationCount: patientConsultations.length
  });
  
  // Delete the patient
  syncService.enqueuePatientDeletion(patientId, ownerUserId);
  
  // Delete all consultations belonging to this patient
  patientConsultations.forEach(consultation => {
    syncDeleteConsultation(consultation.id, ownerUserId, {
      noteId: consultation.noteId
    });
  });
};