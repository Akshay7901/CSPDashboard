import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Lock, LogOut, Save, Send, Menu } from "lucide-react";
import { toast } from "sonner";
import cspLogo from "@/assets/csp-logo.png";
import { getPortalSession, portalLogout } from "@/lib/auth";
import { initialsFromName, displayNameFromEmail } from "@/lib/proposals";
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
  | "keywords"
  | "website_classification"
  | "bic";

const FIELDS: { key: FieldKey; label: string; type: "text" | "textarea"; hint?: string }[] = [
  { key: "full_title", label: "Title Full", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "subtitle", label: "Subtitle", type: "text" },
  { key: "category", label: "Category Auth/Ed", type: "text" },
  { key: "display_names", label: "Display Names", type: "text" },
  { key: "display_bios", label: "Display Bios", type: "textarea" },
  { key: "book_description", label: "Book Description (Blurb)", type: "textarea" },
  { key: "keywords", label: "Keywords", type: "text" },
  { key: "website_classification", label: "Website Classification", type: "text" },
  { key: "bic", label: "BIC Codes", type: "text" },
];

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<FieldKey, string>;


function MetaRow({
  label,
  value,
  onChange,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-0 border-t border-stone-200 first:border-t-0">
      <div className="flex items-center bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
        {label}
      </div>
      <div className="border-l border-stone-200 px-4 py-3">
        {disabled ? (
          <p className="whitespace-pre-wrap break-words px-1 py-1.5 font-sans text-sm text-stone-800">
            {value?.trim() ? value : <span className="text-stone-400">—</span>}
          </p>
        ) : multiline ? (
          <textarea
            rows={5}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-stone-900 outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-500"
          />
        ) : (
          <input
            type="text"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-stone-900 outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-500"
          />
        )}
      </div>
    </div>
  );
}

type AuthorEntry = {
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_2?: string;
  institution?: string;
  country?: string;
};

const AUTHOR_FIELDS: { key: keyof AuthorEntry; label: string }[] = [
  { key: "title", label: "Salutation" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "email_2", label: "Email 2" },
  { key: "institution", label: "Institution" },
  { key: "country", label: "Country" },
];


