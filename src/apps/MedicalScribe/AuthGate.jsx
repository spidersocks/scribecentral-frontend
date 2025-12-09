import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  createContext,
  useContext,
} from "react";
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from "@aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import { getAssetPath } from "./utils/helpers";
import { LoadingAnimation } from "./components/shared/LoadingAnimation";
import styles from "./AuthGate.module.css";

const STATUS = {
  LOADING: "loading",
  SIGNED_IN: "signedIn",
  SIGNED_OUT: "signedOut",
  ERROR: "error",
};

export const AuthContext = createContext({
  status: STATUS.LOADING,
  user: null,
  idTokenPayload: null,
  displayName: null,
  email: null,
  userId: null,
  accessToken: null,
  refreshSession: () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }) {
  const [status, setStatus] = useState(STATUS.LOADING);
  const [user, setUser] = useState(null);
  const [idTokenPayload, setIdTokenPayload] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authError, setAuthError] = useState(null);
  const navigate = useNavigate();

  const extractUserId = useCallback((payload) => {
    if (!payload) return null;
    return (
      payload.sub ||
      payload["custom:user_id"] ||
      payload["preferred_username"] ||
      null
    );
  }, []);

  const computeDisplayName = useCallback((payload, currentUser) => {
    const tokenName =
      payload?.name ||
      (payload?.given_name && payload?.family_name
        ? `${payload.given_name} ${payload.family_name}`
        : null) ||
      payload?.given_name ||
      payload?.preferred_username ||
      payload?.nickname;

    return (
      tokenName ||
      currentUser?.signInDetails?.loginId ||
      currentUser?.username ||
      "Signed-in user"
    );
  }, []);

  const computeEmail = useCallback((payload) => {
    return payload?.email ?? payload?.["custom:email"] ?? null;
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await fetchAuthSession();

      const nextIdTokenPayload = session.tokens?.idToken?.payload ?? null;
      const nextAccessToken = session.tokens?.accessToken?.toString() ?? null;
      const nextUserId = extractUserId(nextIdTokenPayload);

      if (!nextAccessToken) {
        setIdTokenPayload(null);
        setAccessToken(null);
        setUserId(null);
        return null;
      }

      setIdTokenPayload(nextIdTokenPayload);
      setAccessToken(nextAccessToken);
      setUserId(nextUserId);

      return session;
    } catch (error) {
      console.error("Failed to refresh session", error);
      setIdTokenPayload(null);
      setAccessToken(null);
      setUserId(null);
      throw error;
    }
  }, [extractUserId]);

  const checkSession = useCallback(async () => {
    try {
      setStatus(STATUS.LOADING);
      setAuthError(null);

      const session = await refreshSession();
      if (!session) {
        setUser(null);
        setStatus(STATUS.SIGNED_OUT);
        return;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      setStatus(STATUS.SIGNED_IN);
    } catch (err) {
      const expected =
        err?.name === "NotAuthorizedException" ||
        err?.name === "InvalidStateError" ||
        err?.message?.includes("Cannot retrieve a cached session");
      if (!expected) {
        console.error("Auth session check failed:", err);
        setAuthError(err);
        setStatus(STATUS.ERROR);
        return;
      }
      setUser(null);
      setStatus(STATUS.SIGNED_OUT);
    }
  }, [refreshSession]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithRedirect({
        provider: { type: "oauth", options: { provider: "Cognito" } },
      });
    } catch (err) {
      console.error("Hosted UI redirect failed:", err);
      setAuthError(err);
      setStatus(STATUS.ERROR);
    }
  }, []);

  const signUpUrl = useMemo(() => {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/\/$/, "");
    const clientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI;
    const scopes = ["openid", "email", "profile"].join(" ");

    if (!domain || !clientId || !redirectUri) {
      console.warn(
        "Missing Cognito environment variables — sign-up redirect may fail."
      );
      return null;
    }

    const base = `${domain}/signup`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope: scopes,
      redirect_uri: redirectUri,
    });

    return `${base}?${params.toString()}`;
  }, []);

  const handleSignUp = useCallback(() => {
    if (signUpUrl) {
      window.location.assign(signUpUrl);
    } else {
      console.error(
        "Cognito sign-up URL could not be constructed. Check environment variables."
      );
    }
  }, [signUpUrl]);

  const handleTryDemo = useCallback(() => {
    navigate("/medical-scribe/demo");
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      setUser(null);
      setIdTokenPayload(null);
      setAccessToken(null);
      setUserId(null);
      setStatus(STATUS.SIGNED_OUT);
    } catch (err) {
      console.error("Sign out failed:", err);
      setAuthError(err);
      setStatus(STATUS.ERROR);
    }
  }, []);

  const displayName = useMemo(
    () => computeDisplayName(idTokenPayload, user),
    [idTokenPayload, user, computeDisplayName]
  );

  const email = useMemo(
    () => computeEmail(idTokenPayload),
    [idTokenPayload, computeEmail]
  );

  const contextValue = useMemo(
    () => ({
      status,
      user,
      idTokenPayload,
      displayName,
      email,
      userId,
      accessToken,
      refreshSession: checkSession,
      signOut: handleSignOut,
    }),
    [
      status,
      user,
      idTokenPayload,
      displayName,
      email,
      userId,
      accessToken,
      checkSession,
      handleSignOut,
    ]
  );

  if (status === STATUS.LOADING) {
    return (
      <StatusView
        title="Checking your session…"
        message="Hold tight while we confirm your sign-in state."
        showLoader
      />
    );
  }

  if (status === STATUS.ERROR) {
    return (
      <StatusView
        title="We hit a snag"
        message={authError?.message || "An unexpected authentication error occurred."}
      >
        <button className={styles.primaryButton} onClick={checkSession}>
          Try again
        </button>
      </StatusView>
    );
  }

  if (status === STATUS.SIGNED_OUT) {
    return (
      <LandingView
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onTryDemo={handleTryDemo}
      />
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

function StatusView({ title, message, children, showLoader = false }) {
  const loaderMessage = title || message || "Loading…";

  return (
    <div className={styles.centerBox}>
      {showLoader ? (
        <>
          <LoadingAnimation message={loaderMessage} />
          {message && message !== loaderMessage && (
            <p className={styles.message}>{message}</p>
          )}
        </>
      ) : (
        <>
          <h2 className={styles.heading}>{title}</h2>
          {message && <p className={styles.message}>{message}</p>}
        </>
      )}
      {children ? <div className={styles.actionRow}>{children}</div> : null}
    </div>
  );
}

function LandingView({ onSignIn, onSignUp, onTryDemo }) {
  const featureHighlights = [
    "Realtime multilingual transcription",
    "Clinical entity detection powered by AWS Comprehend Medical",
    "Structured notes with customizable formatting",
  ];

  return (
    <div className={styles.landingWrapper}>
      <div className={styles.landingInner}>
        <div className={styles.landingContent}>
          <span className={styles.heroTag}>AI Clinical Documentation</span>
          <h1 className={styles.heroTitle}>
            StethoscribeAI keeps your focus on patients, not paperwork.
          </h1>
          <p className={styles.heroSubtitle}>
            Stream consultations in real-time, intelligently extract key medical
            information, and generate polished clinical notes in seconds. Built
            for busy providers who need trust, accuracy, and speed.
          </p>

          <div className={styles.badgeRow}>
            {featureHighlights.map((item) => (
              <span key={item} className={styles.badgePill}>
                {item}
              </span>
            ))}
          </div>

          <div className={styles.ctaRow}>
            <button className={styles.primaryButtonLarge} onClick={onSignIn}>
              Sign in
            </button>
            <button className={styles.secondaryButton} onClick={onSignUp}>
              Create account
            </button>
          </div>

          <button className={styles.demoButton} onClick={onTryDemo}>
            Try the interactive demo →
          </button>

          <p className={styles.disclaimer}>
            Privacy Disclaimer: Demo mode runs locally and never stores data.
          </p>
        </div>

        <div className={styles.mediaPanel}>
          <div className={styles.mediaCard}>
            <div className={styles.mediaHeader}>
              <img
                src={getAssetPath("/stethoscribe_icon.png")}
                alt="StethoscribeAI icon"
                className={styles.mediaLogo}
              />
              <div className={styles.mediaHeaderText}>
                <span className={styles.mediaTitle}>See it in action</span>
                <span className={styles.mediaSubtitle}>
                  Animated walkthrough video coming soon...
                </span>
              </div>
            </div>

            <div className={styles.mediaPlaceholder}>
              <div className={styles.mediaPlaceholderInner}>
                <span role="img" aria-hidden="true" className={styles.mediaEmoji}>
                  🎥
                </span>
                <p className={styles.mediaHint}>Not yet implemented!</p>
              </div>
            </div>

            <div className={styles.mediaChecklist}>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>✓</span>
                <span>Clinical-grade documentation built on AWS</span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>✓</span>
                <span>
                  Supports multi-language encounters (English, Cantonese, &amp; Mandarin)
                </span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>✓</span>
                <span>Export clean notes to your preferred workflow</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.landingFooter}>
        <span>© {new Date().getFullYear()} StethoscribeAI. All rights reserved.</span>
        <div className={styles.footerRight}>
          <span>Privacy-first by design</span>
          <span>Built with Amplify + Amazon Bedrock</span>
          <span>Made for clinical pragmatists</span>
        </div>
      </footer>
    </div>
  );
}