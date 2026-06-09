const FIREBASE_AUTH_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
const FIREBASE_TOKEN_BASE_URL = "https://securetoken.googleapis.com/v1";
const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1";

export class FirebaseRequestError extends Error {
  constructor(message, { status = 500, code = "FIREBASE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "FirebaseRequestError";
    this.status = status;
    this.code = code;
  }
}

export function firebasePublicConfig(environment = process.env) {
  return {
    apiKey: environment.FIREBASE_API_KEY ?? "",
    authDomain: environment.FIREBASE_AUTH_DOMAIN ?? "",
    projectId: environment.FIREBASE_PROJECT_ID ?? "",
    storageBucket: environment.FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: environment.FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: environment.FIREBASE_APP_ID ?? "",
  };
}

export function firebaseConfigured(environment = process.env) {
  const config = firebasePublicConfig(environment);
  return Boolean(config.apiKey && config.projectId && config.appId);
}

export function bearerToken(request) {
  const authorization = String(request.headers.authorization ?? "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function firebaseErrorMessage(payload, fallback) {
  const rawCode = payload?.error?.message;
  if (!rawCode) return fallback;
  const code = String(rawCode).split(" : ")[0];
  const friendly = {
    EMAIL_EXISTS: "An account with that email already exists.",
    EMAIL_NOT_FOUND: "Email or password is incorrect.",
    INVALID_LOGIN_CREDENTIALS: "Email or password is incorrect.",
    INVALID_PASSWORD: "Email or password is incorrect.",
    INVALID_ID_TOKEN: "Your session has expired. Please log in again.",
    TOKEN_EXPIRED: "Your session has expired. Please log in again.",
    USER_DISABLED: "This account has been disabled.",
    USER_NOT_FOUND: "This account is no longer available.",
  };
  return friendly[code] ?? fallback;
}

export async function verifyFirebaseIdToken(
  idToken,
  {
    environment = process.env,
    fetchImpl = fetch,
  } = {},
) {
  if (!firebaseConfigured(environment)) {
    throw new FirebaseRequestError("Firebase is not configured on this server.", {
      status: 503,
      code: "FIREBASE_NOT_CONFIGURED",
    });
  }
  if (!idToken) {
    throw new FirebaseRequestError("Log in to continue.", {
      status: 401,
      code: "AUTH_REQUIRED",
    });
  }

  const { apiKey } = firebasePublicConfig(environment);
  let response;
  try {
    response = await fetchImpl(
      `${FIREBASE_AUTH_BASE_URL}/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch (error) {
    throw new FirebaseRequestError("Authentication is temporarily unavailable.", {
      status: 503,
      code: "AUTH_UNAVAILABLE",
      cause: error,
    });
  }

  const payload = await response.json().catch(() => null);
  const user = payload?.users?.[0];
  if (!response.ok || !user?.localId) {
    throw new FirebaseRequestError(
      firebaseErrorMessage(payload, "Your session is invalid. Please log in again."),
      {
        status: 401,
        code: "INVALID_AUTH_TOKEN",
      },
    );
  }

  return {
    uid: user.localId,
    email: user.email ?? "",
    name: user.displayName || String(user.email ?? "").split("@")[0] || "StudyPop user",
    emailVerified: Boolean(user.emailVerified),
    photoURL: user.photoUrl ?? "",
    createdAt: user.createdAt
      ? new Date(Number(user.createdAt)).toISOString()
      : null,
  };
}

export async function refreshFirebaseToken(
  refreshToken,
  {
    environment = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const { apiKey } = firebasePublicConfig(environment);
  const response = await fetchImpl(
    `${FIREBASE_TOKEN_BASE_URL}/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new FirebaseRequestError(
      firebaseErrorMessage(payload, "Could not refresh the session."),
      { status: 401, code: "TOKEN_REFRESH_FAILED" },
    );
  }
  return payload;
}

export function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)]),
        ),
      },
    };
  }
  throw new TypeError(`Unsupported Firestore value type: ${typeof value}`);
}

export function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map((item) => fromFirestoreValue(item));
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields ?? {}).map(([key, item]) => [
        key,
        fromFirestoreValue(item),
      ]),
    );
  }
  return null;
}

function stateDocumentUrl(uid, environment = process.env) {
  const { projectId } = firebasePublicConfig(environment);
  const path = `users/${encodeURIComponent(uid)}/appState/main`;
  return `${FIRESTORE_BASE_URL}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
}

async function firestoreRequest(
  url,
  {
    idToken,
    method = "GET",
    body,
    fetchImpl = fetch,
  },
) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${idToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new FirebaseRequestError("Cloud sync is temporarily unavailable.", {
      status: 503,
      code: "SYNC_UNAVAILABLE",
      cause: error,
    });
  }

  const payload = await response.json().catch(() => null);
  return { response, payload };
}

export async function readUserState(
  uid,
  idToken,
  {
    environment = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const { response, payload } = await firestoreRequest(
    stateDocumentUrl(uid, environment),
    { idToken, fetchImpl },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new FirebaseRequestError(
      firebaseErrorMessage(payload, "Could not load your synced study data."),
      {
        status: response.status === 401 || response.status === 403 ? 401 : 502,
        code: "STATE_READ_FAILED",
      },
    );
  }

  return {
    state: fromFirestoreValue(payload.fields?.state),
    version: Number(payload.fields?.version?.integerValue ?? 0),
    updatedAt: payload.fields?.updatedAt?.timestampValue ?? payload.updateTime ?? null,
  };
}

export async function writeUserState(
  uid,
  idToken,
  state,
  {
    expectedVersion,
    environment = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const currentVersion = Number.isFinite(expectedVersion)
    ? Math.max(0, Math.floor(expectedVersion))
    : 0;
  const version = currentVersion + 1;
  const updatedAt = new Date().toISOString();
  const { response, payload } = await firestoreRequest(
    stateDocumentUrl(uid, environment),
    {
      idToken,
      method: "PATCH",
      fetchImpl,
      body: {
        fields: {
          state: toFirestoreValue(state),
          version: { integerValue: String(version) },
          updatedAt: { timestampValue: updatedAt },
          ownerId: { stringValue: uid },
        },
      },
    },
  );

  if (!response.ok) {
    throw new FirebaseRequestError(
      firebaseErrorMessage(payload, "Could not save your study data."),
      {
        status: response.status === 401 || response.status === 403 ? 401 : 502,
        code: "STATE_WRITE_FAILED",
      },
    );
  }

  return {
    saved: true,
    version: Number(payload.fields?.version?.integerValue ?? version),
    updatedAt: payload.fields?.updatedAt?.timestampValue ?? payload.updateTime ?? updatedAt,
  };
}

