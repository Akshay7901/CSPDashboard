import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileText,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  SquarePen,
  Trash2,
  X as XIcon,
  BookOpen,
  Tag,
  Globe,
  Hash,
  Mail,
  Building2,
  CalendarCheck,
  User as UserIcon,
  Lock,
} from "lucide-react";
import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, getPortalToken, isAdmin } from "@/lib/auth";
import { deleteCoverImage as apiDeleteCoverImage } from "@/lib/metadataApi";
import { formatDate, initialsFromName, displayNameFromEmail, getStatusMeta } from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";
import {
  listInternalNotes,
  createInternalNote,
  updateInternalNote,
  deleteInternalNote,
  type InternalNote,
} from "@/lib/notesApi";
import { listProposalEvents, type ProposalEvent } from "@/lib/eventsApi";
import { toast } from "sonner";
import {
  getContract,
  voidContract,
  getQueries,
  respondQuery,
  type ContractDetail,
  type ContractQueryEntry,
} from "@/lib/contractsApi";
import { ContractPdfModal } from "@/components/contract-pdf-modal";
import { ContractQueries } from "@/components/contract-queries";
import { MetadataQueries } from "@/components/metadata-queries";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function MetaRow({
  label,
  value,
  onChange,
  multiline,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-1 border-t border-stone-200 first:border-t-0 sm:grid-cols-[220px_1fr]">
      <div className="flex items-start bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
        {label}
      </div>
      <div className="border-t border-stone-200 px-4 py-3 sm:border-l sm:border-t-0">
        {multiline ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            disabled={disabled}
            readOnly={disabled}
            className={`w-full border-stone-200 bg-white font-sans text-sm text-stone-800 ${disabled ? "bg-stone-50 text-stone-500" : ""}`}
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            readOnly={disabled}
            className={`h-10 w-full border-stone-200 bg-white font-sans text-sm text-stone-800 ${disabled ? "bg-stone-50 text-stone-500" : ""}`}
          />
        )}
        {hint && (
          <p className="mt-2 font-sans text-xs text-emerald-700">
            <span className="font-semibold uppercase tracking-wide">Proposed:</span>{" "}
            <span className="text-stone-700">{hint}</span>
          </p>
        )}
      </div>
    </div>
  );
}


type Assignment = {
  reviewer_email: string;
  reviewer_name?: string;
  reviewer_institution?: string;
  reviewer_topics?: string[];
  assigned_at: string;
  peer_reviewer_status?: string;
  display_status?: string;
};

type PeerReviewer = {
  id: number;
  name: string;
  email: string;
  assigned_proposals_count?: number;
};

type TimelineStage = {
  stage_name: string;
  display_name: string;
  completed_at?: string | null;
  started_at?: string | null;
  is_current?: boolean;
  is_completed?: boolean;
};

type ProposalDetail = {
  ticket_number: string;
  status: string;
  internal_status?: string;
  submitted_at: string;
  updated_at?: string;
  current_data: Record<string, unknown>;
  assignments?: Assignment[];
  timeline?: TimelineStage[];
};

type SubmittedReview = {
  reviewer_email?: string;
  reviewer_name?: string;
  reviewer_role?: string;
  is_submitted?: boolean;
  submitted_at?: string;
  review_data?: Record<string, unknown>;
};

type InfoRequestItem = {
  key?: string;
  label?: string;
  response_text?: string;
};

type InfoRequestFile = {
  url?: string;
  filename?: string;
  size_bytes?: number;
  field_key?: string;
};

type ProposalDocument = {
  url?: string;
  filename: string;
  size_bytes?: number;
  label?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringFrom(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberFrom(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function filenameFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return decodeURIComponent(url.split("/").filter(Boolean).pop() || "");
  }
}

function toProposalDocument(value: unknown, fallbackLabel?: string): ProposalDocument | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
    const url = value.trim();
    return { url, filename: filenameFromUrl(url) || fallbackLabel || "Document", label: fallbackLabel };
  }
  if (!isRecord(value)) return null;
  const url = stringFrom(value, ["url", "file_url", "download_url", "s3_url", "public_url"]);
  const filename =
    stringFrom(value, ["filename", "file_name", "name", "original_filename", "title"]) ||
    filenameFromUrl(url) ||
    fallbackLabel;
  if (!filename) return null;
  return {
    url,
    filename,
    size_bytes: numberFrom(value, ["size_bytes", "file_size_bytes", "file_size", "size"]),
    label: stringFrom(value, ["label", "type", "field_key", "category"]) || fallbackLabel,
  };
}

