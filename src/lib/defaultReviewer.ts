const KEY = "csp.defaultPeerReviewerEmail";

export function getDefaultReviewerEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setDefaultReviewerEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    if (email) window.localStorage.setItem(KEY, email.toLowerCase());
    else window.localStorage.removeItem(KEY);
  } catch {
    // ignore storage failures
  }
}

export function isDefaultReviewer(email?: string | null): boolean {
  const d = getDefaultReviewerEmail();
  return !!d && (email || "").toLowerCase() === d;
}
