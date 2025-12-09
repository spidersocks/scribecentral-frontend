import React, { useState, useEffect, useRef } from "react";
import styles from "./NewNoteTemplateModal.module.css";

export const NewNoteTemplateModal = ({
  onClose,
  onSave,
  initialValue = null,
}) => {
  const [name, setName] = useState(initialValue?.name || "");
  const [sections, setSections] = useState(
    initialValue?.sections?.length
      ? initialValue.sections.map((s, i) => ({
          id: s.id || `sec_${i + 1}`,
          name: s.name || "",
          description: s.description || "",
        }))
      : [{ id: "sec_1", name: "", description: "" }]
  );
  const [exampleNoteText, setExampleNoteText] = useState(initialValue?.exampleNoteText || "");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  useEffect(() => {
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, sections]);

  const validate = () => {
    if (!name.trim()) {
      setError("Template name is required.");
      return false;
    }
    if (sections.length < 1 || sections.length > 8) {
      setError("Templates must have between 1 and 8 sections.");
      return false;
    }
    const invalid = sections.some((s) => !s.name.trim() || !s.description.trim());
    if (invalid) {
      setError("Each section needs a name and a description.");
      return false;
    }
    setError("");
    return true;
  };

  const addSection = () => {
    if (sections.length >= 8) return;
    setSections((prev) => [...prev, { id: `sec_${prev.length + 1}`, name: "", description: "" }]);
    // small timeout to allow scroll-to-bottom later if caller wants
  };

  const removeSection = (idx) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSection = (idx, field, value) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    // Keep it simple for now: accept text/markdown only
    if (!/^text\/(plain|markdown)$/.test(file.type)) {
      alert("Please upload a plain text or markdown file.");
      return;
    }
    const text = await file.text().catch(() => "");
    setExampleNoteText((prev) => (prev ? `${prev}\n\n${text}` : text));
    setSelectedFileName(file.name || "");
  };

  const handleSave = () => {
    if (!validate()) return;
    const payload = {
      name: name.trim(),
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name.trim(),
        description: s.description.trim(),
      })),
      exampleNoteText: exampleNoteText || "",
    };
    // No persistence here — parent can wire this later
    try {
      onSave?.(payload);
    } finally {
      onClose?.();
    }
  };

  // Guard overlay close so selecting text and releasing mouse outside won't close the modal
  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;

    // If the user has an active text selection, do NOT close the modal.
    // This covers the case where selection started inside the modal and mouseup occurred outside.
    try {
      const selection = typeof window !== "undefined" && window.getSelection ? window.getSelection().toString() : "";
      if (selection && selection.trim().length > 0) {
        // keep selection; do not close
        return;
      }
    } catch (err) {
      // If something goes wrong with selection retrieval, fall back to closing.
      // But swallow error to avoid breaking UI.
      console.warn("[NewNoteTemplateModal] selection check failed", err);
    }

    onClose?.();
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className={`modal-content ${styles.modalContent}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{initialValue ? "Edit Template" : "New Note Template"}</h3>
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label}>
              Template Name <span className={styles.req}>*</span>
            </label>
            <input
              type="text"
              className={styles.control}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Oncology Follow-up Note"
              autoFocus
            />
          </div>

          <div className={styles.sectionsWrapper}>
            <div className={styles.sectionsHeader}>
              <span className={styles.sectionsTitle}>Sections</span>
              <span className={styles.sectionsCount}>{sections.length} / 8</span>
            </div>

            <div className={styles.sectionsList} role="list">
              {sections.map((sec, idx) => (
                <div key={sec.id} className={styles.sectionRow} role="listitem">
                  <div className={styles.sectionInner}>
                    <div className={styles.sectionHeader}>
                      <label className={styles.smallLabel}>Section name</label>
                      <input
                        type="text"
                        className={styles.sectionInput}
                        value={sec.name}
                        onChange={(e) => updateSection(idx, "name", e.target.value)}
                        placeholder={`Section ${idx + 1} name`}
                      />
                    </div>

                    <div className={styles.sectionBody}>
                      <label className={styles.smallLabel}>Description (what to write)</label>
                      <textarea
                        className={styles.sectionTextarea}
                        rows={3}
                        value={sec.description}
                        onChange={(e) => updateSection(idx, "description", e.target.value)}
                        placeholder="Describe what content should go here…"
                      />
                    </div>
                  </div>

                  {/* compact remove button placed top-right of each section */}
                  <button
                    type="button"
                    className={styles.removeIcon}
                    onClick={() => removeSection(idx)}
                    aria-label={`Remove section ${idx + 1}`}
                    title="Remove section"
                    disabled={sections.length <= 1}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add section button placed after the list and sticky within the scroll area */}
            <div className={styles.addSectionWrap}>
              <button
                type="button"
                className={styles.addSectionButton}
                onClick={addSection}
                disabled={sections.length >= 8}
              >
                + Add section
              </button>
              <div className={styles.addHint}>Tip: You can add up to 8 sections</div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Example Note (optional)</label>
            <textarea
              className={styles.control}
              rows={6}
              value={exampleNoteText}
              onChange={(e) => setExampleNoteText(e.target.value)}
              placeholder="Paste an example note to guide structure and tone."
            />

            <div className={styles.uploadRow}>
              <input
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".txt,text/plain,.md,text/markdown"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={triggerFilePicker}
              >
                Attach file
              </button>
              <span className={styles.fileName}>
                {selectedFileName || "No file chosen"}
              </span>
            </div>
          </div>

          {error && <div className={styles.errorText}>{error}</div>}
        </div>

        <div className="modal-footer modal-footer-buttons">
          <button className="button button-secondary" onClick={onClose}>Cancel</button>
          <button className="button button-primary" onClick={handleSave} disabled={!!error}>
            {initialValue ? "Save Changes" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
};