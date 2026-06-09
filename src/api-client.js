function messageFromPayload(payload, fallback) {
  if (typeof payload?.error === "string") return payload.error;
  return payload?.error?.message || fallback;
}

async function parseResponse(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(messageFromPayload(payload, fallback));
    error.status = response.status;
    error.code = payload?.error?.code || "API_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

export function createApiClient(firebaseClient, {
  fetchImpl = window.fetch.bind(window),
} = {}) {
  let stateVersion = 0;

  async function request(path, {
    method = "GET",
    body,
    authenticated = false,
  } = {}) {
    const init = {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    };
    const response = authenticated
      ? await firebaseClient.authorizedFetch(path, init)
      : await fetchImpl(path, init);
    return parseResponse(response, "StudyPop could not complete that request.");
  }

  return {
    async config() {
      return request("/api/v1/config");
    },

    async me() {
      return request("/api/v1/me", { authenticated: true });
    },

    async loadState() {
      const payload = await request("/api/v1/state", { authenticated: true });
      stateVersion = Number(payload.version ?? 0);
      return payload;
    },

    async saveState(state) {
      const payload = await request("/api/v1/state", {
        method: "PUT",
        authenticated: true,
        body: { state, version: stateVersion },
      });
      stateVersion = Number(payload.version ?? stateVersion + 1);
      return payload;
    },

    async deleteState() {
      const payload = await request("/api/v1/state", {
        method: "DELETE",
        authenticated: true,
      });
      stateVersion = 0;
      return payload;
    },

    async answer(input) {
      return request("/api/v1/ai/answer", {
        method: "POST",
        authenticated: Boolean(firebaseClient.user),
        body: input,
      });
    },

    async createStudyKit(input) {
      return request("/api/v1/ai/study-kit", {
        method: "POST",
        authenticated: Boolean(firebaseClient.user),
        body: input,
      });
    },

    async transcribe(input) {
      return request("/api/v1/ai/transcribe", {
        method: "POST",
        authenticated: Boolean(firebaseClient.user),
        body: input,
      });
    },

    resetStateVersion() {
      stateVersion = 0;
    },
  };
}
