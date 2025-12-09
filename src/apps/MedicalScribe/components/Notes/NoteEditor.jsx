import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { DEFAULT_NOTE_TYPES } from "../../utils/constants";
import { apiClient } from "../../utils/apiClient";
import {
  formatNotesAsHTML,
  parseHTMLToNotes,
} from "../../utils/noteFormatters";
import {
  UndoIcon,
  RedoIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  SaveIcon,
  CancelIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
} from "../shared/Icons";
import { NoteTypeConfirmationModal } from "../shared/Modal";
import { LoadingAnimation } from "../shared/LoadingAnimation";
import styles from "./NoteEditor.module.css";
import { NewNoteTemplateModal } from "./NewNoteTemplateModal";
import { ManageTemplatesModal } from "./ManageTemplatesModal";
import { useAuth } from "../../AuthGate";

const CONSULTATION_INDICATORS = [
  "consult",
  "asked to see",
  "thank you for asking",
  "referred by dr",
  "requested by dr",
  "specialist",
  "consultation requested",
];

const ADMISSION_INDICATORS = ["admitted", "admission", "hospital", "inpatient"];

const BOOLEAN_TEXT = {
  true: "Yes",
  false: "No",
};

const buildSectionText = (rootNode, nestedClassName) => {
  if (!rootNode) return "";

  let textContent = "";

  rootNode.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "DIV") return;

    node.childNodes.forEach((childNode) => {
      if (childNode.nodeType !== Node.ELEMENT_NODE) return;

      switch (childNode.tagName) {
        case "H3":
          textContent += `\n${childNode.textContent}\n`;
          break;
        case "P":
          textContent += `${childNode.textContent}\n`;
          break;
        case "UL": {
          childNode.querySelectorAll("li").forEach((li) => {
            textContent += `• ${li.textContent}\n`;
          });
          textContent += "\n";
          break;
        }
        default:
          if (childNode.className === nestedClassName) {
            childNode.querySelectorAll("p").forEach((p) => {
              textContent += `${p.textContent}\n`;
            });
            textContent += "\n";
          } else {
            textContent += `${childNode.textContent}\n`;
          }
      }
    });
  });

  return textContent.replace(/\n{3,}/g, "\n\n").trim();
};

const renderNestedSectionValue = (value) =>
  typeof value === "boolean" ? BOOLEAN_TEXT[String(value)] : value;

const createPrintWindow = (title) =>
  window.open("", "", "height=800,width=800") ?? null;

const safeArrayFromMapValues = (mapLike) => {
  if (!mapLike || typeof mapLike.values !== "function") return [];
  return Array.from(mapLike.values());
};

