// CSRF tokens remain in memory. Refresh from the authenticated, same-origin
// session immediately before protected mutations, including logout.
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

// A second tab, sign-in or restored browser session can change the cookie
// without changing this tab's in-memory token. The server remains authoritative.
// Coalesce concurrent refreshes; never silently submit as a different account.
async function refreshSecurityToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.csrfToken || !data.user?.id) {
        if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (authenticatedUserId && data.user.id !== authenticatedUserId) {
        window.dispatchEvent(new Event("session-expired"));
        throw new Error("The signed-in account changed. Please sign in again.");
      }
      setCsrf(data.csrfToken, data.user.id);
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function isProtectedMutation(path, options) {
  const method = (options.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return path !== "/auth/login" && path !== "/auth/setup";
}

export async function api(path, options = {}) {
  const protectedMutation = isProtectedMutation(path, options);

  // Unlike the old recovery-only behavior, ensure every protected write has
  // the CSRF token for the cookie actually held by this browser now.
  if (protectedMutation) await refreshSecurityToken();

  let { res, data } = await send(path, options);

  // CSRF middleware rejects the initial write before it executes, so this
  // single retry is safe. Never retry business 403s or arbitrary failures.
  if (protectedMutation && res.status === 403 && data.code === "CSRF_MISMATCH") {
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
