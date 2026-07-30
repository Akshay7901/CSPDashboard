import { getPortalToken } from "./auth";
import { API_BASE_URL, proposalApiFetch } from "./proposalApi";

const API_ROOT = `${API_BASE_URL}/api`;

export type ProofreaderQueueItem = {
  ticket_number: string;
  title?: string;
  author_name?: string;
  author_email?: string;
  proposal_status?: string;
  metadata_status?: string;
  is_locked?: boolean;
  proofreader_email?: string;
  current_version?: number;
  compiled_at?: string | null;
  sent_for_confirmation_at?: string | null;
  updated_at?: string | null;
};

export type ProofreaderQueueTab = "needs_compiling" | "with_author" | "confirmed";

export type ProofreaderQueueResponse = {
  queue: Record<ProofreaderQueueTab, ProofreaderQueueItem[]>;
  counts: Record<ProofreaderQueueTab, number>;
};

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const EMPTY_QUEUE: ProofreaderQueueResponse = {
  queue: { needs_compiling: [], with_author: [], confirmed: [] },
  counts: { needs_compiling: 0, with_author: 0, confirmed: 0 },
};

export async function getProofreaderQueue(): Promise<{
  ok: boolean;
  data: ProofreaderQueueResponse;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_ROOT}/proofreader/queue?_t=${Date.now()}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Partial<ProofreaderQueueResponse> & {
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, data: EMPTY_QUEUE, error: body.error || `Failed to load queue (${res.status}).` };
    }
    const queue = { ...EMPTY_QUEUE.queue, ...(body.queue ?? {}) };
    const counts = {
      needs_compiling: body.counts?.needs_compiling ?? queue.needs_compiling.length,
      with_author: body.counts?.with_author ?? queue.with_author.length,
      confirmed: body.counts?.confirmed ?? queue.confirmed.length,
    };
    return { ok: true, data: { queue, counts } };
  } catch {
    return { ok: false, data: EMPTY_QUEUE, error: "Could not reach the proofreader queue service." };
  }
}

/** PUT /api/proposals/:ticket/metadata */
export async function saveProofreaderMetadata(
  ticket: string,
  fields: Record<string, string>,
  notes?: string,
) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/metadata`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(notes ? { ...fields, notes } : fields),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Save failed (${res.status}).`);
  return body;
}

/** POST /api/proposals/:ticket/metadata/send */
export async function sendMetadataToAuthor(ticket: string, notes?: string) {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/metadata/send`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(notes ? { notes } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Send failed (${res.status}).`);
  return body;
}