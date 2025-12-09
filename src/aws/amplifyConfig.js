import { Amplify } from 'aws-amplify';

// Use env vars; fall back to origin for redirects
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/^https?:\/\//, '');
const redirect = import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin;

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