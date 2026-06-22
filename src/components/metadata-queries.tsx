import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Send, Tag } from "lucide-react";
import {
  getMetadataQueries,
  raiseMetadataQuery,
  respondMetadataQuery,
  type MetadataQueryEntry,
} from "@/lib/metadataApi";
import { formatDate, displayNameFromEmail } from "@/lib/proposals";

type Props = {
  ticket: string;
  viewer: "author" | "dr";
  /** Author can only raise queries when metadata is sent_to_author. */
  canRaise?: boolean;
  /** Optional list of metadata field keys the author can tag a query against. */
  raisableFields?: { key: string; label: string }[];
  onChanged?: () => void;
  /** Notified whenever the open-query state changes (author has an unanswered query). */
  onOpenQueryChange?: (hasOpen: boolean) => void;
  /**
   * DR only: current value snapshot for each metadata field key. Used to seed
   * inline editors when responding to a query that targets specific fields.
   */
  fieldValues?: Record<string, string>;
  /**
   * DR only: human-readable labels per field key. Falls back to the raw key.
   */
  fieldLabels?: Record<string, string>;
  /**
   * DR only: persist field updates alongside a response. The component will
   * await this before submitting the response text, so the metadata snapshot
   * stays in sync with the query thread.
   */
  onSaveFields?: (updates: Record<string, string>) => Promise<void>;
};

