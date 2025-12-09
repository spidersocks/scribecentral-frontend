import React, { useState, useEffect } from "react";
import { useAuth } from "../../AuthGate";
import { NewNoteTemplateModal } from "./NewNoteTemplateModal";
import styles from "./ManageTemplatesModal.module.css";
import { apiClient } from "../../utils/apiClient";
import { syncService } from "../../utils/syncService";
import { ENABLE_BACKGROUND_SYNC } from "../../utils/constants";

export const ManageTemplatesModal = ({ onClose }) => {
  const { user, accessToken, userId } = useAuth();
  const ownerUserId = user?.attributes?.sub ?? user?.username ?? userId ?? null;
  const token = accessToken;

  const [showNew, setShowNew] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null); // template being edited (or null)

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listTemplates({ token, userId: ownerUserId });
      if (res.ok && Array.isArray(res.data)) {
        setTemplates(res.data);
      } else {
        setTemplates([]);
        console.warn("[Templates] listTemplates failed", res);
      }
    } catch (err) {
      console.error("[Templates] load error", err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unified save handler for create OR update
  const handleSaveTemplate = async (payload) => {
    setError("");
    try {
      if (editingTemplate) {
        // Update existing template
        const updateBody = {
          name: payload.name,
          sections: payload.sections,
          example_text: payload.exampleNoteText ?? "",
        };
        const res = await apiClient.updateTemplate({
          token,
          templateId: editingTemplate.id,
          payload: updateBody,
        });

        if (res.ok && res.data) {
          setTemplates((prev) => prev.map((t) => (t.id === res.data.id ? res.data : t)));
          // enqueue updated template for background sync
          if (ENABLE_BACKGROUND_SYNC && ownerUserId) {
            syncService.enqueueTemplateUpsert({
              id: res.data.id,
              ownerUserId: ownerUserId,
              name: res.data.name,
              sections: res.data.sections,
              example_text: res.data.example_text ?? "",
              created_at: res.data.created_at ?? new Date().toISOString(),
              updated_at: res.data.updated_at ?? new Date().toISOString(),
            });
          }
        } else {
          const msg = res?.error?.message || `Failed to update template (status ${res?.status})`;
          setError(msg);
        }
      } else {
        // Create new template
        const createBody = {
          name: payload.name,
          sections: payload.sections,
          example_text: payload.exampleNoteText ?? "",
        };
        const res = await apiClient.createTemplate({
          token,
          userId: ownerUserId,
          payload: createBody,
        });
        if (res.ok && res.data) {
          setTemplates((prev) => [res.data, ...prev]);
          if (ENABLE_BACKGROUND_SYNC && ownerUserId) {
            syncService.enqueueTemplateUpsert({
              id: res.data.id,
              ownerUserId: ownerUserId,
              name: res.data.name,
              sections: res.data.sections,
              example_text: res.data.example_text ?? "",
              created_at: res.data.created_at ?? new Date().toISOString(),
              updated_at: res.data.updated_at ?? new Date().toISOString(),
            });
          }
        } else {
          const msg = res?.error?.message || `Failed to create template (status ${res?.status})`;
          setError(msg);
        }
      }
    } catch (err) {
      console.error("[Templates] save error", err);
      setError(err?.message || String(err));
    } finally {
      // reset modal/editing
      setEditingTemplate(null);
      setShowNew(false);
    }
  };

  const handleDeleteLocal = (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    // enqueue deletion
    if (ENABLE_BACKGROUND_SYNC && ownerUserId) {
      syncService.enqueueTemplateDeletion(id, ownerUserId);
    }
  };

  const handleEditClick = (t) => {
    // open modal prefilled
    setEditingTemplate({
      id: t.id,
      name: t.name,
      sections: Array.isArray(t.sections) ? t.sections : [],
      exampleNoteText: t.example_text ?? t.exampleNoteText ?? "",
      raw: t.raw ?? null,
    });
    setShowNew(true);
  };

  // overlay click guard to avoid closing while selecting text
  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    try {
      const selection = typeof window !== "undefined" && window.getSelection ? window.getSelection().toString() : "";
      if (selection && selection.trim().length > 0) {
        return;
      }
    } catch (err) {
      console.warn("[ManageTemplatesModal] selection check failed", err);
    }
    onClose();
  };

  return (
    <>
      <div className="modal-overlay" onClick={handleOverlayClick}>
        <div className={`modal-content ${styles.modalContent}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Manage Templates</h3>
            <button className="modal-close-button" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>

          <div className="modal-body">
            {loading ? (
              <div className={styles.empty}>Loading templates…</div>
            ) : templates.length === 0 ? (
              <div className={styles.empty}>
                <p>No custom templates yet.</p>
                <p className={styles.subtle}>Create a template to use it when generating notes.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {templates.map((t) => {
                  const sectionsCount = Array.isArray(t.sections) ? t.sections.length : 0;
                  const updatedDate = new Date(t.updated_at ?? t.updatedAt ?? t.created_at ?? Date.now()).toLocaleString();
                  return (
                    <div key={t.id} className={styles.templateRow}>
                      <div className={styles.templateInfo}>
                        <div className={styles.templateName}>{t.name}</div>
                        <div className={styles.templateMeta}>
                          <span className={styles.metaItem}>{sectionsCount} section{sectionsCount !== 1 ? "s" : ""}</span>
                          <span className={styles.metaDivider}>•</span>
                          <span className={styles.metaItem}>Updated: {updatedDate}</span>
                        </div>
                      </div>

                      <div className={styles.templateActions}>
                        <button
                          className="button button-secondary"
                          onClick={() => handleEditClick(t)}
                          title="Edit template"
                        >
                          Edit
                        </button>

                        <button
                          className="button button-danger"
                          onClick={() => handleDeleteLocal(t.id)}
                          title="Delete template (queued)"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {error && <div className={styles.errorText}>{error}</div>}
          </div>

          <div className="modal-footer modal-footer-buttons">
            <button
              className="button button-secondary"
              onClick={() => {
                setEditingTemplate(null);
                setShowNew(true);
              }}
            >
              + New Template
            </button>
            <button className="button button-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>

      {showNew && (
        <NewNoteTemplateModal
          initialValue={editingTemplate}
          onClose={() => {
            setShowNew(false);
            setEditingTemplate(null);
          }}
          onSave={(payload) => {
            handleSaveTemplate(payload);
          }}
        />
      )}
    </>
  );
};