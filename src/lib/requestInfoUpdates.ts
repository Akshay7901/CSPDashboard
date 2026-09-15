import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

// Single source of truth for revision-request categories — used by the DR's
// Request Revisions picker, the Info Requests history panel, and the author
// page's fallback labeling. Keeping this in one place is the whole point:
// duplicated copies of this list drifted out of sync in the past (e.g. a
// "Supporting Materials" / "Supporting Documents" duplicate, and a stale
// 8-item subset in one component), which is exactly the kind of bug this
// consolidation prevents from recurring.
export const REVISION_AREAS: { key: string; label: string }[] = [
  { key: "abstract_blurb", label: "Abstract / Blurb" },
  { key: "table_of_contents", label: "Table of Contents" },
  { key: "author_credentials", label: "Author Credentials" },
  { key: "market_analysis", label: "Market Analysis" },
  { key: "scope_framing", label: "Scope / Framing" },
  { key: "word_count", label: "Word Count / Length" },
  { key: "primary_author", label: "Primary Author Info" },
  { key: "mailing_address", label: "Mailing Address" },
  { key: "biography", label: "Biography" },
  { key: "additional_authors", label: "Additional Authors / Contributors" },
  { key: "manuscript_details", label: "Manuscript Details" },
  { key: "expected_completion", label: "Expected Completion Date" },
  { key: "overview", label: "Overview" },
  { key: "key_features", label: "Key Features / Selling Points" },
  { key: "marketing_promotion", label: "Marketing & Promotion" },
  { key: "competition", label: "Competing Titles" },
  { key: "audience", label: "Target Audience" },
  { key: "suggested_reviewers", label: "Author-Suggested Reviewers" },
  { key: "permissions", label: "Copyright & Permissions" },
  {
    key: "supporting_documents",
    label: "Supporting Documents (CV, manuscript files, attachments)",
  },
  { key: "other", label: "Other" },
];

export type RequestInfoUpdate = {
  text?: string;
  files?: { url: string; filename: string }[];
  respondedAt?: string;
};

/**
 * Fetches every past revision/info request for a ticket and flattens the
 * responded ones into a map keyed by revision-area key (the same keys used
 * in REVISION_AREAS), so a display field can look up "was this updated via
 * a revision response, and if so what's the new value" in one lookup.
 * Later responses win when the same key was requested more than once.
 */
export async function fetchRequestInfoUpdates(
  ticket: string,
): Promise<Record<string, RequestInfoUpdate>> {
  const token = getPortalToken();
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/request-info`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) return {};
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = (body.requests as Array<Record<string, unknown>>) || [];
  const updates: Record<string, RequestInfoUpdate> = {};

  for (const r of raw) {
    const respondedAt = r.responded_at as string | undefined;
    if (!respondedAt) continue;

    const items = (r.response_items as Array<Record<string, unknown>>) || [];
    for (const it of items) {
      const key = it.key as string | undefined;
      const text = (it.response_text as string | undefined)?.trim();
      if (!key || !text) continue;
      const existing = updates[key];
      if (!existing?.respondedAt || existing.respondedAt < respondedAt) {
        updates[key] = { ...existing, text, respondedAt };
      }
    }

    const files = (r.response_files as Array<Record<string, unknown>>) || [];
    for (const f of files) {
      const key = f.field_key as string | undefined;
      const url = f.url as string | undefined;
      if (!key || !url) continue;
      const entry = updates[key] || {};
      entry.files = [
        ...(entry.files || []),
        { url, filename: (f.filename as string | undefined) || "File" },
      ];
      if (!entry.respondedAt || entry.respondedAt < respondedAt) {
        entry.respondedAt = respondedAt;
      }
      updates[key] = entry;
    }
  }

  return updates;
}
