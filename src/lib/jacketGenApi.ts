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

/** Downloads a finished job's ZIP (needs the auth header, so not a plain link). */
export async function downloadJacketZip(jobId: string, downloadUrl?: string | null) {
  const url = downloadUrl
    ? /^https?:\/\//i.test(downloadUrl)
      ? downloadUrl
      : `${API_BASE_URL}${downloadUrl.startsWith("/") ? "" : "/"}${downloadUrl}`
    : `${BASE}/${encodeURIComponent(jobId)}/download`;
  const res = await fetch(url, { headers: authHeaders(false) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((body.error as string) || `Download failed (${res.status}).`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : `jackets-${jobId.slice(0, 8)}.zip`;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
