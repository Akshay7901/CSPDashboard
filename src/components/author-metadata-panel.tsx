import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  MessageSquarePlus,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";
import {
  approveMetadata,
  deleteCoverImage,
  getMetadata,
  uploadCoverImage,
  validateCoverImageFile,
  type MetadataAuthor,
  type ProposalMetadata,
} from "@/lib/metadataApi";
import { MetadataQueries } from "@/components/metadata-queries";

const FIELD_DEFS: { key: string; label: string; multiline?: boolean }[] = [
  { key: "full_title", label: "Title (full)" },
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "category", label: "Category" },
  { key: "display_names", label: "Display names" },
  { key: "display_bios", label: "Display bios", multiline: true },
  { key: "book_description", label: "Book description", multiline: true },
  { key: "keywords", label: "Keywords" },
  { key: "website_classification", label: "Website classification" },
  { key: "bic", label: "BIC codes" },
];

const AUTHOR_FIELDS: { key: keyof MetadataAuthor; label: string }[] = [
  { key: "title", label: "Salutation" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "email_2", label: "Email 2" },
  { key: "institution", label: "Institution" },
  { key: "country", label: "Country" },
];

export function AuthorMetadataPanel({
  ticket,
  proposalStatus,
}: {
  ticket: string;
  proposalStatus?: string;
}) {
  const [metadata, setMetadata] = useState<ProposalMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [notVisible, setNotVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverSuccess, setCoverSuccess] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showQueries, setShowQueries] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    const res = await getMetadata(ticket);
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        setNotVisible(true);
      } else {
        setError(res.error || "Failed to load metadata.");
      }
      setLoading(false);
      return;
    }
    setMetadata(res.data);
    setNotVisible(false);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const status = metadata?.metadata_status || "";
  const isSent = status === "sent_to_author";
  const isApproved =
    status === "approved" ||
    proposalStatus === "author_approved" ||
    !!metadata?.approved_at;

  const canApprove = isSent && proposalStatus === "awaiting_author_approval";
  const canEditCover = !isApproved;

  const md = metadata?.metadata || {};
  const authors = md.authors || [];

  const raisableFields = useMemo(
    () => [
      ...FIELD_DEFS.map((f) => ({ key: f.key, label: f.label })),
      { key: "cover_image", label: "Cover image" },
      { key: "authors", label: "Authors" },
    ],
    [],
  );

  // Hide panel entirely if there is no metadata visible to the author.
  if (!loading && (notVisible || !metadata)) return null;

  const onApprove = async () => {
    setApproving(true);
    setApproveError(null);
    setApproveSuccess(null);
    try {
      await approveMetadata(ticket);
      setApproveSuccess("Metadata approved. Thank you!");
      await reload();
    } catch (e) {
      setApproveError((e as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handlePickFile = async (file: File | null) => {
    setCoverError(null);
    setCoverSuccess(null);
    if (!file) {
      setPendingFile(null);
      return;
    }
    const v = await validateCoverImageFile(file);
    if (!v.ok) {
      setCoverError(v.error || "Invalid image.");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPendingFile(file);
  };

  const onUpload = async () => {
    if (!pendingFile) return;
    if (!sourceText.trim()) {
      setCoverError("Please provide an attribution / source statement.");
      return;
    }
    setUploading(true);
    setCoverError(null);
    setCoverSuccess(null);
    try {
      await uploadCoverImage(ticket, pendingFile, sourceText.trim());
      setCoverSuccess("Cover image uploaded.");
      setPendingFile(null);
      setSourceText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reload();
    } catch (e) {
      setCoverError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onDeleteCover = async () => {
    if (!metadata?.cover_image) return;
    if (!confirm("Remove the current cover image?")) return;
    setUploading(true);
    setCoverError(null);
    setCoverSuccess(null);
    try {
      await deleteCoverImage(ticket);
      setCoverSuccess("Cover image removed.");
      await reload();
    } catch (e) {
      setCoverError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const statusPill = (() => {
    if (isApproved) return { text: "Approved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
    if (isSent) return { text: "Awaiting your approval", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
    return { text: status || "Draft", cls: "bg-stone-50 text-stone-700 ring-stone-200" };
  })();

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-gradient-to-r from-emerald-50 via-emerald-50/60 to-white px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <BookOpen className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-bold text-stone-900">
              Metadata
            </h2>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-semibold ring-1 ${statusPill.cls}`}
        >
          {statusPill.text}
        </span>
      </div>

      <div className="space-y-5 p-6">
        {loading && (
          <p className="font-sans text-sm text-stone-500">Loading metadata…</p>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        {!loading && !error && metadata && (
          <>
            {isApproved && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-sans text-sm font-semibold text-emerald-900">
                    You have approved this metadata.
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-emerald-800/80">
                    The publisher will proceed to lock and publish your record.
                  </p>
                </div>
              </div>
            )}

            {/* Metadata fields (read-only) */}
            <div className="overflow-hidden rounded-xl border border-stone-200">
              {FIELD_DEFS.map((f) => (
                <ReadRow
                  key={f.key}
                  label={f.label}
                  value={(md as Record<string, string | undefined>)[f.key] || ""}
                  multiline={f.multiline}
                />
              ))}
              {authors.map((a, i) => (
                <div key={i}>
                  <div className="border-t border-stone-200 bg-emerald-700 px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-[0.18em] text-white">
                    {authors.length > 1 ? `Author ${i + 1}` : "Author"}
                  </div>
                  {AUTHOR_FIELDS.map((af) => (
                    <ReadRow
                      key={af.key}
                      label={af.label}
                      value={(a[af.key] as string | undefined) || ""}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Cover image */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-5">
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-stone-500" />
                <h3 className="font-serif text-sm font-bold text-stone-900">Cover image</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white">
                  {metadata.cover_image?.s3_url ? (
                    <img
                      src={metadata.cover_image.s3_url}
                      alt="Cover"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-3 text-center font-sans text-xs text-stone-400">
                      No cover image uploaded yet
                    </p>
                  )}
                </div>
                <div className="space-y-2 font-sans text-sm">
                  {metadata.cover_image ? (
                    <>
                      <p className="text-stone-700">
                        <span className="text-stone-500">File:</span>{" "}
                        {metadata.cover_image.filename || "—"}
                      </p>
                      <p className="text-stone-700">
                        <span className="text-stone-500">Dimensions:</span>{" "}
                        {metadata.cover_image.width_px || "?"}×{metadata.cover_image.height_px || "?"} px
                        {metadata.cover_image.dpi ? ` · ${metadata.cover_image.dpi} dpi` : ""}
                      </p>
                      {metadata.cover_image.source && (
                        <p className="text-stone-700">
                          <span className="text-stone-500">Source:</span>{" "}
                          {metadata.cover_image.source}
                        </p>
                      )}
                      {canEditCover && (
                        <button
                          type="button"
                          onClick={onDeleteCover}
                          disabled={uploading}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove cover
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-stone-600">
                      Upload a high-resolution cover image (JPEG/TIFF, minimum 2360×2360 px at 300 dpi, max 50 MB).
                    </p>
                  )}
                </div>
              </div>

              {canEditCover && (
                <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
                        Choose file
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.tif,.tiff,image/jpeg,image/tiff"
                        onChange={(e) => void handlePickFile(e.target.files?.[0] || null)}
                        className="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-stone-900"
                      />
                      {pendingFile && (
                        <p className="mt-1 font-sans text-xs text-stone-500">
                          Ready: {pendingFile.name} ({(pendingFile.size / 1024 / 1024).toFixed(1)} MB)
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
                        Source / attribution <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        maxLength={500}
                        placeholder="e.g. Photo by Jane Doe, used with permission"
                        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onUpload}
                      disabled={uploading || !pendingFile || !sourceText.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploading ? "Uploading…" : metadata.cover_image ? "Replace cover" : "Upload cover"}
                    </button>
                    {coverError && (
                      <span className="font-sans text-xs text-rose-700">{coverError}</span>
                    )}
                    {!coverError && coverSuccess && (
                      <span className="font-sans text-xs text-emerald-700">{coverSuccess}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {canApprove && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-semibold text-emerald-900">
                    Happy with the metadata?
                  </p>
                  <p className="font-sans text-xs text-emerald-800/80">
                    Approve to finalise your record, or raise a query if anything needs changing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {approveError && (
                    <span className="font-sans text-xs text-rose-700">{approveError}</span>
                  )}
                  {!approveError && approveSuccess && (
                    <span className="font-sans text-xs text-emerald-700">{approveSuccess}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowQueries((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-50"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    {showQueries ? "Hide queries" : "Raise query"}
                  </button>
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={approving}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {approving ? "Submitting…" : "Submit metadata"}
                  </button>
                </div>
              </div>
            )}

            {/* Queries (toggle) */}
            {showQueries && (
              <MetadataQueries
                ticket={ticket}
                viewer="author"
                canRaise={isSent && !isApproved}
                raisableFields={raisableFields}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ReadRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const shown = value && value.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[180px_1fr] gap-0 border-t border-stone-200 first:border-t-0">
      <div className="flex items-start bg-stone-50/60 px-5 py-3 font-sans text-sm font-medium text-stone-700">
        {label}
      </div>
      <div
        className={`border-l border-stone-200 px-4 py-3 font-sans text-sm text-stone-900 ${
          multiline ? "whitespace-pre-line" : "truncate"
        }`}
      >
        {shown}
      </div>
    </div>
  );
}