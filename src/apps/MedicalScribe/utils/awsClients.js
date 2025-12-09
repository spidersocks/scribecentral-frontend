import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { fetchAuthSession } from "aws-amplify/auth";
import { ENABLE_BACKGROUND_SYNC } from "./constants";

const readEnv = (key, fallback) => {
  const metaEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : undefined;
  if (metaEnv && metaEnv[key] !== undefined) return metaEnv[key];

  const windowEnv =
    typeof window !== "undefined" && window.__ENV__
      ? window.__ENV__
      : undefined;
  if (windowEnv && windowEnv[key] !== undefined) return windowEnv[key];

  return fallback;
};

export const AWS_REGION = readEnv("VITE_AWS_REGION", "us-east-1");

const identityPoolId = readEnv("VITE_COGNITO_IDENTITY_POOL_ID", undefined);
const userPoolProviderName = readEnv(
  "VITE_COGNITO_USER_POOL_PROVIDER_NAME",
  undefined
);

if (!identityPoolId) {
  console.error(
    "[awsClients] Missing VITE_COGNITO_IDENTITY_POOL_ID; AWS requests will fail."
  );
}

if (!userPoolProviderName) {
  console.error(
    "[awsClients] Missing VITE_COGNITO_USER_POOL_PROVIDER_NAME; AWS requests will fail."
  );
}

const loginsKey = userPoolProviderName ?? "undefined";

export const credentialsProvider = fromCognitoIdentityPool({
  identityPoolId: identityPoolId ?? "",
  logins: {
    [loginsKey]: async () => {
      const { tokens } = await fetchAuthSession();
      const idToken = tokens?.idToken?.toString();
      if (!idToken) {
        throw new Error(
          "No ID token available for Cognito Identity Pool exchange."
        );
      }
      return idToken;
    },
  },
  clientConfig: { region: AWS_REGION },
});

let dynamoClient = null;
let documentClient = null;

/**
 * Explicitly warm AWS credentials if a user is signed in.
 * - Returns credentials or null if the user is signed out.
 * - No noisy console errors when signed out.
 * - Memoized so concurrent calls share one promise.
 */
let _warmPromise = null;
export const ensureAwsCredentials = async ({ silentIfSignedOut = true } = {}) => {
  if (!ENABLE_BACKGROUND_SYNC) return null;

  if (_warmPromise) return _warmPromise;

  _warmPromise = (async () => {
    try {
      const { tokens } = await fetchAuthSession();
      const idToken = tokens?.idToken?.toString();
      if (!idToken) {
        if (!silentIfSignedOut) {
          console.info("[awsClients] Skipping credential warm: user is signed out.");
        }
        return null;
      }
      const creds = await credentialsProvider();
      console.info("[awsClients] AWS credentials obtained");
      return creds;
    } catch (error) {
      // Only log hard errors (network, config). Missing token isn't an error case here.
      if (!/No ID token available/i.test(String(error?.message || ""))) {
        console.error("[awsClients] Failed to obtain AWS credentials", error);
      } else if (!silentIfSignedOut) {
        console.info("[awsClients] Skipping credential warm: no ID token.");
      }
      return null;
    } finally {
      // allow subsequent warm attempts after this completes
      const tmp = _warmPromise;
      _warmPromise = null;
      return tmp;
    }
  })();

  // Resolve inner promise value
  return _warmPromise.then((result) => result);
};

export const getDynamoClient = () => {
  if (!ENABLE_BACKGROUND_SYNC) {
    console.warn(
      "[awsClients] getDynamoClient called while background sync disabled"
    );
    return null;
  }

  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({
      region: AWS_REGION,
      credentials: credentialsProvider,
    });
  }

  return dynamoClient;
};

export const getDynamoDocumentClient = () => {
  if (!ENABLE_BACKGROUND_SYNC) {
    console.warn(
      "[awsClients] getDynamoDocumentClient called while background sync disabled"
    );
    return null;
  }

  if (!documentClient) {
    const baseClient = getDynamoClient();
    if (!baseClient) {
      return null;
    }

    documentClient = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: { removeUndefinedValues: true },
      unmarshallOptions: { wrapNumbers: false },
    });
  }

  return documentClient;
};