import { proposalApiFetch } from "@/lib/proposalApi";
import { getPortalToken } from "@/lib/auth";

export interface ProposalEvent {
  id: number;
  event_type: string;
  old_status?: string | null;
  new_status?: string | null;
  description: string;
  changed_by?: string | null;
  changed_by_role?: string | null;
  created_at: string;
}

export async function listProposalEvents(ticket: string): Promise<ProposalEvent[]> {
  const token = getPortalToken();
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/events`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed to load events (${res.status})`);
  return (body.events as ProposalEvent[]) || [];
}
