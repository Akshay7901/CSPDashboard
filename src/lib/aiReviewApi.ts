import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";
import { mapWithConcurrency } from "./utils";

export type AiReviewStatus = "not_run" | "pending" | "running" | "completed" | "failed";

export type AiReview = {
  status: AiReviewStatus | string;
  final_score?: number | null;
  triggered_by?: string | null;
  completed_at?: string | null;
  report_url?: string | null;
  error_message?: string | null;
};

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getAiReview(ticket: string): Promise<AiReview> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/ai-review`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return { status: "not_run" };
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Failed to load AI review");
  const data = (await res.json().catch(() => ({}))) as AiReview;
  return { ...data, status: data?.status || "not_run" };
}

export async function runAiReview(ticket: string): Promise<void> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/ai-review`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    let msg = "Failed to start AI review";
    try {
      const data = (await res.json()) as { message?: string; detail?: string };
      msg = data.message || data.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}

export async function fetchAiScores(
  tickets: string[],
  onScore?: (ticket: string, score: number | null) => void,
): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {};
  await mapWithConcurrency(tickets, 5, async (ticket) => {
    let score: number | null = null;
    try {
      const data = await getAiReview(ticket);
      if (data.status === "completed" && data.final_score != null) {
        score = Number(data.final_score);
      }
    } catch {
      score = null;
    }
    results[ticket] = score;
    onScore?.(ticket, score);
  });
  return results;
}
