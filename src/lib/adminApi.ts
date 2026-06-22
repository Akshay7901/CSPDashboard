const API_BASE = "https://api.cambridgescholars.com";

export async function adminApiFetch(path: string, init?: RequestInit) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${API_BASE}${suffix}`, init);
}

export type AiEnrichStatusItem = {
  ticket_number: string;
  ai_enrichment_status: string;
  ai_enrichment_attempts: number;
  ai_enrichment_error?: string | null;
};

export type AiEnrichStatusResponse = {
  summary: Record<string, number>;
  actionable: AiEnrichStatusItem[];
};

export async function fetchAiEnrichStatus(token: string): Promise<AiEnrichStatusResponse> {
  const res = await adminApiFetch("/api/admin/ai-enrich/status", {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

export type DeleteProposalResponse = {
  status: string;
  message: string;
  ticket_number: string;
  deleted_counts?: Record<string, number>;
};

export async function deleteProposal(
  ticketNumber: string,
  token: string,
): Promise<DeleteProposalResponse> {
  const res = await adminApiFetch(
    `/api/proposals/${encodeURIComponent(ticketNumber)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error)
        : "") || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as DeleteProposalResponse;
}