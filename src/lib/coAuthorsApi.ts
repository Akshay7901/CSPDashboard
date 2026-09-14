import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type CoAuthorRole = "author" | "editor";

export type CoAuthor = {
  index: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  role?: CoAuthorRole | string;
};

export type CoAuthorsResponse = {
  co_authors: CoAuthor[];
  count?: number;
  editable?: boolean;
};

export type CoAuthorInput = {
  first_name: string;
  last_name: string;
  email: string;
  role: CoAuthorRole;
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
      (body.error as string) ||
        (body.message as string) ||
        `Request failed (${res.status}).`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function listCoAuthors(ticket: string): Promise<CoAuthorsResponse> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/co-authors`, {
    headers: authHeaders(),
  });
  const body = (await parse(res)) as CoAuthorsResponse;
  return {
    co_authors: body.co_authors || [],
    count: body.count,
    editable: body.editable !== false,
  };
}

export async function addCoAuthor(ticket: string, input: CoAuthorInput) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/co-authors`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return parse(res);
}

export async function removeCoAuthor(ticket: string, index: number) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/co-authors/${index}`,
    { method: "DELETE", headers: authHeaders() },
  );
  return parse(res);
}

export type CoAuthorPatch = Partial<{
  first_name: string;
  last_name: string;
  email: string;
  role: CoAuthorRole;
}>;

export async function updateCoAuthor(ticket: string, index: number, patch: CoAuthorPatch) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/co-authors/${index}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return parse(res);
}
