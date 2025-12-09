// New file: debugUtils.js
import { syncService } from './syncService';

export const debugPersistence = async () => {
  console.group("StethoscribeAI Persistence Debug");
  
  const syncStats = syncService.getStats();
  console.info("Sync Status:", syncStats);
  
  console.info("LocalStorage Contents:");
  try {
    const keys = [
      "consultations",
      "patients",
      "activeConsultationId",
      "syncVersion",
      "lastSyncTimestamp",
      "starredPatients"
    ];
    
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          console.info(`${key}:`, parsed);
          
          if (key === "consultations") {
            // Check if consultations have transcript segments
            parsed.forEach(consultation => {
              console.info(
                `Consultation ${consultation.id} has ` +
                `${Array.isArray(consultation.transcriptSegments) ? 
                  consultation.transcriptSegments.length : 
                  'unknown'} transcript segments`
              );
              
              // Log the first segment to see its structure
              if (Array.isArray(consultation.transcriptSegments) && 
                  consultation.transcriptSegments.length > 0) {
                console.info("Example segment:", consultation.transcriptSegments[0]);
              }
            });
          }
        } catch (e) {
          console.info(`${key}:`, value);
        }
      } else {
        console.info(`${key}: <not set>`);
      }
    });
  } catch (e) {
    console.error("Error inspecting localStorage:", e);
  }
  
  // Check what segments are being synced
  console.info("Triggering transcript segments sync test...");
  
  try {
    // Create a test transcript segment
    const testSegment = {
      id: "test-segment-" + Date.now(),
      text: "Test segment",
      speaker: "spk_0",
      displayText: "Test segment",
      entities: []
    };
    
    const activeConsultationId = localStorage.getItem("activeConsultationId");
    const consultations = JSON.parse(localStorage.getItem("consultations") || "[]");
    const activeConsultation = consultations.find(c => c.id === activeConsultationId);
    
    if (activeConsultation && activeConsultation.ownerUserId) {
      console.info("Attempting to sync a test segment for consultation:", activeConsultationId);
      syncService.enqueueTranscriptSegments(
        activeConsultationId,
        [testSegment],
        0,
        activeConsultation.ownerUserId
      );
      
      await syncService.flushAll("debug-test");
      console.info("Test sync completed");
    } else {
      console.warn("Cannot test sync: No active consultation or missing ownerUserId");
    }
  } catch (error) {
    console.error("Test sync failed:", error);
  }
  
  console.info("Forcing sync flush to check for errors...");
  try {
    await syncService.flushAll("debug");
    console.info("Sync flush completed successfully");
  } catch (error) {
    console.error("Error during sync flush:", error);
  }
  
  console.groupEnd();
  
  return true;
};

// Make it available globally in development mode
window.__stethoscribeDebug = {
  debugPersistence,
  syncService
};

export default debugPersistence;