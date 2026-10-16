import { useEffect, useState } from "react";
import styles from "./ServerWarmupNotice.module.css";

const NOTICE_KEY = "stethoscribe-free-tier-notice-shown";

export default function ServerWarmupNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.sessionStorage.getItem(NOTICE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    window.sessionStorage.setItem(NOTICE_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={styles.overlay} onClick={dismiss}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-tier-notice-title"
      >
        <h2 id="free-tier-notice-title" className={styles.title}>
          Server warm-up notice
        </h2>
        <p className={styles.text}>
          This prototype is running on a free server plan. If the app has been
          inactive, the first load may take a little longer while the server
          spins up.
        </p>
        <div className={styles.footer}>
          <button type="button" className={styles.button} onClick={dismiss}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
