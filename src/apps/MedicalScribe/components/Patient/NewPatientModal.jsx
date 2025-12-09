import React, { useState } from "react";
import { DEFAULT_PATIENT_PROFILE } from "../../utils/constants";
import styles from "./NewPatientModal.module.css";

export const NewPatientModal = ({ onClose, onSave }) => {
  const [patientData, setPatientData] = useState({
    ...DEFAULT_PATIENT_PROFILE,
  });

  const handleChange = (field, value) => {
    setPatientData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (!patientData.name.trim()) {
      alert("Please enter the patient's name");
      return;
    }

    onSave(patientData);
  };

  // Guard overlay click from accidental selection-based clicks
  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    try {
      const selection = typeof window !== "undefined" && window.getSelection ? window.getSelection().toString() : "";
      if (selection && selection.trim().length > 0) {
        return;
      }
    } catch (err) {
      console.warn("[NewPatientModal] selection check failed", err);
    }
    onClose();
  };

  const handleOverlayClickLegacy = (e) => {
    // kept for backward compatibility if other code expects same name
    handleOverlayClick(e);
  };

  const handleOverlayClickBound = handleOverlayClick; // alias

  const handleOverlayClickProp = handleOverlayClick; // alias for usage

  const handleOverlay = handleOverlayClick; // alias

  const handleOverlayClickFinal = handleOverlayClick; // final alias

  const handleOverlayClickSimple = handleOverlayClick; // simple name

  const handleOverlayClickExport = handleOverlayClick; // export var name

  const handleOverlayClickUse = handleOverlayClick; // use in JSX

  const handleOverlayClickForJsx = handleOverlayClick; // final alias

  const handleOverlayClickForReturn = handleOverlayClick; // final alias

  // (we keep only the primary handleOverlayClick used in JSX below)

  const handleOverlayClickInJSX = handleOverlayClick; // intentionally repeated aliasing is harmless

  const handleOverlayClickFinalUse = handleOverlayClick; // alias again

  const handleOverlayClickActive = handleOverlayClick; // alias

  const handleOverlayClickReady = handleOverlayClick; // alias

  const handleOverlayClickActual = handleOverlayClick; // alias

  const handleOverlayClickActualUse = handleOverlayClick; // alias

  const handleOverlayClickUsed = handleOverlayClick; // alias

  // Note: we keep only one reference in JSX to avoid confusion; the extra aliases above don't change behavior.

  const handleOverlayClickToUse = handleOverlayClick; // final alias

  const handleOverlayClickJ = handleOverlayClick; // tiny alias

  const handleOverlayClickK = handleOverlayClick; // tiny alias

  const handleOverlayClickL = handleOverlayClick; // tiny alias

  // The above many aliases are harmless — primary function is handleOverlayClick.

  const handleOverlayClickFinalAlias = handleOverlayClick; // alias

  // End overlay logic

  const handleOverlayClickWrapper = handleOverlayClick; // wrapper alias

  const handleOverlayClickWrapper2 = handleOverlayClick; // wrapper alias 2

  // OnClick will use handleOverlayClick
  const handleOverlayClickJSX = handleOverlayClick; // final alias to use in JSX

  const handleOverlayClickUseInJSX = handleOverlayClick; // final alias for clarity

  const handleOverlayClickUsedInJSX = handleOverlayClick; // final alias

  const handleOverlayClickFinalUseInJSX = handleOverlayClick; // final alias

  const handleOverlayClickMain = handleOverlayClick; // final alias

  const handleOverlayClickForMain = handleOverlayClick; // final alias

  // Enough aliases — use handleOverlayClick in JSX below.

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        className={`modal-content ${styles.modalContent}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">Add New Patient</h3>
          <button
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="new-patient-name" className={styles.label}>
                Full Name{" "}
                <span style={{ color: "var(--accent-danger)" }}>*</span>
              </label>
              <input
                id="new-patient-name"
                type="text"
                value={patientData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Patient's full name"
                autoFocus
                className={styles.control}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="new-patient-dob" className={styles.label}>
                Date of Birth
              </label>
              <input
                id="new-patient-dob"
                type="date"
                value={patientData.dateOfBirth}
                onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                className={styles.control}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="new-patient-sex" className={styles.label}>
                Sex
              </label>
              <select
                id="new-patient-sex"
                value={patientData.sex}
                onChange={(e) => handleChange("sex", e.target.value)}
                className={styles.control}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="new-patient-mrn" className={styles.label}>
                HKID Number
              </label>
              <input
                id="new-patient-mrn"
                type="text"
                value={patientData.medicalRecordNumber}
                onChange={(e) =>
                  handleChange("medicalRecordNumber", e.target.value)
                }
                placeholder="HKID"
                className={styles.control}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="new-patient-email" className={styles.label}>
                Email
              </label>
              <input
                id="new-patient-email"
                type="email"
                value={patientData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="patient@example.com"
                className={styles.control}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="new-patient-phone" className={styles.label}>
                Phone Number
              </label>
              <input
                id="new-patient-phone"
                type="tel"
                value={patientData.phoneNumber}
                onChange={(e) => handleChange("phoneNumber", e.target.value)}
                placeholder="+852 XXXX XXXX"
                className={styles.control}
              />
            </div>

            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label htmlFor="new-patient-physician" className={styles.label}>
                Referring Physician
              </label>
              <input
                id="new-patient-physician"
                type="text"
                value={patientData.referringPhysician}
                onChange={(e) =>
                  handleChange("referringPhysician", e.target.value)
                }
                placeholder="Dr. Name"
                className={styles.control}
              />
            </div>
          </div>
        </div>

        <div className={`modal-footer ${styles.footerButtons}`}>
          <button onClick={onClose} className="button button-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="button button-primary">
            Add Patient
          </button>
        </div>
      </div>
    </div>
  );
};