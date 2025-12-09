export interface PatientProfile {
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: string;
  medicalRecordNumber: string;
  referringPhysician: string;
  email: string;
  phoneNumber: string;
}

export interface PatientRecord {
  id: string;
  ownerUserId: string;
  displayName: string;
  profile: PatientProfile;
  createdAt: string;  // ISO-8601
  updatedAt?: string; // ISO-8601
}

export interface ConsultationRecord {
  id: string;
  ownerUserId: string;
  patientId: string;
  patientName: string;
  title: string;
  noteType: string;
  language: string;
  additionalContext: string;
  speakerRoles: Record<string, string>;
  sessionState: "idle" | "recording" | "stopped";
  connectionStatus: "connected" | "disconnecting" | "disconnected";
  hasShownHint: boolean;
  customNameSet: boolean;
  activeTab: "patient" | "transcript" | "note";
  createdAt: string;
  updatedAt: string;
}

export interface EntityTrait {
  Name: string;
  Score: number;
}

export interface TranscriptEntity {
  BeginOffset: number;
  EndOffset: number;
  Category: string;
  Type: string;
  Traits?: EntityTrait[];
}

export interface ScreenTranscriptSegment {
  id: string;
  speaker: string | null;
  text: string;
  displayText: string;
  translatedText: string | null;
  entities: TranscriptEntity[];
}

export interface PersistedTranscriptSegment extends ScreenTranscriptSegment {
  consultationId: string;
  segmentIndex: number;
}