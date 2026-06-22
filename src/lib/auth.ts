export type PortalRole = "author" | "editor" | "reviewer" | "decision_reviewer";

export type PortalSession = {
  token?: string;
  email: string;
  name?: string;
  role: PortalRole | string;
};

const SESSION_KEY = "csp.session";
const TOKEN_KEY = "csp.token";

const safeStorage = (kind: "local" | "session") => {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export function persistPortalSession(payload: PortalSession) {
  for (const storage of [safeStorage("local"), safeStorage("session")]) {
    try {
      storage?.setItem(SESSION_KEY, JSON.stringify(payload));
      if (payload.token) storage?.setItem(TOKEN_KEY, payload.token);
    } catch {
      // ignore storage failures
    }
  }
}

export function getPortalSession(): PortalSession | null {
  for (const storage of [safeStorage("session"), safeStorage("local")]) {
    try {
      const raw = storage?.getItem(SESSION_KEY);
      if (!raw) continue;
      const session = JSON.parse(raw) as PortalSession;
      persistPortalSession(session);
      return session;
    } catch {
      // try the next storage location
    }
  }
  return null;
}

export function getPortalToken(): string {
  const session = getPortalSession();
  if (session?.token) return session.token;
  for (const storage of [safeStorage("session"), safeStorage("local")]) {
    try {
      const token = storage?.getItem(TOKEN_KEY);
      if (token) return token;
    } catch {
      // try the next storage location
    }
  }
  return "";
}

export function clearPortalSession() {
  for (const storage of [safeStorage("local"), safeStorage("session")]) {
    try {
      storage?.removeItem(SESSION_KEY);
      storage?.removeItem(TOKEN_KEY);
    } catch {
      // ignore storage failures
    }
  }
}

/**
 * Logout the current portal user: calls the backend /auth/logout endpoint
 * with the current bearer token (best-effort) and then clears local session
 * storage. Always resolves — network failures are swallowed so the UI can
 * still navigate the user back to /login.
 */
export async function portalLogout(): Promise<void> {
  const token = getPortalToken();
  try {
    if (token) {
      const { proposalApiFetch } = await import("./proposalApi");
      await proposalApiFetch("/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch {
    // ignore network errors — still clear local session below
  } finally {
    clearPortalSession();
  }
}