function extractProposalDocuments(currentData: Record<string, unknown>) {
  const documents: ProposalDocument[] = [];
  const cv = currentData.author_cv;
  if (isRecord(cv)) {
    const doc = toProposalDocument(cv, "Author CV");
    if (doc) documents.push({ ...doc, label: "Author CV" });
  } else if (typeof cv === "string" && cv) {
    documents.push({ url: cv, filename: filenameFromUrl(cv) || "Author CV", label: "Author CV" });
  } else {
    const cvUrl = currentData.author_cv_url;
    if (typeof cvUrl === "string" && cvUrl) {
      documents.push({
        url: cvUrl,
        filename: filenameFromUrl(cvUrl) || "Author CV",
        label: "Author CV",
      });
    }
  }

  const mf = currentData.manuscript_files;
  if (isRecord(mf)) {
    const sample = mf.sampleChapter ?? mf.sample_chapter;
    if (isRecord(sample)) {
      const doc = toProposalDocument(sample, "Sample Chapter");
      if (doc) documents.push({ ...doc, label: "Sample Chapter" });
    }
    const additional = mf.additionalFiles ?? mf.additional_files;
    if (Array.isArray(additional)) {
      additional.forEach((item) => {
        if (isRecord(item)) {
          const doc = toProposalDocument(item, "Additional File");
          if (doc) documents.push({ ...doc, label: "Additional File" });
        }
      });
    }
  }

  const seen = new Set<string>();
  return documents.filter((doc) => {
    const key = `${doc.url || ""}|${doc.filename}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type InfoRequest = {
  id: string | number;
  status?: string;
  note?: string;
  message?: string;
  resubmission_deadline?: string;
  deadline?: string;
  created_at?: string;
  requested_at?: string;
  items?: InfoRequestItem[];
  response?: {
    note?: string;
    items?: InfoRequestItem[];
    files?: InfoRequestFile[];
    submitted_at?: string;
    is_draft?: boolean;
  } | null;
  draft?: {
    note?: string;
    items?: InfoRequestItem[];
    files?: InfoRequestFile[];
  } | null;
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  proceed: "Proceed without changes",
  minor: "Minor revisions needed",
  major: "Major revisions needed",
  reject: "Reject",
};

const REVIEW_SECTIONS: { key: string; label: string }[] = [
  { key: "scope", label: "Scope" },
  { key: "purpose_value", label: "Purpose & Value" },
  { key: "title", label: "Title" },
  { key: "originality", label: "Originality" },
  { key: "credibility", label: "Credibility" },
  { key: "structure", label: "Structure" },
  { key: "clarity_quality", label: "Clarity & Quality" },
  { key: "other_comments", label: "Other Comments" },
  { key: "red_flags", label: "Red Flags" },
];

const SEVERITY_OPTIONS = [
  "General",
  "Minor Concern",
  "Major Concern",
  "Suggestion",
  "Question",
] as const;
type Severity = (typeof SEVERITY_OPTIONS)[number];

const SEVERITY_TOKENS: Record<Severity, string> = {
  General: "bg-stone-50 text-stone-700 ring-stone-200",
  "Minor Concern": "bg-amber-50 text-amber-800 ring-amber-200",
  "Major Concern": "bg-rose-50 text-rose-800 ring-rose-200",
  Suggestion: "bg-sky-50 text-sky-800 ring-sky-200",
  Question: "bg-violet-50 text-violet-800 ring-violet-200",
};

const SECTION_SEVERITY: Record<string, Severity> = {
  scope: "General",
  purpose_value: "General",
  title: "Suggestion",
  originality: "General",
  credibility: "Minor Concern",
  structure: "Suggestion",
  clarity_quality: "Minor Concern",
  other_comments: "General",
  red_flags: "Major Concern",
};

function ReviewSectionList({ data }: { data: Record<string, unknown> }) {
  const items = REVIEW_SECTIONS.map(({ key, label }) => {
    const v = data[key];
    const text = typeof v === "string" ? v.trim() : "";
    return { key, label, text };
  }).filter((i) => i.text);
  const noteRaw = data.dr_note;
  const note = typeof noteRaw === "string" ? noteRaw.trim() : "";
  if (items.length === 0 && !note) {
    return (
      <p className="font-sans text-sm text-stone-500">No comments provided.</p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.key}>
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            {i.label}
          </p>
          <p className="mt-1 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-800">
            {i.text}
          </p>
        </div>
      ))}
      {note && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-white/70 p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            Note to Author
          </p>
          <p className="mt-1 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-800">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

function ContractField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-sans text-xs font-medium text-stone-500">{label}</dt>
      <dd className="mt-1 font-sans text-sm font-semibold text-stone-900 break-words">
        {children}
      </dd>
    </div>
  );
}

function ReviewFeedbackAccordion({
  title,
  review,
}: {
  title: string;
  review: SubmittedReview;
}) {
  const rd = (review.review_data || {}) as Record<string, unknown>;
  const recoKey = typeof rd.recommendation === "string" ? rd.recommendation : "";
  const recoLabel = RECOMMENDATION_LABELS[recoKey] || recoKey || "—";
  const reviewerName =
    review.reviewer_name ||
    (review.reviewer_email ? displayNameFromEmail(review.reviewer_email) : "");
  return (
    <details className="group rounded-2xl border border-stone-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <h3 className="font-serif text-base font-bold text-stone-900">{title}</h3>
          <p className="mt-0.5 font-sans text-sm text-stone-500">
            {reviewerName}
            {recoLabel && recoLabel !== "—" && (
              <>
                {" "}
                <span className="text-stone-400">•</span>{" "}
                <span className="text-stone-700">{recoLabel}</span>
              </>
            )}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-stone-100 px-6 py-5">
        <ReviewSectionList data={rd} />
        <div className="mt-5 rounded-xl bg-stone-50 px-4 py-3">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Final Recommendation
          </p>
          <p className="mt-1 font-sans text-sm font-semibold text-stone-900">
            {recoLabel}
          </p>
        </div>
      </div>
    </details>
  );
}

type ReviewComment = {
  id: string;
  severity: Severity;
  chapter: string;
  page: string;
  body: string;
};

export const Route = createFileRoute("/dashboard/proposal/$ticket")({
  head: () => ({ meta: [{ title: "Proposal Details — Editor Portal" }] }),
  component: ProposalDetailPage,
});

function ProposalDetailPage() {
  const { ticket } = Route.useParams();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [data, setData] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleLockProposal = async () => {
    if (!confirm(`Lock proposal ${ticket} and generate production files? This cannot be undone.`)) return;
    setLocking(true);
    try {
      const token = getPortalToken();
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        toast.error((body.error as string) || (body.message as string) || `Failed to lock (${res.status}).`);
        return;
      }
      toast.success((body.message as string) || `Proposal ${ticket} locked.`);
      const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const refreshedBody = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLocking(false);
    }
  };
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const [reviewers, setReviewers] = useState<PeerReviewer[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewersError, setReviewersError] = useState<string | null>(null);
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | null>(null);
  const [reviewDueDate, setReviewDueDate] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [reviews, setReviews] = useState<SubmittedReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractDetail[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [contractsReloadKey, setContractsReloadKey] = useState(0);
  const [optimisticProposed, setOptimisticProposed] = useState<{
    title?: string;
    subtitle?: string;
  } | null>(null);
  const [contractCardOpen, setContractCardOpen] = useState(true);
  const [contractQueriesOpen, setContractQueriesOpen] = useState(true);
  const authorQuestionRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledQuestionRef = useRef<string | null>(null);
  const [queryThread, setQueryThread] = useState<ContractQueryEntry[]>([]);
  const [queryProposalStatus, setQueryProposalStatus] = useState<string>("");
  const [queryResponseText, setQueryResponseText] = useState("");
  const [queryResponseSubmitting, setQueryResponseSubmitting] = useState(false);
  const [queryResponseError, setQueryResponseError] = useState<string | null>(null);
  const [queryResponseSuccess, setQueryResponseSuccess] = useState<string | null>(null);
  const [contractResendPrompt, setContractResendPrompt] = useState<
    "prompt" | "send" | "skip" | null
  >(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentsSeeded, setCommentsSeeded] = useState(false);
  
  // Default to expanded so the original proposal details and supporting
  // documents are visible in every state (review-returned, contract-issued,
  // etc.), matching the author-facing view.
  const [originalOpen, setOriginalOpen] = useState(true);

  useEffect(() => {
    setComments([]);
    setCommentsSeeded(false);
  }, [ticket]);

  // Metadata (shown after the contract is signed)
  type MetadataAuthor = {
    title?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    email_2?: string;
    institution?: string;
    country?: string;
  };
  type ProposalMetadata = {
    ticket_number?: string;
    current_version?: number;
    metadata_status?: string;
    metadata?: {
      full_title?: string;
      title?: string;
      subtitle?: string;
      category?: string;
      display_names?: string;
      display_bios?: string;
      authors?: MetadataAuthor[];
      book_description?: string;
      keywords?: string;
      website_classification?: string;
      bic?: string;
    };
    created_at?: string;
    updated_at?: string;
    approved_at?: string;
    cover_image?: {
      s3_url?: string;
      url?: string;
      filename?: string;
      width_px?: number;
      height_px?: number;
      dpi?: number;
      file_size_bytes?: number;
      version?: number;
      source?: string;
      uploaded_at?: string;
    } | null;
  };
  const [metadata, setMetadata] = useState<ProposalMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataHasOpenQuery, setMetadataHasOpenQuery] = useState(false);
  const metadataScrolledRef = useRef(false);
  useEffect(() => {
    if (metadataHasOpenQuery && !metadataScrolledRef.current) {
      metadataScrolledRef.current = true;
      setTimeout(() => {
        const el = document.getElementById("dr-metadata-queries-section");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
    if (!metadataHasOpenQuery) metadataScrolledRef.current = false;
  }, [metadataHasOpenQuery]);
  type MetaForm = {
    full_title: string;
    title: string;
    subtitle: string;
    category: string;
    display_names: string;
    display_bios: string;
    book_description: string;
    keywords: string;
    website_classification: string;
    bic: string;
    authors: MetadataAuthor[];
  };
  const emptyMetaForm: MetaForm = {
    full_title: "",
    title: "",
    subtitle: "",
    category: "",
    display_names: "",
    display_bios: "",
    book_description: "",
    keywords: "",
    website_classification: "",
    bic: "",
    authors: [],
  };
  const [metaForm, setMetaForm] = useState<MetaForm>(emptyMetaForm);
  const metaFormRef = useRef<MetaForm>(emptyMetaForm);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaveError, setMetaSaveError] = useState<string | null>(null);
  const [metaSaveSuccess, setMetaSaveSuccess] = useState<string | null>(null);
  const [metaSendLoading, setMetaSendLoading] = useState(false);
  const [metaSendError, setMetaSendError] = useState<string | null>(null);
  const [metaSendSuccess, setMetaSendSuccess] = useState<string | null>(null);

  // Request Revisions (request-info) modal state
  const REVISION_AREAS: { key: string; label: string }[] = [
    { key: "abstract_blurb", label: "Abstract / Blurb" },
    { key: "table_of_contents", label: "Table of Contents" },
    { key: "supporting_materials", label: "Supporting Materials" },
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
    { key: "supporting_documents", label: "Supporting Documents" },
    { key: "other", label: "Other" },
  ];
  const [reqRevOpen, setReqRevOpen] = useState(false);
  type RevisionEntry = { id: string; key: string; note: string };
  const newRevisionEntry = (): RevisionEntry => ({
    id: `rev_${Math.random().toString(36).slice(2, 9)}`,
    key: "",
    note: "",
  });
  const [reqRevEntries, setReqRevEntries] = useState<RevisionEntry[]>([
    newRevisionEntry(),
  ]);
  const [reqRevDeadline, setReqRevDeadline] = useState("");
  const [reqRevSubmitting, setReqRevSubmitting] = useState(false);
  const [reqRevError, setReqRevError] = useState<string | null>(null);
  const [reqRevSuccess, setReqRevSuccess] = useState<string | null>(null);
  const [reqRevMode, setReqRevMode] = useState<"revisions" | "major">("revisions");
  const [declineLoading, setDeclineLoading] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [reviewRecommendation, setReviewRecommendation] = useState<string>("proceed");
  const [submitReviewLoading, setSubmitReviewLoading] = useState(false);
  const [submitReviewError, setSubmitReviewError] = useState<string | null>(null);
  const [submitReviewSuccess, setSubmitReviewSuccess] = useState<string | null>(null);

  // Issue Contract modal state
  const [contractOpen, setContractOpen] = useState(false);
  const [contractType, setContractType] = useState<"author" | "editor">("author");
  const [contractAmendments, setContractAmendments] = useState("");
  const [contractNote, setContractNote] = useState("");
  const [contractExpiryDays, setContractExpiryDays] = useState(14);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractSuccess, setContractSuccess] = useState<string | null>(null);
  const [contractStep, setContractStep] = useState<1 | 2>(1);
  const [contractFields, setContractFields] = useState({
    title: "",
    subtitle: "",
    language: "in all languages",
    author_copies: "two copies",
    if_two_author_copies: "two copies",
    if_three_or_four_author_copies: "one copy",
    copies_sold_revenue: "10",
    secondary_rights_revenue: "20",
    publishing_agreement:
      "This publishing agreement will run in perpetuity, unless agreed otherwise by both the Publisher and the Author/Editor.",
  });

  const openIssueContract = () => {
    setContractType("author");
    setContractAmendments("");
    setContractNote("");
    setContractExpiryDays(14);
    setContractError(null);
    setContractSuccess(null);
    // Only show the "Note to Author" step on the first contract issuance.
    // For resends (e.g. after the author raised a query), skip straight to
    // the contract summary.
    setContractStep(contracts.length > 0 ? 2 : 1);
    setContractFields((f) => ({
      ...f,
      title: cd.main_title || title || "",
      subtitle: cd.sub_title || "",
    }));
    setContractOpen(true);
  };

  const submitIssueContract = async () => {
    if (contractStep === 1) {
      setContractError(null);
      setContractStep(2);
      return;
    }
    setContractLoading(true);
    setContractError(null);
    setContractSuccess(null);
    try {
      const token = getPortalToken();
      // Step A: Submit the DR's (possibly edited) review comments so the
      // author can see them via GET /review. Required before the contract is
      // sent, otherwise the author endpoint returns 404 "Review not found".
      try {
        const sectionByLabel: Record<string, string> = {};
        REVIEW_SECTIONS.forEach(({ label }) => (sectionByLabel[label] = ""));
        const otherBuckets: string[] = [];
        comments.forEach((c) => {
          const b = (c.body || "").trim();
          if (!b) return;
          const label = (c.chapter || "").trim();
          if (label && Object.prototype.hasOwnProperty.call(sectionByLabel, label)) {
            sectionByLabel[label] = sectionByLabel[label]
              ? `${sectionByLabel[label]}\n\n${b}`
              : b;
          } else {
            otherBuckets.push(label ? `${label}: ${b}` : b);
          }
        });
        const reviewPayload: Record<string, unknown> = {
          recommendation: reviewRecommendation || "proceed",
        };
        if (contractNote.trim()) {
          reviewPayload.dr_note = contractNote.trim();
        }
        REVIEW_SECTIONS.forEach(({ key, label }) => {
          const v = sectionByLabel[label];
          if (key === "other_comments") {
            const merged = [v, ...otherBuckets].filter(Boolean).join("\n\n");
            if (merged) reviewPayload[key] = merged;
          } else if (v) {
            reviewPayload[key] = v;
          }
        });
        // Only push a review if there's actually content beyond the recommendation
        if (Object.keys(reviewPayload).length > 1) {
          await proposalApiFetch(
            `/${encodeURIComponent(ticket)}/review/submit`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(reviewPayload),
            },
          );
        }
      } catch {
        // Non-blocking: if review/submit fails we still try to send the
        // contract. The author panel will fall back to its empty state.
      }

      const originalTitle = (cd.main_title || title || "").trim();
      const originalSubtitle = (cd.sub_title || "").trim();
      const enteredTitle = (contractFields.title || "").trim();
      const enteredSubtitle = (contractFields.subtitle || "").trim();
      const titleChanged = enteredTitle.length > 0 && enteredTitle !== originalTitle;
      const subtitleChanged = enteredSubtitle !== originalSubtitle;
      const payload: Record<string, unknown> = {
        contract_type: contractType,
        // Backend requires a title. Always send one; use the original when
        // the DR didn't change it so the frontend can tell "unchanged" apart
        // from "proposed edit" by comparing to main_title on read.
        title: (titleChanged ? enteredTitle : originalTitle),
        expiry_days: contractExpiryDays,
        language: contractFields.language,
        author_copies: contractFields.author_copies,
        if_two_author_copies: contractFields.if_two_author_copies,
        if_three_or_four_author_copies: contractFields.if_three_or_four_author_copies,
        copies_sold_revenue: Number(contractFields.copies_sold_revenue) || 0,
        secondary_rights_revenue: Number(contractFields.secondary_rights_revenue) || 0,
        publishing_agreement: contractFields.publishing_agreement,
      };
      // Only include subtitle when actually edited, so the backend doesn't
      // record an unchanged value as a "proposed" subtitle.
      if (subtitleChanged && enteredSubtitle) {
        payload.subtitle = enteredSubtitle;
      }
      if (contractAmendments.trim()) payload.addendum = contractAmendments.trim();
      if (contractNote.trim()) {
        payload.notes = contractNote.trim();
      }
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/contract/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setContractError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to issue contract (${res.status}).`,
        );
        return;
      }
      setContractSuccess(
        (body.message as string) || "Contract sent to author.",
      );
      // Optimistically remember what we just sent so the hero card shows the
      // proposed title/subtitle immediately, without waiting for the contracts
      // list to refetch.
      setOptimisticProposed({
        title: titleChanged ? enteredTitle : undefined,
        subtitle: subtitleChanged && enteredSubtitle ? enteredSubtitle : undefined,
      });
      // Force the contracts list to refetch so the header/hero pick up the
      // new title/subtitle/addendum the DR just submitted.
      setContractsReloadKey((k) => k + 1);
      try {
        const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const refreshedBody = (await refreshed.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
      } catch {
        // ignore refresh errors
      }
      setTimeout(() => setContractOpen(false), 1200);
    } catch {
      setContractError("Network error. Please try again.");
    } finally {
      setContractLoading(false);
    }
  };

  const openRequestRevisions = () => {
    setReqRevMode("revisions");
    setReqRevEntries([newRevisionEntry()]);
    setReqRevDeadline("");
    setReqRevError(null);
    setReqRevSuccess(null);
    setReqRevOpen(true);
  };

  const openRequestMajorRevision = () => {
    setReqRevMode("major");
    setReqRevEntries([newRevisionEntry()]);
    setReqRevDeadline("");
    setReqRevError(null);
    setReqRevSuccess(null);
    setReqRevOpen(true);
  };

  const updateRevisionEntry = (id: string, patch: Partial<RevisionEntry>) =>
    setReqRevEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addRevisionEntry = () =>
    setReqRevEntries((prev) => [...prev, newRevisionEntry()]);
  const removeRevisionEntry = (id: string) =>
    setReqRevEntries((prev) =>
      prev.length <= 1 ? prev : prev.filter((e) => e.id !== id),
    );

  const submitRequestRevisions = async () => {
    const valid = reqRevEntries.filter((e) => e.key && e.note.trim());
    if (valid.length === 0) {
      setReqRevError("Please add at least one revision area with feedback.");
      return;
    }
    if (valid.length !== reqRevEntries.length) {
      setReqRevError("Please complete each revision entry or remove it.");
      return;
    }
    setReqRevSubmitting(true);
    setReqRevError(null);
    setReqRevSuccess(null);
    try {
      const token = getPortalToken();
      const items = valid.map((e) => {
        const area = REVISION_AREAS.find((a) => a.key === e.key);
        return {
          key: e.key,
          label: area?.label || e.key,
          note: e.note.trim(),
        };
      });
      const combinedNote = items
        .map((i) => `${i.label}: ${i.note}`)
        .join("\n\n");
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/request-info`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            items,
            note: combinedNote,
            ...(reqRevDeadline ? { resubmission_deadline: reqRevDeadline } : {}),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setReqRevError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to send request (${res.status}).`,
        );
        return;
      }
      setReqRevSuccess((body.message as string) || "Revision request sent to author.");
      // refresh proposal
      try {
        const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const refreshedBody = (await refreshed.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
      } catch {
        // ignore
      }
      setTimeout(() => setReqRevOpen(false), 1200);
    } catch {
      setReqRevError("Network error. Please try again.");
    } finally {
      setReqRevSubmitting(false);
    }
  };

  const handleDecline = () => {
    setDeclineError(null);
    setDeclineConfirmOpen(true);
  };

  const executeDecline = async () => {
    setDeclineLoading(true);
    setDeclineError(null);
    try {
      const token = getPortalToken();
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/decline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setDeclineError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to decline proposal (${res.status}).`,
        );
        return;
      }
      setDeclineConfirmOpen(false);
      // Refresh proposal data
      try {
        const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const refreshedBody = (await refreshed.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
      } catch {
        // ignore refresh errors
      }
    } catch {
      setDeclineError("Network error. Please try again.");
    } finally {
      setDeclineLoading(false);
    }
  };

  const submitReviewToAuthor = async () => {
    setSubmitReviewLoading(true);
    setSubmitReviewError(null);
    setSubmitReviewSuccess(null);
    try {
      const token = getPortalToken();
      // Map comments back to section fields by chapter label
      const sectionByLabel: Record<string, string> = {};
      REVIEW_SECTIONS.forEach(({ label }) => (sectionByLabel[label] = ""));
      const otherBuckets: string[] = [];
      comments.forEach((c) => {
        const body = (c.body || "").trim();
        if (!body) return;
        const label = (c.chapter || "").trim();
        if (label && Object.prototype.hasOwnProperty.call(sectionByLabel, label)) {
          sectionByLabel[label] = sectionByLabel[label]
            ? `${sectionByLabel[label]}\n\n${body}`
            : body;
        } else {
          otherBuckets.push(label ? `${label}: ${body}` : body);
        }
      });
      const payload: Record<string, unknown> = { recommendation: reviewRecommendation };
      if (contractNote.trim()) {
        payload.dr_note = contractNote.trim();
      }
      REVIEW_SECTIONS.forEach(({ key, label }) => {
        const v = sectionByLabel[label];
        if (key === "other_comments") {
          const merged = [v, ...otherBuckets].filter(Boolean).join("\n\n");
          if (merged) payload[key] = merged;
        } else if (v) {
          payload[key] = v;
        }
      });
      
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/review/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setSubmitReviewError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to submit review (${res.status}).`,
        );
        return;
      }
      setSubmitReviewSuccess(
        (body.message as string) || "Review submitted to author.",
      );
      // refresh proposal
      try {
        const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const refreshedBody = (await refreshed.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
      } catch {
        // ignore
      }
    } catch {
      setSubmitReviewError("Network error. Please try again.");
    } finally {
      setSubmitReviewLoading(false);
    }
  };

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(session.email);
      setUserName(session.name || "");
    } catch {
      navigate({ to: "/login" });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getPortalToken();
        const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          setError((body.error as string) || `Failed to load proposal (${res.status}).`);
          return;
        }
        setData(body as unknown as ProposalDetail);
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [ticket]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReviewsLoading(true);
      setReviewsError(null);
      try {
        const token = getPortalToken();
        const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/review`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          setReviewsError((body.error as string) || null);
          return;
        }
        const list = Array.isArray(body.reviews)
          ? (body.reviews as SubmittedReview[])
          : body.review
            ? [body.review as SubmittedReview]
            : [];
        setReviews(list);
      } catch {
        if (!cancelled) setReviewsError(null);
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket]);

  const displayName = userName || displayNameFromEmail(userEmail);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (showLoading: boolean) => {
      if (showLoading) setContractsLoading(true);
      try {
        const list = await getContract(ticket);
        if (cancelled) return;
        setContracts(list);
        // If the latest contract is still pending signature, poll so the
        // dashboard updates automatically once DocuSign reports signed/declined.
        const latest = list[0];
        const st = (latest?.status || "").toLowerCase();
        const pending = st === "sent" || st === "draft";
        if (pending) {
          timer = setTimeout(() => load(false), 5000);
        }
      } catch {
        if (!cancelled) setContracts([]);
      } finally {
        if (!cancelled && showLoading) setContractsLoading(false);
      }
    };
    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ticket, data?.status, data?.updated_at, contractsReloadKey]);

  // Load contract queries (author <-> DR thread) and proposal status flag
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await getQueries(ticket);
        if (cancelled) return;
        setQueryThread(body.queries || []);
        setQueryProposalStatus(body.proposal_status || "");
      } catch {
        if (!cancelled) {
          setQueryThread([]);
          setQueryProposalStatus("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket, data?.status, data?.updated_at, contractsReloadKey]);

  const submitVoid = async () => {
    if (!voidReason.trim()) {
      setVoidError("Please provide a reason.");
      return;
    }
    setVoidLoading(true);
    setVoidError(null);
    try {
      await voidContract(ticket, voidReason.trim());
      setVoidOpen(false);
      setVoidReason("");
      setContractsReloadKey((k) => k + 1);
      // refresh proposal status too
      try {
        const token = getPortalToken();
        const r = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (r.ok) setData((await r.json()) as ProposalDetail);
      } catch {
        // ignore
      }
    } catch (e) {
      setVoidError((e as Error).message);
    } finally {
      setVoidLoading(false);
    }
  };

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const rawCd = normalizeProposalData(
    (data?.current_data ?? {}) as Record<string, unknown>,
  );
  const asStr = (v: unknown): string | undefined => {
    if (v === null || v === undefined || v === "") return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
      const parts = v
        .map((item) => {
          if (item == null) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") {
            const o = item as Record<string, unknown>;
            const name = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
            return name || (typeof o.name === "string" ? o.name : JSON.stringify(o));
          }
          return String(item);
        })
        .filter(Boolean);
      return parts.length ? parts.join("\n") : undefined;
    }
    return undefined;
  };
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const s = asStr(rawCd[k]);
      if (s !== undefined) return s;
    }
    return undefined;
  };
  const cd: Record<string, string | undefined> = {
    main_title: pick("main_title", "title"),
    sub_title: pick("sub_title", "subtitle"),
    proposed_title: pick("proposed_title", "proposed_book_title", "proposed"),
    proposed_subtitle: pick("proposed_subtitle", "proposed_sub_title", "proposed_book_subtitle"),
    book_type: pick("book_type"),
    corresponding_author_name:
      pick("corresponding_author_name") ||
      [pick("author_first_name"), pick("author_last_name")].filter(Boolean).join(" ") ||
      undefined,
    email: pick("email"),
    secondary_email: pick("secondary_email", "email_2"),
    phone: pick("phone", "phone_number"),
    institution: pick("institution"),
    job_title: pick("job_title", "author_title"),
    qualifications: pick("qualifications", "academic_qualifications", "professional_qualifications"),
    address: pick("address"),
    address_line_1: pick("address_line_1", "address_line1"),
    address_line_2: pick("address_line_2", "address_line2"),
    city: pick("city"),
    state: pick("state", "region", "province", "county"),
    postal_code: pick("postal_code", "zip", "zip_code"),
    country: pick("country"),
    biography: pick("biography"),
    co_authors_editors: pick("co_authors_editors", "co_authors"),
    word_count: pick("word_count", "estimated_word_count"),
    has_tables: pick("has_tables"),
    has_illustrations: pick("has_illustrations"),
    illustration_count: pick("illustration_count", "number_of_illustrations"),
    figures_tables_count: pick("figures_tables_count"),
    under_review_elsewhere: pick(
      "under_review_elsewhere",
      "under_review_elsewhere_details",
      "review_elsewhere",
      "review_elsewhere_details",
    ),
    expected_completion_date: pick("expected_completion_date", "estimated_completion_date"),
    expected_submission_date: pick("expected_submission_date", "submission_date"),
    manuscript_stage: pick("manuscript_stage", "stage", "current_stage"),
    languages_used: pick("languages_used", "languages", "language"),
    intended_audience: pick("intended_audience", "target_audience", "audience"),
    short_description: pick("short_description", "detailed_description"),
    detailed_description: pick(
      "detailed_description_extra",
      "key_features",
      "unique_selling_points",
    ),
    key_features: pick("key_features", "selling_points", "unique_selling_points"),
    competing_titles: pick("competing_titles"),
    unique_contribution: pick("unique_contribution", "unique_selling_points"),
    primary_market: pick("primary_market", "market"),
    conferences: pick("conferences", "relevant_conferences"),
    promotional_channels: pick("promotional_channels", "promotion_channels"),
    keywords: pick("keywords"),
    marketing_info: pick(
      "marketing_info",
      "primary_market",
      "target_audience",
      "competing_titles",
    ),
    referees_reviewers: pick("referees_reviewers", "recommended_reviewers"),
    additional_info: pick("additional_info", "conferences", "promotional_channels"),
    additional_notes: pick("additional_notes", "additional_comments", "notes"),
    permissions_required: pick("permissions_required"),
    table_of_contents: pick("table_of_contents"),
    subject: pick("subject"),
  };
  // Prefer the title/subtitle from the most recent contract (the DR may
  // have edited them at /contract/send time); fall back to the proposal's
  // current_data values.
  // Pick the most recent contract by created_at / contract_version so the hero
  // always reflects what the DR last sent, regardless of API ordering.
  const latestContractForHeader = (() => {
    if (!contracts.length) return undefined;
    const sorted = [...contracts].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      if (tb !== ta) return tb - ta;
      return (b.contract_version || 0) - (a.contract_version || 0);
    });
    return sorted[0];
  })();
  const title = latestContractForHeader?.title || cd.main_title || ticket;
  const proposalDocuments = extractProposalDocuments(rawCd);

  const keywords = useMemo(
    () =>
      (cd.keywords || "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
    [cd.keywords],
  );

  const tocItems = useMemo(
    () =>
      (cd.table_of_contents || "")
        .split(/\n+/)
        .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean),
    [cd.table_of_contents],
  );

  const suggestedReviewers = useMemo(
    () =>
      (cd.referees_reviewers || "")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean),
    [cd.referees_reviewers],
  );

  const assignedReviewer = data?.assignments?.[0];

  const isReviewReturned = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "review_returned" && reviews.some((r) => r.is_submitted);
  }, [data?.status, reviews]);

  const isDeclined = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "declined";
  }, [data?.status]);

  const isAwaitingMoreInfo = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "awaiting_more_info";
  }, [data?.status]);

  const isLocked = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "locked" || s === "confirmed_and_finalised" || s === "confirmed_and_finalized";
  }, [data?.status]);

  /**
   * Proofreader phase: once a contract is signed the proofreader owns the
   * proposal. Admin / DR can observe only — the API rejects assign, decline
   * and metadata writes while the proposal sits in awaiting_author_approval.
   */
  const isProofreaderPhase = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "awaiting_author_approval";
  }, [data?.status]);

  // Latest unanswered author query (used for prominent DR action panel)
  const openQuery = useMemo<ContractQueryEntry | null>(() => {
    const answered = new Set(
      queryThread
        .filter((t) => t.type === "response" && t.parent_query_id)
        .map((t) => t.parent_query_id as number),
    );
    const unanswered = queryThread
      .filter((t) => t.type === "query" && !answered.has(t.id))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return unanswered[0] || null;
  }, [queryThread]);

  const hasOpenQuery =
    !!openQuery ||
    queryProposalStatus === "queries_raised" ||
    queryProposalStatus === "question_raised";

  useEffect(() => {
    if (!hasOpenQuery || !openQuery) return;

    const questionKey = `${ticket}:${openQuery.id}`;
    if (lastScrolledQuestionRef.current === questionKey) return;
    lastScrolledQuestionRef.current = questionKey;

    window.setTimeout(() => {
      authorQuestionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, [hasOpenQuery, openQuery, ticket]);

  const submitQueryResponse = async (e: FormEvent) => {
    e.preventDefault();
    if (!openQuery || !queryResponseText.trim()) return;
    setQueryResponseSubmitting(true);
    setQueryResponseError(null);
    setQueryResponseSuccess(null);
    try {
      await respondQuery(ticket, openQuery.id, queryResponseText.trim());
      setQueryResponseText("");
      setQueryResponseSuccess("Response sent to the author.");
      setContractsReloadKey((k) => k + 1);
      // Prompt the DR: "Send Contract Again?" → opens the full Issue Contract
      // dialog with title/subtitle and the rest of the contract fields.
      setContractResendPrompt("prompt");
    } catch (err) {
      setQueryResponseError(
        (err as Error).message || "Failed to send response.",
      );
    } finally {
      setQueryResponseSubmitting(false);
    }
  };

  const latestContract = contracts[0];
  const isContractIssued = useMemo(() => {
    if (!latestContract) return false;
    const cs = (latestContract.status || "").toLowerCase();
    return cs === "sent" || cs === "signed" || cs === "declined" || cs === "draft";
  }, [latestContract]);
  const isAwaitingSignature = useMemo(() => {
    const cs = (latestContract?.status || "").toLowerCase();
    return cs === "sent" || cs === "draft";
  }, [latestContract]);
  const isContractExpired = useMemo(() => {
    if (!latestContract) return false;
    const cs = (latestContract.status || "").toLowerCase();
    if (cs === "signed" || cs === "declined" || cs === "voided") return false;
    const exp = latestContract.docusign_expires_at;
    if (!exp) return false;
    const t = Date.parse(exp);
    return Number.isFinite(t) && t <= Date.now();
  }, [latestContract]);
  const isContractSigned = useMemo(() => {
    const cs = (latestContract?.status || "").toLowerCase();
    if (cs !== "signed") return false;
    const ps = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return ["contract_signed", "contract_received"].includes(ps);
  }, [latestContract, data?.status]);

  const hasSignedContract = useMemo(
    () => (latestContract?.status || "").toLowerCase() === "signed",
    [latestContract],
  );
  useEffect(() => {
    if (!hasSignedContract || !ticket) return;
    let cancelled = false;
    const load = async () => {
      setMetadataLoading(true);
      setMetadataError(null);
      try {
        const token = getPortalToken();
        const res = await proposalApiFetch(
          `/${encodeURIComponent(ticket)}/metadata`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setMetadata(null);
            setMetadataError(null);
          } else {
            setMetadataError(
              (body.error as string) || `Failed to load metadata (${res.status}).`,
            );
          }
        } else {
          setMetadata(body as ProposalMetadata);
        }
      } catch {
        if (!cancelled) setMetadataError("Network error. Please try again.");
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [hasSignedContract, ticket]);

  useEffect(() => {
    if (!metadata) {
      setMetaForm(emptyMetaForm);
      metaFormRef.current = emptyMetaForm;
      return;
    }
    const md = metadata.metadata || {};
    const nextMetaForm: MetaForm = {
      full_title: md.full_title || "",
      title: md.title || "",
      subtitle: md.subtitle || "",
      category: md.category || "",
      display_names: md.display_names || "",
      display_bios: md.display_bios || "",
      book_description: md.book_description || "",
      keywords: md.keywords || "",
      website_classification: md.website_classification || "",
      bic: md.bic || "",
      authors: (md.authors || []).map((a) => ({ ...a })),
    };
    setMetaForm(nextMetaForm);
    metaFormRef.current = nextMetaForm;
    setMetaSaveError(null);
    setMetaSaveSuccess(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata]);

  const updateMetaField = <K extends keyof MetaForm>(key: K, value: MetaForm[K]) => {
    setMetaForm((prev) => {
      const next = { ...prev, [key]: value };
      metaFormRef.current = next;
      return next;
    });
    setMetaSaveSuccess(null);
  };
  const updateMetaAuthor = (index: number, key: keyof MetadataAuthor, value: string) => {
    setMetaForm((prev) => {
      const next = prev.authors.map((a, i) => (i === index ? { ...a, [key]: value } : a));
      const nextMetaForm = { ...prev, authors: next };
      metaFormRef.current = nextMetaForm;
      return nextMetaForm;
    });
    setMetaSaveSuccess(null);
  };

  const saveMetadataDraft = async () => {
    if (!ticket) return;
    setMetaSaving(true);
    setMetaSaveError(null);
    setMetaSaveSuccess(null);
    try {
      const token = getPortalToken();
      const session = getPortalSession();
      const payload: Record<string, unknown> = {
        full_title: metaForm.full_title,
        title: metaForm.title,
        subtitle: metaForm.subtitle,
        category: metaForm.category,
        display_names: metaForm.display_names,
        display_bios: metaForm.display_bios,
        book_description: metaForm.book_description,
        keywords: metaForm.keywords,
        website_classification: metaForm.website_classification,
        bic: metaForm.bic,
        authors: metaForm.authors,
      };
      if (session?.email) payload.updated_by = session.email;
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/metadata`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMetaSaveError((body.error as string) || `Failed to save (${res.status}).`);
        return;
      }
      // Optimistically update local metadata snapshot
      setMetadata((prev) => {
        if (!prev) return prev;
        const next: ProposalMetadata = {
          ...prev,
          // If the author has already approved this metadata record,
          // keep the status as "approved" so subsequent reviewer edits
          // flow straight through to the author dashboard without
          // requiring another approval round-trip.
          metadata_status:
            prev.metadata_status === "approved" || !!prev.approved_at
              ? "approved"
              : "draft",
          current_version:
            (body.current_version as number) ?? prev.current_version,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(prev.metadata || {}),
            full_title: metaForm.full_title,
            title: metaForm.title,
            subtitle: metaForm.subtitle,
            category: metaForm.category,
            display_names: metaForm.display_names,
            display_bios: metaForm.display_bios,
            book_description: metaForm.book_description,
            keywords: metaForm.keywords,
            website_classification: metaForm.website_classification,
            bic: metaForm.bic,
            authors: metaForm.authors,
          },
        };
        try {
          localStorage.setItem(`author_metadata_cache:${ticket}`, JSON.stringify(next));
        } catch {
          /* ignore quota errors */
        }
        return next;
      });
      setMetaSaveSuccess("Draft saved.");
    } catch {
      setMetaSaveError("Network error. Please try again.");
    } finally {
      setMetaSaving(false);
    }
  };

  const sendMetadataToAuthor = async () => {
    if (!ticket) return;
    setMetaSendLoading(true);
    setMetaSendError(null);
    setMetaSendSuccess(null);
    try {
      const token = getPortalToken();
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/metadata/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMetaSendError((body.error as string) || `Failed to send (${res.status}).`);
        return;
      }
      setMetaSendSuccess((body.message as string) || "Metadata sent to author.");
      setMetadata((prev) =>
        prev ? { ...prev, metadata_status: "sent_to_author" } : prev,
      );
    } catch {
      setMetaSendError("Network error. Please try again.");
    } finally {
      setMetaSendLoading(false);
    }
  };

  const peerReview = useMemo(
    () => reviews.find((r) => r.reviewer_role === "peer_reviewer" && r.is_submitted),
    [reviews],
  );
  const drReview = useMemo(
    () => reviews.find((r) => r.reviewer_role === "decision_reviewer"),
    [reviews],
  );
  const submittedDrReview = useMemo(
    () => reviews.find((r) => r.reviewer_role === "decision_reviewer" && r.is_submitted),
    [reviews],
  );
  const submittedReviews = useMemo(() => reviews.filter((r) => r.is_submitted), [reviews]);
  const primaryReview = peerReview || submittedReviews[0] || reviews[0];
  const recommendationKey = (primaryReview?.review_data?.recommendation as string) || "";
  const recommendationLabel = RECOMMENDATION_LABELS[recommendationKey] || recommendationKey;
  const reviewerDisplayName = primaryReview
    ? primaryReview.reviewer_name ||
      displayNameFromEmail(primaryReview.reviewer_email || "")
    : "";
  const reviewerInstitution = (primaryReview as { reviewer_institution?: string } | undefined)
    ?.reviewer_institution;
  const reviewerSummary = useMemo(() => {
    if (!primaryReview) return "";
    const rd = (primaryReview.review_data || {}) as Record<string, unknown>;
    const candidates = [
      rd.note_to_dr,
      rd.other_comments,
      rd.scope,
      rd.purpose_value,
    ];
    for (const c of candidates) {
      const s = typeof c === "string" ? c.trim() : "";
      if (s) return s;
    }
    return "";
  }, [primaryReview]);

  useEffect(() => {
    if (commentsSeeded) return;
    // Prefer the Decision Reviewer's own saved draft (if any) over the
    // peer reviewer's submitted review, so reloads restore the DR's edits.
    const sourceReview = drReview || primaryReview;
    if (!sourceReview) return;
    const rd = (sourceReview.review_data || {}) as Record<string, unknown>;
    const seeded: ReviewComment[] = [];
    REVIEW_SECTIONS.forEach(({ key, label }) => {
      const v = rd[key];
      const text = typeof v === "string" ? v.trim() : "";
      seeded.push({
        id: `${key}-${seeded.length}`,
        severity: SECTION_SEVERITY[key] || "General",
        chapter: label,
        page: "",
        body: text,
      });
    });
    setComments(seeded);
    setCommentsSeeded(true);
    if (recommendationKey) setReviewRecommendation(recommendationKey);
  }, [commentsSeeded, primaryReview, drReview]);

  const [savingDraft, setSavingDraft] = useState(false);
  const saveCommentsDraft = async () => {
    setSavingDraft(true);
    try {
      // Map comments back to section fields by chapter label (same shape
      // as the submit flow, but posted to the /review/save draft endpoint).
      const sectionByLabel: Record<string, string> = {};
      REVIEW_SECTIONS.forEach(({ label }) => (sectionByLabel[label] = ""));
      const otherBuckets: string[] = [];
      comments.forEach((c) => {
        const body = (c.body || "").trim();
        if (!body) return;
        const label = (c.chapter || "").trim();
        if (label && Object.prototype.hasOwnProperty.call(sectionByLabel, label)) {
          sectionByLabel[label] = sectionByLabel[label]
            ? `${sectionByLabel[label]}\n\n${body}`
            : body;
        } else {
          otherBuckets.push(label ? `${label}: ${body}` : body);
        }
      });
      const payload: Record<string, unknown> = {};
      REVIEW_SECTIONS.forEach(({ key, label }) => {
        const v = sectionByLabel[label];
        if (key === "other_comments") {
          const merged = [v, ...otherBuckets].filter(Boolean).join("\n\n");
          if (merged) payload[key] = merged;
        } else if (v) {
          payload[key] = v;
        }
      });

      const token = getPortalToken();
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/review/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        toast.error(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to save draft (${res.status}).`,
        );
        return;
      }
      toast.success((body.message as string) || "Draft saved");
    } catch {
      toast.error("Network error. Could not save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const updateComment = (id: string, patch: Partial<ReviewComment>) =>
    setComments((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeComment = (id: string) =>
    setComments((cs) => cs.filter((c) => c.id !== id));
  const addComment = () =>
    setComments((cs) => [
      ...cs,
      {
        id: `new-${Date.now()}`,
        severity: "General",
        chapter: "",
        page: "",
        body: "",
      },
    ]);

  const refreshInternalNotes = async () => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const list = await listInternalNotes(ticket);
      setInternalNotes(list);
    } catch (e) {
      setNotesError((e as Error).message);
    } finally {
      setNotesLoading(false);
    }
  };

  const refreshEvents = async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const list = await listProposalEvents(ticket);
      setEvents(list);
    } catch (e) {
      setEventsError((e as Error).message);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    const session = getPortalSession();
    const role = (session?.role || "").toLowerCase();
    if (role !== "admin" && role !== "decision_reviewer") return;
    refreshInternalNotes();
    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const onSaveNotes = async (e: FormEvent) => {
    e.preventDefault();
    const text = notes.trim();
    if (!text) return;
    setSavingNote(true);
    setNotesError(null);
    try {
      const created = await createInternalNote(ticket, text);
      setInternalNotes((prev) => [created, ...prev]);
      setNotes("");
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setNotesError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setSavingNote(false);
    }
  };

  const onUpdateNote = async (noteId: number) => {
    const text = editingNoteText.trim();
    if (!text) return;
    try {
      const updated = await updateInternalNote(ticket, noteId, text);
      setInternalNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingNoteId(null);
      setEditingNoteText("");
      toast.success("Note updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onDeleteNote = async (noteId: number) => {
    if (!confirm("Delete this internal note?")) return;
    try {
      await deleteInternalNote(ticket, noteId);
      setInternalNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success("Note deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openReviewers = async () => {
    setReviewersOpen(true);
    setSelectedReviewerId(null);
    setAssignError(null);
    setAssignSuccess(null);
    // default due date = today + 4 weeks (yyyy-mm-dd for <input type="date">)
    const d = new Date();
    d.setDate(d.getDate() + 28);
    setReviewDueDate(d.toISOString().slice(0, 10));
    setReviewerNotes("");
    setReviewersLoading(true);
    setReviewersError(null);
    try {
      const token = getPortalToken();
      const res = await proposalApiFetch("/users/peer-reviewers", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setReviewersError((body.error as string) || `Failed to load reviewers (${res.status}).`);
        return;
      }
      setReviewers((body.peer_reviewers as PeerReviewer[]) || []);
    } catch {
      setReviewersError("Network error. Please try again.");
    } finally {
      setReviewersLoading(false);
    }
  };

  const handleAssignReviewer = async () => {
    const reviewer = reviewers.find((r) => r.id === selectedReviewerId);
    if (!reviewer) return;
    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);
    try {
      const token = getPortalToken();
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reviewer_email: reviewer.email,
          ...(reviewerNotes.trim() ? { note: reviewerNotes.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setAssignError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to assign reviewer (${res.status}).`,
        );
        return;
      }
      setAssignSuccess(
        (body.message as string) || `Assigned to ${reviewer.name || reviewer.email}.`,
      );
      // Refresh proposal so the assigned reviewer appears
      try {
        const refreshed = await proposalApiFetch(`/${encodeURIComponent(ticket)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const refreshedBody = (await refreshed.json().catch(() => ({}))) as Record<string, unknown>;
        if (refreshed.ok) setData(refreshedBody as unknown as ProposalDetail);
      } catch {
        // ignore refresh errors
      }
      setTimeout(() => setReviewersOpen(false), 1200);
    } catch {
      setAssignError("Network error. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F7F2] font-sans text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/decision_reviewer" className="flex items-center gap-3">
              <img src={cspLogo} alt="CSP" width={32} height={32} />
              <span className="font-serif text-xl font-bold text-stone-900">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-base text-stone-700">Editor Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0E3D2F] font-sans text-xs font-semibold text-white">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm font-medium text-stone-800">{displayName}</span>
            <span className="h-5 w-px bg-stone-300" />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-stone-600 hover:text-stone-900"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {mounted ? (() => {
        const session = getPortalSession();
        const role = (session?.role || "").toLowerCase();
        if (role !== "admin" && role !== "decision_reviewer") return null;
        return (
          <Sheet onOpenChange={(o) => { if (o) refreshEvents(); }}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="View audit trail"
                className="fixed right-5 top-24 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-md hover:bg-stone-50 hover:text-stone-900"
              >
                <History className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto bg-white sm:max-w-md">
              <SheetHeader>
                <SheetTitle className="font-serif text-black">Audit Trail</SheetTitle>
                <SheetDescription className="text-black">
                  All events for {ticket}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <p className="font-sans text-xs text-black">
                  {events.length} event{events.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {eventsLoading && events.length === 0 && (
                  <p className="font-sans text-xs text-black">Loading events…</p>
                )}
                {eventsError && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
                    {eventsError}
                  </p>
                )}
                {!eventsLoading && !eventsError && events.length === 0 && (
                  <p className="font-sans text-xs text-black">No events yet.</p>
                )}
                <ol className="relative space-y-3 border-l border-stone-200 pl-4">
                  {events.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-stone-500 ring-2 ring-white" />
                      <div className="rounded-xl border border-stone-200 bg-stone-100 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-black ring-1 ring-stone-200">
                            {ev.event_type.replace(/_/g, " ")}
                          </span>
                          <p className="font-sans text-[11px] text-black">
                            {formatDate(ev.created_at)}
                          </p>
                        </div>
                        <p className="whitespace-pre-wrap font-sans text-sm text-black">
                          {ev.description}
                        </p>
                        {(ev.old_status || ev.new_status) && (
                          <p className="mt-1.5 font-sans text-[11px] text-black">
                            {ev.old_status && (
                              <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-stone-200">
                                {ev.old_status}
                              </span>
                            )}
                            {ev.old_status && ev.new_status && (
                              <span className="mx-1.5 text-stone-400">→</span>
                            )}
                            {ev.new_status && (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 ring-1 ring-emerald-200">
                                {ev.new_status}
                              </span>
                            )}
                          </p>
                        )}
                        {ev.changed_by && (
                          <p className="mt-1.5 font-sans text-[11px] text-black">
                            by {ev.changed_by}
                            {ev.changed_by_role && (
                              <span className="text-stone-600"> · {ev.changed_by_role.replace(/_/g, " ")}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </SheetContent>
          </Sheet>
        );
      })() : null}

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <Link
          to="/dashboard/decision_reviewer"
          className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-[#0E3D2F] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {loading && (
          <p className="mt-10 text-center font-sans text-sm text-stone-500">
            Loading proposal details…
          </p>
        )}
        {error && !loading && (
          <p className="mt-10 text-center font-sans text-sm text-red-600">{error}</p>
        )}

        {data && !loading && (
          <>
            {/* Title hero card */}
            <section className="mt-6 rounded-2xl border border-stone-200 bg-white px-8 py-7">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="font-serif text-3xl font-bold leading-tight text-stone-900">
                    {cd.main_title || title}
                  </h1>
                  {cd.sub_title && (
                    <p className="mt-2 font-sans text-base font-medium text-amber-700">
                      {cd.sub_title}
                    </p>
                  )}
                  {(() => {
                    if (!latestContractForHeader) return null;
                    const origTitle = (cd.main_title || title || "").trim();
                    const origSubtitle = (cd.sub_title || "").trim();
                    const pTitle =
                      (
                        latestContractForHeader?.title ||
                        optimisticProposed?.title ||
                        cd.proposed_title ||
                        ""
                      ).trim();
                    const pSubtitle =
                      (
                        latestContractForHeader?.subtitle ||
                        optimisticProposed?.subtitle ||
                        cd.proposed_subtitle ||
                        ""
                      ).trim();
                    // Hide the "Proposed Title" row entirely when the DR did
                    // not actually edit the title/subtitle (i.e. proposed
                    // matches the original values).
                    const titleDiffers = pTitle && pTitle !== origTitle;
                    const subtitleDiffers = pSubtitle && pSubtitle !== origSubtitle;
                    if (!titleDiffers && !subtitleDiffers) return null;
                    const showTitle = titleDiffers ? pTitle : "";
                    const showSubtitle = subtitleDiffers ? pSubtitle : "";
                    return (
                      <p className="mt-3 flex items-center gap-2 font-sans text-sm text-stone-500">
                        <FileText className="h-4 w-4 text-stone-400" />
                        <span className="font-medium text-stone-500">Proposed Title:</span>
                        <span className="font-semibold text-stone-800">
                          {showTitle}
                          {showTitle && showSubtitle ? ": " : ""}
                          {showSubtitle}
                        </span>
                      </p>
                    );
                  })()}
                </div>
                {isContractSigned ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" />
                    Contract Signed
                  </span>
                ) : (() => {
                  const normalizedStatus = data.status?.toLowerCase().replace(/\s+/g, "_") || "";
                  const rawLabel =
                    normalizedStatus === "awaiting_more_info"
                      ? "Request Revision"
                      : normalizedStatus === "new" || normalizedStatus === "submitted"
                        ? "New"
                        : data.status;
                  const sMeta = getStatusMeta(data.status, rawLabel);
                  return (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-medium ${sMeta.badgeClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${sMeta.dot}`} />
                      {rawLabel}
                    </span>
                  );
                })()}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2 font-sans text-sm text-stone-600">
                {cd.corresponding_author_name && (
                  <MetaItem icon="user" text={cd.corresponding_author_name} />
                )}
                {cd.email && <MetaItem icon="mail" text={cd.email} />}
                {cd.institution && <MetaItem icon="building" text={cd.institution} />}
                {cd.country && <MetaItem icon="globe" text={cd.country} />}
                <MetaItem icon="calendar" text={formatDate(data.submitted_at)} />
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
              {/* Main column */}
              <div className="space-y-6">
                {hasSignedContract && (
                  <Card className="overflow-hidden border-stone-200">
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
                    </div>

                    <div className="p-6">
                      {metadataLoading && (
                        <p className="font-sans text-sm text-stone-500">Loading metadata…</p>
                      )}
                      {metadataError && (
                        <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                          {metadataError}
                        </p>
                      )}
                      {!metadataLoading && !metadataError && !metadata && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
                            <BookOpen className="h-5 w-5 text-stone-400" />
                          </div>
                          <p className="mt-3 font-sans text-sm text-stone-500">
                            No metadata has been recorded for this proposal yet.
                          </p>
                        </div>
                      )}

                      {!metadataLoading && !metadataError && metadata && (() => {
                        const coverImg = metadata.cover_image;
                        const coverUrl = coverImg?.url || coverImg?.s3_url;
                        const canDeleteCover = isAdmin();
                        const authorsList = metaForm.authors;
                         const isMetaLocked =
                           isLocked ||
                           (metadata.metadata_status === "sent_to_author" &&
                             !metadataHasOpenQuery);
                        const isMetaApproved = metadata.metadata_status === "approved" || !!metadata.approved_at;
                        return (
                          <div className="space-y-4">
                            {isMetaLocked && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-sans text-sm text-amber-800">
                                {isLocked
                                  ? "Metadata has been locked — no further changes can be made."
                                  : "Metadata has been sent to the author for approval. Editing is disabled until the author responds."}
                              </div>
                            )}
                            {metadata.metadata_status === "sent_to_author" &&
                              metadataHasOpenQuery && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-800">
                                  The author has raised a query — metadata fields
                                  are editable so you can update them before
                                  responding.
                                </div>
                              )}
                            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                              <MetaRow label="Title Full" value={metaForm.full_title} onChange={(v) => updateMetaField("full_title", v)} disabled={isMetaLocked} />
                              <MetaRow
                                label="Title"
                                value={metaForm.title}
                                onChange={(v) => updateMetaField("title", v)}
                                disabled={isMetaLocked}
                                hint={
                                  latestContractForHeader?.title &&
                                  latestContractForHeader.title !== metaForm.title
                                    ? latestContractForHeader.title
                                    : undefined
                                }
                              />
                              <MetaRow
                                label="Subtitle"
                                value={metaForm.subtitle}
                                onChange={(v) => updateMetaField("subtitle", v)}
                                disabled={isMetaLocked}
                                hint={
                                  latestContractForHeader?.subtitle &&
                                  latestContractForHeader.subtitle !== metaForm.subtitle
                                    ? latestContractForHeader.subtitle
                                    : undefined
                                }
                              />
                              <MetaRow label="Category Auth/Ed" value={metaForm.category} onChange={(v) => updateMetaField("category", v)} disabled={isMetaLocked} />
                              <MetaRow label="Display Names" value={metaForm.display_names} onChange={(v) => updateMetaField("display_names", v)} disabled={isMetaLocked} />
                              <MetaRow label="Display Bios" value={metaForm.display_bios} onChange={(v) => updateMetaField("display_bios", v)} multiline disabled={isMetaLocked} />
                              <MetaRow label="Book Description" value={metaForm.book_description} onChange={(v) => updateMetaField("book_description", v)} multiline disabled={isMetaLocked} />
                              <MetaRow label="Keywords" value={metaForm.keywords} onChange={(v) => updateMetaField("keywords", v)} disabled={isMetaLocked} />
                              <MetaRow label="Website Classification" value={metaForm.website_classification} onChange={(v) => updateMetaField("website_classification", v)} disabled={isMetaLocked} />
                              <MetaRow label="BIC Codes" value={metaForm.bic} onChange={(v) => updateMetaField("bic", v)} disabled={isMetaLocked} />
                              <div className="grid grid-cols-[220px_1fr] gap-0 border-t border-stone-200">
                                <div className="flex items-center bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
                                  Cover Image
                                </div>
                                <div className="border-l border-stone-200 px-4 py-4">
                                  {coverUrl ? (
                                    <div className="flex flex-wrap items-start gap-4">
                                      <img
                                        src={coverUrl}
                                        alt="Cover"
                                        className="h-40 rounded-lg border border-stone-200 object-contain shadow-sm"
                                      />
                                      <div className="space-y-1 font-sans text-xs text-stone-600">
                                        {coverImg?.filename && (
                                          <p><span className="text-stone-400">File:</span> {coverImg.filename}</p>
                                        )}
                                        {(coverImg?.width_px || coverImg?.height_px) && (
                                          <p>
                                            <span className="text-stone-400">Dimensions:</span>{" "}
                                            {coverImg?.width_px || "?"}×{coverImg?.height_px || "?"} px
                                            {coverImg?.dpi ? ` · ${coverImg.dpi} dpi` : ""}
                                          </p>
                                        )}
                                        {typeof coverImg?.file_size_bytes === "number" && (
                                          <p>
                                            <span className="text-stone-400">Size:</span>{" "}
                                            {(coverImg.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                                          </p>
                                        )}
                                        {typeof coverImg?.version === "number" && (
                                          <p><span className="text-stone-400">Version:</span> v{coverImg.version}</p>
                                        )}
                                        {coverImg?.source && (
                                          <p><span className="text-stone-400">Source:</span> {coverImg.source}</p>
                                        )}
                                        {canDeleteCover && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (!confirm("Remove the current cover image? This cannot be undone.")) return;
                                              try {
                                                await apiDeleteCoverImage(ticket);
                                                setMetadata((prev) => prev ? { ...prev, cover_image: null } : prev);
                                              } catch (e) {
                                                alert((e as Error).message);
                                              }
                                            }}
                                            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                          >
                                            Remove cover
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-stone-300 px-4 font-sans text-xs text-stone-400">
                                      No cover image uploaded
                                    </div>
                                  )}
                                </div>
                              </div>

                              {authorsList.map((a, i) => (
                                <div key={i}>
                                  <div className="border-t border-stone-200 bg-emerald-700 px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-white">
                                    {authorsList.length > 1 ? `Primary Author(s) — ${i + 1}` : "Primary Author(s)"}
                                  </div>
                                  <MetaRow label="Salutation" value={a.title || ""} onChange={(v) => updateMetaAuthor(i, "title", v)} disabled={isMetaLocked} />
                                  <MetaRow label="First name" value={a.first_name || ""} onChange={(v) => updateMetaAuthor(i, "first_name", v)} disabled={isMetaLocked} />
                                  <MetaRow label="Last name" value={a.last_name || ""} onChange={(v) => updateMetaAuthor(i, "last_name", v)} disabled={isMetaLocked} />
                                  <MetaRow label="Email" value={a.email || ""} onChange={(v) => updateMetaAuthor(i, "email", v)} disabled={isMetaLocked} />
                                  <MetaRow label="Email 2" value={a.email_2 || ""} onChange={(v) => updateMetaAuthor(i, "email_2", v)} disabled={isMetaLocked} />
                                  <MetaRow label="Institution" value={a.institution || ""} onChange={(v) => updateMetaAuthor(i, "institution", v)} disabled={isMetaLocked} />
                                  <MetaRow label="Country" value={a.country || ""} onChange={(v) => updateMetaAuthor(i, "country", v)} disabled={isMetaLocked} />
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-5 py-3">
                              <div className="min-w-0 font-sans text-xs text-stone-600">
                                {metaSaveError && (
                                  <span className="text-rose-700">{metaSaveError}</span>
                                )}
                                {metaSendError && (
                                  <span className="text-rose-700">{metaSendError}</span>
                                )}
                                {!metaSaveError && !metaSendError && metaSaveSuccess && (
                                  <span className="text-emerald-700">{metaSaveSuccess}</span>
                                )}
                                {!metaSaveError && !metaSendError && metaSendSuccess && (
                                  <span className="text-emerald-700">{metaSendSuccess}</span>
                                )}
                                {!metaSaveError && !metaSendError && !metaSaveSuccess && !metaSendSuccess && (
                                  <span>Status: <strong className="text-stone-800">{metadata.metadata_status || "draft"}</strong></span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!isMetaLocked && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={saveMetadataDraft}
                                      disabled={metaSaving}
                                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {metaSaving ? "Saving…" : "Save Draft"}
                                    </button>
                                    {!isMetaApproved && !metadataHasOpenQuery && (
                                      <button
                                        type="button"
                                        onClick={sendMetadataToAuthor}
                                        disabled={metaSendLoading || metaSaving}
                                        className="inline-flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {metaSendLoading ? "Sending…" : "Send to Author"}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <div id="dr-metadata-queries-section" className="scroll-mt-24">
                            <MetadataQueries
                              ticket={ticket}
                              viewer="dr"
                              onOpenQueryChange={setMetadataHasOpenQuery}
                              onAfterRespond={sendMetadataToAuthor}
                              fieldLabels={{
                                full_title: "Title (full)",
                                title: "Title",
                                subtitle: "Subtitle",
                                category: "Category",
                                display_names: "Display names",
                                display_bios: "Display bios",
                                book_description: "Book description",
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
                              }}
                              fieldValues={{
                                full_title: metaForm.full_title,
                                title: metaForm.title,
                                subtitle: metaForm.subtitle,
                                category: metaForm.category,
                                display_names: metaForm.display_names,
                                display_bios: metaForm.display_bios,
                                book_description: metaForm.book_description,
                                keywords: metaForm.keywords,
                                website_classification:
                                  metaForm.website_classification,
                                bic: metaForm.bic,
                                "authors.title": metaForm.authors[0]?.title || "",
                                "authors.first_name":
                                  metaForm.authors[0]?.first_name || "",
                                "authors.last_name":
                                  metaForm.authors[0]?.last_name || "",
                                "authors.email": metaForm.authors[0]?.email || "",
                                "authors.email_2": metaForm.authors[0]?.email_2 || "",
                                "authors.institution":
                                  metaForm.authors[0]?.institution || "",
                                "authors.country": metaForm.authors[0]?.country || "",
                              }}
                              onSaveFields={async (updates) => {
                                const baseMetaForm = metaFormRef.current;
                                const topLevelUpdates: Partial<MetaForm> = {};
                                let nextAuthors = baseMetaForm.authors.map((author) => ({ ...author }));
                                let hasAuthorUpdate = false;

                                for (const [key, value] of Object.entries(updates)) {
                                  if (key.startsWith("authors.")) {
                                    const authorKey = key.slice("authors.".length) as keyof MetadataAuthor;
                                    if (nextAuthors.length === 0) nextAuthors = [{}];
                                    nextAuthors[0] = {
                                      ...nextAuthors[0],
                                      [authorKey]: value,
                                    };
                                    hasAuthorUpdate = true;
                                  } else {
                                    topLevelUpdates[key as keyof MetaForm] = value as never;
                                  }
                                }

                                const merged: MetaForm = {
                                  ...baseMetaForm,
                                  ...topLevelUpdates,
                                  ...(hasAuthorUpdate ? { authors: nextAuthors } : {}),
                                };
                                metaFormRef.current = merged;
                                const token = getPortalToken();
                                const session = getPortalSession();
                                const payload: Record<string, unknown> = {
                                  full_title: merged.full_title,
                                  title: merged.title,
                                  subtitle: merged.subtitle,
                                  category: merged.category,
                                  display_names: merged.display_names,
                                  display_bios: merged.display_bios,
                                  book_description: merged.book_description,
                                  keywords: merged.keywords,
                                  website_classification:
                                    merged.website_classification,
                                  bic: merged.bic,
                                  authors: merged.authors,
                                };
                                if (session?.email)
                                  payload.updated_by = session.email;
                                const res = await proposalApiFetch(
                                  `/${encodeURIComponent(ticket)}/metadata`,
                                  {
                                    method: "PUT",
                                    headers: {
                                      "Content-Type": "application/json",
                                      ...(token
                                        ? { Authorization: `Bearer ${token}` }
                                        : {}),
                                    },
                                    body: JSON.stringify(payload),
                                  },
                                );
                                const body = (await res
                                  .json()
                                  .catch(() => ({}))) as Record<string, unknown>;
                                if (!res.ok) {
                                  throw new Error(
                                    (body.error as string) ||
                                      `Failed to save (${res.status}).`,
                                  );
                                }
                                setMetaForm(merged);
                                setMetadata((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        current_version:
                                          (body.current_version as number) ??
                                          prev.current_version,
                                        updated_at: new Date().toISOString(),
                                        metadata: {
                                          ...(prev.metadata || {}),
                                          ...topLevelUpdates,
                                          ...(hasAuthorUpdate
                                            ? { authors: nextAuthors }
                                            : {}),
                                        },
                                      }
                                    : prev,
                                );
                              }}
                            />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </Card>
                )}
                {isContractIssued && (
                  <>
                    {/* Contract & Feedback preview */}
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-violet-200 bg-violet-50/70 px-6 py-4">
                        <div className="min-w-0">
                          <h2 className="font-serif text-base font-bold text-stone-900">
                            Contract &amp; Feedback
                          </h2>
                          <p className="mt-0.5 font-sans text-sm text-stone-500">
                            {latestContract?.docusign_sent_at
                              ? `Issued ${formatDate(latestContract.docusign_sent_at)}`
                              : "Contract issued"}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-semibold ring-1 ${
                            isContractExpired
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : (latestContract?.status || "").toLowerCase() === "signed"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : (latestContract?.status || "").toLowerCase() === "declined"
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-violet-50 text-violet-700 ring-violet-200"
                          }`}
                        >
                          {isContractExpired
                            ? "Expired"
                            : (latestContract?.status || "").toLowerCase() === "signed"
                            ? "Signed"
                            : (latestContract?.status || "").toLowerCase() === "declined"
                              ? "Declined"
                              : "Awaiting Signature"}
                        </span>
                      </div>
                      <div className="px-6 py-6">
                        <div className="mx-auto max-w-xl rounded-xl border border-stone-200 bg-white px-10 py-10 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.08)]">
                          <p className="text-center font-sans text-[11px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                            Cambridge Scholars Publishing
                          </p>
                          <div className="mt-3 flex items-center justify-center gap-2">
                            <span className="h-px w-10 bg-stone-300" />
                            <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
                            <span className="h-px w-10 bg-stone-300" />
                          </div>
                          <p className="mt-4 text-center font-sans text-xs font-semibold uppercase tracking-[0.28em] text-stone-700">
                            Publishing Agreement
                          </p>
                          <dl className="mt-8 space-y-3 font-sans text-sm">
                            <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-stone-200 pb-2">
                              <dt className="text-stone-500">Author</dt>
                              <dd className="text-right font-medium text-stone-800">
                                {latestContract?.recipient_name ||
                                  cd.corresponding_author_name ||
                                  "—"}
                              </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-stone-200 pb-2">
                              <dt className="text-stone-500">Title</dt>
                              <dd className="truncate text-right font-medium text-stone-800">
                                {latestContract?.title || cd.main_title || title}
                              </dd>
                            </div>
                            {cd.book_type && (
                              <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-stone-200 pb-2">
                                <dt className="text-stone-500">Format</dt>
                                <dd className="text-right font-medium text-stone-800">
                                  {cd.book_type}
                                </dd>
                              </div>
                            )}
                            {cd.expected_completion_date && (
                              <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-stone-200 pb-2">
                                <dt className="text-stone-500">Expected Completion</dt>
                                <dd className="text-right font-medium text-stone-800">
                                  {cd.expected_completion_date}
                                </dd>
                              </div>
                            )}
                          </dl>
                          {latestContract && (
                            <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                              <ContractField label="Status">
                                {(latestContract.status || "—")
                                  .charAt(0)
                                  .toUpperCase() +
                                  (latestContract.status || "").slice(1)}
                              </ContractField>
                              <ContractField label="Contract Type">
                                {latestContract.contract_type
                                  ? latestContract.contract_type
                                      .charAt(0)
                                      .toUpperCase() +
                                    latestContract.contract_type.slice(1)
                                  : "—"}
                              </ContractField>
                              <ContractField label="Version">
                                {latestContract.contract_version ?? "—"}
                              </ContractField>
                              <ContractField label="Recipient">
                                {latestContract.recipient_name ||
                                  cd.corresponding_author_name ||
                                  "—"}
                              </ContractField>
                              <ContractField label="Recipient Email">
                                {latestContract.recipient_email || cd.email || "—"}
                              </ContractField>
                              <ContractField label="Sent">
                                {latestContract.docusign_sent_at
                                  ? formatDate(latestContract.docusign_sent_at)
                                  : "—"}
                              </ContractField>
                              {latestContract.docusign_completed_at && (
                                <ContractField label="Completed">
                                  {formatDate(latestContract.docusign_completed_at)}
                                </ContractField>
                              )}
                              {latestContract.docusign_declined_at && (
                                <ContractField label="Declined">
                                  {formatDate(latestContract.docusign_declined_at)}
                                </ContractField>
                              )}
                              {latestContract.docusign_expires_at &&
                                !latestContract.docusign_completed_at && (
                                  <ContractField label="Expires">
                                    {formatDate(latestContract.docusign_expires_at)}
                                  </ContractField>
                                )}
                            </dl>
                          )}
                          <div className="mt-10 grid grid-cols-2 gap-8 pt-4 font-sans text-xs text-stone-500">
                            <div className="border-t border-stone-300 pt-2">Publisher</div>
                            <div className="border-t border-stone-300 pt-2 text-right">
                              Author
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-center font-sans text-xs text-stone-500">
                          Preview — full contract sent to author by email
                        </p>

                        {latestContract && (
                          <div className="mt-6 flex justify-center">
                            <button
                              type="button"
                              onClick={() => setPdfOpen(true)}
                              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 font-sans text-sm font-semibold text-stone-800 hover:border-stone-300 hover:bg-stone-50"
                            >
                              <Eye className="h-4 w-4 text-stone-500" />
                              View Contract Document
                            </button>
                          </div>
                        )}
                      </div>
                    </Card>


                    {/* Contract Queries — moved from right sidebar */}
                    {contracts.length > 0 && !hasOpenQuery && contractResendPrompt !== "prompt" && contractResendPrompt !== "skip" && (
                      <ContractQueries
                        ticket={ticket}
                        viewer="dr"
                        collapsible
                        defaultOpen={contractQueriesOpen}
                        onOpenChange={setContractQueriesOpen}
                        onChanged={() => setContractsReloadKey((k) => k + 1)}
                      />
                    )}

                    {/* Peer + Decision Reviewer feedback (collapsible) */}
                    {peerReview && (
                      <ReviewFeedbackAccordion
                        title="Original Peer Review Feedback"
                        review={peerReview}
                      />
                    )}
                    {submittedDrReview && (
                      <ReviewFeedbackAccordion
                        title="Final Peer Review Feedback"
                        review={submittedDrReview}
                      />
                    )}

                    {/* Author Question — prominent DR response panel */}
                    {hasOpenQuery && openQuery && (
                      <div ref={authorQuestionRef} className="scroll-mt-24">
                      <Card>
                        <div className="rounded-t-2xl border-b border-teal-200 bg-teal-50/70 px-6 py-4">
                          <h2 className="flex items-center gap-2 font-serif text-base font-bold text-stone-900">
                            <MessageSquare className="h-4 w-4 text-teal-700" />
                            Author Question
                          </h2>
                          <p className="mt-0.5 font-sans text-sm text-teal-800/80">
                            Awaiting your response before the author can sign
                          </p>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                          <div className="rounded-xl border border-teal-200 bg-teal-50/40 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-teal-800">
                                Author's question
                                {openQuery.raised_by_name
                                  ? ` · ${openQuery.raised_by_name}`
                                  : openQuery.raised_by
                                    ? ` · ${displayNameFromEmail(openQuery.raised_by)}`
                                    : ""}
                              </p>
                              <p className="font-sans text-xs text-stone-500">
                                {formatDate(openQuery.created_at)}
                              </p>
                            </div>
                            <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-800">
                              {openQuery.text}
                            </p>
                          </div>

                          <form onSubmit={submitQueryResponse} className="space-y-3">
                            <label className="block font-sans text-sm font-semibold text-stone-800">
                              Your response
                            </label>
                            <textarea
                              value={queryResponseText}
                              onChange={(e) => setQueryResponseText(e.target.value)}
                              rows={5}
                              placeholder="Reply to the author's question…"
                              className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                            />
                            {queryResponseError && (
                              <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
                                {queryResponseError}
                              </p>
                            )}
                            {queryResponseSuccess && (
                              <p className="rounded-lg bg-emerald-50 px-3 py-2 font-sans text-xs text-emerald-700 ring-1 ring-emerald-200">
                                {queryResponseSuccess}
                              </p>
                            )}
                            <button
                              type="submit"
                              disabled={
                                queryResponseSubmitting || !queryResponseText.trim()
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
                            >
                              {queryResponseSubmitting
                                ? "Sending…"
                                : "Send Response"}
                            </button>
                          </form>
                        </div>
                      </Card>
                      </div>
                    )}

                    {/* Collapsible toggle for original proposal */}
                    <button
                      type="button"
                      onClick={() => setOriginalOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-6 py-4 font-sans text-sm font-semibold text-stone-800 hover:border-stone-300"
                      aria-expanded={originalOpen}
                    >
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4 text-stone-500" />
                        View original proposal details
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-stone-500 transition-transform ${originalOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </>
                )}


                {isReviewReturned && !isContractIssued && (
                  <>
                    {/* Review Returned hero */}
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-200 bg-indigo-50 px-5 py-3.5">
                        <div className="min-w-0">
                          <h2 className="font-serif text-base font-bold text-indigo-900">
                            Review Returned
                          </h2>
                          <p className="mt-0.5 font-sans text-xs text-indigo-600">
                            <span>{reviewerDisplayName}</span>
                            {reviewerInstitution && (
                              <span> · {reviewerInstitution}</span>
                            )}
                          </p>
                        </div>
                        {reviewRecommendation && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 font-sans text-xs font-semibold text-amber-800">
                            Recommended: {RECOMMENDATION_LABELS[reviewRecommendation] || reviewRecommendation}
                          </span>
                        )}
                      </div>
                      {reviewerSummary && (
                        <div className="px-7 py-6">
                          <SectionLabel>Reviewer Summary</SectionLabel>
                          <p className="mt-3 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                            {reviewerSummary}
                          </p>
                        </div>
                      )}
                    </Card>

                    {/* Peer Review Comments */}
                    <Card>
                      <CardHeader
                        title="Peer Review Comments"
                        subtitle={`Edit before sending — ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
                      />
                      <div className="space-y-4 px-7 py-6">
                        {comments.length === 0 && (
                          <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center font-sans text-sm text-stone-500">
                            No comments yet. Add one below.
                          </p>
                        )}
                        {comments.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-2xl border border-stone-200 bg-white p-4"
                          >
                            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                              <p className="font-sans text-sm font-semibold text-stone-800">
                                {c.chapter || "Chapter / Section"}
                              </p>
                            </div>
                            <textarea
                              value={c.body}
                              onChange={(e) =>
                                updateComment(c.id, { body: e.target.value })
                              }
                              rows={3}
                              placeholder="Comment…"
                              className="mt-3 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2.5 font-sans text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                            />
                          </div>
                        ))}
                        <div className="mt-2 border-t border-stone-200 pt-5">
                          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-700">
                            Recommendation
                          </p>
                          <div className="mt-3 space-y-3">
                            {Object.entries(RECOMMENDATION_LABELS).map(([key, label]) => {
                              const checked = reviewRecommendation === key;
                              return (
                                <label
                                  key={key}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                                    checked
                                      ? "border-sky-400 bg-sky-50/60 ring-2 ring-sky-100"
                                      : "border-stone-200 bg-white hover:border-stone-300"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="dr-recommendation"
                                    className="mt-1 h-4 w-4 cursor-pointer accent-sky-600"
                                    checked={checked}
                                    onChange={() => setReviewRecommendation(key)}
                                  />
                                  <div className="font-sans text-sm font-semibold text-stone-900">
                                    {label}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={saveCommentsDraft}
                            disabled={savingDraft}
                            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-medium text-stone-700 hover:border-[#0E3D2F] hover:text-[#0E3D2F] disabled:opacity-60"
                          >
                            <Check className="h-4 w-4" />
                            Save draft
                          </button>
                        </div>
                      </div>
                    </Card>


                    {/* Send Review to Author */}

                    {/* Collapsible toggle for original proposal */}
                    <button
                      type="button"
                      onClick={() => setOriginalOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-6 py-4 font-sans text-sm font-semibold text-stone-800 hover:border-stone-300"
                      aria-expanded={originalOpen}
                    >
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4 text-stone-500" />
                        View original proposal details
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-stone-500 transition-transform ${originalOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </>
                )}

                {((!isReviewReturned && !isContractIssued) || originalOpen) && (
                  <>
                <div className="space-y-6 rounded-3xl border border-stone-200 bg-white p-4 sm:p-5">
                {/* Primary Author */}
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-6 px-7 pt-6">
                    <div>
                      <h2 className="font-serif text-xl font-bold text-stone-900">
                        Primary Author / Editor
                      </h2>
                      <p className="mt-1 font-sans text-sm text-stone-500">
                        Institutional affiliation and contact
                      </p>
                    </div>
                    <div className="flex gap-10 font-sans text-sm">
                      {cd.book_type && (
                        <Stat label="Type" value={cd.book_type} />
                      )}
                      {cd.word_count && (
                        <Stat label="Words" value={formatNumber(cd.word_count)} />
                      )}
                      {cd.expected_completion_date && (
                        <Stat label="Completion" value={cd.expected_completion_date} />
                      )}
                    </div>
                  </div>
                  <Divider />
                  <div className="grid grid-cols-1 gap-6 px-7 py-6 md:grid-cols-3">
                    <DataField label="Name" value={cd.corresponding_author_name} />
                    <DataField label="Email" value={cd.email} />
                    <DataField label="Institution" value={cd.institution} />
                    <DataField label="Country" value={cd.country} />
                  </div>
                  {(cd.address || cd.address_line_1 || cd.city || cd.state || cd.postal_code || cd.country) && (
                    <>
                      <Divider />
                      <div className="px-7 py-6">
                        <SectionLabel>Mailing Address</SectionLabel>
                        <p className="mt-2 font-sans text-sm text-stone-800">
                          {[
                            cd.address_line_1,
                            cd.address_line_2,
                            cd.city,
                            cd.state,
                            cd.postal_code,
                            cd.country,
                          ]
                            .filter(Boolean)
                            .join(", ") || cd.address}
                        </p>
                      </div>
                    </>
                  )}
                  {cd.biography && (
                    <>
                      <Divider />
                      <div className="px-7 py-6">
                        <SectionLabel>Biography</SectionLabel>
                        <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-800">
                          {cd.biography}
                        </p>
                      </div>
                    </>
                  )}
                </Card>

                {/* Additional Authors */}
                {(Array.isArray(rawCd.co_authors) && (rawCd.co_authors as unknown[]).length > 0) ? (
                  <Card>
                    <CardHeader
                      title="Co-authors / Editors / Contributors / Translators"
                      subtitle="Additional contributors listed on the proposal"
                    />
                    <ul className="divide-y divide-stone-200">
                      {(rawCd.co_authors as Array<Record<string, unknown>>).map((c, i) => {
                        const name =
                          [c.firstName || c.first_name, c.lastName || c.last_name]
                            .filter(Boolean)
                            .join(" ")
                            .trim() || (c.name as string) || `Contributor ${i + 1}`;
                        return (
                          <li key={i} className="grid grid-cols-1 gap-4 px-7 py-5 sm:grid-cols-4">
                            <DataField label="Role" value={(c.role as string) || "—"} />
                            <DataField label="Name" value={name} />
                            <DataField label="Email" value={(c.email as string) || undefined} />
                            <DataField
                              label="Affiliation"
                              value={(c.institution || c.affiliation) as string | undefined}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ) : cd.co_authors_editors ? (
                  <Card>
                    <CardHeader
                      title="Additional Authors / Editors"
                      subtitle="Co-authors and contributors"
                    />
                    <div className="px-7 py-6">
                      <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                        {cd.co_authors_editors}
                      </p>
                    </div>
                  </Card>
                ) : null}

                {/* Manuscript Details */}
                <Card>
                  <CardHeader title="Manuscript Details" />
                  <div className="grid grid-cols-2 gap-6 px-7 py-6 sm:grid-cols-3">
                    <Stat label="Word Count" value={formatNumber(cd.word_count) || "—"} large />
                    <Stat
                      label="illustrations/figures/tables"
                      value={formatNumber(cd.illustration_count) || "—"}
                      large
                    />
                    <Stat
                      label="Languages"
                      value={cd.languages_used || "—"}
                      large
                    />
                    <Stat
                      label="Est. Completion"
                      value={cd.expected_completion_date || "—"}
                      large
                    />
                    <Stat
                      label="Subject"
                      value={cd.subject || "—"}
                      large
                    />
                  </div>
                  {(cd.intended_audience || cd.manuscript_stage || cd.under_review_elsewhere) && (
                    <div className="flex flex-col gap-5 border-t border-stone-200 px-7 py-6">
                      <DataField label="Intended Audience" value={cd.intended_audience} multiline />
                      <DataField label="Manuscript Stage" value={cd.manuscript_stage} />
                      <DataField
                        label="Under Review Elsewhere"
                        value={cd.under_review_elsewhere}
                      />
                    </div>
                  )}
                </Card>

                {/* Summary & Description */}
                {(cd.short_description || cd.detailed_description || keywords.length > 0) && (
                  <Card>
                    <CardHeader
                      title="Summary & Description"
                      subtitle="Overview, key features and audience"
                    />
                    <div className="space-y-6 px-7 py-6">
                      {cd.short_description && (
                        <div>
                          <SectionLabel>Overview</SectionLabel>
                          <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                            {cd.short_description}
                          </p>
                          {keywords.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {keywords.map((k) => (
                                <span
                                  key={k}
                                  className="inline-flex rounded-full bg-amber-50 px-3 py-1 font-sans text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {cd.detailed_description && (
                        <div className="-mx-7 border-t border-stone-300 px-7 pt-5">
                          <SectionLabel>Key Features & Unique Contribution</SectionLabel>
                          <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                            {cd.detailed_description}
                          </p>
                        </div>
                      )}
                      {cd.key_features && cd.key_features !== cd.detailed_description && (
                        <div className="-mx-7 border-t border-stone-300 px-7 pt-5">
                          <SectionLabel>Key Features / Selling Points</SectionLabel>
                          <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                            {cd.key_features}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Table of Contents */}
                {tocItems.length > 0 && (
                  <Card>
                    <CardHeader
                      title="Table of Contents"
                      subtitle="Is this coherently planned?"
                    />
                    <div className="px-7 py-6">
                      <ol className="space-y-3 rounded-xl bg-stone-50 px-6 py-5 font-sans text-sm text-stone-800">
                        {tocItems.map((item, i) => (
                          <li key={`${i}-${item}`} className="flex gap-3">
                            <span className="text-stone-500">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </Card>
                )}

                {/* Market & Competition */}
                {(cd.competing_titles || cd.unique_contribution || cd.primary_market || cd.conferences || cd.promotional_channels || cd.marketing_info) && (
                  <Card>
                    <CardHeader
                      title="Marketing & Promotion"
                      subtitle="Market positioning, competition and promotion plan"
                    />
                    <div className="space-y-5 px-7 py-6">
                      {cd.primary_market && (
                        <DataField label="Primary Market" value={cd.primary_market} />
                      )}
                      {cd.competing_titles && (
                        <DataField label="Competing Titles" value={cd.competing_titles} multiline />
                      )}
                      {cd.unique_contribution && (
                        <DataField
                          label="Unique Contribution vs Competing Titles"
                          value={cd.unique_contribution}
                          multiline
                        />
                      )}
                      {cd.conferences && (
                        <DataField
                          label="Relevant Conferences / Academic Events"
                          value={cd.conferences}
                          multiline
                        />
                      )}
                      {cd.promotional_channels && (
                        <DataField
                          label="Promotional Channels"
                          value={cd.promotional_channels}
                          multiline
                        />
                      )}
                      {cd.marketing_info &&
                        cd.marketing_info !== cd.competing_titles &&
                        cd.marketing_info !== cd.primary_market && (
                          <DataField
                            label="Additional Marketing Notes"
                            value={cd.marketing_info}
                            multiline
                          />
                        )}
                    </div>
                  </Card>
                )}

                {/* Author-Suggested Reviewers */}
                {suggestedReviewers.length > 0 && (
                  <Card>
                    <CardHeader
                      title="Author-Suggested Reviewers"
                      subtitle="Nominated by the author — for consideration only"
                    />
                    <ol className="divide-y divide-stone-100 px-2 py-2">
                      {suggestedReviewers.map((r, i) => (
                        <li key={`${i}-${r}`} className="flex gap-5 px-5 py-4">
                          <span className="font-sans text-sm font-medium text-stone-500">
                            {i + 1}.
                          </span>
                          <p className="whitespace-pre-line font-sans text-sm text-stone-800">
                            {r}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}

                {/* Additional Notes */}
                {(cd.additional_info || cd.additional_notes || cd.permissions_required) && (
                  <Card>
                    <CardHeader
                      title="Additional Comments & Permissions"
                      subtitle="Copyright, permissions, special considerations"
                    />
                    <div className="space-y-4 px-7 py-6">
                      {cd.additional_notes && (
                        <DataField
                          label="Additional Notes from Author"
                          value={cd.additional_notes}
                          multiline
                        />
                      )}
                      {cd.additional_info && (
                        <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                          {cd.additional_info}
                        </p>
                      )}
                      {cd.permissions_required && (
                        <DataField
                          label="Permissions Required from Copyright Holders"
                          value={cd.permissions_required}
                          multiline
                        />
                      )}
                    </div>
                  </Card>
                )}
                </div>
                  </>
                )}

                {/* Supporting Documents */}
                {((!isReviewReturned && !isContractIssued) || originalOpen) && (
                  <AdditionalProposalDetails rawCd={rawCd} />
                )}

                {/* Supporting Documents */}
                {((!isReviewReturned && !isContractIssued) || originalOpen) && (
                  <Card>
                    <CardHeader
                      title="Supporting Documents"
                      subtitle="Files attached to this proposal"
                    />
                    {proposalDocuments.length === 0 ? (
                      <div className="px-7 py-8 text-center font-sans text-sm text-stone-500">
                        No supporting documents available.
                      </div>
                    ) : (
                      <ul className="divide-y divide-stone-100 px-2 py-2">
                        {proposalDocuments.map((doc, i) => {
                          return (
                            <li key={`${doc.url || doc.filename}-${i}`} className="px-5 py-4">
                              <div className="flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-stone-200 hover:bg-stone-50">
                                {doc.url && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc({ url: doc.url!, filename: doc.filename })}
                                    className="mt-0.5 shrink-0 rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                                    title="Preview document"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                )}
                                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                                <div className="min-w-0 flex-1">
                                  {doc.url ? (
                                    <a
                                      href={doc.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block truncate font-sans text-sm font-semibold text-stone-900 hover:underline"
                                    >
                                      {doc.filename}
                                    </a>
                                  ) : (
                                    <p className="truncate font-sans text-sm font-semibold text-stone-900">
                                      {doc.filename}
                                    </p>
                                  )}
                                  {(doc.label || doc.size_bytes) && (
                                    <p className="mt-1 font-sans text-xs text-stone-500">
                                      {[doc.label, formatFileSize(doc.size_bytes)].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <aside className="space-y-6">
                {/* Editorial Decision */}
                <Card>
                  <div className="border-b border-stone-200 px-5 py-3.5">
                    <h2 className="font-serif text-base font-bold text-stone-900">
                      Editorial Decision
                    </h2>
                    <p className="mt-1 font-sans text-sm text-stone-500">
                      {isContractIssued && hasOpenQuery
                        ? "Author has raised a question"
                        : isContractIssued
                        ? isAwaitingSignature
                          ? "Contract sent — awaiting signature"
                          : (latestContract?.status || "").toLowerCase() === "signed"
                            ? "Contract signed"
                            : "Contract declined"
                        : isAwaitingMoreInfo
                        ? "Revisions requested — awaiting author"
                        : isDeclined
                        ? "Declined"
                        : isReviewReturned
                        ? "Review returned — add notes and send to author"
                        : assignedReviewer
                          ? "With peer reviewer"
                          : "Awaiting initial assessment"}
                    </p>
                  </div>
                  {isContractIssued && hasOpenQuery && (
                    <div className="mx-5 mb-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                        Author Question
                      </p>
                      <p className="mt-1 font-sans text-xs leading-relaxed text-amber-900/90">
                        The author has raised a question before signing. Review
                        their message and respond to proceed.
                      </p>
                    </div>
                  )}
                  {assignedReviewer && !isReviewReturned && !isDeclined && !isContractIssued && (
                    <div className="mx-5 mb-4 rounded-xl bg-indigo-50/70 px-5 py-4 ring-1 ring-indigo-100">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
                        Assigned Reviewer
                      </p>
                      <p className="mt-2 font-serif text-lg font-bold text-stone-900">
                        {assignedReviewer.reviewer_name ||
                          displayNameFromEmail(assignedReviewer.reviewer_email)}
                      </p>
                      {assignedReviewer.reviewer_institution && (
                        <p className="font-sans text-sm italic text-stone-600">
                          {assignedReviewer.reviewer_institution}
                        </p>
                      )}
                      <p className="mt-1 font-sans text-xs text-stone-500">
                        {assignedReviewer.reviewer_email}
                      </p>
                      <p className="mt-1 font-sans text-xs text-stone-500">
                        Assigned {formatDate(assignedReviewer.assigned_at)}
                        {(assignedReviewer.display_status ||
                          assignedReviewer.peer_reviewer_status) && (
                          <>
                            {" · "}
                            {assignedReviewer.display_status ||
                              assignedReviewer.peer_reviewer_status}
                          </>
                        )}
                      </p>
                      {assignedReviewer.reviewer_topics &&
                        assignedReviewer.reviewer_topics.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {assignedReviewer.reviewer_topics.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center rounded-md bg-white/80 px-2.5 py-1 font-sans text-xs font-medium text-indigo-700 ring-1 ring-indigo-100"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      <button
                        type="button"
                        onClick={openReviewers}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
                      >
                        Reassign peer reviewer
                      </button>
                    </div>
                  )}
                  <div className="space-y-3 border-t border-stone-300 px-5 py-4">
                    {data.status?.toLowerCase().replace(/\s+/g, "_") === "author_approved" && (
                      <button
                        type="button"
                        onClick={handleLockProposal}
                        disabled={locking}
                        className="flex w-full items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50/60 px-4 py-3 text-left transition-colors hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <Lock className="mt-0.5 h-4 w-4 text-emerald-700" />
                        <div>
                          <p className="font-sans text-sm font-semibold text-emerald-900">
                            {locking ? "Locking…" : "Lock Proposal"}
                          </p>
                          <p className="font-sans text-xs text-emerald-800/80">
                            Generate production files and lock
                          </p>
                        </div>
                      </button>
                    )}
                    {isDeclined ? (
                      <p className="py-6 text-center font-sans text-sm text-stone-500">
                        No actions available
                      </p>
                    ) : isLocked ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 px-5 py-6 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                          <Lock className="h-5 w-5" strokeWidth={2.5} />
                        </div>
                        <p className="mt-3 font-serif text-lg font-bold text-emerald-900">
                          Proposal Locked
                        </p>
                        <p className="mt-1 font-sans text-xs leading-relaxed text-emerald-800/80">
                          This proposal is locked — no further changes can be made.
                        </p>
                      </div>
                    ) : isContractSigned ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-6 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                          <Check className="h-5 w-5" strokeWidth={2.5} />
                        </div>
                        <p className="mt-3 font-serif text-lg font-bold text-emerald-900">
                          Contract Signed
                        </p>
                        <p className="mt-1 font-sans text-xs leading-relaxed text-emerald-800/80">
                          Author has signed — no further action required
                        </p>
                      </div>
                    ) : isContractIssued ? (
                      <>
                        {isContractExpired && (
                          <>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                              <p className="font-sans text-sm font-semibold text-amber-900">
                                Contract expired
                              </p>
                              <p className="mt-0.5 font-sans text-xs text-amber-800/80">
                                The author did not sign within 15 days
                                {latestContract?.docusign_expires_at
                                  ? ` (expired ${formatDate(latestContract.docusign_expires_at)})`
                                  : ""}
                                . You can send the contract again.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={openIssueContract}
                              className="flex w-full items-start gap-3 rounded-xl bg-[#5B2EBA] px-4 py-3 text-left text-white transition-colors hover:bg-[#4a2599]"
                            >
                              <FileText className="mt-0.5 h-4 w-4 text-white" />
                              <div>
                                <p className="font-sans text-sm font-medium text-white">
                                  Send Contract Again
                                </p>
                                <p className="font-sans text-xs font-normal text-white">
                                  Reissue contract to author (previous one expired)
                                </p>
                              </div>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={handleDecline}
                          disabled={declineLoading}
                          className="flex w-full items-start gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-red-300 hover:bg-red-50/50 disabled:opacity-50"
                        >
                          <XIcon className="mt-0.5 h-4 w-4 text-stone-500" />
                          <div>
                            <p className="font-sans text-sm font-semibold text-stone-900">
                              {declineLoading ? "Declining…" : "Decline"}
                            </p>
                            <p className="font-sans text-xs text-stone-500">Not moving forward</p>
                          </div>
                        </button>
                      </>
                    ) : (
                      <>
                    {isReviewReturned && (
                      <>
                         <button
                           type="button"
                           onClick={openIssueContract}
                           className="flex w-full items-start gap-3 rounded-xl bg-[#5B2EBA] px-4 py-3 text-left text-white transition-colors hover:bg-[#4a2599]"
                         >
                           <FileText className="mt-0.5 h-4 w-4 text-white" />
                           <div>
                             <p className="font-sans text-sm font-medium text-white">Issue Contract</p>
                             <p className="font-sans text-xs font-normal text-white">
                               Send contract &amp; review comments to author
                             </p>
                           </div>
                         </button>
                        <button
                          type="button"
                          onClick={openRequestMajorRevision}
                          className="flex w-full items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-left transition-colors hover:bg-rose-50"
                        >
                          <SquarePen className="mt-0.5 h-4 w-4 text-rose-700" />
                          <div>
                            <p className="font-sans text-sm font-semibold text-rose-900">
                              Request Major Revisions
                            </p>
                            <p className="font-sans text-xs text-rose-700/80">
                              Send review comments back to author
                            </p>
                          </div>
                        </button>
                      </>
                    )}
                    {!assignedReviewer && !isReviewReturned && (
                      <button
                        type="button"
                        onClick={openReviewers}
                        className="flex w-full items-start gap-3 rounded-xl bg-[#0E3D2F] px-4 py-3 text-left text-white transition-colors hover:bg-[#0a2f24]"
                      >
                        <Check className="mt-0.5 h-4 w-4 text-white" />
                        <div>
                          <p className="font-sans text-sm font-semibold">Move to Review</p>
                          <p className="font-sans text-xs text-white/80">Assign a peer reviewer</p>
                        </div>
                      </button>
                    )}
                    {!assignedReviewer && !isReviewReturned && !isAwaitingMoreInfo && (
                      <button
                        type="button"
                        onClick={openRequestRevisions}
                        className="flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:bg-amber-50"
                      >
                        <SquarePen className="mt-0.5 h-4 w-4 text-amber-700" />
                        <div>
                          <p className="font-sans text-sm font-semibold text-amber-900">Request Revisions</p>
                          <p className="font-sans text-xs text-amber-700/80">Needs more info before review</p>
                        </div>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDecline}
                      disabled={declineLoading}
                      className="flex w-full items-start gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-red-300 hover:bg-red-50/50 disabled:opacity-50"
                    >
                      <XIcon className="mt-0.5 h-4 w-4 text-stone-500" />
                      <div>
                        <p className="font-sans text-sm font-semibold text-stone-900">
                          {declineLoading ? "Declining…" : "Decline"}
                        </p>
                        <p className="font-sans text-xs text-stone-500">Not moving forward</p>
                      </div>
                    </button>
                    {declineError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs text-red-700 ring-1 ring-red-200">
                        {declineError}
                      </p>
                    )}
                      </>
                    )}
                  </div>
                </Card>



                {/* Internal Notes */}
                <Card>
                  <div className="border-b border-stone-200 px-5 py-3.5">
                    <h2 className="font-serif text-base font-bold text-stone-900">
                      Internal Notes
                    </h2>
                    <p className="mt-1 font-sans text-sm text-stone-500">
                      Not visible to the author
                    </p>
                  </div>
                  <form onSubmit={onSaveNotes} className="space-y-3 px-5 pb-4 pt-4">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Editorial notes, flags, or comments..."
                      rows={5}
                      className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                    />
                    <button
                      type="submit"
                      disabled={savingNote || !notes.trim()}
                      className="w-full rounded-xl bg-[#3D2A1E] px-4 py-3 font-sans text-sm font-semibold text-white hover:bg-[#2c1e15] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingNote ? "Saving…" : "Add Note"}
                    </button>
                    {notesError && (
                      <p className="text-center font-sans text-xs text-rose-600">
                        {notesError}
                      </p>
                    )}
                  </form>
                  <div className="space-y-3 border-t border-stone-200 px-5 py-4">
                    {notesLoading && internalNotes.length === 0 && (
                      <p className="font-sans text-xs text-stone-500">Loading notes…</p>
                    )}
                    {!notesLoading && internalNotes.length === 0 && !notesError && (
                      <p className="font-sans text-xs text-stone-500">
                        No internal notes yet.
                      </p>
                    )}
                    {internalNotes.map((n) => {
                      const session = getPortalSession();
                      const myEmail = (session?.email || "").toLowerCase();
                      const role = (session?.role || "").toLowerCase();
                      const isOwner =
                        n.created_by?.toLowerCase() === myEmail;
                      const canModify = role === "admin" || isOwner;
                      const isEditing = editingNoteId === n.id;
                      return (
                        <div
                          key={n.id}
                          className="rounded-xl border border-stone-200 bg-stone-50/60 p-3"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="font-sans text-xs font-semibold text-stone-700">
                              {n.created_by_name || n.created_by}
                            </p>
                            <p className="font-sans text-[11px] text-stone-500">
                              {formatDate(n.created_at)}
                            </p>
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                rows={3}
                                className="w-full resize-none rounded-lg border border-stone-300 bg-white px-2.5 py-2 font-sans text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => onUpdateNote(n.id)}
                                  className="rounded-lg bg-[#3D2A1E] px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-[#2c1e15]"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteText("");
                                  }}
                                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap font-sans text-sm text-stone-800">
                                {n.note}
                              </p>
                              {canModify && (
                                <div className="mt-2 flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteId(n.id);
                                      setEditingNoteText(n.note);
                                    }}
                                    className="font-sans text-xs font-semibold text-stone-600 hover:text-stone-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteNote(n.id)}
                                    className="font-sans text-xs font-semibold text-rose-600 hover:text-rose-800"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Submission Info */}
                <Card>
                  <div className="border-b border-stone-200 px-5 py-3.5">
                    <h2 className="font-serif text-base font-bold text-stone-900">
                      Submission Info
                    </h2>
                  </div>
                  <dl className="divide-y divide-stone-100 px-6 pb-5 font-sans text-sm">
                    <InfoRow label="Ref" value={data.ticket_number} />
                    {cd.book_type && <InfoRow label="Type" value={cd.book_type} />}
                    <InfoRow label="Submitted" value={formatDate(data.submitted_at)} />
                    {data.updated_at && (
                      <InfoRow label="Updated" value={formatDate(data.updated_at)} />
                    )}
                    {data.internal_status && (
                      <InfoRow label="Stage" value={data.internal_status} />
                    )}
                  </dl>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>

      {reviewersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4"
          onClick={() => setReviewersOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0E3D2F]">
                  <Check className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-stone-900">
                    Submit for Peer Review
                  </h3>
                  <p className="mt-0.5 font-sans text-sm text-stone-500">
                    Assign a reviewer and set expectations before sending.
                  </p>
                  <p className="mt-1 font-sans text-xs italic text-stone-500">
                    "{title}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewersOpen(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="font-sans text-sm font-semibold text-stone-900">
                Assign Reviewer <span className="text-red-500">*</span>
              </p>

              {reviewersLoading && (
                <p className="mt-4 px-3 py-6 text-center font-sans text-sm text-stone-500">
                  Loading reviewers…
                </p>
              )}
              {reviewersError && !reviewersLoading && (
                <p className="mt-4 px-3 py-6 text-center font-sans text-sm text-red-600">
                  {reviewersError}
                </p>
              )}
              {!reviewersLoading && !reviewersError && reviewers.length === 0 && (
                <p className="mt-4 px-3 py-6 text-center font-sans text-sm text-stone-500">
                  No peer reviewers found.
                </p>
              )}
              {!reviewersLoading && !reviewersError && reviewers.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {reviewers.map((r) => {
                    const checked = selectedReviewerId === r.id;
                    const count = r.assigned_proposals_count ?? 0;
                    return (
                      <li key={r.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                            checked
                              ? "border-[#0E3D2F] bg-[#0E3D2F]/5"
                              : "border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="reviewer"
                            checked={checked}
                            onChange={() => setSelectedReviewerId(r.id)}
                            className="mt-1 h-4 w-4 accent-[#0E3D2F]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-sans text-sm font-semibold text-stone-900">
                                  {r.name || displayNameFromEmail(r.email)}
                                </p>
                                <p className="truncate font-sans text-xs text-stone-500">
                                  {r.email}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium ring-1 ${
                                  count > 0
                                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                                    : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                }`}
                              >
                                {count > 0 ? `${count} active` : "Available"}
                              </span>
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Review Due Date */}
              <div className="mt-6">
                <div className="flex items-baseline justify-between">
                  <label className="font-sans text-sm font-semibold text-stone-900">
                    Review Due Date
                  </label>
                  <span className="font-sans text-xs text-stone-500">
                    (approx. 4 weeks)
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={reviewDueDate}
                    onChange={(e) => setReviewDueDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                  />
                  <p className="font-sans text-xs text-stone-500">
                    Reviewer will be notified by email with the proposal details.
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-6">
                <label className="font-sans text-sm font-semibold text-stone-900">
                  Notes for Reviewer{" "}
                  <span className="font-normal text-stone-500">(optional)</span>
                </label>
                <textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  rows={3}
                  placeholder="Any specific areas to focus on, context, or guidance…"
                  className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-6 py-4">
              {(assignError || assignSuccess) && (
                <div
                  className={`mr-auto text-xs font-medium ${
                    assignError ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {assignError || assignSuccess}
                </div>
              )}
              <button
                type="button"
                onClick={() => setReviewersOpen(false)}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 font-sans text-sm font-semibold text-stone-800 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedReviewerId || assigning}
                onClick={handleAssignReviewer}
                className="rounded-xl bg-[#0E3D2F] px-4 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#0a2f24] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
              >
                {assigning ? "Assigning…" : "Confirm & Assign Reviewer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reqRevOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 py-8">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <SquarePen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#2C1A0E]">
                    {reqRevMode === "major" ? "Request Major Revision" : "Request Revisions"}
                  </h2>
                  <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
                    Specify what needs to be updated before the proposal can move forward.
                  </p>
                  <p className="mt-1 font-sans text-sm italic text-[#7A6A5A]">"{title}"</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReqRevOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-7 pb-5">
              <div className="space-y-4">
                <p className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Revision Requests <span className="text-rose-600">*</span>
                </p>
                {reqRevEntries.map((entry, idx) => {
                  const takenKeys = reqRevEntries
                    .filter((e) => e.id !== entry.id)
                    .map((e) => e.key)
                    .filter(Boolean);
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-stone-200 bg-stone-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                          Revision {idx + 1}
                        </span>
                        {reqRevEntries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRevisionEntry(entry.id)}
                            className="font-sans text-xs font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="mt-3">
                        <label className="font-sans text-xs font-semibold text-[#2C1A0E]">
                          Area
                        </label>
                        <select
                          value={entry.key}
                          onChange={(e) =>
                            updateRevisionEntry(entry.id, { key: e.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                        >
                          <option value="">Select an area…</option>
                          {REVISION_AREAS.filter(
                            (a) => a.key === entry.key || !takenKeys.includes(a.key),
                          ).map((a) => (
                            <option key={a.key} value={a.key}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-3">
                        <label className="font-sans text-xs font-semibold text-[#2C1A0E]">
                          Feedback
                        </label>
                        <textarea
                          value={entry.note}
                          onChange={(e) =>
                            updateRevisionEntry(entry.id, { note: e.target.value })
                          }
                          rows={3}
                          placeholder="Explain what needs to be updated and why…"
                          className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                        />
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addRevisionEntry}
                  disabled={reqRevEntries.length >= REVISION_AREAS.length}
                  className="w-full rounded-xl border border-dashed border-amber-400 bg-amber-50/50 px-4 py-2.5 font-sans text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add new revision
                </button>
              </div>
              <div className="mt-5">
                <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Resubmission Deadline{" "}
                  <span className="font-normal text-[#7A6A5A]">(optional)</span>
                </label>
                <input
                  type="date"
                  value={reqRevDeadline}
                  onChange={(e) => setReqRevDeadline(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
              </div>
              {reqRevError && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                  {reqRevError}
                </p>
              )}
              {reqRevSuccess && (
                <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700 ring-1 ring-emerald-200">
                  {reqRevSuccess}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-7 py-4">
              <button
                type="button"
                onClick={() => setReqRevOpen(false)}
                className="rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRequestRevisions}
                disabled={
                  reqRevSubmitting ||
                  reqRevEntries.length === 0 ||
                  reqRevEntries.some((e) => !e.key || !e.note.trim())
                }
                className="rounded-xl bg-[#C97A6A] px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#b56656] disabled:cursor-not-allowed disabled:bg-[#E9C8C0] disabled:text-white/80"
              >
                {reqRevSubmitting ? "Sending…" : "Send Revision Request"}
              </button>
            </div>
          </div>
        </div>
      )}
      {declineConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 py-8">
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#2C1A0E]">
                    Decline Proposal
                  </h2>
                  <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
                    This action cannot be undone and the proposal will become read-only.
                  </p>
                  <p className="mt-1 font-sans text-sm italic text-[#7A6A5A]">
                    &ldquo;{title}&rdquo;
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeclineConfirmOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="px-7 pb-5">
              <p className="font-sans text-sm text-stone-700">
                Are you sure you want to decline this proposal? The author will be notified and the proposal status will be set to <strong>Declined</strong>.
              </p>
              {declineError && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                  {declineError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-7 py-4">
              <button
                type="button"
                onClick={() => setDeclineConfirmOpen(false)}
                className="rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDecline}
                disabled={declineLoading}
                className="rounded-xl bg-rose-600 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 disabled:text-white/80"
              >
                {declineLoading ? "Declining…" : "Decline Proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
      {contractOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 py-8">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE7FA] text-[#5B2EBA]">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#2C1A0E]">
                    Issue Contract &amp; Feedback
                  </h2>
                  <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
                    Send the review outcome and contract to the author.
                  </p>
                  <p className="mt-1 font-sans text-sm italic text-[#7A6A5A]">
                    &ldquo;{title}&rdquo;
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContractOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-7 pb-5">
              <div className="rounded-xl bg-[#F3EEFB] px-4 py-3 font-sans text-sm text-[#5B2EBA] ring-1 ring-[#E0D4F5]">
                The contract and peer review comments will be sent to the author
                simultaneously. They will be able to review, raise questions, or sign.
              </div>
              {contractStep === 1 && (
              <div className="mt-5">
                <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Note to Author{" "}
                  <span className="font-normal text-[#7A6A5A]">
                    (optional — included with the contract)
                  </span>
                </label>
                <textarea
                  value={contractNote}
                  onChange={(e) => setContractNote(e.target.value)}
                  rows={4}
                  placeholder="Any additional context or guidance for the author ahead of signing…"
                  className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                />
              </div>
              )}
              {contractStep === 2 && (
                <div className="mt-5 space-y-4">
                  <h3 className="font-serif text-lg font-bold text-[#2C1A0E]">
                    Contract Details
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Title <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={contractFields.title}
                        onChange={(e) =>
                          setContractFields((f) => ({ ...f, title: e.target.value }))
                        }
                        placeholder="Book title"
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Subtitle
                      </label>
                      <input
                        type="text"
                        value={contractFields.subtitle}
                        onChange={(e) =>
                          setContractFields((f) => ({ ...f, subtitle: e.target.value }))
                        }
                        placeholder="Optional subtitle"
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Language <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={contractFields.language}
                        onChange={(e) =>
                          setContractFields((f) => ({ ...f, language: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Publishing Agreement <span className="text-rose-600">*</span>
                      </label>
                      <textarea
                        value={contractFields.publishing_agreement}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            publishing_agreement: e.target.value,
                          }))
                        }
                        rows={3}
                        className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Author Copies <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={contractFields.author_copies}
                        onChange={(e) =>
                          setContractFields((f) => ({ ...f, author_copies: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        If Two Authors — Copies Each <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={contractFields.if_two_author_copies}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            if_two_author_copies: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        If 3–4 Authors — Copies Each <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={contractFields.if_three_or_four_author_copies}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            if_three_or_four_author_copies: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Copies Sold Revenue (%) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={contractFields.copies_sold_revenue}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            copies_sold_revenue: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Secondary Rights Revenue (%) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={contractFields.secondary_rights_revenue}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            secondary_rights_revenue: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Addendum <span className="font-normal text-[#7A6A5A]">(optional)</span>
                      </label>
                      <textarea
                        value={contractAmendments}
                        onChange={(e) => setContractAmendments(e.target.value)}
                        rows={3}
                        placeholder="This agreement is subject to the following additional terms: ..."
                        className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      />
                    </div>
                  </div>
                </div>
              )}
              {contractError && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                  {contractError}
                </p>
              )}
              {contractSuccess && (
                <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700 ring-1 ring-emerald-200">
                  {contractSuccess}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-7 py-4">
              <button
                type="button"
                onClick={() => setContractOpen(false)}
                className="rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitIssueContract}
                disabled={contractLoading}
                className="rounded-xl bg-[#5B2EBA] px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:cursor-not-allowed disabled:bg-[#B8A8E0] disabled:text-white/80"
              >
                {contractLoading
                  ? "Issuing…"
                  : contractStep === 1
                    ? "Submit"
                    : "Issue Contract"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ContractPdfModal ticket={ticket} open={pdfOpen} onClose={() => setPdfOpen(false)} />
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-stone-200 px-5 py-3">
            <div className="flex-1">
              <DialogTitle className="truncate font-sans text-sm font-semibold text-stone-900">
                {previewDoc?.filename}
              </DialogTitle>
              <DialogDescription className="sr-only">Document preview</DialogDescription>
            </div>
            {previewDoc?.url && (
              <a
                href={previewDoc.url}
                download={previewDoc.filename}
                title="Download file"
                className="ml-4 mr-4 flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-stone-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            )}
          </DialogHeader>
          {previewDoc && (() => {
            const url = previewDoc.url;
            const ext = (previewDoc.filename.split(".").pop() || "").toLowerCase();
            const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
            const isPdf = ext === "pdf" || url.toLowerCase().includes(".pdf");
            const isOffice = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
            return (
              <div className="h-[75vh] w-full bg-stone-100">
                {isImage ? (
                  <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                    <img src={url} alt={previewDoc.filename} className="max-h-full max-w-full object-contain" />
                  </div>
                ) : isPdf ? (
                  <iframe src={url} title={previewDoc.filename} className="h-full w-full" />
                ) : isOffice ? (
                  <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                    title={previewDoc.filename}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <FileText className="h-10 w-10 text-stone-400" />
                    <p className="font-sans text-sm text-stone-600">
                      Preview isn't available for this file type.
                    </p>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-stone-900 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-stone-800"
                    >
                      Open in new tab
                    </a>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {voidOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-lg font-bold text-stone-900">
              Void Contract
            </h2>
            <p className="mt-1 font-sans text-sm text-stone-600">
              The author will no longer be able to sign. You can issue a new contract afterwards.
            </p>
            <label className="mt-4 block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Reason
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder="Why is this contract being voided?"
              className="mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
            />
            {voidError && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
                {voidError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={voidLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {voidLoading ? "Voiding…" : "Void Contract"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Popup: send contract again after query resolved */}
      <Dialog
        open={contractResendPrompt === "prompt"}
        onOpenChange={(open) => {
          if (!open) setContractResendPrompt("skip");
        }}
      >
        <DialogContent className="max-w-md bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Send Contract Again?</DialogTitle>
            <DialogDescription>
              The author&apos;s question has been answered. Do you want to send the contract again?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setContractResendPrompt("send");
                openIssueContract();
              }}
              className="inline-flex items-center rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599]"
            >
              Send Contract
            </button>
            <button
              type="button"
              onClick={() => setContractResendPrompt("skip")}
              className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Not Now
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaItem({ icon, text }: { icon: "user" | "mail" | "building" | "calendar" | "globe"; text: string }) {
  const paths: Record<typeof icon, string> = {
    user:
      "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
    mail: "M4 6h16v12H4z M4 6l8 7 8-7",
    building: "M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M9 9h2M9 13h2M9 17h2",
    calendar:
      "M4 7h16M4 7v12a2 2 0 002 2h12a2 2 0 002-2V7M4 7l1-3h14l1 3M9 11h6M9 15h6",
    globe:
      "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18",
  };
  return (
    <span className="inline-flex items-center gap-2 text-stone-600">
      <svg
        className="h-4 w-4 text-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[icon]} />
      </svg>
      {text}
    </span>
  );
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-stone-200 bg-white ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function Divider() {
  return <hr className="border-stone-100" />;
}

function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-stone-200 bg-neutral-50/30 px-5 py-3.5">
      <div>
        <h2 className="font-serif text-base font-bold text-[#2C1A0E]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">{subtitle}</p>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs uppercase tracking-wide text-stone-500">
      {children}
    </p>
  );
}

function DataField({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <SectionLabel>{label}</SectionLabel>
      <p
        className={`mt-1.5 font-sans text-sm font-semibold text-stone-900 break-words ${
          multiline ? "whitespace-pre-line font-normal text-stone-800 leading-relaxed" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  large,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="font-sans text-xs uppercase tracking-wide text-stone-500 break-words">
        {label}
      </p>
      <p
        className={`mt-1 font-sans font-semibold text-stone-900 ${
          large ? "text-base" : "text-sm"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="font-sans text-sm text-stone-500">{label}</dt>
      <dd className="font-sans text-sm font-semibold text-stone-900">{value}</dd>
    </div>
  );
}

function formatNumber(s?: string): string {
  if (!s) return "";
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n === 0) return s;
  return n.toLocaleString();
}

// Camel/PascalCase → snake_case (preserves digits)
function toSnake(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

// Flatten the nested submission shape (authors[], mailing{}, book{},
// description{}, marketing{}, agreement{}, manuscript{}) into the flat
// snake_case shape the rest of the detail page expects. Existing flat
// fields always win — we never overwrite values already on the payload.
function normalizeProposalData(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const setIfEmpty = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    const existing = out[key];
    if (existing === undefined || existing === null || existing === "") {
      out[key] = value;
    }
  };

  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  // authors[] — first entry maps onto the primary author fields,
  // the rest become co_authors.
  const authors = raw.authors;
  if (Array.isArray(authors) && authors.length > 0) {
    const primary = authors.find(
      (a) => isObj(a) && String(a.role || "").toLowerCase() === "author",
    ) || authors[0];
    if (isObj(primary)) {
      const first = (primary.firstName || primary.first_name) as
        | string
        | undefined;
      const last = (primary.lastName || primary.last_name) as
        | string
        | undefined;
      setIfEmpty("author_first_name", first);
      setIfEmpty("author_last_name", last);
      setIfEmpty(
        "corresponding_author_name",
        [first, last].filter(Boolean).join(" ").trim() || undefined,
      );
      setIfEmpty("email", primary.email);
      setIfEmpty("phone", primary.phone);
      setIfEmpty("institution", primary.institution);
      setIfEmpty("country", primary.country);
      setIfEmpty("biography", primary.biography);
      setIfEmpty("author_title", primary.position || primary.title);
    }
    const others = (authors as unknown[]).filter((a) => a !== primary);
    if (others.length > 0) {
      setIfEmpty("co_authors", others);
    }
  }

  // mailing{} → address (single line)
  const mailing = raw.mailing;
  if (isObj(mailing)) {
    const parts = [
      mailing.addressLine1 || mailing.address_line_1,
      mailing.addressLine2 || mailing.address_line_2,
      mailing.city,
      mailing.state,
      mailing.postalCode || mailing.postal_code,
      mailing.country,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    if (parts.length) setIfEmpty("address", parts.join(", "));
    setIfEmpty("country", mailing.country);
  }

  // book{}, description{}, marketing{}, manuscript{}, agreement{}
  // — copy each leaf field across with snake_case keys.
  const flatGroups = ["book", "description", "marketing", "manuscript", "agreement"];
  for (const group of flatGroups) {
    const g = raw[group];
    if (!isObj(g)) continue;
    for (const [k, v] of Object.entries(g)) {
      setIfEmpty(toSnake(k), v);
    }
  }

  // Aliases so the existing pick() lookups resolve.
  if (isObj(raw.book)) {
    const b = raw.book as Record<string, unknown>;
    setIfEmpty("main_title", b.title);
    setIfEmpty("sub_title", b.subtitle);
    setIfEmpty("book_type", b.type);
    setIfEmpty("word_count", b.wordCount || b.estimatedWordCount);
    setIfEmpty("illustration_count", b.illustrationsCount || b.figuresCount || b.illustrationCount);
    setIfEmpty("languages_used", b.languages || b.language);
  }
  if (isObj(raw.description)) {
    const d = raw.description as Record<string, unknown>;
    setIfEmpty("abstract_blurb", d.abstract || d.summary);
    setIfEmpty("short_description", d.summary || d.abstract);
    setIfEmpty("key_features", d.keyFeatures || d.sellingPoints);
    setIfEmpty("table_of_contents", d.tableOfContents || d.toc);
    setIfEmpty("intended_audience", d.intendedAudience || d.audience);
  }
  if (isObj(raw.marketing)) {
    const m = raw.marketing as Record<string, unknown>;
    setIfEmpty("competing_titles", m.competingTitles);
    setIfEmpty("unique_contribution", m.uniqueContribution);
    setIfEmpty("primary_market", m.primaryMarket);
    setIfEmpty("recommended_reviewers", m.recommendedReviewers);
    setIfEmpty("conferences", m.conferences || m.relevantConferences);
    setIfEmpty("promotional_channels", m.promotionalChannels);
  }
  if (isObj(raw.manuscript)) {
    const m = raw.manuscript as Record<string, unknown>;
    setIfEmpty("manuscript_stage", m.stage || m.currentStage);
    setIfEmpty(
      "expected_completion_date",
      m.expectedSubmission || m.completionDate || m.expectedSubmissionDate,
    );
  }
  if (isObj(raw.agreement)) {
    const a = raw.agreement as Record<string, unknown>;
    setIfEmpty("permissions_required", a.permissions || a.permissionsRequired);
    setIfEmpty("additional_notes", a.notes || a.additionalNotes);
  }
  // primary author auxiliary fields from authors[0]
  if (Array.isArray(raw.authors) && raw.authors.length > 0) {
    const primary = (raw.authors as unknown[]).find(
      (a) => isObj(a) && String((a as Record<string, unknown>).role || "").toLowerCase() === "author",
    ) || raw.authors[0];
    if (isObj(primary)) {
      setIfEmpty("qualifications", primary.qualifications);
      setIfEmpty("phone", primary.phone);
    }
  }

  return out;
}

const ADDITIONAL_DETAILS_SKIP = new Set<string>([
  "main_title",
  "title",
  "sub_title",
  "subtitle",
  "book_type",
  "corresponding_author_name",
  "author_first_name",
  "author_last_name",
  "email",
  "secondary_email",
  "email_2",
  "phone",
  "phone_number",
  "qualifications",
  "academic_qualifications",
  "professional_qualifications",
  "institution",
  "job_title",
  "author_title",
  "address",
  "address_line_1",
  "address_line_2",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "region",
  "province",
  "county",
  "postal_code",
  "zip",
  "zip_code",
  "country",
  "languages_used",
  "languages",
  "language",
  "intended_audience",
  "audience",
  "manuscript_stage",
  "stage",
  "current_stage",
  "expected_submission_date",
  "submission_date",
  "competing_titles",
  "unique_contribution",
  "primary_market",
  "market",
  "conferences",
  "relevant_conferences",
  "promotional_channels",
  "promotion_channels",
  "additional_notes",
  "additional_comments",
  "notes",
  "authors",
  "mailing",
  "book",
  "description",
  "marketing",
  "manuscript",
  "agreement",
  "biography",
  "co_authors_editors",
  "co_authors",
  "word_count",
  "estimated_word_count",
  "figures_tables_count",
  "illustration_count",
  "has_tables",
  "has_illustrations",
  "under_review_elsewhere",
  "is_previously_published",
  "expected_completion_date",
  "estimated_completion_date",
  "short_description",
  "detailed_description",
  "detailed_description_extra",
  "key_features",
  "unique_selling_points",
  "keywords",
  "marketing_info",
  "primary_market",
  "target_audience",
  "competing_titles",
  "referees_reviewers",
  "recommended_reviewers",
  "additional_info",
  "conferences",
  "promotional_channels",
  "permissions_required",
  "table_of_contents",
  "manuscript_files",
  "documents",
  "supporting_documents",
  "files",
  "attachments",
  "source",
  "website_reference_number",
  "author_cv",
  "author_cv_url",
  "cv",
  "cv_url",
  "subject",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v ?? "")))
      .filter((s) => s && s !== "[]" && s !== "{}");
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s && s !== "{}" && s !== "[]" ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

function AdditionalProposalDetails({ rawCd }: { rawCd: Record<string, unknown> }) {
  const entries = Object.entries(rawCd)
    .filter(([k]) => !ADDITIONAL_DETAILS_SKIP.has(k))
    .map(([k, v]) => [k, formatDetailValue(v)] as const)
    .filter(([, v]) => v !== null) as Array<[string, string]>;

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Additional Proposal Information"
        subtitle="All other details submitted with this proposal"
      />
      <div className="grid grid-cols-1 gap-5 px-7 py-6 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <DataField
            key={key}
            label={humanizeKey(key)}
            value={value}
            multiline={value.length > 80 || value.includes("\n")}
          />
        ))}
      </div>
    </Card>
  );
}