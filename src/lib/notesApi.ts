import { proposalApiFetch } from "@/lib/proposalApi";
import { getPortalToken } from "@/lib/auth";

export interface InternalNote {
  id: number;
  ticket_number: string;
  note: string;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function listInternalNotes(ticket: string): Promise<InternalNote[]> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/notes`, {
    headers: authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed to load notes (${res.status})`);
  return (body.notes as InternalNote[]) || [];
}

export async function createInternalNote(ticket: string, note: string): Promise<InternalNote> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/notes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ note }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed to create note (${res.status})`);
  return body.note as InternalNote;
}

export async function updateInternalNote(
  ticket: string,
  noteId: number,
  note: string,
): Promise<InternalNote> {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/notes/${noteId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ note }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed to update note (${res.status})`);
  return body.note as InternalNote;
}

export async function deleteInternalNote(ticket: string, noteId: number): Promise<void> {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/notes/${noteId}`,
    { method: "DELETE", headers: authHeaders() },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((body.error as string) || `Failed to delete note (${res.status})`);
  }
}
