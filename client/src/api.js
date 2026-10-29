// In-memory token only: do not store CSRF secrets in localStorage.
let csrfToken = "";
let authenticatedUserId = null;
let refreshInFlight = null;
export function setCsrf(value, userId = null) {
  csrfToken = value || "";
  authenticatedUserId = userId || null;
}
async function send(path, options = {}) {
  const res = await fetch("/api" + path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({
    error: "Server is unavailable. Please retry.",
  }));
  return { res, data };
}
// Another tab may replace the session cookie while this tab holds an older CSRF.
// Refresh once, coalesce concurrent attempts, and never silently switch users.
async function refreshSecurityToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch("/api/auth/me", {
        method: "GET", credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.csrfToken || !data.user?.id) {
        if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (authenticatedUserId && data.user.id !== authenticatedUserId) {
        window.dispatchEvent(new Event("session-expired"));
        throw new Error("The account changed in another tab. Please sign in again.");
      }
      setCsrf(data.csrfToken, data.user.id);
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
export async function api(path, options = {}) {
  let { res, data } = await send(path, options);
  // Retry only the explicit CSRF rejection: middleware blocks the first write.
  if (res.status === 403 && data.code === "CSRF_MISMATCH" && path !== "/auth/login" && path !== "/auth/setup") {
    await refreshSecurityToken();
    ({ res, data } = await send(path, options));
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "Request failed");
  }
  return data;
}
export const post = (path, body = {}) => api(path, { method: "POST", body });
export const put = (path, body) => api(path, { method: "PUT", body });
