const SESSION_STORAGE_KEY = "studypop.firebase.session.v1";
const AUTH_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
const TOKEN_BASE_URL = "https://securetoken.googleapis.com/v1";

const friendlyAuthErrors = {
  EMAIL_EXISTS: "An account with that email already exists.",
  EMAIL_NOT_FOUND: "Email or password is incorrect.",
  INVALID_LOGIN_CREDENTIALS: "Email or password is incorrect.",
  INVALID_PASSWORD: "Email or password is incorrect.",
  INVALID_EMAIL: "Enter a valid email address.",
  WEAK_PASSWORD: "Use a stronger password with at least 8 characters.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Take a short break and try again.",
  USER_DISABLED: "This account has been disabled.",
  USER_NOT_FOUND: "This account is no longer available.",
  TOKEN_EXPIRED: "Your session expired. Please log in again.",
};

function normalizeFirebaseError(payload, fallback) {
  const raw = payload?.error?.message;
  const code = String(raw ?? "").split(" : ")[0];
  const error = new Error(friendlyAuthErrors[code] ?? fallback);
  error.code = code || "FIREBASE_REQUEST_FAILED";
  return error;
}

function publicUser(record) {
  if (!record) return null;
  const email = record.email ?? "";
  return {
    id: record.localId,
    uid: record.localId,
    email,
    name: record.displayName || email.split("@")[0] || "StudyPop user",
    emailVerified: Boolean(record.emailVerified),
    photoURL: record.photoUrl ?? "",
  };
}

export function createFirebaseClient({
  fetchImpl = window.fetch.bind(window),
  storage = window.localStorage,
} = {}) {
  let config = null;
  let session = null;
  let initialization = null;

  function saveSession(nextSession) {
    session = nextSession;
    if (session) storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else storage.removeItem(SESSION_STORAGE_KEY);
  }

  function restoreSession() {
    try {
      const value = JSON.parse(storage.getItem(SESSION_STORAGE_KEY));
      if (!value?.refreshToken || !value?.user?.id) return null;
      return value;
    } catch {
      return null;
    }
  }

  async function firebaseRequest(path, body) {
    if (!config?.apiKey) throw new Error("Firebase authentication is not configured.");
    const response = await fetchImpl(
      `${AUTH_BASE_URL}/${path}?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw normalizeFirebaseError(payload, "The account request could not be completed.");
    }
    return payload;
  }

  function tokenSession(payload, fallbackRefreshToken = "") {
    const user = publicUser(payload);
    return {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken || fallbackRefreshToken,
      expiresAt: Date.now() + Number(payload.expiresIn || 3600) * 1000,
      user,
    };
  }

  async function refreshSession() {
    if (!session?.refreshToken || !config?.apiKey) {
      saveSession(null);
      return null;
    }

    const response = await fetchImpl(
      `${TOKEN_BASE_URL}/token?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      saveSession(null);
      throw normalizeFirebaseError(payload, "Your session expired. Please log in again.");
    }

    const refreshed = {
      idToken: payload.id_token,
      refreshToken: payload.refresh_token || session.refreshToken,
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
      user: {
        ...session.user,
        id: payload.user_id || session.user.id,
        uid: payload.user_id || session.user.uid,
      },
    };
    saveSession(refreshed);
    return refreshed;
  }

  async function lookupUser(idToken) {
    const payload = await firebaseRequest("accounts:lookup", { idToken });
    return publicUser(payload.users?.[0]);
  }

  async function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      const response = await fetchImpl("/api/v1/config");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("StudyPop configuration could not be loaded.");
      config = payload.firebase?.config ?? null;
      session = restoreSession();
      if (!config || !session) return { configured: Boolean(config), user: null };

      try {
        if (session.expiresAt <= Date.now() + 60_000) await refreshSession();
        const user = await lookupUser(session.idToken);
        saveSession({ ...session, user });
        return { configured: true, user };
      } catch {
        saveSession(null);
        return { configured: true, user: null };
      }
    })();
    return initialization;
  }

  async function signUp({ name, email, password }) {
    await initialize();
    const created = await firebaseRequest("accounts:signUp", {
      email,
      password,
      returnSecureToken: true,
    });
    const updated = await firebaseRequest("accounts:update", {
      idToken: created.idToken,
      displayName: name,
      returnSecureToken: true,
    });
    const nextSession = tokenSession(updated, created.refreshToken);
    saveSession(nextSession);
    return nextSession.user;
  }

  async function signIn({ email, password }) {
    await initialize();
    const payload = await firebaseRequest("accounts:signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    });
    const nextSession = tokenSession(payload);
    saveSession(nextSession);
    return nextSession.user;
  }

  async function sendPasswordReset(email) {
    await initialize();
    await firebaseRequest("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email,
    });
  }

  async function getIdToken(forceRefresh = false) {
    await initialize();
    if (!session) return "";
    if (forceRefresh || session.expiresAt <= Date.now() + 60_000) {
      await refreshSession();
    }
    return session?.idToken ?? "";
  }

  async function authorizedFetch(input, init = {}) {
    const execute = async (forceRefresh = false) => {
      const idToken = await getIdToken(forceRefresh);
      if (!idToken) {
        const error = new Error("Log in to continue.");
        error.code = "AUTH_REQUIRED";
        throw error;
      }
      const headers = new Headers(init.headers ?? {});
      headers.set("authorization", `Bearer ${idToken}`);
      return fetchImpl(input, { ...init, headers });
    };

    let response = await execute(false);
    if (response.status === 401 && session?.refreshToken) {
      response = await execute(true);
    }
    return response;
  }

  return {
    initialize,
    signUp,
    signIn,
    signOut() {
      saveSession(null);
    },
    sendPasswordReset,
    getIdToken,
    authorizedFetch,
    get user() {
      return session?.user ?? null;
    },
    get configured() {
      return Boolean(config);
    },
  };
}

