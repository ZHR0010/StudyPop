import assert from "node:assert/strict";
import test from "node:test";
import { createFirebaseClient } from "../src/firebase-client.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("Firebase client signs in and adds the ID token to API requests", async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (url === "/api/v1/config") {
      return Response.json({
        firebase: {
          config: {
            apiKey: "client-key",
            projectId: "project",
            appId: "app",
          },
        },
      });
    }
    if (String(url).includes("accounts:signInWithPassword")) {
      return Response.json({
        idToken: "id-token",
        refreshToken: "refresh-token",
        expiresIn: "3600",
        localId: "user-1",
        email: "student@example.com",
        displayName: "Student",
      });
    }
    if (url === "/api/v1/me") {
      return Response.json({ user: { uid: "user-1" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const client = createFirebaseClient({
    fetchImpl,
    storage: memoryStorage(),
  });
  const user = await client.signIn({
    email: "student@example.com",
    password: "password123",
  });
  assert.equal(user.name, "Student");

  await client.authorizedFetch("/api/v1/me");
  const apiRequest = requests.find((request) => request.url === "/api/v1/me");
  assert.equal(new Headers(apiRequest.init.headers).get("authorization"), "Bearer id-token");
});

