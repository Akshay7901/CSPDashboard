import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Lock, Save, Send } from "lucide-react";
import { toast } from "sonner";
import cspLogo from "@/assets/csp-logo.png";
import { getPortalSession } from "@/lib/auth";
import { getMetadata } from "@/lib/metadataApi";
import { saveProofreaderMetadata, sendMetadataToAuthor } from "@/lib/proofreaderApi";
import { MetadataQueries } from "@/components/metadata-queries";

export const Route = createFileRoute("/dashboard/proofreader_proposal/$ticket")({
  head: () => ({
    meta: [
      { title: "Metadata Compilation — Proofreader Portal" },
      {
        name: "description",
        content:
          "Compile publication metadata, send it to the author for approval, and answer author queries.",
      },
      { property: "og:title", content: "Metadata Compilation — Proofreader Portal" },
      {
        property: "og:description",
        content: "Proofreader metadata compilation workspace for a signed proposal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProofreaderProposalPage,
});

type FieldKey =
  | "full_title"
  | "title"
  | "subtitle"
  | "category"
  | "display_names"
  | "display_bios"
  | "book_description"
  | "short_description"
  | "keywords"
  | "website_classification"
  | "bic"
  | "bisac"
  | "thema";

const FIELDS: { key: FieldKey; label: string; type: "text" | "textarea"; hint?: string }[] = [
  { key: "full_title", label: "Full Title", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "subtitle", label: "Subtitle", type: "text" },
  { key: "category", label: "Category", type: "text" },
  {
    key: "display_names",
    label: "Author Display Names",
    type: "text",
    hint: "Comma separated",
  },
  { key: "display_bios", label: "Author Bios", type: "textarea" },
  { key: "book_description", label: "Book Description", type: "textarea" },
  { key: "short_description", label: "Short Description", type: "textarea" },
  { key: "keywords", label: "Keywords", type: "text", hint: "Comma separated" },
  { key: "website_classification", label: "Website Classification", type: "text" },
  { key: "bic", label: "BIC", type: "text" },
  { key: "bisac", label: "BISAC", type: "text" },
  { key: "thema", label: "Thema", type: "text" },
];

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<FieldKey, string>;

function ProofreaderProposalPage() {
  const { ticket } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...EMPTY });
  const [notes, setNotes] = useState("");
  const [metadataStatus, setMetadataStatus] = useState<string>("draft");
  const [proposalStatus, setProposalStatus] = useState<string>("");
  const [isLocked, setIsLocked] = useState(false);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [metadataHasOpenQuery, setMetadataHasOpenQuery] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMetadata(ticket);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not load metadata.");
      toast.error(res.error ?? "Could not load metadata.");
      setLoading(false);
      return;
    }
    const raw = (res.data.metadata ?? {}) as Record<string, unknown>;
    const next = { ...EMPTY };
    for (const f of FIELDS) {
      const v = raw[f.key];
      next[f.key] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
    setValues(next);
    setMetadataStatus((res.data.metadata_status || "draft").toLowerCase());
    setProposalStatus((res.data.proposal_status || "").toLowerCase());
    setIsLocked(Boolean((res.data as unknown as { is_locked?: boolean }).is_locked));
    setVersion(res.data.current_version);
    setError(null);
    setLoading(false);
  }, [ticket]);

  useEffect(() => {
    if (!getPortalSession()) {
      navigate({ to: "/login" });
      return;
    }
    void load();
  }, [load, navigate]);

  const readOnly =
    isLocked || proposalStatus === "author_approved" || metadataStatus !== "draft";

  /**
   * The proposal reaches the proofreader once the contract is signed, so its
   * status can be signed / contract_signed / awaiting_author_approval. Gate
   * sending on the metadata itself instead of a single proposal status, and
   * fall back to enabled when the API omits proposal_status.
   */
  const canSend =
    !isLocked &&
    metadataStatus === "draft" &&
    proposalStatus !== "author_approved" &&
    proposalStatus !== "declined";

  const onSave = async () => {
    setSaving(true);
    try {
      await saveProofreaderMetadata(ticket, values, notes.trim() || undefined);
      toast.success("Metadata saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onSend = async () => {
    setSending(true);
    try {
      await sendMetadataToAuthor(ticket, notes.trim() || undefined);
      toast.success("Metadata sent to the author for approval");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const fieldLabels: Record<string, string> = {
    full_title: "Title (full)",
    title: "Title",
    subtitle: "Subtitle",
    category: "Category",
    display_names: "Display names",
    display_bios: "Display bios",
    book_description: "Book description",
    short_description: "Short description",
    keywords: "Keywords",
    website_classification: "Website classification",
    bic: "BIC codes",
    bisac: "BISAC codes",
    thema: "Thema codes",
  };

  const onSaveFields = async (updates: Record<string, string>) => {
    const next = { ...values, ...updates } as Record<FieldKey, string>;
    setValues(next);
    const res = await saveProofreaderMetadata(
      ticket,
      next,
      notes.trim() || undefined,
    );
    return res;
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6]">
      <header className="bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-4">
          <Link to="/dashboard/proofreader" className="flex items-center gap-3">
            <img src={cspLogo} alt="Cambridge Scholars Publishing" width={32} height={32} />
            <span className="font-serif text-base font-bold leading-none text-[#2C1A0E]">
              Cambridge Scholars Publishing
            </span>
          </Link>
          <span className="font-sans text-sm font-medium text-violet-600">Proofreader Portal</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link
          to="/dashboard/proofreader"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to queue
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2C1A0E]">
            Metadata Compilation
          </h1>
          <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 font-sans text-xs text-[#7A6A5A]">
            {ticket}
          </span>
          {version != null && (
            <span className="font-sans text-xs text-[#9A8A7A]">Version {version}</span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-sans text-xs font-medium text-red-700">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>

        <StatusBanner status={metadataStatus} proposalStatus={proposalStatus} />

        {metadataStatus === "sent_to_author" && metadataHasOpenQuery && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-800">
            The author has raised a query — metadata fields are editable so you can
            update them before responding.
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-6 space-y-3">
            <div className="h-64 animate-pulse rounded-xl border border-stone-200 bg-white" />
            <div className="h-32 animate-pulse rounded-xl border border-stone-200 bg-white" />
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className={f.type === "textarea" ? "sm:col-span-2" : undefined}
                  >
                    <label
                      htmlFor={`pf-${f.key}`}
                      className="mb-1 block font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A]"
                    >
                      {f.label}
                      {f.hint && (
                        <span className="ml-2 font-normal normal-case tracking-normal text-[#9A8A7A]">
                          {f.hint}
                        </span>
                      )}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        id={`pf-${f.key}`}
                        rows={4}
                        disabled={readOnly}
                        value={values[f.key]}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-[#2C1A0E] outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-500"
                      />
                    ) : (
                      <input
                        id={`pf-${f.key}`}
                        type="text"
                        disabled={readOnly}
                        value={values[f.key]}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-[#2C1A0E] outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-500"
                      />
                    )}
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="pf-notes"
                    className="mb-1 block font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A]"
                  >
                    Notes <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    id="pf-notes"
                    rows={3}
                    disabled={readOnly}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-[#2C1A0E] outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-500"
                  />
                </div>
              </div>

              {!readOnly && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void onSave()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-sans text-sm font-medium text-[#2C1A0E] hover:bg-stone-50 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </button>
                  {canSend && (
                    <button
                      type="button"
                      onClick={() => void onSend()}
                      disabled={sending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2C1A0E] px-4 py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send to Author
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
              <h2 className="mb-3 font-serif text-lg font-bold text-[#2C1A0E]">Author Queries</h2>
              <MetadataQueries
                ticket={ticket}
                viewer="dr"
                canRaise={false}
                onOpenQueryChange={setMetadataHasOpenQuery}
                onAfterRespond={onSend}
                fieldLabels={fieldLabels}
                fieldValues={values}
                onSaveFields={onSaveFields}
              />
            </section>
          </>
        )}
      </main>

    </div>
  );
}

function StatusBanner({
  status,
  proposalStatus,
}: {
  status: string;
  proposalStatus: string;
}) {
  if (status === "approved" || proposalStatus === "author_approved") {
    return (
      <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Author has approved this metadata.
      </p>
    );
  }
  if (status === "sent_to_author") {
    return (
      <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-sans text-sm text-blue-700">
        Sent to author — awaiting approval.
      </p>
    );
  }
  return (
    <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 font-sans text-sm text-orange-700">
      In progress — not yet sent to author.
    </p>
  );
}