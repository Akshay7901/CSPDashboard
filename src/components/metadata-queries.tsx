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
};

export function MetadataQueries({
  ticket,
  viewer,
  canRaise = true,
  raisableFields,
  onChanged,
}: Props) {
  const [thread, setThread] = useState<MetadataQueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [responseText, setResponseText] = useState("");

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

  const toggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const onRaise = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await raiseMetadataQuery(ticket, text.trim(), selectedFields);
      setText("");
      setSelectedFields([]);
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
      await respondMetadataQuery(ticket, queryId, responseText.trim());
      setRespondingTo(null);
      setResponseText("");
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

      {viewer === "author" && canRaise && (
        <form onSubmit={onRaise} className="space-y-3 border-t border-stone-200 px-5 py-4">
          <div>
            <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Raise a new query
            </label>
            {raisableFields && raisableFields.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {raisableFields.map((f) => {
                  const active = selectedFields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleField(f.key)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium transition ${
                        active
                          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-400"
                          : "bg-stone-50 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Describe your concern about the metadata…"
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Sending…" : "Submit Query"}
          </button>
        </form>
      )}
    </div>
  );
}