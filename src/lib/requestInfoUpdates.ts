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

export function isFileUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function filenameFromUrl(url: string): string {
  const last = url.split("/").pop() || "File";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Fetches every past revision/info request for a ticket and flattens the
 * responded ones into a map keyed by revision-area key (the same keys used
 * in REVISION_AREAS), so a display field can look up "was this updated via
 * a revision response, and if so what's the new value" in one lookup.
 *
 * The real API shape has no `response_items`/`response_files` fields — each
 * request only carries a flat `draft_data: {key: value}` map, and text-only
 * answers (e.g. a new word count) aren't in there at all because the backend
 * writes those straight into the ticket's `current_data` instead. So:
 *  - `items[].key` + `responded_at` is used purely to flag "this field was
 *    touched by a response" (for the "Updated" badge), even when draft_data
 *    has nothing for that key.
 *  - `draft_data` values that look like URLs are file uploads. The backend
 *    overwrites `current_data.supporting_documents` with only the latest
 *    upload, so historical files are only recoverable from each past
 *    request's own draft_data — every request is walked and every distinct
 *    file URL for a key is accumulated, not just the newest one.
 *  - Any other draft_data value is treated as plain text, latest wins.
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
  const seenFileUrls: Record<string, Set<string>> = {};

  // Oldest first, so a plain re-assignment gives "latest response wins" for
  // text, and files end up listed in the order they were uploaded.
  const responded = raw
    .filter((r) => !!r.responded_at)
    .sort((a, b) =>
      String(a.responded_at || "").localeCompare(String(b.responded_at || "")),
    );

  const addFile = (key: string, url: string) => {
    const seen = seenFileUrls[key] || (seenFileUrls[key] = new Set());
    if (seen.has(url)) return;
    seen.add(url);
    const entry = updates[key] || (updates[key] = {});
    entry.files = [...(entry.files || []), { url, filename: filenameFromUrl(url) }];
  };

  for (const r of responded) {
    const respondedAt = r.responded_at as string;
    const items = (r.items as Array<Record<string, unknown>>) || [];
    const draftData = (r.draft_data as Record<string, unknown>) || {};

    for (const it of items) {
      const key = it.key as string | undefined;
      if (!key) continue;
      const entry = updates[key] || (updates[key] = {});
      entry.respondedAt = respondedAt;
    }

    for (const [key, value] of Object.entries(draftData)) {
      if (isFileUrl(value)) {
        addFile(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (isFileUrl(v)) addFile(key, v);
        }
      } else if (typeof value === "string" && value.trim()) {
        const entry = updates[key] || (updates[key] = {});
        entry.text = value.trim();
      }
      const entry = updates[key];
      if (entry) entry.respondedAt = respondedAt;
    }
  }

  return updates;
}
