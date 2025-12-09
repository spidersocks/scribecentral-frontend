import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "../../AuthGate";
import { getAssetPath, formatConsultationDate } from "../../utils/helpers";
import {
  PencilIcon,
  CloseIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MoreVerticalIcon,
  StarIcon,
  DownloadIcon,
  PlusIcon,
} from "../shared/Icons";
import styles from "./Sidebar.module.css";

export const Sidebar = ({
  consultations,
  patients,
  activeConsultationId,
  onConsultationSelect,
  onAddConsultationForPatient,
  onAddNewPatient,
  onRenameConsultation,
  onDeleteConsultation,
  onDeletePatient,
  sidebarOpen,
  onCloseSidebar,
  // NEW: show loading state instead of "No patients yet" while hydrating
  isHydrating = false,
  // NEW: allow sign-out from the sidebar (mobile-friendly)
  onSignOut,
}) => {
  const { displayName, email } = useAuth();

  const userInitials = useMemo(() => {
    const value = displayName || email || "";
    if (!value) return "U";
    const parts = value
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2);
    return parts.length ? parts.join("") : value[0]?.toUpperCase() || "U";
  }, [displayName, email]);

  const [editingConsultationId, setEditingConsultationId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [deletingConsultationId, setDeletingConsultationId] = useState(null);
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [expandedPatients, setExpandedPatients] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [openPatientMenu, setOpenPatientMenu] = useState(null);
  const [starredPatients, setStarredPatients] = useState(() => {
    const saved = localStorage.getItem("starredPatients");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem(
      "starredPatients",
      JSON.stringify([...starredPatients])
    );
  }, [starredPatients]);

  useEffect(() => {
    const handleClickOutside = () => setOpenPatientMenu(null);
    if (openPatientMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openPatientMenu]);

  const groupedData = useMemo(() => {
    const result = {
      patients: {},
      orphaned: [],
    };

    consultations.forEach((consultation) => {
      if (consultation.patientId) {
        if (!result.patients[consultation.patientId]) {
          result.patients[consultation.patientId] = {
            id: consultation.patientId,
            name: consultation.patientName || "Unknown Patient",
            consultations: [],
            mostRecentDate: null,
          };
        }
        result.patients[consultation.patientId].consultations.push(
          consultation
        );

        if (consultation.createdAt) {
          const consultDate = new Date(consultation.createdAt);
          if (
            !result.patients[consultation.patientId].mostRecentDate ||
            consultDate >
              result.patients[consultation.patientId].mostRecentDate
          ) {
            result.patients[consultation.patientId].mostRecentDate = consultDate;
          }
        }
      } else {
        result.orphaned.push(consultation);
      }
    });

    patients.forEach((patient) => {
      if (!result.patients[patient.id]) {
        result.patients[patient.id] = {
          id: patient.id,
          name: patient.name,
          consultations: [],
          mostRecentDate: null,
        };
      }
    });

    Object.values(result.patients).forEach((patient) => {
      patient.consultations.sort((a, b) => {
        if (!a.createdAt && b.createdAt) return -1;
        if (a.createdAt && !b.createdAt) return 1;
        if (!a.createdAt && !b.createdAt) return 0;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    });

    return result;
  }, [consultations, patients]);

  const filteredGroupedData = useMemo(() => {
    if (!searchQuery.trim()) return groupedData;

    const query = searchQuery.toLowerCase();
    const filtered = {
      patients: {},
      orphaned: groupedData.orphaned.filter((c) =>
        c.name.toLowerCase().includes(query)
      ),
    };

    Object.entries(groupedData.patients).forEach(([patientId, patient]) => {
      const matchingConsultations = patient.consultations.filter((c) =>
        c.name.toLowerCase().includes(query)
      );

      if (
        matchingConsultations.length > 0 ||
        patient.name.toLowerCase().includes(query)
      ) {
        filtered.patients[patientId] = {
          ...patient,
          consultations:
            matchingConsultations.length > 0
              ? matchingConsultations
              : patient.consultations,
        };
      }
    });

    return filtered;
  }, [groupedData, searchQuery]);

  const handleRenameConsultation = (id, newName) => {
    onRenameConsultation(id, newName);
    setEditingConsultationId(null);
    setEditingName("");
  };

  const handleEditClick = (e, consultationId, currentName) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingConsultationId(consultationId);
    setEditingName(currentName);
  };

  const handleConsultationClick = (consultationId) => {
    onConsultationSelect(consultationId);
    onCloseSidebar();
  };

  const handleAddNewPatient = () => {
    onAddNewPatient();
    onCloseSidebar();
  };

  const handleDeleteClick = (e, consultationId) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingConsultationId(consultationId);
  };

  const confirmDelete = () => {
    onDeleteConsultation(deletingConsultationId);
    setDeletingConsultationId(null);
  };

  const cancelDelete = () => {
    setDeletingConsultationId(null);
  };

  const togglePatientExpanded = (patientId) => {
    setExpandedPatients((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) {
        next.delete(patientId);
      } else {
        next.add(patientId);
      }
      return next;
    });
  };

  const handleAddConsultationForPatient = (e, patientId) => {
    e.stopPropagation();
    onAddConsultationForPatient(patientId);
    onCloseSidebar();
  };

  const togglePatientMenu = (e, patientId) => {
    e.stopPropagation();
    setOpenPatientMenu(openPatientMenu === patientId ? null : patientId);
  };

  const handleDeletePatient = (e, patientId) => {
    e.stopPropagation();
    setDeletingPatientId(patientId);
    setOpenPatientMenu(null);
  };

  const confirmDeletePatient = () => {
    onDeletePatient(deletingPatientId);
    setDeletingPatientId(null);
  };

  const toggleStarPatient = (e, patientId) => {
    e.stopPropagation();
    setStarredPatients((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) {
        next.delete(patientId);
      } else {
        next.add(patientId);
      }
      return next;
    });
    setOpenPatientMenu(null);
  };

  const handleExportPatientNotes = async (e, patientId) => {
    e.stopPropagation();
    alert("Export feature coming soon!");
    setOpenPatientMenu(null);
  };

  const renderConsultationItem = (consultation) => {
    if (editingConsultationId === consultation.id) {
      return (
        <div
          key={consultation.id}
          className={`${styles.sidebarConsultationItem} ${styles.sidebarConsultationItemEditing}`}
        >
          <input
            type="text"
            className={styles.sidebarRenameInput}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={() =>
              handleRenameConsultation(consultation.id, editingName)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter")
                handleRenameConsultation(consultation.id, editingName);
              if (e.key === "Escape") {
                setEditingConsultationId(null);
                setEditingName("");
              }
            }}
            autoFocus
          />
        </div>
      );
    }

    const isActive = activeConsultationId === consultation.id;

    return (
      <div
        key={consultation.id}
        className={`${styles.sidebarConsultationItem} ${
          isActive ? styles.sidebarConsultationItemActive : ""
        }`}
      >
        <a
          className={styles.sidebarLink}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleConsultationClick(consultation.id);
          }}
        >
          <div className={styles.sidebarLinkContent}>
            <span className={styles.sidebarLinkText}>{consultation.name}</span>
            <span className={styles.sidebarLinkDate}>
              {consultation.createdAt
                ? formatConsultationDate(consultation.createdAt)
                : "Not started"}
            </span>
          </div>
        </a>

        <div className={styles.sidebarIcons}>
          <div
            className={styles.editIconWrapper}
            onClick={(e) =>
              handleEditClick(e, consultation.id, consultation.name)
            }
            title="Rename consultation"
          >
            <PencilIcon />
          </div>
          <div
            className={styles.deleteIconWrapper}
            onClick={(e) => handleDeleteClick(e, consultation.id)}
            title="Delete consultation"
          >
            <TrashIcon />
          </div>
        </div>
      </div>
    );
  };

  const patientsList = Object.values(filteredGroupedData.patients).sort(
    (a, b) => {
      const aStarred = starredPatients.has(a.id);
      const bStarred = starredPatients.has(b.id);
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;

      if (a.mostRecentDate && !b.mostRecentDate) return -1;
      if (!a.mostRecentDate && b.mostRecentDate) return 1;
      if (!a.mostRecentDate && !b.mostRecentDate) {
        return a.name.localeCompare(b.name);
      }
      return b.mostRecentDate - a.mostRecentDate;
    }
  );

  const hasPatients = patientsList.length > 0;
  const hasOrphaned = filteredGroupedData.orphaned.length > 0;

  return (
    <>
      <aside
        className={`${styles.sidebar} ${
          sidebarOpen ? styles.sidebarOpen : ""
        }`}
        aria-label="Primary"
      >
        <button
          className={styles.mobileSidebarClose}
          onClick={onCloseSidebar}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>

        <div className={styles.sidebarBrand}>
          <img
            src={getAssetPath("/stethoscribe.png")}
            alt="StethoscribeAI"
            className={styles.sidebarLogo}
          />
        </div>

        <div className={styles.sidebarSearch}>
          <input
            type="text"
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.sidebarSearchInput}
          />
        </div>

        <div className={styles.sidebarNavWrapper}>
          {isHydrating ? (
            <div className={`${styles.sidebarEmpty} ${styles.centered}`}>
              <div className={`${styles.emptyTitle} ${styles.subtle}`}>
                Fetching patients...
              </div>
              <div className={styles.emptySub}>
                Syncing with your account
              </div>
            </div>
          ) : patients.length === 0 && consultations.length === 0 ? (
            <div className={`${styles.sidebarEmpty} ${styles.centered}`}>
              <div className={`${styles.emptyTitle} ${styles.subtle}`}>
                No patients yet
              </div>
              <div className={styles.emptySub}>
                Add your first patient to get started
              </div>
            </div>
          ) : (
            <nav className={styles.sidebarNav}>
              {hasPatients &&
                patientsList.map((patient) => {
                  const isExpanded = expandedPatients.has(patient.id);
                  const isStarred = starredPatients.has(patient.id);
                  const isMenuOpen = openPatientMenu === patient.id;

                  return (
                    <div key={patient.id} className={styles.sidebarSection}>
                      <div
                        className={`${styles.sidebarSectionHeader} ${styles.sidebarPatientHeader}`}
                        onClick={() => togglePatientExpanded(patient.id)}
                      >
                        <div className={styles.sidebarPatientInfo}>
                          <div className={styles.sidebarChevron}>
                            {isExpanded ? (
                              <ChevronDownIcon />
                            ) : (
                              <ChevronRightIcon />
                            )}
                          </div>
                          {isStarred && (
                            <span
                              className={styles.patientStar}
                              title="Starred patient"
                            >
                              <StarIcon filled />
                            </span>
                          )}
                          <span className={styles.sidebarSectionTitle}>
                            {patient.name}
                          </span>
                        </div>

                        <div className={styles.sidebarPatientActions}>
                          <span className={styles.sidebarSectionCount}>
                            {patient.consultations.length}
                          </span>

                          <button
                            className={styles.patientMenuButton}
                            onClick={(e) => togglePatientMenu(e, patient.id)}
                            title="Patient options"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                          >
                            <MoreVerticalIcon />
                          </button>

                          {isMenuOpen && (
                            <div
                              className={styles.patientMenuDropdown}
                              onClick={(e) => e.stopPropagation()}
                              role="menu"
                            >
                              <button
                                className={styles.patientMenuItem}
                                onClick={(e) =>
                                  toggleStarPatient(e, patient.id)
                                }
                                role="menuitem"
                              >
                                <StarIcon filled={isStarred} />
                                <span>
                                  {isStarred ? "Unstar Patient" : "Star Patient"}
                                </span>
                              </button>

                              <button
                                className={styles.patientMenuItem}
                                onClick={(e) =>
                                  handleExportPatientNotes(e, patient.id)
                                }
                                role="menuitem"
                              >
                                <DownloadIcon />
                                <span>Export All Notes</span>
                              </button>

                              <div className={styles.patientMenuDivider} />

                              <button
                                className={`${styles.patientMenuItem} ${styles.patientMenuItemDanger}`}
                                onClick={(e) => handleDeletePatient(e, patient.id)}
                                role="menuitem"
                              >
                                <TrashIcon />
                                <span>Delete Patient</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={styles.sidebarSectionContent}>
                          {patient.consultations.map(renderConsultationItem)}
                          <button
                            className={styles.addConsultationButtonInline}
                            onClick={(e) =>
                              handleAddConsultationForPatient(e, patient.id)
                            }
                            title={`New consultation for ${patient.name}`}
                          >
                            <PlusIcon />
                            <span>New consultation</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

              {hasOrphaned && (
                <div className={styles.sidebarSection}>
                  <div
                    className={`${styles.sidebarSectionHeader} ${styles.sidebarPatientHeader}`}
                    onClick={() => togglePatientExpanded("orphaned")}
                  >
                    <div className={styles.sidebarPatientInfo}>
                      <div className={styles.sidebarChevron}>
                        {expandedPatients.has("orphaned") ? (
                          <ChevronDownIcon />
                        ) : (
                          <ChevronRightIcon />
                        )}
                      </div>
                      <span
                        className={`${styles.sidebarSectionTitle} ${styles.sidebarUnknown}`}
                      >
                        No Patient
                      </span>
                    </div>
                    <span className={styles.sidebarSectionCount}>
                      {filteredGroupedData.orphaned.length}
                    </span>
                  </div>

                  {expandedPatients.has("orphaned") && (
                    <div className={styles.sidebarSectionContent}>
                      {filteredGroupedData.orphaned.map(renderConsultationItem)}
                    </div>
                  )}
                </div>
              )}
            </nav>
          )}
        </div>

        <div className={styles.sidebarAddPatientFooter}>
          <button
            className={styles.addPatientButtonFooter}
            onClick={handleAddNewPatient}
          >
            <PlusIcon />
            <span>Add New Patient</span>
          </button>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.userBlock}>
            <div className={styles.avatar} aria-hidden="true">
              {userInitials}
            </div>
            <div className={styles.userDetails}>
              <div className={styles.userName}>
                {displayName || "Signed-in user"}
              </div>
              {email && <div className={styles.userEmail}>{email}</div>}
            </div>
          </div>
          {onSignOut && (
            <button
              className={styles.signOutButton}
              onClick={onSignOut}
              type="button"
              aria-label="Sign out"
            >
              Sign out
            </button>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={onCloseSidebar} />
      )}

      {deletingConsultationId && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div
            className={`modal-content ${styles.deleteConfirmationModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">Delete Consultation</h3>
              <button
                className="modal-close-button"
                onClick={cancelDelete}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this consultation?</p>
              <p className={styles.modalWarningText}>
                This action cannot be undone. All transcript data and notes will
                be permanently lost.
              </p>
            </div>
            <div className="modal-footer modal-footer-buttons">
              <button onClick={cancelDelete} className="button button-secondary">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className={`button ${styles.buttonDanger}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingPatientId && (
        <div className="modal-overlay" onClick={() => setDeletingPatientId(null)}>
          <div
            className={`modal-content ${styles.deleteConfirmationModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">Delete Patient</h3>
              <button
                className="modal-close-button"
                onClick={() => setDeletingPatientId(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete this patient and all their
                consultations?
              </p>
              <p className={styles.modalWarningText}>
                This will permanently delete all associated data including
                transcripts and notes. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer modal-footer-buttons">
              <button
                onClick={() => setDeletingPatientId(null)}
                className="button button-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePatient}
                className={`button ${styles.buttonDanger}`}
              >
                Delete Patient
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};