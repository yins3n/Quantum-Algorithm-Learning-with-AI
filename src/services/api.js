import { getAccessToken } from "./user.js";

const API_BASE_URL = ((import.meta.env?.VITE_QUANTUM_ENGINE_URL) || "http://localhost:8000").replace(/\/$/, "");
async function request(path, options = {}) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = Array.isArray(body?.detail) ? body.detail.join(" ") : body?.detail;
    throw new Error(detail || `Request failed with status ${response.status}.`);
  }
  return body;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  health: () => request("/health"),
  exercises: () => request("/exercises"),
  exercise: (id) => request(`/exercises/${encodeURIComponent(id)}`),
  submitExercise: (id, payload) => request(`/exercises/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  tutor: (payload) => request("/tutor", { method: "POST", body: JSON.stringify(payload) }),
  aiChat: (payload) => request("/api/ai/chat", { method: "POST", body: JSON.stringify(payload) }),
  user: (id) => request(`/users/${encodeURIComponent(id)}`),
  updatePreferences: (id, preferences) => request(`/users/${encodeURIComponent(id)}/preferences`, {
    method: "PUT",
    body: JSON.stringify({ user_id: id, preferences }),
  }),
  circuits: (id) => request(`/users/${encodeURIComponent(id)}/circuits`),
  saveCircuit: (id, name, circuit) => request(`/users/${encodeURIComponent(id)}/circuits`, {
    method: "POST",
    body: JSON.stringify({ user_id: id, name, circuit }),
  }),
};
