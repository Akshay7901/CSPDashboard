import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type ContributorStatus = "pending" | "accepted" | "declined";

export type Contributor = {
  id: number;
  name: string;
  email: string;
  affiliation?: string | null;
  chapter_title?: string | null;
  status: ContributorStatus;
  invited_at?: string | null;
  responded_at?: string | null;
  notes?: string | null;
};

export type ContributorCounts = {
  total?: number;
  pending?: number;
  accepted?: number;
  declined?: number;
};

export type ContributorsResponse = {
  status?: string;
  ticket_number?: string;
  contributors?: Contributor[];
  counts?: ContributorCounts;
};

export type ContributorInput = {
  name: string;
  email: string;
  affiliation?: string;
  chapter_title?: string;
  notes?: string;
};

export type ContributorConfirmInfo = {
  contributor_name?: string;
  editor_name?: string;
  book_title?: string;
  affiliation?: string | null;
  chapter_title?: string | null;
  current_status?: ContributorStatus;
  invited_at?: string | null;
  responded_at?: string | null;
};

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parse(res: Response) {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      (body.error as string) || (body.message as string) || `Request failed (${res.status}).`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function listContributors(ticket: string): Promise<ContributorsResponse> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contributors`, {
    headers: authHeaders(),
  });
  return (await parse(res)) as ContributorsResponse;
}

export async function addContributor(ticket: string, input: ContributorInput) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/contributors`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return (await parse(res)) as {
    message?: string;
    contributor?: Contributor;
    email_sent?: boolean;
  };
}

export async function removeContributor(ticket: string, id: number) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contributors/${id}`,
    { method: "DELETE", headers: authHeaders() },
  );
  return parse(res);
}

export async function resendContributorInvite(ticket: string, id: number) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/contributors/${id}/resend`,
    { method: "POST", headers: authHeaders() },
  );
  return parse(res);
}

export async function getContributorConfirmInfo(
  token: string,
): Promise<ContributorConfirmInfo> {
  const res = await proposalApiFetch(
    `/contributors/confirm/${encodeURIComponent(token)}`,
    { headers: { "Content-Type": "application/json" } },
  );
  return (await parse(res)) as ContributorConfirmInfo;
}

export async function submitContributorResponse(
  token: string,
  action: "accept" | "decline",
) {
  const res = await proposalApiFetch(
    `/contributors/confirm/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  return parse(res);
}
