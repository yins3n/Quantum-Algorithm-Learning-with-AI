import test from "node:test";
import assert from "node:assert/strict";

const stored = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
};

const { api } = await import("./api.js");

test("attaches an Authorization header when a token is stored", async () => {
  stored.set("quantum_access_token", "tok-123");
  let seenHeaders;
  globalThis.fetch = async (_url, options) => {
    seenHeaders = options.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await api.health();

  assert.equal(seenHeaders.Authorization, "Bearer tok-123");
});

test("propagates the backend error detail as the thrown message", async () => {
  stored.set("quantum_access_token", "tok-123");
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "Exercise not found." }), { status: 404 });

  await assert.rejects(() => api.exercise("missing"), /Exercise not found\./);
});

test("sends the request body as JSON to the configured engine", async () => {
  stored.clear();
  let seenUrl;
  let seenBody;
  globalThis.fetch = async (url, options) => {
    seenUrl = url;
    seenBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  };

  await api.submitExercise("bell-state", { user_id: "demo-user", circuit: { num_qubits: 2 } });

  assert.ok(seenUrl.endsWith("/exercises/bell-state/submit"));
  assert.deepEqual(seenBody, { user_id: "demo-user", circuit: { num_qubits: 2 } });
});