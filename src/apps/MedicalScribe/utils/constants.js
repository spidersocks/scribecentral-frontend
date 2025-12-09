// Backend URLs are driven by env. In production, use HTTPS/WSS to avoid mixed-content blocking.
export const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "";
export const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";

// Example production configuration:
// VITE_BACKEND_API_URL = https://api.scribecentral.io
// VITE_BACKEND_WS_URL  = wss://api.scribecentral.io/client-transcribe

export const DEFAULT_NOTE_TYPES = [
  { id: "standard", name: "Standard Clinical Note" },
  { id: "soap", name: "SOAP Note" },
  { id: "hp", name: "History & Physical (H&P)" },
  { id: "consultation", name: "Consultation Note" },
];

export const DEFAULT_PATIENT_PROFILE = {
  name: "",
  dateOfBirth: "",
  sex: "",
  medicalRecordNumber: "",
  referringPhysician: "",
  email: "",
  phoneNumber: "",
};

export const ENABLE_BACKGROUND_SYNC =
  import.meta?.env?.VITE_ENABLE_BACKGROUND_SYNC === "true";

export const DEFAULT_CONSULTATION = {
  sessionState: "idle",
  connectionStatus: "disconnected",
  transcriptSegments: new Map(),
  interimTranscript: "",
  interimSpeaker: null,
  notes: null,
  loading: false,
  error: null,
  language: "en-US",
  speakerRoles: {},
  activeTab: "patient",
  hasShownHint: false,
  patientProfile: { ...DEFAULT_PATIENT_PROFILE },
  additionalContext: "",
  customNameSet: false,
  noteType: "standard",
  patientId: null,
  patientName: null,
  createdAt: null,
  updatedAt: null,
  transcriptLoading: false,
  transcriptLoaded: false,
};