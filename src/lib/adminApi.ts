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