export function MetadataQueries({
  ticket,
  viewer,
  canRaise = true,
  raisableFields,
  onChanged,
  onOpenQueryChange,
  fieldValues,
  fieldLabels,
  onSaveFields,
}: Props) {
  const [thread, setThread] = useState<MetadataQueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type DraftRow = { field: string; text: string };
  const [drafts, setDrafts] = useState<DraftRow[]>([{ field: "", text: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [responseText, setResponseText] = useState("");
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await getMetadataQueries(ticket);
      setThread(body.queries || []);
    } catch (e) {
      setError((e as Error).message || "Failed to load queries.");
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateDraft = (idx: number, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const addDraftRow = () =>
    setDrafts((prev) => [...prev, { field: "", text: "" }]);
  const removeDraftRow = (idx: number) =>
    setDrafts((prev) =>
      prev.length === 1 ? [{ field: "", text: "" }] : prev.filter((_, i) => i !== idx),
    );

  const onRaise = async (e: FormEvent) => {
    e.preventDefault();
    const valid = drafts.filter((d) => d.text.trim());
    if (valid.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      for (const d of valid) {
        await raiseMetadataQuery(
          ticket,
          d.text.trim(),
          d.field ? [d.field] : [],
        );
      }
      setDrafts([{ field: "", text: "" }]);
      await reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onRespond = async (queryId: number) => {
    if (!responseText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // Persist any field updates first so the metadata snapshot reflects
      // the change before the response is recorded.
      if (onSaveFields) {
        const updates: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldEdits)) {
          if ((fieldValues?.[k] ?? "") !== v) updates[k] = v;
        }
        if (Object.keys(updates).length > 0) {
          await onSaveFields(updates);
        }
      }
      await respondMetadataQuery(ticket, queryId, responseText.trim());
      setRespondingTo(null);
      setResponseText("");
      setFieldEdits({});
      await reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const answered = new Set(
    thread
      .filter((t) => t.type === "response" && t.parent_query_id)
      .map((t) => t.parent_query_id as number),
  );

  const hasOpenQuery = thread.some(
    (t) => t.type === "query" && !answered.has(t.id),
  );

  useEffect(() => {
    onOpenQueryChange?.(hasOpenQuery);
  }, [hasOpenQuery, onOpenQueryChange]);

  if (viewer === "dr" && !loading && thread.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-serif text-base font-bold text-stone-900">
            <MessageSquare className="h-4 w-4 text-stone-500" />
            Metadata Queries
          </h3>
          <p className="mt-1 font-sans text-sm text-stone-500">
            {viewer === "author"
              ? "Raise a question about any metadata field"
              : "Author questions about the metadata"}
          </p>
        </div>
        {viewer === "dr" && hasOpenQuery && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
            Action needed
          </span>
        )}
      </div>

      <div className="space-y-3 px-5 py-4">
        {loading && thread.length === 0 && (
          <p className="font-sans text-sm text-stone-500">Loading…</p>
        )}
        {!loading && thread.length === 0 && (
          <p className="font-sans text-sm text-stone-500">No queries yet.</p>
        )}
        {thread.map((entry) => {
          const isQuery = entry.type === "query";
          return (
            <div
              key={`${entry.type}-${entry.id}`}
              className={`rounded-xl border px-4 py-3 ${
                isQuery
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-600">
                  {isQuery ? "Query" : "Response"} ·{" "}
                  {entry.raised_by_name ||
                    displayNameFromEmail(entry.raised_by || "")}
                  {entry.raised_by_role ? ` (${entry.raised_by_role})` : ""}
                </p>
                <p className="font-sans text-xs text-stone-500">
                  {formatDate(entry.created_at)}
                </p>
              </div>
              {isQuery && entry.fields && entry.fields.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.fields.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-sans text-[11px] font-medium text-amber-800 ring-1 ring-amber-300"
                    >
                      <Tag className="h-3 w-3" />
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 whitespace-pre-line font-sans text-sm text-stone-800">
                {entry.text}
              </p>
              {viewer === "dr" && isQuery && !answered.has(entry.id) && (
                <div className="mt-3">
                  {respondingTo === entry.id ? (
                    <div className="space-y-2">
                      {onSaveFields && entry.fields && entry.fields.length > 0 && (
                        <div className="space-y-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
                          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                            Update tagged metadata fields
                          </p>
                          {entry.fields.map((fkey) => {
                            // Skip non-text fields — they have their own UI elsewhere.
                            if (fkey === "cover_image" || fkey === "authors") {
                              return (
                                <p
                                  key={fkey}
                                  className="font-sans text-xs text-stone-500"
                                >
                                  {(fieldLabels?.[fkey] || fkey)} — edit in the
                                  metadata form above.
                                </p>
                              );
                            }
                            const current =
                              fieldEdits[fkey] ?? fieldValues?.[fkey] ?? "";
                            const multiline =
                              fkey === "display_bios" ||
                              fkey === "book_description";
                            return (
                              <div key={fkey}>
                                <label className="block font-sans text-[11px] font-medium text-stone-600">
                                  {fieldLabels?.[fkey] || fkey}
                                </label>
                                {multiline ? (
                                  <textarea
                                    rows={3}
                                    value={current}
                                    onChange={(e) =>
                                      setFieldEdits((prev) => ({
                                        ...prev,
                                        [fkey]: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full resize-none rounded-md border border-stone-300 bg-white px-2 py-1.5 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={current}
                                    onChange={(e) =>
                                      setFieldEdits((prev) => ({
                                        ...prev,
                                        [fkey]: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        rows={3}
                        placeholder="Type a response to the author…"
                        className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submitting || !responseText.trim()}
                          onClick={() => onRespond(entry.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submitting ? "Sending…" : "Send Response"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRespondingTo(null);
                            setResponseText("");
                            setFieldEdits({});
                          }}
                          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRespondingTo(entry.id);
                        setResponseText("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Respond
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
      </div>

      {viewer === "author" && canRaise && hasOpenQuery && (
        <div className="border-t border-stone-200 px-5 py-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800 ring-1 ring-amber-200">
            You have an open query awaiting a response. You can raise a new query
            once the publisher has responded.
          </p>
        </div>
      )}
      {viewer === "author" && canRaise && !hasOpenQuery && (
        <form onSubmit={onRaise} className="space-y-3 border-t border-stone-200 px-5 py-4">
          <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
            Raise new queries
          </label>
          <div className="space-y-2">
            {drafts.map((d, idx) => (
              <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <select
                  value={d.field}
                  onChange={(e) => updateDraft(idx, { field: e.target.value })}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100 sm:w-48"
                >
                  <option value="">Select field…</option>
                  {(raisableFields || []).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={d.text}
                  onChange={(e) => updateDraft(idx, { text: e.target.value })}
                  placeholder="Describe your concern…"
                  maxLength={2000}
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                />
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDraftRow(idx)}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-xs font-semibold text-stone-600 hover:bg-stone-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addDraftRow}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              + Add another query
            </button>
            <button
              type="submit"
              disabled={submitting || !drafts.some((d) => d.text.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? "Sending…" : "Submit Queries"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}