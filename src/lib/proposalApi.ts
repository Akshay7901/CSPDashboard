const EXTERNAL_API_BASE = "https://api.cambridgescholars.com/api/proposals";

let isRedirectingForAuth = false;

export async function proposalApiFetch(path: string, init?: RequestInit) {
  let suffix = path ?? "";
  let query = "";
  const qIdx = suffix.indexOf("?");
  if (qIdx >= 0) {
    query = suffix.slice(qIdx);
    suffix = suffix.slice(0, qIdx);
  }
  if (suffix.startsWith("/")) suffix = suffix.slice(1);
  // Cache-bust GETs so the browser/CDN never returns a stale contract
  // status after the DocuSign webhook updates the backend. Without this,
  // the "Contract Signed" state can be delayed by 10+ minutes even though
  // the frontend polls every few seconds.
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const sep = query ? "&" : "?";
    query = `${query}${sep}_t=${Date.now()}`;
  }
  const url = suffix ? `${EXTERNAL_API_BASE}/${suffix}${query}` : `${EXTERNAL_API_BASE}${query}`;
  const mergedInit: RequestInit = {
    ...init,
    ...(method === "GET" ? { cache: "no-store" as RequestCache } : {}),
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(method === "GET"
        ? { "Cache-Control": "no-cache", Pragma: "no-cache" }
        : {}),
    },
  };
  const res = await fetch(url, mergedInit);
  if (res.status === 401 && typeof window !== "undefined") {
    const isAuthCall = suffix.startsWith("auth/");
    if (!isAuthCall && !isRedirectingForAuth) {
      isRedirectingForAuth = true;
      try {
        const { clearPortalSession } = await import("./auth");
        clearPortalSession();
      } catch {
        // ignore
      }
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?reason=expired");
      }
    }
  }
  return res;
}