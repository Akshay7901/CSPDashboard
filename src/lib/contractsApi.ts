import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type ContractDetail = {
  id: number;
  contract_version?: number;
  contract_type?: "author" | "editor";
  status?: string;
  docusign_envelope_id?: string;
  docusign_status?: string;
  docusign_signing_url?: string;
  docusign_view_url?: string;
  docusign_sent_at?: string;
  docusign_completed_at?: string | null;
  docusign_declined_at?: string | null;
  docusign_decline_reason?: string | null;
  docusign_expires_at?: string;
  recipient_email?: string;
  recipient_name?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  addendum?: string;
  notes?: string;
  note_to_author?: string;
  author_note?: string;
  message_to_author?: string;
  title?: string;
  subtitle?: string;
  language?: string;
  author_copies?: string | number;
  if_two_author_copies?: string | number;
  if_three_or_four_author_copies?: string | number;
  copies_sold_revenue?: string | number;
  secondary_rights_revenue?: string | number;
  publishing_agreement?: string;
};

export type ContractQueryEntry = {
  id: number;
  type: "query" | "response";
  category?: string;
  text: string;
  raised_by?: string;
  raised_by_name?: string;
  raised_by_role?: string;
  parent_query_id?: number | null;
  created_at: string;
};

export type QueryThreadResponse = {
  status?: string;
  ticket_number?: string;
  proposal_status?: string;
  total?: number;
  queries?: ContractQueryEntry[];
};

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getContract(ticket: string): Promise<ContractDetail[]> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (Array.isArray(body.contracts)) return body.contracts as ContractDetail[];
  if (body.contract) return [body.contract as ContractDetail];
  return [];
}

export async function getQueries(ticket: string): Promise<QueryThreadResponse> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/queries`, {
    headers: authHeaders(),
  });
  if (!res.ok) return { queries: [] };
  return (await res.json().catch(() => ({}))) as QueryThreadResponse;
}

export async function raiseQuery(
  ticket: string,
  query_text: string,
  category: string = "contract",
) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/query`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query_text, category }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function respondQuery(
  ticket: string,
  query_id: number,
  response_text: string,
) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contract/query/respond`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query_id, response_text }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function voidContract(ticket: string, reason: string) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/void`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function getSigningUrl(ticket: string): Promise<string> {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contract/signing-url`,
    { headers: authHeaders() },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return (body.signing_url as string) || "";
}

export async function fetchContractPdfBlob(ticket: string): Promise<string> {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contract/document`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}