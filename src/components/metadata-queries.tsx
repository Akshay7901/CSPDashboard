import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  /** DR only: called after query responses are saved, before the thread reloads. */
  onAfterRespond?: () => Promise<void> | void;
  /** Notified whenever the open-query state changes (author has an unanswered query). */
  onOpenQueryChange?: (hasOpen: boolean) => void;
  /**
   * Called when a new entry from the *other* party is detected since the
   * viewer last saw the thread. Author: new publisher response. DR: new
   * author query. Use to highlight the primary CTA in the parent panel.
   */
  onNewActivity?: () => void;
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
  onAfterRespond,
  onOpenQueryChange,
  fieldValues,
  fieldLabels,
  onSaveFields,
  onNewActivity,
}: Props) {
  const [thread, setThread] = useState<MetadataQueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [flashCta, setFlashCta] = useState(false);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const seenKey = `metadata_queries_seen:${viewer}:${ticket}`;
  const didInitialSeenRef = useRef(false);

  type DraftRow = { field: string; text: string };
  const [drafts, setDrafts] = useState<DraftRow[]>([{ field: "", text: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const [responseText, setResponseText] = useState("");
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [rowEdits, setRowEdits] = useState<Record<string, string>>({});
  const appliedStorageKey = `metadata_queries_applied:${viewer}:${ticket}`;
  const [appliedKeys, setAppliedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(appliedStorageKey) : null;
      setAppliedKeys(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setAppliedKeys({});
    }
  }, [appliedStorageKey]);

  const markApplied = useCallback(
    (key: string) => {
      setAppliedKeys((prev) => {
        const next = { ...prev, [key]: true };
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(appliedStorageKey, JSON.stringify(next));
          }
        } catch {
          // ignore disabled storage
        }
        return next;
      });
    },
    [appliedStorageKey],
  );

  const clearAppliedForFields = useCallback(
    (fields: string[]) => {
      const fieldSet = new Set(fields);
      setAppliedKeys((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([key]) => {
            const field = key.split(":")[1];
            return !field || !fieldSet.has(field);
          }),
        );
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(appliedStorageKey, JSON.stringify(next));
          }
        } catch {
          // ignore disabled storage
        }
        return next;
      });
    },
    [appliedStorageKey],
  );

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

  // Detect new activity from the other party since last visit. Scroll into
  // view and flash the primary CTA so the reviewer/author is guided to act.
  useEffect(() => {
    if (loading) return;
    if (thread.length === 0) return;
    let seen: Record<string, true> = {};
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(seenKey) : null;
      if (raw) seen = JSON.parse(raw) as Record<string, true>;
    } catch {
      seen = {};
    }
    // On the very first render for this ticket, treat everything as already
    // seen — we only want to react to genuinely new activity.
    const firstTime = Object.keys(seen).length === 0 && !didInitialSeenRef.current;
    const relevantType = viewer === "author" ? "response" : "query";
    const newRelevant = thread.filter(
      (t) => t.type === relevantType && !seen[`${t.type}-${t.id}`],
    );
    // Update the seen map with every current entry.
    const nextSeen: Record<string, true> = { ...seen };
    for (const t of thread) nextSeen[`${t.type}-${t.id}`] = true;
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(seenKey, JSON.stringify(nextSeen));
    } catch {
      // ignore quota / disabled storage
    }
    didInitialSeenRef.current = true;
    if (firstTime || newRelevant.length === 0) return;
    // New activity — scroll to the queries panel and flash the CTA.
    setFlashCta(true);
    onNewActivity?.();
    // Prefer scrolling directly to the newest relevant entry (e.g. the
    // publisher's response on the author dashboard) so the viewer is taken
    // straight to what changed, and briefly highlight it.
    const latest = newRelevant[newRelevant.length - 1];
    const latestKey = latest ? `${latest.type}-${latest.id}` : null;
    window.setTimeout(() => {
      const target =
        (latestKey && entryRefs.current[latestKey]) || rootRef.current;
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    if (latestKey) {
      setHighlightKey(latestKey);
      window.setTimeout(() => setHighlightKey((k) => (k === latestKey ? null : k)), 6000);
    }
    const t = window.setTimeout(() => setFlashCta(false), 6000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, loading, viewer]);

  // Author view: keep the thread fresh so the publisher's response appears
  // automatically. Poll while an open query is awaiting a response, and
  // refetch when the tab regains focus / becomes visible.
  useEffect(() => {
    if (viewer !== "author") return;
    const onFocus = () => void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [viewer, reload]);

  const hasUnansweredAuthorQuery =
    viewer === "author" &&
    thread.some(
      (t) =>
        t.type === "query" &&
        !thread.some(
          (r) => r.type === "response" && r.parent_query_id === t.id,
        ),
    );

  useEffect(() => {
    if (!hasUnansweredAuthorQuery) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void reload();
    }, 4000);
    return () => window.clearInterval(id);
  }, [hasUnansweredAuthorQuery, reload]);

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

  const [confirmSend, setConfirmSend] = useState<null | {
    ids: number[];
    updates: Record<string, string>;
  }>(null);

  /** Compute the field updates that would be saved alongside a response. */
  const pendingFieldUpdates = useCallback(() => {
    const updates: Record<string, string> = {};
    if (!onSaveFields) return updates;
    for (const [k, v] of Object.entries(fieldEdits)) {
      if ((fieldValues?.[k] ?? "") !== v) updates[k] = v;
    }
    for (const [rowKey, v] of Object.entries(rowEdits)) {
      const fkey = rowKey.split(":")[1];
      if (!fkey || fkey === "cover_image" || fkey === "authors") continue;
      if ((fieldValues?.[fkey] ?? "") !== v) updates[fkey] = v;
    }
    return updates;
  }, [onSaveFields, fieldEdits, rowEdits, fieldValues]);

  /** Seed the inline field editors with the value the author requested. */
  useEffect(() => {
    if (!onSaveFields || !fieldValues) return;
    const nextRowEdits: Record<string, string> = {};
    for (const q of thread) {
      if (q.type !== "query") continue;
      for (const fkey of q.fields || []) {
        if (fkey === "cover_image" || fkey === "authors") continue;
        const key = `${q.id}:${fkey}`;
        if (rowEdits[key] === undefined) {
          const requested = (q.text || "").trim();
          nextRowEdits[key] =
            requested.length > 0 ? requested : (fieldValues[fkey] ?? "").toString();
        }
      }
    }
    if (Object.keys(nextRowEdits).length > 0) {
      setRowEdits((prev) => ({ ...prev, ...nextRowEdits }));
    }
  }, [thread, fieldValues, onSaveFields]);

  const onRespond = async (queryIds: number[], applyFields = true) => {
    if (!responseText.trim()) return;
    if (queryIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // Persist any field updates first so the metadata snapshot reflects
      // the change before the response is recorded.
      if (onSaveFields && applyFields) {
        const updates = pendingFieldUpdates();
        if (Object.keys(updates).length > 0) {
          await onSaveFields(updates);
        }
      }
      for (const id of queryIds) {
        await respondMetadataQuery(ticket, id, responseText.trim());
      }
      await onAfterRespond?.();
      setResponseText("");
      setFieldEdits({});
      setRowEdits({});
      setConfirmSend(null);
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
    <div
      ref={rootRef}
      className={`rounded-2xl border bg-white transition ${
        flashCta
          ? "border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]"
          : "border-stone-200"
      }`}
    >
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

      {flashCta && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
          <p className="font-sans text-sm text-amber-900">
            {viewer === "author"
              ? "The publisher has responded to your query. Please review the updated metadata table above and press Submit metadata if you're happy with it."
              : "The author has raised a new query. Review the tagged fields, apply any requested changes, then send your response below."}
          </p>
        </div>
      )}

      <div className="space-y-3 px-5 py-4">
        {loading && thread.length === 0 && (
          <p className="font-sans text-sm text-stone-500">Loading…</p>
        )}
        {!loading && thread.length === 0 && (
          <p className="font-sans text-sm text-stone-500">No queries yet.</p>
        )}
        {thread.map((entry) => {
          const isQuery = entry.type === "query";
          const entryKey = `${entry.type}-${entry.id}`;
          const isHighlighted = highlightKey === entryKey;
          return (
            <div
              key={entryKey}
              ref={(el) => {
                entryRefs.current[entryKey] = el;
              }}
              className={`rounded-xl border px-4 py-3 transition ${
                isQuery
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
              } ${
                isHighlighted
                  ? "ring-4 ring-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]"
                  : ""
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
            </div>
          );
        })}
        {viewer === "dr" && hasOpenQuery && (() => {
          const openQueries = thread.filter(
            (t) => t.type === "query" && !answered.has(t.id),
          );
          const openIds = openQueries.map((q) => q.id);
          const unionFields = Array.from(
            new Set(openQueries.flatMap((q) => q.fields || [])),
          );
          return (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">
                Respond to {openIds.length} open {openIds.length === 1 ? "query" : "queries"}
              </p>
              {onSaveFields && (() => {
                const rows: { qid: number; fkey: string; queryText: string }[] = [];
                for (const q of openQueries) {
                  for (const fkey of q.fields || []) {
                    rows.push({ qid: q.id, fkey, queryText: q.text });
                  }
                }
                if (rows.length === 0) return null;
                return (
                  <div className="space-y-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                      Apply requested metadata changes
                    </p>
                    {rows.map(({ qid, fkey, queryText }) => {
                      const key = `${qid}:${fkey}`;
                      if (fkey === "cover_image" || fkey === "authors") {
                        return (
                          <p key={key} className="font-sans text-xs text-stone-500">
                            <span className="font-medium text-stone-700">
                              {fieldLabels?.[fkey] || fkey}:
                            </span>{" "}
                            {queryText} — edit in the metadata form above.
                          </p>
                        );
                      }
                      const requested = (queryText || "").trim();
                      const current =
                        rowEdits[key] ??
                        (requested.length > 0
                          ? requested
                          : (fieldValues?.[fkey] ?? "").toString());
                      const savedValue = (fieldValues?.[fkey] ?? "").toString().trim();
                      const isApplied =
                        !!appliedKeys[key] ||
                        (savedValue.length > 0 &&
                          requested.length > 0 &&
                          savedValue === requested);
                      const multiline =
                        fkey === "display_bios" || fkey === "book_description";
                      return (
                        <div
                          key={key}
                          className={`flex flex-col gap-2 sm:flex-row sm:items-start ${isApplied ? "opacity-70" : ""}`}
                        >
                          <label className="font-sans text-xs font-medium text-stone-700 sm:w-32 sm:pt-2">
                            {fieldLabels?.[fkey] || fkey}
                          </label>
                          {multiline ? (
                            <textarea
                              rows={2}
                              value={current}
                              disabled={isApplied}
                              onChange={(e) =>
                                setRowEdits((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              className="flex-1 resize-none rounded-md border border-stone-300 bg-white px-2 py-1.5 font-sans text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100 disabled:bg-stone-50 disabled:text-stone-500 disabled:cursor-not-allowed"
                            />
                          ) : (
                            <input
                              type="text"
                              value={current}
                              disabled={isApplied}
                              onChange={(e) =>
                                setRowEdits((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1.5 font-sans text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100 disabled:bg-stone-50 disabled:text-stone-500 disabled:cursor-not-allowed"
                            />
                          )}
                          <button
                            type="button"
                             disabled={!current.trim() || isApplied}
                            onClick={() => markApplied(key)}
                            className={`rounded-md px-3 py-1.5 font-sans text-xs font-semibold transition ${
                              isApplied
                                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                                : "bg-[#5B2EBA] text-white hover:bg-[#4a2599] disabled:opacity-50"
                            }`}
                          >
                             {isApplied ? "Applied ✓" : "Apply"}
                          </button>
                        </div>
                      );
                    })}
                    <p className="font-sans text-[11px] text-stone-500">
                      These edits will be saved when you click <span className="font-semibold">Send Response</span> below.
                    </p>
                  </div>
                );
              })()}
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                rows={3}
                placeholder="Type one response — it will be sent for all open queries…"
                className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
              />
              <button
                type="button"
                disabled={submitting || !responseText.trim()}
                onClick={() => {
                  const updates = pendingFieldUpdates();
                  if (Object.keys(updates).length > 0) {
                    setConfirmSend({ ids: openIds, updates });
                  } else {
                    void onRespond(openIds, true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 ${
                  flashCta ? "ring-4 ring-amber-300 animate-pulse" : ""
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                {submitting
                  ? "Sending…"
                  : "Send Response & Metadata"}
              </button>
            </div>
          );
        })()}
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
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 font-sans text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100 sm:w-64"
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
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
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

      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <h4 className="font-serif text-lg font-bold text-stone-900">
              Apply metadata changes?
            </h4>
            <p className="mt-2 font-sans text-sm text-stone-600">
              Sending this reply will also update{" "}
              {Object.keys(confirmSend.updates).length}{" "}
              {Object.keys(confirmSend.updates).length === 1 ? "field" : "fields"} in
              the metadata record. Do you want to apply these changes or discard them
              and send the reply only?
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              {Object.entries(confirmSend.updates).map(([k, v]) => (
                <li key={k} className="font-sans text-xs text-stone-700">
                  <span className="font-semibold">{fieldLabels?.[k] || k}:</span>{" "}
                  <span className="text-stone-600">{v || "—"}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSend(null)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  clearAppliedForFields(Object.keys(confirmSend.updates));
                  setRowEdits({});
                  setFieldEdits({});
                  void onRespond(confirmSend.ids, false);
                }}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Discard changes & send reply
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void onRespond(confirmSend.ids, true)}
                className="rounded-lg bg-emerald-700 px-3 py-2 font-sans text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Apply changes & send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}