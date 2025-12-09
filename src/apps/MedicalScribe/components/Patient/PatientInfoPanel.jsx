import React, { useRef, useEffect } from "react";
import styles from "./PatientInfoPanel.module.css";

export const PatientInfoPanel = ({
  activeConsultation,
  updateConsultation,
  activeConsultationId,
  onRegenerateNote,
}) => {
  const previousPatientInfoRef = useRef(null);

  useEffect(() => {
    if (previousPatientInfoRef.current === null) {
      previousPatientInfoRef.current = {
        ...activeConsultation.patientProfile,
        additionalContext: activeConsultation.additionalContext,
      };
      return;
    }

    if (!activeConsultation.notes) {
      previousPatientInfoRef.current = {
        ...activeConsultation.patientProfile,
        additionalContext: activeConsultation.additionalContext,
      };
      return;
    }

    const currentPatientInfo = {
      ...activeConsultation.patientProfile,
      additionalContext: activeConsultation.additionalContext,
    };

    const hasChanged =
      JSON.stringify(currentPatientInfo) !==
      JSON.stringify(previousPatientInfoRef.current);

    if (hasChanged) {
      onRegenerateNote();
      previousPatientInfoRef.current = currentPatientInfo;
    }
  }, [
    activeConsultation.patientProfile,
    activeConsultation.additionalContext,
    activeConsultation.notes,
    onRegenerateNote,
  ]);

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Patient Information</h3>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="patient-name" className={styles.label}>
            Full Name
          </label>
          <input
            id="patient-name"
            type="text"
            value={activeConsultation.patientProfile.name}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  name: e.target.value,
                },
              })
            }
            placeholder="Patient's full name"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="patient-dob" className={styles.label}>
            Date of Birth
          </label>
          <input
            id="patient-dob"
            type="date"
            value={activeConsultation.patientProfile.dateOfBirth}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  dateOfBirth: e.target.value,
                },
              })
            }
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="patient-sex" className={styles.label}>
            Sex
          </label>
          <select
            id="patient-sex"
            value={activeConsultation.patientProfile.sex}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  sex: e.target.value,
                },
              })
            }
            className={styles.select}
          >
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="patient-mrn" className={styles.label}>
            HKID Number
          </label>
          <input
            id="patient-mrn"
            type="text"
            value={activeConsultation.patientProfile.medicalRecordNumber}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  medicalRecordNumber: e.target.value,
                },
              })
            }
            placeholder="HKID"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="patient-email" className={styles.label}>
            Email
          </label>
          <input
            id="patient-email"
            type="email"
            value={activeConsultation.patientProfile.email}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  email: e.target.value,
                },
              })
            }
            placeholder="patient@example.com"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="patient-phone" className={styles.label}>
            Phone Number
          </label>
          <input
            id="patient-phone"
            type="tel"
            value={activeConsultation.patientProfile.phoneNumber}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  phoneNumber: e.target.value,
                },
              })
            }
            placeholder="+852 XXXX XXXX"
            className={styles.input}
          />
        </div>
        <div className={`${styles.field} ${styles.fullWidth}`}>
          <label htmlFor="referring-physician" className={styles.label}>
            Referring Physician
          </label>
          <input
            id="referring-physician"
            type="text"
            value={activeConsultation.patientProfile.referringPhysician}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                patientProfile: {
                  ...activeConsultation.patientProfile,
                  referringPhysician: e.target.value,
                },
              })
            }
            placeholder="Dr. Name"
            className={styles.input}
          />
        </div>
        <div className={`${styles.field} ${styles.fullWidth}`}>
          <label htmlFor="additional-context" className={styles.label}>
            Additional Context
          </label>
          <textarea
            id="additional-context"
            value={activeConsultation.additionalContext}
            onChange={(e) =>
              updateConsultation(activeConsultationId, {
                additionalContext: e.target.value,
              })
            }
            placeholder="Paste any relevant patient history, medications, allergies, chronic conditions, or context here..."
            rows={4}
            className={styles.textarea}
          />
        </div>
      </div>
    </div>
  );
};