function ProofreaderProposalPage() {
  const { ticket } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...EMPTY });
  const [notes, setNotes] = useState("");
  const [metadataStatus, setMetadataStatus] = useState<string>("draft");
  const [proposalStatus, setProposalStatus] = useState<string>("");
  const [isLocked, setIsLocked] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [metadataHasOpenQuery, setMetadataHasOpenQuery] = useState(false);
  const [authors, setAuthors] = useState<AuthorEntry[]>([]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");


  const load = useCallback(async () => {
    setLoading(true);
    let res: Awaited<ReturnType<typeof getMetadata>>;
    try {
      res = await getMetadata(ticket);
    } catch {
      setError("Could not reach the metadata service. Please try again.");
      toast.error("Could not reach the metadata service.");
      setLoading(false);
      return;
    }
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
    const known = new Set<string>([...FIELDS.map((f) => f.key), "authors"]);
    setExtras(
      Object.fromEntries(Object.entries(raw).filter(([k]) => !known.has(k))),
    );
    const rawAuthors = raw.authors;
    setAuthors(Array.isArray(rawAuthors) ? (rawAuthors as AuthorEntry[]) : []);
    const d = res.data as unknown as Record<string, unknown>;
    const cover = d.cover_image;
    setCoverImage(
      typeof cover === "string"
        ? cover
        : cover && typeof cover === "object"
          ? ((cover as { url?: string; file_url?: string }).url ??
            (cover as { file_url?: string }).file_url ??
            null)
          : null,
    );
    setMetadataStatus((res.data.metadata_status || "draft").toLowerCase());
    setProposalStatus((res.data.proposal_status || "").toLowerCase());
    setIsLocked(Boolean((res.data as unknown as { is_locked?: boolean }).is_locked));
    setError(null);
    setLoading(false);
  }, [ticket]);

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    setDisplayName(session.name || displayNameFromEmail(session.email));
    void load();
  }, [load, navigate]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

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
      await saveProofreaderMetadata(
        ticket,
        { ...extras, ...values, authors },
        notes.trim() || undefined,
      );
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
    book_description: "Book description (Blurb)",
    keywords: "Keywords",
    website_classification: "Website classification",
    bic: "BIC codes",
    cover_image: "Cover image",
    authors: "Authors",
    "authors.title": "Salutation",
    "authors.first_name": "First name",
    "authors.last_name": "Last name",
    "authors.email": "Email",
    "authors.email_2": "Email 2",
    "authors.institution": "Institution",
    "authors.country": "Country",
  };

  const onSaveFields = async (updates: Record<string, string>) => {
    // Queries can target nested author fields ("authors.country"), which must be
    // written into the authors array rather than as a top-level metadata key.
    const next = { ...values } as Record<FieldKey, string>;
    let nextAuthors = authors.map((a) => ({ ...a }));
    let authorsChanged = false;

    for (const [key, value] of Object.entries(updates)) {
      if (key.startsWith("authors.")) {
        const authorKey = key.slice("authors.".length) as keyof AuthorEntry;
        if (nextAuthors.length === 0) nextAuthors = [{}];
        nextAuthors[0] = { ...nextAuthors[0], [authorKey]: value };
        authorsChanged = true;
      } else if (key in next) {
        next[key as FieldKey] = value;
      }
    }

    setValues(next);
    if (authorsChanged) setAuthors(nextAuthors);
    await saveProofreaderMetadata(
      ticket,
      { ...extras, ...next, authors: nextAuthors },
      notes.trim() || undefined,
    );
    await load();
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6]">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/proofreader" className="flex items-center gap-3">
              <img src={cspLogo} alt="Cambridge Scholars Publishing" width={32} height={32} />
              <span className="font-serif text-xl font-bold text-stone-900">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-base text-stone-700">Proofreader Portal</span>
          </div>
          {/* Desktop: full account row */}
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 font-sans text-xs font-semibold text-violet-700">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm font-medium text-stone-800">{displayName}</span>
            <span className="h-5 w-px bg-stone-300" />
            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-stone-600 hover:text-stone-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>

          {/* Mobile: collapse account actions behind a menu button */}
          <div className="relative ml-auto sm:hidden">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-800 hover:bg-stone-50"
            >
              <Menu className="h-5 w-5" />
            </button>
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                  <div className="flex items-center gap-2 px-1 pb-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 font-sans text-xs font-semibold text-violet-700">
                      {initialsFromName(displayName)}
                    </div>
                    <span className="font-sans text-sm font-medium text-stone-800">{displayName}</span>
                  </div>
                  <div className="border-t border-stone-100 pt-2">
                    <button
                      type="button"
                      onClick={() => void onLogout()}
                      className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-2 font-sans text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          to="/dashboard/proofreader"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2C1A0E]">
            Metadata Compilation
          </h1>
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
            <section className="mt-6">
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                {FIELDS.map((f) => (
                  <MetaRow
                    key={f.key}
                    label={f.label}
                    value={values[f.key]}
                    multiline={f.type === "textarea"}
                    disabled={readOnly}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}

                <div className="grid grid-cols-[220px_1fr] gap-0 border-t border-stone-200">
                  <div className="flex items-center bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
                    Cover Image
                  </div>
                  <div className="border-l border-stone-200 px-4 py-4">
                    {coverImage ? (
                      <img
                        src={coverImage}
                        alt="Cover"
                        className="h-40 rounded-lg border border-stone-200 object-contain shadow-sm"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-stone-300 px-4 font-sans text-xs text-stone-400">
                        No cover image uploaded
                      </div>
                    )}
                  </div>
                </div>

                {authors.map((a, i) => (
                  <div key={i}>
                    <div className="border-t border-stone-200 bg-emerald-700 px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-white">
                      {authors.length > 1
                        ? `Primary Author(s) — ${i + 1}`
                        : "Primary Author(s)"}
                    </div>
                    {AUTHOR_FIELDS.map((af) => (
                      <MetaRow
                        key={af.key}
                        label={af.label}
                        value={a[af.key] ?? ""}
                        disabled={readOnly}
                        onChange={(v) =>
                          setAuthors((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, [af.key]: v } : row,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                ))}

                <MetaRow
                  label="Notes (optional)"
                  value={notes}
                  multiline
                  disabled={readOnly}
                  onChange={setNotes}
                />
              </div>

              {(() => {
                const extraRows = Object.entries(extras).filter(
                  ([, v]) =>
                    v != null &&
                    (typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                      ? String(v).trim() !== ""
                      : Array.isArray(v)
                        ? v.length > 0
                        : false),
                );
                if (extraRows.length === 0) return null;
                return (
                  <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
                    <div className="bg-stone-50/60 px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
                      Additional Metadata (sent to author)
                    </div>
                    {extraRows.map(([k, v]) => (
                      <div
                        key={k}
                        className="grid grid-cols-[220px_1fr] gap-0 border-t border-stone-200"
                      >
                        <div className="flex items-center bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
                          {fieldLabels[k] ??
                            k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                        </div>
                        <div className="border-l border-stone-200 px-5 py-4 font-sans text-sm text-stone-800">
                          <span className="whitespace-pre-wrap break-words">
                            {Array.isArray(v) ? v.map((x) => String(x)).join(", ") : String(v)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {!readOnly && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
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
                fieldValues={{
                  ...values,
                  "authors.title": authors[0]?.title || "",
                  "authors.first_name": authors[0]?.first_name || "",
                  "authors.last_name": authors[0]?.last_name || "",
                  "authors.email": authors[0]?.email || "",
                  "authors.email_2": authors[0]?.email_2 || "",
                  "authors.institution": authors[0]?.institution || "",
                  "authors.country": authors[0]?.country || "",
                }}
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