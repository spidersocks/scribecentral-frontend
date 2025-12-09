import React, { useState } from "react";
import { BACKEND_API_URL } from "../../utils/constants";
import styles from "./CommandBar.module.css";

export const CommandBar = ({ notes, setNotes }) => {
  const [command, setCommand] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  const [copied, setCopied] = useState(false);

  const handleModalClose = () => {
    setModalContent(null);
    setCopied(false);
  };

  const handleCopyResult = () => {
    if (!modalContent) return;
    navigator.clipboard.writeText(modalContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!command.trim() || !notes) return;
    setIsLoading(true);
    try {
      const resp = await fetch(`${BACKEND_API_URL}/execute-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_content: notes, command }),
      });
      const data = await resp.json();
      if (!resp.ok)
        throw new Error(data.detail || "An unknown server error occurred.");
      setModalTitle(`Result for: "${command}"`);
      setModalContent(data.result);
    } catch (err) {
      setModalTitle("Error");
      setModalContent(err.message);
    } finally {
      setIsLoading(false);
      setCommand("");
    }
  };

  return (
    <>
      <div className={styles.container}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            className={styles.input}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='e.g., "Write a referral letter to a cardiologist for atrial fibrillation"'
            disabled={!notes || isLoading}
          />
          <button
            type="submit"
            className={`button ${styles.submitButton}`}
            disabled={!notes || isLoading}
          >
            {isLoading ? "Working..." : "Execute"}
          </button>
        </form>
      </div>

      {modalContent && (
        <div className="modal-overlay" onClick={handleModalClose}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">{modalTitle}</h3>
              <button
                className="modal-close-button"
                onClick={handleModalClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">{modalContent}</div>
            <div className="modal-footer">
              <button onClick={handleCopyResult} className="button button-copy">
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};