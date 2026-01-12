import React, { useState, useEffect } from "react";
import { useAuth } from "../../AuthGate";
import { NewNoteTemplateModal } from "./NewNoteTemplateModal";
import styles from "./ManageTemplatesModal.module.css";
import { apiClient } from "../../utils/apiClient";
import { syncService } from "../../utils/syncService";
import { ENABLE_BACKGROUND_SYNC } from "../../utils/constants";

export const ManageTemplatesModal = ({ onClose, onTemplatesChange }) => {
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
      let savedData = null;
      
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
          savedData = res.data;
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
          savedData = res.data;
        } else {
          const msg = res?.error?.message || `Failed to create template (status ${res?.status})`;
          setError(msg);
        }
      }

      // If save was successful, trigger background sync and notify parent
      if (savedData) {
        if (ENABLE_BACKGROUND_SYNC && ownerUserId) {
          syncService.enqueueTemplateUpsert({
            id: savedData.id,
            ownerUserId: ownerUserId,
            name: savedData.name,
            sections: savedData.sections,
            example_text: savedData.example_text ?? "",
            created_at: savedData.created_at ?? new Date().toISOString(),
            updated_at: savedData.updated_at ?? new Date().toISOString(),
          });
        }
        
        // NOTIFY PARENT to refresh dropdown
        if (onTemplatesChange) {
          onTemplatesChange();
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
    
    // Notify parent immediately
    if (onTemplatesChange) {
      onTemplatesChange();
    }
    
    // Fire and forget API call
    apiClient.deleteTemplate({ token, templateId: id }).catch(console.error);
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
        <div className={`modal-content ${styles.manageModal}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Manage Templates</h3>
            <button className="modal-close-button" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="modal-body">
            {loading ? (
              <LoadingAnimation />
            ) : templates.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No custom templates yet.</p>
                <p>Create a template to use it when generating notes.</p>
              </div>
            ) : (
              <div className={styles.templateList}>
                {templates.map((t) => {
                  const sectionsCount = Array.isArray(t.sections) ? t.sections.length : 0;
                  const updatedDate = new Date(t.updated_at ?? t.updatedAt ?? t.created_at ?? Date.now()).toLocaleString();
                  return (
                    <div key={t.id} className={styles.templateRow}>
                      <div className={styles.templateInfo}>
                        <div className={styles.templateName}>{t.name}</div>
                        <div className={styles.templateMeta}>
                          {sectionsCount} section{sectionsCount !== 1 ? "s" : ""}
                          •
                          Updated: {updatedDate}
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
                          className={`button ${styles.deleteButton}`}
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
            {error && <div className="error-box">{error}</div>}
          </div>

          <div className="modal-footer modal-footer-buttons">
            <button
              className="button button-primary"
              onClick={() => {
                setEditingTemplate(null);
                setShowNew(true);
              }}
            >
              + New Template
            </button>
            <button className="button button-secondary" onClick={onClose}>
              Done
            </button>
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