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

export function saveCurrentUser({ userId, displayName }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("quantum_user_id", userId);
  window.localStorage.setItem("quantum_display_name", displayName);
  window.dispatchEvent(new CustomEvent("quantum-profile-updated"));
}
