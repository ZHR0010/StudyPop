import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  firebaseConfigured,
  firebasePublicConfig,
  fromFirestoreValue,
  readUserState,
  toFirestoreValue,
  verifyFirebaseIdToken,
  writeUserState,
} from "../lib/firebase-rest.mjs";

const environment = {
  FIREBASE_API_KEY: "test-key",
  FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_STORAGE_BUCKET: "test.firebasestorage.app",
  FIREBASE_MESSAGING_SENDER_ID: "123",
  FIREBASE_APP_ID: "app-123",
};

test("firebase configuration exposes only public client values", () => {
  assert.equal(firebaseConfigured(environment), true);
  assert.deepEqual(firebasePublicConfig(environment), {
    apiKey: "test-key",
    authDomain: "test.firebaseapp.com",
    projectId: "test-project",
    storageBucket: "test.firebasestorage.app",
    messagingSenderId: "123",
    appId: "app-123",
  });
});

test("bearerToken accepts a standard authorization header", () => {
  assert.equal(
    bearerToken({ headers: { authorization: "Bearer firebase-token" } }),
    "firebase-token",
  );
  assert.equal(bearerToken({ headers: {} }), "");
});

test("Firestore values round-trip StudyPop state", () => {
  const state = {
    theme: "pink",
    streak: 4,
    studyKit: null,
    flags: [true, false],
    chats: {
      math: [{ role: "user", text: "What is 2 + 2?" }],
    },
  };
  assert.deepEqual(fromFirestoreValue(toFirestoreValue(state)), state);
});

test("verifyFirebaseIdToken returns a trusted normalized user", async () => {
  const fetchImpl = async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { idToken: "valid-token" });
    return Response.json({
      users: [{
        localId: "user-1",
        email: "student@example.com",
        displayName: "Student",
        emailVerified: true,
        createdAt: "1710000000000",
      }],
    });
  };

  const user = await verifyFirebaseIdToken("valid-token", {
    environment,
    fetchImpl,
  });
  assert.equal(user.uid, "user-1");
  assert.equal(user.name, "Student");
  assert.equal(user.emailVerified, true);
});

test("readUserState handles a missing Firestore document", async () => {
  const record = await readUserState("user-1", "token", {
    environment,
    fetchImpl: async () => Response.json({}, { status: 404 }),
  });
  assert.equal(record, null);
});

test("writeUserState writes an owned versioned document", async () => {
  let requestBody;
  const result = await writeUserState(
    "user-1",
    "token",
    { theme: "blue" },
    {
      expectedVersion: 2,
      environment,
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return Response.json({
          fields: requestBody.fields,
          updateTime: "2026-06-09T00:00:00.000Z",
        });
      },
    },
  );

  assert.equal(requestBody.fields.ownerId.stringValue, "user-1");
  assert.equal(requestBody.fields.version.integerValue, "3");
  assert.equal(result.version, 3);
});

