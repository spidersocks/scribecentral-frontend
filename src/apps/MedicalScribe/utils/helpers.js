export const getAssetPath = (path) => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

export const getFriendlySpeakerLabel = (speakerId, speakerRoles) => {
  if (!speakerId) return "...";
  if (speakerRoles[speakerId]) return speakerRoles[speakerId];
  const speakerNum = parseInt(String(speakerId).replace("spk_", ""), 10);
  return !isNaN(speakerNum) ? `Speaker ${speakerNum + 1}` : speakerId;
};

export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return "";
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age.toString();
};

export const hasPatientProfileContent = (profile) => {
  return !!(
    profile.name ||
    profile.dateOfBirth ||
    profile.sex ||
    profile.medicalRecordNumber ||
    profile.referringPhysician ||
    profile.email ||
    profile.phoneNumber
  );
};

/**
 * Generate patient name for sidebar display
 * Returns just the full name (e.g., "John Smith")
 */
export const generatePatientName = (profile) => {
  if (!profile.name) return null;
  return profile.name;
};

/**
 * Generate consultation name based on date/time
 * Returns formats like:
 * - "Today - 2:30 PM"
 * - "Yesterday - 10:15 AM"
 * - "Nov 15, 2024 - 2:30 PM"
 */
export const generateConsultationName = (createdAt) => {
  if (!createdAt) return "New Consultation";
  
  const date = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Format time
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  // Check if today
  if (date >= today) {
    return `Today - ${timeStr}`;
  }
  
  // Check if yesterday
  if (date >= yesterday) {
    return `Yesterday - ${timeStr}`;
  }
  
  // Older dates
  const dateStr = date.toLocaleDateString('en-US', { 
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  return `${dateStr} - ${timeStr}`;
};

export const to16BitPCM = (input) => {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};

// ===== PATIENT GROUPING UTILITIES =====

/**
 * Generate a stable patient ID from patient profile
 * Uses name + DOB as unique identifier
 */
export const generatePatientId = (profile) => {
  if (!profile.name) return null;
  
  // Create simple hash from name and DOB
  const identifier = `${profile.name.toLowerCase().trim()}_${profile.dateOfBirth || 'unknown'}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `patient_${Math.abs(hash)}`;
};

/**
 * Check if consultation was created within the last 7 days
 */
export const isRecentConsultation = (createdAt) => {
  if (!createdAt) return false;
  
  const consultationDate = new Date(createdAt);
  const now = new Date();
  const daysDiff = (now - consultationDate) / (1000 * 60 * 60 * 24);
  
  return daysDiff <= 7;
};

/**
 * Group consultations by patient
 * Returns structure: { recent: [], patients: { [patientId]: { info, consultations } }, unknown: [] }
 */
export const groupConsultationsByPatient = (consultations) => {
  const result = {
    recent: [],
    patients: {},
    unknown: []
  };
  
  consultations.forEach(consultation => {
    // Check if recent (last 7 days)
    if (isRecentConsultation(consultation.createdAt)) {
      result.recent.push(consultation);
    }
    
    // Group by patient
    if (consultation.patientId) {
      if (!result.patients[consultation.patientId]) {
        result.patients[consultation.patientId] = {
          id: consultation.patientId,
          name: consultation.patientName || 'Unknown Patient',
          consultations: []
        };
      }
      result.patients[consultation.patientId].consultations.push(consultation);
    } else {
      // No patient data
      result.unknown.push(consultation);
    }
  });
  
  // Sort consultations within each patient group by date (newest first)
  Object.values(result.patients).forEach(patient => {
    patient.consultations.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  });
  
  // Sort recent consultations by date (newest first)
  result.recent.sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  // Sort unknown consultations by date (newest first)
  result.unknown.sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  return result;
};

/**
 * Format consultation date for display in sidebar
 */
export const formatConsultationDate = (createdAt) => {
  if (!createdAt) return '';
  
  const date = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Check if today
  if (date >= today) {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  // Check if yesterday
  if (date >= yesterday) {
    return 'Yesterday, ' + date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  // This week
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date >= weekAgo) {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
  
  // Older
  return date.toLocaleDateString('en-US', { 
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};