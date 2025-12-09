import { Amplify } from 'aws-amplify';

// Prefer the live origin; fall back to env if needed
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/^https?:\/\//, '');
const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
const redirect = runtimeOrigin || import.meta.env.VITE_COGNITO_REDIRECT_URI || "https://scribecentral.io/";

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