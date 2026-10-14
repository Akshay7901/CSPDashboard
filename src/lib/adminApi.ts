import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type DeleteProposalResponse = {
  status?: string;
  message?: string;
  ticket_number?: string;
  deleted_counts?: Record<string, number>;
};

export async function deleteProposal(ticket: string): Promise<DeleteProposalResponse> {
  const token = getPortalToken();
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (body.error as string) || `Failed to delete proposal (${res.status}).`,
    );
  }
  return body as DeleteProposalResponse;
}

export type ExportFilters = {
  statuses?: string[];
  subjects?: string[];
  sortOrder?: "asc" | "desc";
};

/**
 * Admin-only: downloads every proposal matching the filters as a CSV file
 * (no pagination — the backend returns all matches). Throws on failure.
 */
export async function exportProposalsCsv(filters: ExportFilters): Promise<void> {
  const params = new URLSearchParams();
  for (const s of filters.statuses || []) params.append("status", s);
  for (const s of filters.subjects || []) params.append("subject", s);
  if (filters.sortOrder) params.set("sort_order", filters.sortOrder);
  const qs = params.toString();

  const token = getPortalToken();
  const res = await proposalApiFetch(`/export.csv${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status}).`);

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match
    ? decodeURIComponent(match[1])
    : `proposals-${new Date().toISOString().slice(0, 10)}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}