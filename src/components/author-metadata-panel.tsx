import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [attributionType, setAttributionType] = useState<"own" | "public" | "permission" | "">("");
  const [attributionDetails, setAttributionDetails] = useState<Record<"own" | "public" | "permission", string>>({
    own: "",
    public: "",
    permission: "",
  });
  const attributionDetail = attributionType ? attributionDetails[attributionType] : "";
  const setAttributionDetail = (value: string) => {
    if (!attributionType) return;
    setAttributionDetails((prev) => ({ ...prev, [attributionType]: value }));
  };
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Cache the just-uploaded file so the author can submit attribution as a
  // follow-up step (backend requires source at upload time, so submitting
  // attribution re-uploads the same file with the real source string).
  const uploadedFileRef = useRef<File | null>(null);
  // Track whether we have already seeded the attribution form from the
  // saved cover source. Once the user has edited the form, we stop syncing
  // from the server to avoid overwriting their input.
  const attributionInitialisedRef = useRef(false);
  const [attributionSaving, setAttributionSaving] = useState(false);
  const [attributionSaved, setAttributionSaved] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);
  const [showQueries, setShowQueries] = useState(false);
  const [hasOpenQuery, setHasOpenQuery] = useState(false);
  const [flashApprove, setFlashApprove] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const approveBtnRef = useRef<HTMLButtonElement | null>(null);
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

    const dataChanged = JSON.stringify(metadataRef.current) !== JSON.stringify(res.data);
    setMetadata(res.data);
    if (dataChanged) {
      setLastFetchedAt(new Date());
    }
    // Cache the latest snapshot so we can keep displaying it after the
    // proposal advances past `sent_to_author` and the API hides the record.
    try {
      if (res.data) {
        localStorage.setItem(`author_metadata_cache:${ticket}`, JSON.stringify(res.data));
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

  // Sync attribution form state from the saved cover source the first time
  // we see a real saved source. Once initialised (or when the user has just
  // uploaded a fresh "Pending attribution" cover), we reset and wait for the
  // user to edit rather than overwriting their input.
  useEffect(() => {
    const source = metadata?.cover_image?.source;
    if (!source || source === "Pending attribution") {
      setAttributionType("");
      setAttributionDetails({ own: "", public: "", permission: "" });
      setAttributionSaved(false);
      attributionInitialisedRef.current = false;
      return;
    }
    if (attributionInitialisedRef.current) return;

    if (source.startsWith("I own the copyright to this image.")) {
      setAttributionType("own");
      setAttributionDetails((prev) => ({ ...prev, own: source.replace("I own the copyright to this image.", "").trim() }));
    } else if (source.startsWith("Public domain source:")) {
      setAttributionType("public");
      setAttributionDetails((prev) => ({ ...prev, public: source.replace("Public domain source:", "").trim() }));
    } else if (source.startsWith("Permission from copyright holder:")) {
      setAttributionType("permission");
      setAttributionDetails((prev) => ({ ...prev, permission: source.replace("Permission from copyright holder:", "").trim() }));
    } else {
      setAttributionType("");
      setAttributionDetails({ own: "", public: "", permission: "" });
      attributionInitialisedRef.current = false;
      return;
    }
    setAttributionSaved(true);
    attributionInitialisedRef.current = true;
  }, [metadata?.cover_image?.source]);

  // Mark the attribution form as dirty as soon as the user interacts with it.
  useEffect(() => {
    if (attributionType || attributionDetail) {
      attributionInitialisedRef.current = true;
    }
  }, [attributionType, attributionDetail]);

  // Clear the attribution error once the author has selected an option and
  // started typing the required details.
  useEffect(() => {
    if (attributionError && attributionType && attributionDetail.trim()) {
      setAttributionError(null);
    }
  }, [attributionType, attributionDetail, attributionError]);

  // Auto-save attribution whenever the author changes the option or details.
  // The backend requires the source string at upload time, so this re-uploads
  // the cached file with the real attribution statement.
  useEffect(() => {
    if (!metadata?.cover_image || !uploadedFileRef.current) return;
    if (!attributionType || !attributionDetail.trim()) return;

    const sourceStatement =
      attributionType === "own"
        ? `I own the copyright to this image. ${attributionDetail.trim()}`
        : attributionType === "public"
          ? `Public domain source: ${attributionDetail.trim()}`
          : `Permission from copyright holder: ${attributionDetail.trim()}`;

    // Avoid re-uploading when the current values already match the saved source.
    if (sourceStatement === metadata.cover_image.source) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        setAttributionSaving(true);
        setCoverError(null);
        try {
          const newCover = await uploadCoverImage(
            ticket,
            uploadedFileRef.current!,
            sourceStatement,
          );
          setSourceText(sourceStatement);
          setMetadata((prev) => (prev ? { ...prev, cover_image: newCover } : prev));
          setAttributionSaved(true);
        } catch (e) {
          setCoverError((e as Error).message);
        } finally {
          setAttributionSaving(false);
        }
      })();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [attributionType, attributionDetail, metadata?.cover_image, ticket]);

  const status = metadata?.metadata_status || "";
  const isSent = status === "sent_to_author";
  const isApproved = status === "approved" || !!metadata?.approved_at;

  const canApprove = isSent && proposalStatus === "awaiting_author_approval";
  const canEditCover = !isApproved;
  const canDeleteCover = isAdmin();
  const coverImg: CoverImage | null | undefined = metadata?.cover_image;
  const coverDisplayUrl = coverImg?.url || coverImg?.s3_url;
  const isAttributionComplete =
    !coverImg || (attributionType !== "" && attributionDetail.trim().length > 0);

  const md = metadata?.metadata || {};
  const authors = md.authors || [];

  const raisableFields = useMemo(
    () => [
      ...FIELD_DEFS.map((f) => ({ key: f.key, label: f.label })),
      { key: "cover_image", label: "Cover image" },
      ...AUTHOR_FIELDS.map((f) => ({
        key: `authors.${String(f.key)}`,
        label: f.label,
      })),
    ],
    [],
  );

  // The author must only see metadata after the decision reviewer explicitly
  // sends it (`sent_to_author`). Once the author approves, the released
  // record (or its cached snapshot after post-approval) keeps the panel
  // permanently visible. Proposal/contract statuses alone must not reveal
  // draft metadata.
  if (loading && !metadata) return null;
  if (!loading && !metadata) return null;
  if (!loading && !isSent && !isApproved) return null;

  void notVisible;

  const onApprove = async () => {
    setAttributionError(null);
    // Cover image is mandatory; block finalisation if none is uploaded.
    if (!coverImg) {
      setCoverError("Please upload a cover image before finalising.");
      const coverEl = document.getElementById("cover-image-section");
      coverEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // If a cover image exists, attribution details must be completed first.
    if (!isAttributionComplete) {
      setShowFinalizeConfirm(false);
      setAttributionError("Please complete the Image Permissions & Attribution section before finalising.");
      // Scroll the attribution section into view so the author can see the missing field.
      const attributionEl = document.getElementById("cover-attribution-section");
      attributionEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Show the finalisation confirmation first. If the user already confirmed
    // (dialog still open), skip.
    if (!showFinalizeConfirm) {
      setShowFinalizeConfirm(true);
      return;
    }

    setApproving(true);
    setApproveError(null);
    setApproveSuccess(null);
    try {
      await approveMetadata(ticket);
      setApproveSuccess("Metadata approved. Thank you!");
      toast.success("Metadata submitted successfully");
      setShowFinalizeConfirm(false);
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
    // Attribution is captured AFTER a successful upload (see attribution
    // section below). Send a placeholder so the backend accepts the upload.
    const sourceStatement = "Pending attribution";
    setSourceText(sourceStatement);
    setUploading(true);
    setCoverError(null);
    setCoverSuccess(null);
    setUploadPct(0);
    try {
      const newCover = await uploadCoverImage(ticket, pendingFile, sourceStatement, (pct) =>
        setUploadPct(pct),
      );
      setCoverSuccess("Cover image uploaded. Please add attribution below.");
      // Cache the uploaded file so the follow-up attribution submission can
      // re-send it with the real source string.
      uploadedFileRef.current = pendingFile;
      setPendingFile(null);
      setAttributionType("");
      setAttributionDetail("");
      setAttributionSaved(false);
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
    if (isApproved)
      return { text: "Approved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
    if (isSent)
      return { text: "Awaiting your approval", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
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
            <h2 className="font-serif text-base font-bold text-stone-900">Metadata</h2>
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

        {!error && metadata && (
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

              <div className="space-y-4 font-sans text-sm">
                <div>
                  <h4 className="font-semibold text-stone-900">Upload Your Cover Image</h4>
                  <p className="mt-1 text-stone-700">
                    You can upload an image to be used on the front cover of your book. Your image
                    will be incorporated into our standard cover template as a background image, so
                    please note the following:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
                    <li>
                      Do not include text in your image. Your title, name, and all other cover text
                      will be added by our design team as part of the template.
                    </li>
                    <li>
                      Choose an image that works well as a full background — high-quality
                      photographs or artwork without busy focal points at the edges tend to work
                      best.
                    </li>
                  </ul>
                  <p className="mt-2 text-stone-700">
                    If you choose not to upload an image, your cover will be produced using an
                    abstract or plain design in keeping with our standard template. Please note that
                    once you complete this stage, you will no longer be able to upload a cover
                    image, so make sure you're happy with your choice before proceeding.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                  <div
                    className={`flex h-48 items-center justify-center overflow-hidden rounded-lg bg-white ${
                      coverDisplayUrl
                        ? "border border-stone-200"
                        : "border-2 border-dashed border-stone-300"
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
                          {metadata?.cover_image.width_px || "?"}×
                          {metadata?.cover_image.height_px || "?"} px
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
                            <span className="text-stone-500">Version:</span> v
                            {metadata.cover_image.version}
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
                        Upload a high-resolution cover image (JPEG/PNG/TIFF, minimum 2360×2360 px and
                        at least 300 dpi, max 50 MB).
                      </p>
                    )}

                    {/* Pre-upload guidance intentionally hidden — errors are shown contextually below. */}
                  </div>
                </div>

                {canEditCover && (
                  <div className="space-y-4 border-t border-stone-200 pt-4">
                    {(
                      <div className="space-y-4">
                        {metadata?.cover_image && (
                          <p className="font-sans text-xs text-stone-500">
                            Change cover image — pick a new file to replace the current cover.
                          </p>
                        )}
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
                              Ready: {pendingFile.name} ({(pendingFile.size / 1024 / 1024).toFixed(1)}{" "}
                              MB)
                            </p>
                          )}
                        </div>

                        {coverError && (() => {
                          const err = coverError;
                          // Split into sentences and classify each as a real failure clause or informational noise.
                          // A sentence only counts as a DPI/dim failure when it actually asserts one — not when it
                          // merely mentions the concept (e.g. "DPI is also verified server-side").
                          const sentences = err.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
                          const dimFail = (s: string) =>
                            /(at least|minimum|must be|required to be)[^.]*\d+\s*[x×]\s*\d+/i.test(s) ||
                            /\d+\s*[x×]\s*\d+[^.]*(too small|below|less than|smaller)/i.test(s) ||
                            /\bdimensions?\b[^.]*(too small|below|insufficient|do(es)? not meet|invalid|smaller)/i.test(s) ||
                            /\b(width|height)\b[^.]*(too small|below|less than|insufficient)/i.test(s) ||
                            /(resize|upscale)[^.]*(image|cover)/i.test(s);
                          const dpiFail = (s: string) =>
                            /\b(dpi|dots per inch)\b[^.]*(too low|below|less than|insufficient|do(es)? not meet|required|must be|at least|invalid|only|metadata|information|embedded|read|missing|minimum)/i.test(s) ||
                            /(too low|below|less than|only|insufficient|metadata|information|embedded|read|missing|minimum)[^.]*\b(dpi|dots per inch)\b/i.test(s) ||
                            /\b(low|insufficient)\s+(dpi|resolution)\b/i.test(s) ||
                            (/\b(dpi|dots per inch)\b/i.test(s) && /(could not read|metadata|information|embedded|missing|minimum)/i.test(s));
                          const isDpi = sentences.some(dpiFail);
                          const isDim = sentences.some(dimFail);
                          const displayErr = (() => {
                            if (isDpi && isDim) {
                              return sentences.filter((s) => dpiFail(s) || dimFail(s)).join(" ") || err;
                            }
                            if (isDpi) {
                              return sentences.filter(dpiFail).join(" ") || err;
                            }
                            if (isDim) {
                              return sentences.filter(dimFail).join(" ") || err;
                            }
                            return err;
                          })();
                          if (isDpi && isDim) {
                            return (
                              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
                                <p className="font-semibold text-rose-800">Image DPI and dimensions issue</p>
                                <p className="mt-1 text-rose-700">{displayErr}</p>
                                <p className="mt-2 text-rose-700">Your image couldn't be uploaded because it doesn't meet our DPI and dimension requirements. Adjust it with the free tools below and try again:</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-700">
                                  <li>
                                    <a href="https://clideo.com/dpi-converter" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                                      <ExternalLink className="h-3 w-3" />
                                      Adjust image DPI
                                    </a>
                                  </li>
                                  <li>
                                    <a href="https://www.simpleimageresizer.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                                      <ExternalLink className="h-3 w-3" />
                                      Resize image dimensions
                                    </a>
                                  </li>
                                </ul>
                              </div>
                            );
                          }
                          if (isDpi) {
                            return (
                              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
                                <p className="font-semibold text-rose-800">Image DPI issue</p>
                                <p className="mt-1 text-rose-700">{displayErr}</p>
                                <p className="mt-2 text-rose-700">Your image couldn't be uploaded because its DPI is too low. Adjust it with the free tool below and try again:</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-700">
                                  <li>
                                    <a href="https://clideo.com/dpi-converter" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                                      <ExternalLink className="h-3 w-3" />
                                      Adjust image DPI
                                    </a>
                                  </li>
                                </ul>
                              </div>
                            );
                          }
                          if (isDim) {
                            return (
                              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
                                <p className="font-semibold text-rose-800">Image dimensions issue</p>
                                <p className="mt-1 text-rose-700">{displayErr}</p>
                                <p className="mt-2 text-rose-700">Your image may have enough DPI, but its pixel width or height is too small. Increase the image dimensions with the free tool below and try again:</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-700">
                                  <li>
                                    <a href="https://www.simpleimageresizer.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                                      <ExternalLink className="h-3 w-3" />
                                      Resize image dimensions
                                    </a>
                                  </li>
                                </ul>
                              </div>
                            );
                          }
                          return (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
                              <p className="font-semibold text-rose-800">Upload failed</p>
                              <p className="mt-1 text-rose-700">{err}</p>
                            </div>
                          );
                        })()}

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
                            disabled={uploading || !pendingFile}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {uploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {uploading ? "Uploading…" : metadata?.cover_image ? "Change cover" : "Upload cover"}
                          </button>
                          {!coverError && coverSuccess && (
                            <span className="font-sans text-xs text-emerald-700">{coverSuccess}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Attribution — shown only after a successful upload */}
                    {metadata?.cover_image && (
                      <div id="cover-attribution-section" className="space-y-3">
                        <h4 className="font-semibold text-stone-900">
                          Image Permissions & Attribution{" "}
                          <span className="text-rose-600" aria-hidden="true">*</span>
                          <span className="sr-only">(required)</span>
                        </h4>
                        <p className="text-stone-700">
                          Your cover was uploaded. Please tell us how it's attributed — select the
                          option that applies and fill in the required details.
                        </p>
                        {attributionError && (
                          <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                            {attributionError}
                          </p>
                        )}
                        <div className="space-y-3">
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
                            <input
                              type="radio"
                              name="cover-attribution"
                              className="mt-0.5 h-4 w-4 text-emerald-700"
                              checked={attributionType === "own"}
                              onChange={() => setAttributionType("own")}
                            />
                            <div className="space-y-1">
                              <span className="block font-medium text-stone-900">
                                I own the copyright to this image
                              </span>
                              <span className="block text-xs text-stone-600">
                                Simply provide your name and the year the image was taken or
                                created. Example: © Jane Smith, 2024
                              </span>
                              {attributionType === "own" && (
                                <input
                                  type="text"
                                  value={attributionDetail}
                                  onChange={(e) => setAttributionDetail(e.target.value)}
                                  maxLength={500}
                                  required
                                  placeholder="© Your name, year *"
                                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                                />
                              )}
                            </div>
                          </label>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
                            <input
                              type="radio"
                              name="cover-attribution"
                              className="mt-0.5 h-4 w-4 text-emerald-700"
                              checked={attributionType === "public"}
                              onChange={() => setAttributionType("public")}
                            />
                            <div className="space-y-1">
                              <span className="block font-medium text-stone-900">
                                The image is from a public domain source
                              </span>
                              <span className="block text-xs text-stone-600">
                                Provide the name of the public domain source, the image title, and
                                the year. Example: Unsplash — "Mountain Lake at Dawn", 2022
                              </span>
                              {attributionType === "public" && (
                                <input
                                  type="text"
                                  value={attributionDetail}
                                  onChange={(e) => setAttributionDetail(e.target.value)}
                                  maxLength={500}
                                  required
                                  placeholder="Source — title, year *"
                                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                                />
                              )}
                            </div>
                          </label>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
                            <input
                              type="radio"
                              name="cover-attribution"
                              className="mt-0.5 h-4 w-4 text-emerald-700"
                              checked={attributionType === "permission"}
                              onChange={() => setAttributionType("permission")}
                            />
                            <div className="space-y-1">
                              <span className="block font-medium text-stone-900">
                                I have permission from the copyright holder
                              </span>
                              <span className="block text-xs text-stone-600">
                                We'll need a signed permission form from the copyright holder before
                                we can use the image.
                              </span>
                              {attributionType === "permission" && (
                                <>
                                  <input
                                    type="text"
                                    value={attributionDetail}
                                    onChange={(e) => setAttributionDetail(e.target.value)}
                                    maxLength={500}
                                    required
                                    placeholder="Copyright holder name and permission details *"
                                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                                  />
                                  <a
                                    href="https://www.cambridgescholars.com/cover-design"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Download the permissions form
                                  </a>
                                </>
                              )}
                            </div>
                          </label>
                        </div>
                        {attributionSaving && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 font-sans text-xs text-stone-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Saving attribution…
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {isSent && !isApproved && (
              <>
                {showNoCoverConfirm ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                    <p className="font-sans text-sm font-semibold text-amber-900">
                      Are you sure you want to proceed without a cover image?
                    </p>
                    <p className="mt-1 font-sans text-xs text-amber-800/80">
                      Your cover will be created using an abstract or plain design, and you won't be
                      able to upload an image after this point.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNoCoverConfirm(false);
                          setShowFinalizeConfirm(false);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
                      >
                        Go back and upload an image
                      </button>
                      <button
                        type="button"
                        onClick={onApprove}
                        disabled={approving || hasOpenQuery}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {approving ? "Submitting…" : "Proceed without an image"}
                      </button>
                    </div>
                    {hasOpenQuery && (
                      <p className="mt-2 w-full font-sans text-xs text-amber-800">
                        Submit is disabled until the publisher responds to your open query.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
                    {canApprove && (
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-semibold text-emerald-900">
                          {flashApprove
                            ? "The publisher has responded — please review the table above."
                            : "Happy with the metadata?"}
                        </p>
                        <p className="font-sans text-xs text-emerald-800/80">
                          {flashApprove
                            ? "If you're happy with the updated details, press Submit metadata to finalise your record."
                            : "Approve to finalise your record, or raise a query if anything needs changing."}
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
                        ref={approveBtnRef}
                        onClick={onApprove}
                        disabled={approving || hasOpenQuery || (!!coverImg && !isAttributionComplete)}
                        title={
                          hasOpenQuery
                            ? "Resolve the open metadata query before submitting."
                            : !!coverImg && !isAttributionComplete
                              ? "Complete the Image Permissions & Attribution section before submitting."
                              : undefined
                        }
                        className={`inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 ${
                          flashApprove ? "ring-4 ring-amber-300 animate-pulse" : ""
                        }`}
                      >
                        {approving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
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
              </>
            )}

            <AlertDialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
              <AlertDialogContent className="bg-white text-stone-900">
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalise metadata?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-stone-600">
                      <p>
                        The details shown will be used exactly as they appear below. If any information is incorrect or requires updating, please make your amendments directly in the relevant fields before clicking <strong>Finalise metadata</strong>. Do not add notes or comments within the fields themselves.
                      </p>
                      {coverImg ? (
                        <p>
                          As you have provided a cover image, we will prepare your cover using this content. Images must be cleared of all copyrights and permissions and you must provide full information on source and ownership.
                        </p>
                      ) : (
                        <p>
                          As you have not provided a cover image, we will prepare a cover in line with our house style. The cover will be a neutral/abstract design, with the title and author/editor name clearly displayed. Once complete, it will not be able to be amended.
                        </p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => setShowFinalizeConfirm(false)}
                    disabled={approving}
                    className="bg-white text-stone-900 hover:bg-stone-50 hover:text-stone-900 border-stone-300"
                  >
                    Go back
                  </AlertDialogCancel>
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={approving || hasOpenQuery || (!!coverImg && !isAttributionComplete)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {approving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {approving ? "Finalising…" : "Finalise metadata"}
                  </button>
                </AlertDialogFooter>
                {hasOpenQuery && (
                  <p className="mt-2 font-sans text-xs text-amber-800">
                    Finalise is disabled until the publisher responds to your open query.
                  </p>
                )}
              </AlertDialogContent>
            </AlertDialog>

            {/* Queries — always mounted while metadata is loaded so the
                author can see the publisher's responses to any raised
                queries even after the metadata status transitions away
                from `sent_to_author`. Hidden visually until the author
                opens the panel or there's an active thread. */}
            <div
              className={showQueries || hasOpenQuery || !(isSent && !isApproved) ? "" : "hidden"}
            >
              <MetadataQueries
                ticket={ticket}
                viewer="author"
                canRaise={isSent && !isApproved}
                raisableFields={raisableFields}
                onOpenQueryChange={setHasOpenQuery}
                onNewActivity={() => {
                  setShowQueries(true);
                  setFlashApprove(true);
                  window.setTimeout(() => setFlashApprove(false), 6000);
                }}
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
