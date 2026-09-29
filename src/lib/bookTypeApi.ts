import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type BookTypeValue = "monograph" | "edited-volume";

export type BookTypeResult =
  | { ok: true; old_book_type?: string; new_book_type: string }
  // Switching to monograph while contributors exist — resend with confirm.
  | { ok: false; confirmRequired: true; contributorCount: number; message: string };

export function toBookTypeValue(raw?: string | null): BookTypeValue {
  return /edited/i.test(raw || "") ? "edited-volume" : "monograph";
}

// Backend slugs → display labels; anything else is shown as stored.
export function bookTypeLabel(raw?: string | null): string {
  const s = (raw || "").trim();
  if (/^monograph$/i.test(s)) return "Monograph";
  if (/^edited[-_ ]?volume$/i.test(s)) return "Edited Volume";
  return s;
}

export async function updateBookType(
  ticket: string,
  bookType: BookTypeValue,
  confirm = false,
): Promise<BookTypeResult> {
  const token = getPortalToken();
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/book-type`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(confirm ? { book_type: bookType, confirm: true } : { book_type: bookType }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 409 && body.confirm_required) {
    return {
      ok: false,
      confirmRequired: true,
      contributorCount: Number(body.contributor_count) || 0,
      message: (body.error as string) || "",
    };
  }
  if (!res.ok) {
    throw new Error(
      (body.error as string) || (body.message as string) || `Request failed (${res.status}).`,
    );
  }
  return {
    ok: true,
    old_book_type: body.old_book_type as string | undefined,
    new_book_type: (body.new_book_type as string) || bookType,
  };
}
