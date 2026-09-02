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
  if (body.contract && typeof body.contract === "object") {
    return [body.contract as ContractDetail];
  }
  // Newer two-stage payloads return the contract fields at the top level
  // (no `contract` / `contracts` wrapper). Treat that as a single contract.
  const inner = (body.data && typeof body.data === "object" ? body.data : body) as Record<
    string,
    unknown
  >;
  if (
    inner.stages ||
    inner.publishing_agreement ||
    inner.author_contract ||
    inner.contract_version ||
    inner.docusign_envelope_id ||
    inner.contract_type
  ) {
    return [inner as ContractDetail];
  }
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

export async function respondQuery(ticket: string, query_id: number, response_text: string) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/query/respond`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query_id, response_text }),
  });
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

export async function declineContract(ticket: string, reason: string) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/decline`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function getSigningUrl(ticket: string, stage?: string): Promise<string> {
  const qs = stage ? `?stage=${encodeURIComponent(stage)}` : "";
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contract/signing-url${qs}`,
    { headers: authHeaders() },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 403 && body.locked) {
      throw new Error("Please sign the Publishing Agreement above first.");
    }
    throw new Error((body.error as string) || `Failed (${res.status})`);
  }
  return (body.signing_url as string) || "";
}

export type ContractStageInfo = {
  status?: string;
  locked?: boolean;
  docusign_expires_at?: string;
  docusign_signed_at?: string;
};

export type TwoStageContract = {
  contract_version?: number;
  publishing_agreement_signed?: boolean;
  stages?: {
    publishing_agreement?: ContractStageInfo;
    author_contract?: ContractStageInfo;
  };
};

/**
 * Fetch the two-stage contract shape (Publishing Agreement + Author/Editor
 * Contract). Returns null when the backend still returns the legacy single
 * contract shape.
 */
export async function getTwoStageContract(ticket: string): Promise<TwoStageContract | null> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // Tolerate several wrapper shapes: top-level, `contract`, `data`, or
  // `data.contract`.
  const candidates = [
    body,
    body.contract,
    body.data,
    (body.data as Record<string, unknown> | undefined)?.contract,
  ].filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
  for (const inner of candidates) {
    let stages = inner.stages as TwoStageContract["stages"];
    // Some payloads expose the two stages directly without a `stages` wrapper.
    if (
      (!stages || typeof stages !== "object") &&
      (inner.publishing_agreement || inner.author_contract)
    ) {
      stages = {
        publishing_agreement: inner.publishing_agreement as ContractStageInfo,
        author_contract: inner.author_contract as ContractStageInfo,
      };
    }
    if (stages && typeof stages === "object") {
      return {
        contract_version: inner.contract_version as number | undefined,
        publishing_agreement_signed: inner.publishing_agreement_signed as boolean | undefined,
        stages,
      };
    }
  }
  return null;
}

export async function fetchContractPdfBlob(ticket: string): Promise<string> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contract/document`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
