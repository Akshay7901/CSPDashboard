import { API_BASE_URL } from "./proposalApi";
import { getPortalToken } from "./auth";

// Batch jacket generation — admin only. Lives under /api/jacket-gen, not
// /api/proposals, so it doesn't go through proposalApiFetch.

export type JacketJobStatus = "pending" | "running" | "done" | "failed";

export type JacketBookResult = {
  status: "done" | "failed" | string;
  pb_isbn?: string | null;
  missing_images?: string[];
  warnings?: string[];
  error?: string | null;
};

export type JacketJob = {
  job_id: string;
  created_at?: string | null;
  created_by?: string | null;
  status: JacketJobStatus;
  total: number;
  completed: number;
  results?: Record<string, JacketBookResult>;
  download_url?: string | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type JacketJobSummary = Omit<JacketJob, "results" | "download_url" | "error">;

/** Maximum IDs the backend accepts in one job. */
export const MAX_JACKET_IDS = 500;

const BASE = `${API_BASE_URL}/api/jacket-gen/jobs`;

function authHeaders(json = true): Record<string, string> {
  const token = getPortalToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const fallback =
      res.status === 401
        ? "Your session has expired — please log in again."
        : res.status === 403
          ? "Only admins can use batch jacket generation."
          : `Request failed (${res.status}).`;
    throw new Error((body.error as string) || (body.message as string) || fallback);
  }
  return body as T;
}

export async function createJacketJob(
  ids: number[],
): Promise<{ job_id: string; status: JacketJobStatus; total: number }> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  });
  return parse(res);
}

export async function getJacketJob(jobId: string): Promise<JacketJob> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}?_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  return parse(res);
}

export async function listJacketJobs(limit = 20): Promise<JacketJobSummary[]> {
  const res = await fetch(`${BASE}?limit=${limit}&_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  const body = await parse<{ jobs?: JacketJobSummary[] }>(res);
  return body.jobs || [];
}

/**
 * Downloads a finished job's ZIP. The backend accepts the JWT as ?token=,
 * so this is a plain link the browser streams straight to disk (with its
 * native progress bar) instead of buffering the whole ZIP — often hundreds
 * of MB — in JS memory first.
 *
 * Opened in a new tab: a ZIP just downloads (and the tab closes itself),
 * while an error response shows there instead of replacing the dashboard.
 * Must be called directly from the click handler so it isn't blocked as a
 * pop-up.
 */
export async function downloadJacketZip(jobId: string, downloadUrl?: string | null) {
  const token = getPortalToken();
  if (!token) throw new Error("Your session has expired — please log in again.");

  const base = downloadUrl
    ? /^https?:\/\//i.test(downloadUrl)
      ? downloadUrl
      : `${API_BASE_URL}${downloadUrl.startsWith("/") ? "" : "/"}${downloadUrl}`
    : `${BASE}/${encodeURIComponent(jobId)}/download`;
  const url = `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  // Ignored for cross-origin links (the server's Content-Disposition names
  // the file), but kept as a hint for same-origin setups.
  a.download = `jacket_gen_${jobId}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
