import { Amplify } from 'aws-amplify';

// Prefer the live page; fall back to env if needed.
// Cognito matches this string exactly, including the /stethoscribe path.
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/^https?:\/\//, '');
const appBasePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export function getAuthRedirectUri() {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_COGNITO_REDIRECT_URI || "https://www.seanfontaine.dev/stethoscribe";
  }
  return `${window.location.origin}${appBasePath}`;
}

const redirect = getAuthRedirectUri();

// DEBUG LOGS
console.info("[amplifyConfig] window.origin", window.location.origin);
console.info("[amplifyConfig] VITE_COGNITO_DOMAIN", import.meta.env.VITE_COGNITO_DOMAIN);
console.info("[amplifyConfig] VITE_COGNITO_REDIRECT_URI", import.meta.env.VITE_COGNITO_REDIRECT_URI);
console.info("[amplifyConfig] computed cognitoDomain", cognitoDomain);
console.info("[amplifyConfig] computed redirect", redirect);

Amplify.configure({
  Auth: {
    Cognito: {
      region: import.meta.env.VITE_COGNITO_REGION,
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: cognitoDomain,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [redirect],
          redirectSignOut: [redirect],
          responseType: 'code',
        },
      },
    },
  },
});