import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  type CoverImage,
  type ProposalMetadata,
} from "@/lib/metadataApi";
import { MetadataQueries } from "@/components/metadata-queries";
import { isAdmin } from "@/lib/auth";

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

function isReleasedMetadata(record: ProposalMetadata | null | undefined) {
  const status = (record?.metadata_status || "").trim().toLowerCase();
  return status === "sent_to_author" || status === "approved" || !!record?.approved_at;
}

function hasMetadataContent(record: ProposalMetadata | null | undefined) {
  const md = record?.metadata;
  if (!md) return false;
  return Object.entries(md).some(([key, value]) => {
    if (key === "authors") return Array.isArray(value) && value.length > 0;
    return typeof value === "string" && value.trim().length > 0;
  });
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function AuthorMetadataPanel({
  ticket,
  proposalStatus,
  isPostApproval,
  fallbackData,
}: {
  ticket: string;
  proposalStatus?: string;
  isPostApproval?: boolean;
  /**
   * Synthesized metadata derived from the proposal's `current_data` payload.
   * Used when the dedicated `/metadata` endpoint returns 404/403 (e.g.
   * after author approval) so the author can still see their record.
   */
  fallbackData?: ProposalMetadata | null;
}) {
  const [metadata, setMetadata] = useState<ProposalMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [notVisible, setNotVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const metadataRef = useRef(metadata);

  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverSuccess, setCoverSuccess] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [sourceText, setSourceText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showQueries, setShowQueries] = useState(false);
  const [hasOpenQuery, setHasOpenQuery] = useState(false);
  const cacheKey = `author_metadata_cache:${ticket}`;

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);


  const restorePostApprovalMetadata = () => {
    if (!isPostApproval) return null;
    let restored: ProposalMetadata | null = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ProposalMetadata;
        if (isReleasedMetadata(parsed) || hasMetadataContent(parsed)) {
          restored = {
            ...parsed,
            metadata_status: parsed.metadata_status || "approved",
          };
        }
      }
    } catch {
      /* ignore */
    }
    return restored;
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    const res = await getMetadata(ticket);
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        setNotVisible(true);
        // After author approval the API may stop exposing the record.
        // Fall back to (a) the last cached snapshot, or (b) data
        // synthesized from the proposal's `current_data` payload.
        const restored = restorePostApprovalMetadata();
        if (restored) {
          setMetadata(restored);
          setNotVisible(false);
        }
      } else {
        setError(res.error || "Failed to load metadata.");
      }
      setLoading(false);
      return;
    }
    // Once the author has already approved this proposal's metadata, any
    // subsequent reviewer edits (even if the backend temporarily marks the
    // record as "draft") should keep showing on the author dashboard so the
    // updated values are reflected automatically without a re-approval round.
    if (!isReleasedMetadata(res.data) && !isPostApproval) {
      setMetadata(null);
      setNotVisible(true);
      try {
        localStorage.removeItem(`author_metadata_cache:${ticket}`);
      } catch {
        /* ignore quota errors */
      }
      setLoading(false);
      return;
    }

    const dataChanged =
      JSON.stringify(metadataRef.current) !== JSON.stringify(res.data);
    setMetadata(res.data);
    if (dataChanged) {
      setLastFetchedAt(new Date());
    }
    // Cache the latest snapshot so we can keep displaying it after the
    // proposal advances past `sent_to_author` and the API hides the record.
    try {
      if (res.data) {
        localStorage.setItem(
          `author_metadata_cache:${ticket}`,
          JSON.stringify(res.data),
        );
      }
    } catch {
      /* ignore quota errors */
    }
    setNotVisible(false);
    setLoading(false);
  };


  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, isPostApproval]);

  // After the author has approved, the decision reviewer may continue to
  // edit metadata via "Save Draft". Re-fetch whenever the author returns
  // to the tab (or every 60s while it stays open) so those edits show up
  // automatically without requiring a manual refresh.
  useEffect(() => {
    const onFocus = () => {
      void reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 10_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, isPostApproval]);

  const status = metadata?.metadata_status || "";
  const isSent = status === "sent_to_author";
  const isApproved = status === "approved" || !!metadata?.approved_at;

  const canApprove = isSent && proposalStatus === "awaiting_author_approval";
  const canEditCover = !isApproved;
  const canDeleteCover = isAdmin();
  const coverImg: CoverImage | null | undefined = metadata?.cover_image;
  const coverDisplayUrl = coverImg?.url || coverImg?.s3_url;

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

  // The author must only see metadata after the decision reviewer explicitly
  // sends it (`sent_to_author`) or after the author has approved that sent
  // record. Proposal/contract statuses alone must not reveal draft metadata.
  const approvedByProposal = false;

  if (loading && !metadata) return null;
  if (!loading && !metadata && !approvedByProposal) return null;

  // Do not show the metadata section until the decision reviewer has
  // sent the metadata to the author. Before that the record may exist
  // in a "draft" state on the backend, but the author should not see it.
  if (!loading && !isSent && !isApproved && !approvedByProposal && !isPostApproval) return null;

  void notVisible;

  const onApprove = async () => {
    setApproving(true);
    setApproveError(null);
    setApproveSuccess(null);
    try {
      await approveMetadata(ticket);
      setApproveSuccess("Metadata approved. Thank you!");
      toast.success("Metadata submitted successfully");
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
    setUploadPct(0);
    try {
      const newCover = await uploadCoverImage(
        ticket,
        pendingFile,
        sourceText.trim(),
        (pct) => setUploadPct(pct),
      );
      setCoverSuccess("Cover image uploaded.");
      setPendingFile(null);
      setSourceText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Update directly from response — no re-fetch needed.
      setMetadata((prev) => (prev ? { ...prev, cover_image: newCover } : prev));
    } catch (e) {
      setCoverError((e as Error).message);
    } finally {
      setUploading(false);
      setUploadPct(0);
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
      setMetadata((prev) => (prev ? { ...prev, cover_image: null } : prev));
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
            {lastFetchedAt && (
              <p className="mt-0.5 font-sans text-xs text-stone-500">
                Last updated: {formatTimestamp(lastFetchedAt)}
              </p>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-semibold ring-1 ${statusPill.cls}`}
        >
          {statusPill.text}
        </span>
      </div>

      <div className="space-y-5 p-6">
        {loading && !metadata && (
          <p className="font-sans text-sm text-stone-500">Loading metadata…</p>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        {!error && (metadata || approvedByProposal) && (
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
                <div
                  className={`flex h-48 items-center justify-center overflow-hidden rounded-lg bg-white ${
                    coverDisplayUrl ? "border border-stone-200" : "border-2 border-dashed border-stone-300"
                  }`}
                >
                  {coverDisplayUrl ? (
                    <img
                      src={coverDisplayUrl}
                      alt="Cover"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-3 text-center font-sans text-xs text-stone-400">
                      No cover image uploaded
                    </p>
                  )}
                </div>
                <div className="space-y-2 font-sans text-sm">
                  {metadata?.cover_image ? (
                    <>
                      <p className="text-stone-700">
                        <span className="text-stone-500">File:</span>{" "}
                        {metadata?.cover_image.filename || "—"}
                      </p>
                      <p className="text-stone-700">
                        <span className="text-stone-500">Dimensions:</span>{" "}
                        {metadata?.cover_image.width_px || "?"}×{metadata?.cover_image.height_px || "?"} px
                        {metadata?.cover_image.dpi ? ` · ${metadata?.cover_image.dpi} dpi` : ""}
                      </p>
                      {typeof metadata?.cover_image.file_size_bytes === "number" && (
                        <p className="text-stone-700">
                          <span className="text-stone-500">Size:</span>{" "}
                          {(metadata.cover_image.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                        </p>
                      )}
                      {typeof metadata?.cover_image.version === "number" && (
                        <p className="text-stone-700">
                          <span className="text-stone-500">Version:</span>{" "}
                          v{metadata.cover_image.version}
                        </p>
                      )}
                      {metadata?.cover_image.source && (
                        <p className="text-stone-700">
                          <span className="text-stone-500">Source:</span>{" "}
                          {metadata?.cover_image.source}
                        </p>
                      )}
                      {canDeleteCover && (
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
                      Upload a high-resolution cover image (JPEG/PNG/TIFF, minimum 2360×2360 px at 300 dpi, max 50 MB).
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
                        accept=".jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff"
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
                  {uploading && (
                    <div className="space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                        <div
                          className="h-full bg-emerald-600 transition-all"
                          style={{ width: `${uploadPct}%` }}
                        />
                      </div>
                      <p className="font-sans text-xs text-stone-500">Uploading… {uploadPct}%</p>
                    </div>
                  )}
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
                      {uploading ? "Uploading…" : metadata?.cover_image ? "Replace cover" : "Upload cover"}
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
            {isSent && !isApproved && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
                {canApprove && (
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-semibold text-emerald-900">
                      Happy with the metadata?
                    </p>
                    <p className="font-sans text-xs text-emerald-800/80">
                      Approve to finalise your record, or raise a query if anything needs changing.
                    </p>
                  </div>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
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
                    disabled={approving || hasOpenQuery}
                    title={
                      hasOpenQuery
                        ? "Resolve the open metadata query before submitting."
                        : undefined
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {approving ? "Submitting…" : "Submit metadata"}
                  </button>
                </div>
                {hasOpenQuery && (
                  <p className="w-full font-sans text-xs text-amber-800">
                    Submit is disabled until the publisher responds to your open query.
                  </p>
                )}
              </div>
            )}

            {/* Queries — always mounted while metadata is loaded so the
                author can see the publisher's responses to any raised
                queries even after the metadata status transitions away
                from `sent_to_author`. Hidden visually until the author
                opens the panel or there's an active thread. */}
            <div
              className={
                showQueries || hasOpenQuery || !(isSent && !isApproved)
                  ? ""
                  : "hidden"
              }
            >
              <MetadataQueries
                ticket={ticket}
                viewer="author"
                canRaise={isSent && !isApproved}
                raisableFields={raisableFields}
                onOpenQueryChange={setHasOpenQuery}
              />
            </div>
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