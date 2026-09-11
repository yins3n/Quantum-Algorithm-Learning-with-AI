const API_BASE_URL = (import.meta.env.VITE_QUANTUM_ENGINE_URL || "http://localhost:8000").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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
  health: () => request("/health"),
  simulate: (circuit) => request("/simulate", { method: "POST", body: JSON.stringify(circuit) }),
  evaluate: (payload) => request("/evaluate", { method: "POST", body: JSON.stringify(payload) }),
  exercises: () => request("/exercises"),
  exercise: (id) => request(`/exercises/${encodeURIComponent(id)}`),
  submitExercise: (id, payload) => request(`/exercises/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  tutor: (payload) => request("/tutor", { method: "POST", body: JSON.stringify(payload) }),
  user: (id) => request(`/users/${encodeURIComponent(id)}`),
  updatePreferences: (id, preferences) => request(`/users/${encodeURIComponent(id)}/preferences`, {
    method: "PUT",
    body: JSON.stringify({ user_id: id, preferences }),
  }),
};
