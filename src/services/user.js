export const DEFAULT_USER_ID = "demo-user";

function readStorage(key, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) || fallback;
}

export function getCurrentUserId() {
  return readStorage("quantum_user_id", DEFAULT_USER_ID);
}

export function getCurrentUserProfile() {
  return {
    userId: getCurrentUserId(),
    displayName: readStorage("quantum_display_name", "Demo learner"),
  };
}

export function getAccessToken() {
  return readStorage("quantum_access_token", "");
}

export function saveSession({ userId, displayName, accessToken = "" }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("quantum_user_id", userId);
  window.localStorage.setItem("quantum_display_name", displayName);
  if (accessToken) window.localStorage.setItem("quantum_access_token", accessToken);
  window.dispatchEvent(new CustomEvent("quantum-profile-updated"));
}

export const saveCurrentUser = saveSession;

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("quantum_user_id");
  window.localStorage.removeItem("quantum_display_name");
  window.localStorage.removeItem("quantum_access_token");
  window.dispatchEvent(new CustomEvent("quantum-profile-updated"));
}
