import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../utils/apiClient";

const DEFAULT_PROBE_TIMEOUT_MS = 7000;
const DEFAULT_MAX_WAIT_MS = 90000;

export const useBackendReadiness = ({ autoStart = true } = {}) => {
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("Backend readiness not checked yet.");
  const [lastError, setLastError] = useState(null);
  const inFlightWarmupRef = useRef(null);

  const startWarmup = useCallback(async () => {
    if (inFlightWarmupRef.current) {
      return inFlightWarmupRef.current;
    }

    setPhase((prev) => (prev === "ready" ? prev : "warming"));
    setMessage("Waking backend server in the background...");

    const run = apiClient
      .warmupBackend({ timeoutMs: DEFAULT_PROBE_TIMEOUT_MS })
      .then((result) => {
        if (result.ok) {
          setPhase("ready");
          setMessage("Backend server is ready.");
          setLastError(null);
          return true;
        }

        setPhase((prev) => (prev === "ready" ? prev : "warming"));
        setMessage("Backend is still waking up.");
        setLastError(result.error?.message || "Backend warmup probe failed");
        return false;
      })
      .catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        setPhase("error");
        setMessage("Backend warmup failed.");
        setLastError(normalized.message);
        return false;
      })
      .finally(() => {
        inFlightWarmupRef.current = null;
      });

    inFlightWarmupRef.current = run;
    return run;
  }, []);

  const ensureReady = useCallback(async ({ maxWaitMs = DEFAULT_MAX_WAIT_MS, onProgress } = {}) => {
    setPhase("warming");
    setLastError(null);

    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt < maxWaitMs) {
      attempt += 1;
      const remainingMs = Math.max(maxWaitMs - (Date.now() - startedAt), 0);
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const progressMessage =
        attempt === 1
          ? "Waking backend server..."
          : `Still waking server... (${remainingSeconds}s left)`;

      setMessage(progressMessage);
      if (onProgress) {
        onProgress(progressMessage, { attempt, remainingSeconds });
      }

      const result = await apiClient.pingBackend({ timeoutMs: DEFAULT_PROBE_TIMEOUT_MS });
      if (result.ok) {
        setPhase("ready");
        setMessage("Backend server is ready.");
        setLastError(null);
        if (onProgress) {
          onProgress("Backend server is ready.", { attempt, ready: true });
        }
        return { ok: true };
      }

      const waitMs = attempt < 3 ? 1000 : 2000;
      // Use short backoff to reduce pressure while keeping UI responsive.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    }

    const timeoutMessage = "Server is still waking up on the free plan. Please retry.";
    setPhase("timeout");
    setMessage(timeoutMessage);
    setLastError(timeoutMessage);
    if (onProgress) {
      onProgress(timeoutMessage, { timeout: true });
    }

    return { ok: false, error: new Error(timeoutMessage) };
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    startWarmup();
  }, [autoStart, startWarmup]);

  return {
    phase,
    message,
    lastError,
    isReady: phase === "ready",
    startWarmup,
    ensureReady,
  };
};