export const NoteEditor = ({
  notes,
  setNotes,
  loading,
  error,
  noteType,
  onNoteTypeChange,
  onRegenerate,
  transcriptSegments,
}) => {
  const { user, userId } = useAuth();
  const ownerUserId = user?.attributes?.sub ?? user?.username ?? userId ?? null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [availableNoteTypes, setAvailableNoteTypes] = useState(
    DEFAULT_NOTE_TYPES.map((t) => ({ ...t, source: "builtin" }))
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingNoteType, setPendingNoteType] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  const editorRef = useRef(null);
  const notesDisplayRef = useRef(null);
  const lastContentRef = useRef("");
  const isUpdatingRef = useRef(false);
  const templateMenuRef = useRef(null);

  const transcriptText = useMemo(() => {
    const segments = safeArrayFromMapValues(transcriptSegments);
    if (!segments.length) return "";

    return segments
      .map((segment) => segment.displayText || segment.text || "")
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }, [transcriptSegments]);

  const checkNoteTypeAppropriateness = useCallback(
    (newType) => {
      // If selecting a custom template, skip heuristics here — assume user knows what they want
      if (typeof newType === "string" && newType.startsWith("template:")) {
        return { appropriate: true };
      }

      if (!transcriptText) return { appropriate: true };

      if (newType === "consultation") {
        const hasConsult = CONSULTATION_INDICATORS.some((indicator) =>
          transcriptText.includes(indicator)
        );

        if (!hasConsult) {
          return {
            appropriate: false,
            warning:
              "This transcript appears to be a direct patient visit, not a consultation.",
            recommendedType: "standard",
            explanation:
              "Consultation notes are for specialist evaluations requested by another provider.",
          };
        }
      }

      if (newType === "hp") {
        const hasAdmission = ADMISSION_INDICATORS.some((indicator) =>
          transcriptText.includes(indicator)
        );

        if (!hasAdmission && transcriptText.length < 3000) {
          return {
            appropriate: false,
            warning:
              "H&P notes are typically for hospital admissions or comprehensive evaluations.",
            recommendedType: "standard",
            explanation:
              "For outpatient visits, consider Standard or SOAP notes.",
          };
        }
      }

      return { appropriate: true };
    },
    [transcriptText]
  );

  const warning = useMemo(() => {
    if (!notes) return null;

    const check = checkNoteTypeAppropriateness(noteType);
    if (!check.appropriate) {
      const recommendedTypeName =
        availableNoteTypes.find((type) => type.id === check.recommendedType)
          ?.name || check.recommendedType;

      return {
        message: `${check.warning} Consider using "${recommendedTypeName}" instead.`,
        severity: "info",
      };
    }

    return null;
  }, [notes, noteType, availableNoteTypes, checkNoteTypeAppropriateness]);

  const pendingTypeInfo = useMemo(
    () =>
      pendingNoteType
        ? availableNoteTypes.find((type) => type.id === pendingNoteType)
        : null,
    [pendingNoteType, availableNoteTypes]
  );

  const pendingTypeCheck = useMemo(
    () =>
      pendingNoteType
        ? checkNoteTypeAppropriateness(pendingNoteType)
        : null,
    [pendingNoteType, checkNoteTypeAppropriateness]
  );

  const recommendedTypeInfo = useMemo(
    () =>
      pendingTypeCheck?.recommendedType
        ? availableNoteTypes.find(
            (type) => type.id === pendingTypeCheck.recommendedType
          )
        : null,
    [pendingTypeCheck, availableNoteTypes]
  );

  const copyIcon = copied ? "✓" : "📋";
  const copyLabel = copied ? "Copied" : "Copy";
  const copyAria = copied ? "Copied to clipboard" : "Copy note to clipboard";

  // Load note types, prefer per-user list when ownerUserId is known.
  const loadNoteTypes = useCallback(async () => {
    try {
      const types = await apiClient.getNoteTypesCached({
        userId: ownerUserId,
        force: !!ownerUserId, // when we have a user, ensure we get the user-specific list
      });
      if (Array.isArray(types) && types.length > 0) {
        // Ensure each item has a source default
        const normalized = types.map((t) => ({ ...(t || {}), source: t?.source || "builtin" }));
        setAvailableNoteTypes(normalized);
      } else {
        setAvailableNoteTypes(DEFAULT_NOTE_TYPES.map((t) => ({ ...t, source: "builtin" })));
      }
    } catch (err) {
      setAvailableNoteTypes(DEFAULT_NOTE_TYPES.map((t) => ({ ...t, source: "builtin" })));
    }
  }, [ownerUserId]);

  const handleUndo = useCallback(() => {
    if (undoStack.length <= 1) return;

    isUpdatingRef.current = true;

    setUndoStack((prev) => {
      const nextUndoStack = [...prev];
      const current = nextUndoStack.pop();
      const previous = nextUndoStack[nextUndoStack.length - 1];

      setRedoStack((redoPrev) => [...redoPrev, current]);
      setEditedContent(previous);
      lastContentRef.current = previous;

      if (editorRef.current) {
        editorRef.current.innerHTML = previous;
      }

      return nextUndoStack;
    });

    requestAnimationFrame(() => {
      isUpdatingRef.current = false;
    });
  }, [undoStack.length]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length) return;

    isUpdatingRef.current = true;

    setRedoStack((prev) => {
      const nextRedoStack = [...prev];
      const next = nextRedoStack.pop();

      setUndoStack((undoPrev) => [...undoPrev, next]);
      setEditedContent(next);
      lastContentRef.current = next;

      if (editorRef.current) {
        editorRef.current.innerHTML = next;
      }

      return nextRedoStack;
    });

    requestAnimationFrame(() => {
      isUpdatingRef.current = false;
    });
  }, [redoStack.length]);

  const saveCursorPosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return {
      offset: preCaretRange.toString().length,
    };
  }, []);

  const restoreCursorPosition = useCallback((position) => {
    if (!position || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    let currentOffset = 0;
    let found = false;

    const findNode = (node) => {
      if (found) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= position.offset) {
          range.setStart(node, position.offset - currentOffset);
          range.collapse(true);
          found = true;
          return;
        }
        currentOffset += nodeLength;
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        node.childNodes.forEach(findNode);
      }
    };

    findNode(editorRef.current);

    if (found) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, []);

  const handleEditorInput = useCallback(
    (event) => {
      if (isUpdatingRef.current) return;

      const cursorPos = saveCursorPosition();
      const content = event.currentTarget.innerHTML;

      if (content !== lastContentRef.current) {
        setUndoStack((prev) => [...prev.slice(-19), lastContentRef.current]);
        setRedoStack([]);
        lastContentRef.current = content;
      }

      setEditedContent(content);

      requestAnimationFrame(() => restoreCursorPosition(cursorPos));
    },
    [restoreCursorPosition, saveCursorPosition]
  );

  const applyFormat = useCallback((command) => {
    document.execCommand(command, false, null);
    editorRef.current?.focus();
  }, []);

  const proceedWithNoteTypeChange = useCallback(
    (newType) => {
      onNoteTypeChange(newType);
      // Pass the literal selected id through to the generator; the generation hook will
      // interpret template:<uuid> specially and include template_id in backend payload.
      onRegenerate(newType);
      setShowConfirmModal(false);
      setPendingNoteType(null);
    },
    [onNoteTypeChange, onRegenerate]
  );

  const handleConfirmModalCancel = useCallback(() => {
    if (!pendingNoteType) {
      setShowConfirmModal(false);
      return;
    }

    const checkResult = checkNoteTypeAppropriateness(pendingNoteType);
    if (checkResult.recommendedType) {
      proceedWithNoteTypeChange(checkResult.recommendedType);
    } else {
      setShowConfirmModal(false);
      setPendingNoteType(null);
    }
  }, [pendingNoteType, checkNoteTypeAppropriateness, proceedWithNoteTypeChange]);

  const handleConfirmModalContinue = useCallback(() => {
    if (!pendingNoteType) return;
    proceedWithNoteTypeChange(pendingNoteType);
  }, [pendingNoteType, proceedWithNoteTypeChange]);

  const handleNoteTypeChangeInternal = useCallback(
    (event) => {
      const newType = event.target.value;
      const checkResult = checkNoteTypeAppropriateness(newType);

      if (!checkResult.appropriate) {
        setPendingNoteType(newType);
        setShowConfirmModal(true);
        return;
      }

      proceedWithNoteTypeChange(newType);
    },
    [checkNoteTypeAppropriateness, proceedWithNoteTypeChange]
  );

  const handleEdit = useCallback(() => {
    const htmlContent = formatNotesAsHTML(notes);
    setEditedContent(htmlContent);
    lastContentRef.current = htmlContent;
    setUndoStack([htmlContent]);
    setRedoStack([]);
    setIsEditing(true);
  }, [notes]);

  const handleSave = useCallback(() => {
    const parsedNotes = parseHTMLToNotes(editedContent);
    setNotes(parsedNotes);
    setIsEditing(false);
    setUndoStack([]);
    setRedoStack([]);
  }, [editedContent, setNotes]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedContent("");
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleCopy = useCallback(() => {
    const notesElement = notesDisplayRef.current;
    if (!notesElement) return;

    const textContent = buildSectionText(notesElement, styles.nestedSection);

    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleDownloadPDF = useCallback(() => {
    const noteTypeName =
      availableNoteTypes.find((type) => type.id === noteType)?.name ||
      "Clinical Note";
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const printWindow = createPrintWindow(noteTypeName);
    if (!printWindow) return;

    const sections = Object.entries(notes ?? {});
    const printableSections = sections.filter(
      ([_, items]) => items && (!Array.isArray(items) || items.length > 0)
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${noteTypeName}</title>
          <style>
            @page { size: A4; margin: 2cm; }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
            }
            .header h1 {
              margin: 0 0 10px 0;
              font-size: 18pt;
              font-weight: bold;
            }
            .header .date {
              font-size: 11pt;
              color: #333;
            }
            h3 {
              font-size: 13pt;
              font-weight: bold;
              margin-top: 20px;
              margin-bottom: 10px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 5px;
              page-break-after: avoid;
            }
            h3:first-of-type { margin-top: 0; }
            p {
              margin: 8px 0;
              text-align: justify;
              page-break-inside: avoid;
            }
            ul {
              margin: 10px 0;
              padding-left: 25px;
              list-style-type: disc;
            }
            li {
              margin: 5px 0;
              page-break-inside: avoid;
            }
            strong { font-weight: bold; }
            .section { margin-bottom: 15px; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${noteTypeName}</h1>
            <div class="date">${currentDate}</div>
          </div>
          ${printableSections
            .map(([section, items]) => {
              if (typeof items === "string") {
                if (items === "None") {
                  return `
                    <div class="section">
                      <h3>${section}</h3>
                      <p><em>${items}</em></p>
                    </div>
                  `;
                }

                if (section === "Assessment and Plan") {
                  const paragraphs = items
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) => `<p>${line.trim()}</p>`)
                    .join("");

                  return `
                    <div class="section">
                      <h3>${section}</h3>
                      ${paragraphs}
                    </div>
                  `;
                }

                return `
                  <div class="section">
                    <h3>${section}</h3>
                    <p>${items}</p>
                  </div>
                `;
              }

              if (Array.isArray(items)) {
                const listItems = items
                  .map((item) => `<li>${item.text}</li>`)
                  .join("");

                return `
                  <div class="section">
                    <h3>${section}</h3>
                    <ul>${listItems}</ul>
                  </div>
                `;
              }

              if (typeof items === "object") {
                const objectEntries = Object.entries(items)
                  .map(
                    ([key, value]) =>
                      `<p><strong>${key}:</strong> ${renderNestedSectionValue(
                        value
                      )}</p>`
                  )
                  .join("");

                return `
                  <div class="section">
                    <h3>${section}</h3>
                    ${objectEntries}
                  </div>
                `;
              }

              return "";
            })
            .join("")}
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  }, [availableNoteTypes, noteType, notes]);

  // Load types when ownerUserId becomes available (or on mount)
  useEffect(() => {
    loadNoteTypes();
  }, [loadNoteTypes, ownerUserId]);

  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (event) => {
      const { ctrlKey, metaKey, shiftKey, key } = event;
      const modifier = ctrlKey || metaKey;

      if (modifier && key === "z" && !shiftKey) {
        event.preventDefault();
        handleUndo();
      }

      const redoCombination =
        (modifier && shiftKey && key === "z") || (modifier && key === "y");

      if (redoCombination) {
        event.preventDefault();
        handleRedo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, handleUndo, handleRedo]);

  // close template menu when clicking outside
  useEffect(() => {
    if (!showTemplateMenu) return;
    const onDocClick = (e) => {
      if (!templateMenuRef.current) return;
      if (!templateMenuRef.current.contains(e.target)) {
        setShowTemplateMenu(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowTemplateMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showTemplateMenu]);

  if (loading) {
    return <LoadingAnimation message="Generating clinical note..." />;
  }

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  if (!notes) {
    return (
      <div className={styles.emptyNote}>
        <h3 className={styles.emptyNoteTitle}>No clinical note yet</h3>
        <p className={styles.emptyNoteSub}>
          Complete a recording session to generate a structured clinical note.
        </p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <>
        <div className={styles.richEditorToolbar}>
          <div className={styles.toolbarSection}>
            <button
              type="button"
              onClick={handleUndo}
              className={styles.toolbarButton}
              disabled={undoStack.length <= 1}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              className={styles.toolbarButton}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <RedoIcon />
            </button>
          </div>

          <div className={styles.toolbarDivider} />

          <div className={styles.toolbarSection}>
            <button
              type="button"
              onClick={() => applyFormat("bold")}
              className={styles.toolbarButton}
              title="Bold (Ctrl+B)"
              aria-label="Bold"
            >
              <BoldIcon />
            </button>
            <button
              type="button"
              onClick={() => applyFormat("italic")}
              className={styles.toolbarButton}
              title="Italic (Ctrl+I)"
              aria-label="Italic"
            >
              <ItalicIcon />
            </button>
            <button
              type="button"
              onClick={() => applyFormat("underline")}
              className={styles.toolbarButton}
              title="Underline (Ctrl+U)"
              aria-label="Underline"
            >
              <UnderlineIcon />
            </button>
            <button
              type="button"
              onClick={() => applyFormat("strikeThrough")}
              className={styles.toolbarButton}
              title="Strikethrough"
              aria-label="Strikethrough"
            >
              <StrikethroughIcon />
            </button>
          </div>

          <div className={styles.toolbarDivider} />

          <div
            className={`${styles.toolbarSection} ${styles.toolbarActions}`}
          >
            <button
              type="button"
              onClick={handleCancel}
              className={`${styles.toolbarActionButton} ${styles.toolbarCancel}`}
              aria-label="Cancel editing"
              title="Cancel"
            >
              <CancelIcon />
              <span className={styles.actionText}>Cancel</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={`${styles.toolbarActionButton} ${styles.toolbarSave}`}
              aria-label="Save changes"
              title="Save changes"
            >
              <SaveIcon />
              <span className={styles.actionText}>Save Changes</span>
            </button>
          </div>
        </div>

        <div
          ref={editorRef}
          className={styles.richEditorContent}
          contentEditable
          onInput={handleEditorInput}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: editedContent }}
        />
      </>
    );
  }

  // Split types into builtins and templates for grouped dropdown rendering
  const builtinTypes = availableNoteTypes.filter((t) => t.source !== "template");
  const templateTypes = availableNoteTypes.filter((t) => t.source === "template");

  return (
    <>
      <NoteTypeConfirmationModal
        show={showConfirmModal}
        noteTypeName={pendingTypeInfo?.name}
        warning={pendingTypeCheck?.warning}
        recommendedType={pendingTypeCheck?.recommendedType}
        recommendedTypeName={recommendedTypeInfo?.name}
        onConfirm={handleConfirmModalContinue}
        onCancel={handleConfirmModalCancel}
      />

      {showNewTemplateModal && (
        <NewNoteTemplateModal
          onClose={() => setShowNewTemplateModal(false)}
          onSave={(payload) => {
            console.log("[Templates] Created payload:", payload);
          }}
        />
      )}

      {showManageTemplates && (
        <ManageTemplatesModal
          onClose={() => setShowManageTemplates(false)}
        />
      )}

      <div className={styles.notesHeaderControls}>
        <div className={styles.noteTypeSelectorContainer}>
          <label
            htmlFor="note-type-select"
            className={styles.noteTypeLabel}
          >
            Note Type:
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <select
              id="note-type-select"
              value={noteType}
              onChange={handleNoteTypeChangeInternal}
              className={styles.noteTypeSelect}
              disabled={loading}
              aria-label="Select note type"
            >
              {/* Builtins first */}
              <optgroup label="Built-in">
                {builtinTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </optgroup>

              {templateTypes.length > 0 && (
                <optgroup label="Custom templates">
                  {templateTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} {/* option text can't be styled; label communicates customness via optgroup */}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Single button: "Custom Templates +" opens a small accordion-style menu with Create / Manage */}
            <div className={styles.templateMenuWrapper} ref={templateMenuRef}>
              <button
                type="button"
                className={`button ${styles.iconButton} ${styles.customTemplatesButton}`}
                onClick={() => setShowTemplateMenu((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={showTemplateMenu}
                title="Custom Templates"
              >
                <span className={styles.actionText}>Custom Templates</span>
                <span className={styles.actionIcon} aria-hidden>
                  <PlusIcon />
                </span>
              </button>

              {showTemplateMenu && (
                <div className={styles.templatesMenu} role="menu" aria-label="Custom templates">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.templatesMenuItem}
                    onClick={() => {
                      setShowNewTemplateModal(true);
                      setShowTemplateMenu(false);
                    }}
                  >
                    Create New
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.templatesMenuItem}
                    onClick={() => {
                      setShowManageTemplates(true);
                      setShowTemplateMenu(false);
                    }}
                  >
                    Manage Templates
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.notesActions}>
          <button
            type="button"
            onClick={handleEdit}
            className={`button ${styles.iconButton}`}
            aria-label="Edit note"
            title="Edit"
          >
            <span className={styles.actionIcon} aria-hidden>
              <EditIcon />
            </span>
            <span className={styles.actionText}>Edit</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={`button ${styles.iconButton} ${
              copied ? styles.iconButtonCopied : ""
            }`}
            aria-label={copyAria}
            title={copyLabel}
          >
            <span className={styles.actionIcon} aria-hidden>
              {copyIcon}
            </span>
            <span className={styles.actionText}>{copyLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className={`button ${styles.iconButton}`}
            aria-label="Download as PDF"
            title="PDF"
          >
            <span className={styles.actionIcon} aria-hidden>
              <DownloadIcon />
            </span>
            <span className={styles.actionText}>PDF</span>
          </button>
        </div>
      </div>

      {warning && (
        <div className={styles.warningBanner} role="alert">
          {warning.message}
        </div>
      )}

      <div ref={notesDisplayRef} className={styles.notesDisplay}>
        {Object.entries(notes).map(([section, items]) => {
          if (!items || (Array.isArray(items) && items.length === 0)) {
            return null;
          }
          
          // FIX: Check if an object-type section (like Objective) contains only "None" values.
          const isObjectNone =
            typeof items === "object" &&
            !Array.isArray(items) &&
            items !== null &&
            Object.values(items).every((v) => v === "None");

          if (isObjectNone) {
            return (
              <div key={section}>
                <h3>{section}</h3>
                <p className={styles.noneText}>None</p>
              </div>
            );
          }

          return (
            <div key={section}>
              <h3>{section}</h3>

              {typeof items === "string" ? (
                items === "None" ? (
                  <p className={styles.noneText}>{items}</p>
                ) : section === "Assessment and Plan" ? (
                  items
                    .split("\n")
                    .map((line, index) =>
                      line.trim() ? <p key={index}>{line.trim()}</p> : null
                    )
                ) : (
                  <p>{items}</p>
                )
              ) : Array.isArray(items) ? (
                <ul>
                  {items.map((item, index) => (
                    <li key={index}>{item.text}</li>
                  ))}
                </ul>
              ) : typeof items === "object" ? (
                <div className={styles.nestedSection}>
                  {Object.entries(items).map(([key, value]) => (
                    <p key={key}>
                      <strong>{key}:</strong>{" "}
                      {renderNestedSectionValue(value)}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
};