import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronDown, FileText, Check, X, Calendar, Send, Save, AlertCircle, Upload, Paperclip, Download, HelpCircle, CheckCircle2, LogOut, Eye } from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { initialsFromName, type StatusKey } from "@/lib/proposals";
import { portalLogout, getPortalSession, getPortalToken } from "@/lib/auth";
import { proposalApiFetch } from "@/lib/proposalApi";
import {
  getContract,
  getSigningUrl,
  type ContractDetail,
} from "@/lib/contractsApi";
import { getQueries, raiseQuery } from "@/lib/contractsApi";
import { ContractPdfModal } from "@/components/contract-pdf-modal";
import { ContractQueries } from "@/components/contract-queries";
import { AuthorMetadataPanel } from "@/components/author-metadata-panel";

export const Route = createFileRoute("/dashboard/author_proposal/$id")({
  head: () => ({ meta: [{ title: "Proposal Details — Author Portal" }] }),
  component: AuthorProposalDetails,
});

const STATUS_MAP: Record<string, StatusKey> = {
  new: "submitted",
  submitted: "submitted",
  in_review: "in_review",
  peer_review: "in_review",
  review_returned: "review_returned",
  contract_issued: "contract",
  contract_received: "contract",
  awaiting_author_approval: "contract",
  queries_raised: "question",
  question_raised: "question",
  author_approved: "approved",
  locked: "approved",
  contract_signed: "signed",
  confirmed_and_finalised: "approved",
  confirmed_and_finalized: "approved",
  final_review_and_confirmation: "approved",
  feedback_and_contract_issued: "contract",
  declined: "declined",
  awaiting_more_info: "revisions",
  revisions_requested: "revisions",
  major_revisions: "major_revisions",
};

// Reviewer comment display config (mirrors DR dashboard)
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

const SECTION_SEVERITY: Record<string, string> = {
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

const SECTION_PAGES: Record<string, string> = {
  scope: "pp. 1–8",
  purpose_value: "pp. 9–16",
  title: "Cover",
  originality: "pp. 17–24",
  credibility: "pp. 25–32",
  structure: "pp. 33–48",
  clarity_quality: "pp. 49–64",
  other_comments: "—",
  red_flags: "—",
};

const SEVERITY_TOKENS: Record<string, string> = {
  General: "bg-stone-100 text-stone-700",
  "Minor Concern": "bg-amber-50 text-amber-800",
  "Major Concern": "bg-rose-50 text-rose-800",
  Suggestion: "bg-sky-50 text-sky-800",
  Question: "bg-violet-50 text-violet-800",
};

type AuthorReview = {
  reviewer_name?: string;
  reviewer_email?: string;
  reviewer_role?: string;
  is_submitted?: boolean;
  review_data?: Record<string, unknown>;
};

function ReviewerCommentsList({ ticket }: { ticket: string }) {
  const [reviews, setReviews] = useState<AuthorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
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
          setNotFound(true);
          return;
        }
        const list = Array.isArray(body.reviews)
          ? (body.reviews as AuthorReview[])
          : body.review
            ? [body.review as AuthorReview]
            : [];
        const submitted = list.filter((r) => r.is_submitted);
        setReviews(submitted);
        if (submitted.length === 0) setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket]);

  if (loading) return null;

  // Prefer the Decision Reviewer's submitted version when available.
  const primary =
    reviews.find((r) => (r.reviewer_role || "").toLowerCase() === "decision_reviewer") ||
    reviews[0];
  const rd = (primary?.review_data || {}) as Record<string, unknown>;
  const drNote = typeof rd.dr_note === "string" ? rd.dr_note.trim() : "";
  const recommendation =
    typeof rd.recommendation === "string" ? rd.recommendation.trim() : "";
  const recLabel = recommendation
    ? recommendation
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  const recTone = (() => {
    const r = recommendation.toLowerCase();
    if (r === "proceed" || r === "accept")
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (r === "reject" || r === "decline")
      return "bg-rose-50 text-rose-700 ring-rose-200";
    if (r.includes("revision") || r.includes("info"))
      return "bg-amber-50 text-amber-800 ring-amber-200";
    return "bg-stone-100 text-stone-700 ring-stone-200";
  })();

  const items = REVIEW_SECTIONS.map(({ key, label }) => {
    const v = rd[key];
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) return null;
    return {
      key,
      label,
      text,
      severity: SECTION_SEVERITY[key] || "General",
      page: SECTION_PAGES[key] || "",
    };
  }).filter(Boolean) as { key: string; label: string; text: string; severity: string; page: string }[];

  const header =
    (drNote || recLabel) && (
      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-5">
        {recLabel && (
          <div className="flex items-center gap-2">
            <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-violet-700">
              Editor's Recommendation
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-semibold ring-1 ${recTone}`}
            >
              {recLabel}
            </span>
          </div>
        )}
        {drNote && (
          <>
            <p className="mt-3 font-sans text-[11px] font-bold uppercase tracking-wider text-violet-700">
              Note from your editor
            </p>
            <p className="mt-1.5 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
              {drNote}
            </p>
          </>
        )}
      </div>
    );

  if (items.length === 0) {
    if (notFound || !primary) {
      return (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white/60 p-5 text-center">
          <p className="font-sans text-sm text-stone-600">
            No detailed peer reviewer comments were attached to your proposal.
            Refer to the overall assessment above and your editor's note below.
          </p>
        </div>
      );
    }
    return header || null;
  }

  return (
    <div className="mt-4 space-y-3">
      {header}
      {items.map((it) => (
        <div key={it.key} className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="font-serif text-[15px] font-bold text-[#2C1A0E]">
                {it.label}
              </span>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-line font-sans text-[14px] leading-relaxed text-stone-700">
            {it.text}
          </p>
        </div>
      ))}
    </div>
  );
}

const DISPLAY_STATUS_MAP: Record<string, StatusKey> = {
  "in review": "in_review",
  "under review": "in_review",
  "peer review": "in_review",
  "review returned": "review_returned",
  "contract issued": "contract",
  "contract received": "contract",
  "awaiting author approval": "contract",
  "queries raised": "question",
  "question raised": "question",
  "author approved": "approved",
  "contract signed": "signed",
  "awaiting more info": "revisions",
  "additional info required": "revisions",
  "revisions requested": "revisions",
  "major revisions required": "major_revisions",
  "major revisions": "major_revisions",
  "confirmed & finalised": "approved",
  "confirmed & finalized": "approved",
};

function normalizeStatus(raw?: string, display?: string): StatusKey {
  if (display) {
    const k = display.trim().toLowerCase();
    if (DISPLAY_STATUS_MAP[k]) return DISPLAY_STATUS_MAP[k];
  }
  if (raw) {
    const lower = raw.trim().toLowerCase();
    const snake = lower
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (STATUS_MAP[snake]) return STATUS_MAP[snake];
    if (DISPLAY_STATUS_MAP[lower]) return DISPLAY_STATUS_MAP[lower];
  }
  return "submitted";
}

function statusFromTimeline(timeline?: TimelineStage[]): StatusKey | undefined {
  if (!timeline || timeline.length === 0) return undefined;
  const current = timeline.find((t) => t.is_current);
  if (!current) return undefined;
  const name = `${current.stage_name || ""} ${current.display_name || ""}`.toLowerCase();
  if (name.includes("contract") || name.includes("sign") || name.includes("approval") || name.includes("awaiting author")) return "contract";
  if (name.includes("peer review") || name.includes("under review") || name.includes("in review")) return "in_review";
  if (name.includes("review returned") || name.includes("feedback")) return "review_returned";
  if (name.includes("declin") || name.includes("reject")) return "declined";
  if (name.includes("major revision")) return "major_revisions";
  if (name.includes("revision") || name.includes("more info") || name.includes("additional info")) return "revisions";
  if (name.includes("query") || name.includes("question")) return "question";
  if (name.includes("confirm") || name.includes("final") || name.includes("publish")) return "signed";
  if (name.includes("submit") || name.includes("new")) return "submitted";
  return undefined;
}

const STATUS_LABEL: Record<StatusKey, string> = {
  submitted: "Submitted",
  revisions: "Revisions Requested",
  in_review: "Under Review",
  review_returned: "Review Returned",
  major_revisions: "Major Revisions Required",
  question: "Question Raised",
  contract: "Contract Issued",
  signed: "Contract Signed",
  approved: "Metadata Approved",
  declined: "Declined",
};

const STATUS_TINT: Record<StatusKey, { bg: string; text: string; dot: string }> = {
  submitted: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  revisions: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  in_review: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  review_returned: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  major_revisions: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  question: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  contract: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  signed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  declined: { bg: "bg-stone-100", text: "text-stone-600", dot: "bg-stone-400" },
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMonthYear(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

type ManuscriptFile = { url: string; filename: string; size_bytes?: number };
type ManuscriptFiles = {
  sampleChapter?: ManuscriptFile;
  additionalFiles?: ManuscriptFile[];
};

type InfoRequestItem = {
  key?: string;
  label?: string;
  response_text?: string;
  note?: string;
};

type InfoRequestFile = {
  url?: string;
  filename?: string;
  size_bytes?: number;
};

type InfoRequest = {
  id?: string | number;
  status?: string;
  note?: string;
  message?: string;
  resubmission_deadline?: string;
  deadline?: string;
  created_at?: string;
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

type CurrentData = Record<string, unknown> & {
  main_title?: string;
  sub_title?: string;
  proposed_title?: string;
  proposed_subtitle?: string;
  book_type?: string;
  subject?: string;
  secondary_subjects?: string[];
  language?: string;
  corresponding_author_name?: string;
  author_first_name?: string;
  author_last_name?: string;
  author_title?: string;
  email?: string;
  phone?: string;
  secondary_email?: string;
  job_title?: string;
  address?: string;
  institution?: string;
  country?: string;
  biography?: string;
  co_authors?: unknown[];
  co_authors_editors?: string;
  estimated_word_count?: number;
  word_count?: number | string;
  estimated_pages?: number | null;
  estimated_completion_date?: string;
  expected_completion_date?: string;
  has_tables?: boolean;
  has_illustrations?: boolean;
  illustration_count?: number;
  number_of_illustrations?: number | string;
  figures_tables_count?: number | string;
  is_previously_published?: boolean;
  under_review_elsewhere?: string | boolean;
  permissions_required?: string | boolean;
  detailed_description?: string;
  short_description?: string;
  overview?: string;
  table_of_contents?: string;
  key_features?: string;
  unique_selling_points?: string;
  target_audience?: string;
  marketing_info?: string;
  unique_contribution?: string;
  additional_info?: string;
  keywords?: string;
  primary_market?: string;
  competing_titles?: string;
  conferences?: string;
  promotional_channels?: string;
  recommended_reviewers?: string;
  referees_reviewers?: string;
  website_reference_number?: string;
  source?: string;
  manuscript_files?: ManuscriptFiles;
};

type TimelineStage = {
  stage_name: string;
  display_name: string;
  completed_at?: string | null;
  started_at?: string | null;
  is_current?: boolean;
  is_completed?: boolean;
};

type ProposalState = {
  ticket: string;
  status?: string;
  displayStatus?: string;
  submittedAt?: string;
  updatedAt?: string;
  internalStatus?: string;
  websiteRef?: string;
  timeline?: TimelineStage[];
  cd: CurrentData;
  infoRequests?: InfoRequest[];
};

function AuthorProposalDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const [authorName, setAuthorName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      if (session.role !== "author") {
        navigate({ to: "/login" });
        return;
      }
      if (session.name) setAuthorName(session.name);
    } catch {
      navigate({ to: "/login" });
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = getPortalToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await proposalApiFetch(`/${encodeURIComponent(id)}`, { headers });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          if (!cancelled) {
            setLoadError((body.error as string) || `Failed to load proposal (${res.status}).`);
            setLoading(false);
          }
          return;
        }
        const cd = (body.current_data as CurrentData) || {};
        if (!cancelled) {
          setProposal({
            ticket: (body.ticket_number as string) || id,
            status: body.status as string | undefined,
            displayStatus: body.display_status as string | undefined,
            submittedAt: body.submitted_at as string | undefined,
            updatedAt: body.updated_at as string | undefined,
            internalStatus: body.internal_status as string | undefined,
            timeline: (body.timeline as TimelineStage[]) || [],
            cd,
            infoRequests:
              (body.info_requests as InfoRequest[]) ||
              (body.request_info as InfoRequest[]) ||
              [],
          });
          setLoading(false);
        }
        // Fetch info-requests (revision requests) from the dedicated endpoint.
        try {
          const r2 = await proposalApiFetch(
            `/${encodeURIComponent(id)}/request-info`,
            { headers },
          );
          const b2 = (await r2.json().catch(() => ({}))) as Record<string, unknown>;
          if (!cancelled && r2.ok) {
            const raw = (b2.requests as Array<Record<string, unknown>>) || [];
            const normalizeDraft = (
              raw: unknown,
              items: InfoRequestItem[],
            ): InfoRequest["draft"] => {
              if (!raw || typeof raw !== "object") return null;
              const obj = raw as Record<string, unknown>;
              // Already in expected shape
              if (Array.isArray(obj.items)) {
                return {
                  note: obj.note as string | undefined,
                  items: obj.items as InfoRequestItem[],
                  files: (obj.files as InfoRequestFile[]) || [],
                };
              }
              // Shape stored as { updated_fields: { key: value } } or flat map
              const fields =
                (obj.updated_fields as Record<string, string> | undefined) ||
                (obj.fields as Record<string, string> | undefined) ||
                (obj as Record<string, string>);
              const draftItems: InfoRequestItem[] = items.map((it) => ({
                ...it,
                response_text: (fields?.[it.key || ""] as string) || "",
              }));
              const files: InfoRequestFile[] = Array.isArray(obj.files)
                ? (obj.files as InfoRequestFile[])
                : [];
              return {
                note: typeof obj.note === "string" ? (obj.note as string) : undefined,
                items: draftItems,
                files,
              };
            };
            const mapped: InfoRequest[] = raw.map((r) => {
              const items = (r.items as InfoRequestItem[]) || [];
              return {
                id: r.id as string | number | undefined,
                status: r.status as string | undefined,
                note: (r.note as string | undefined) ?? (r.message as string | undefined),
                resubmission_deadline: r.resubmission_deadline as string | undefined,
                deadline: r.deadline as string | undefined,
                created_at: (r.requested_at as string | undefined) ?? (r.created_at as string | undefined),
                items,
                response: r.responded_at
                  ? {
                      note: r.response_note as string | undefined,
                      submitted_at: r.responded_at as string | undefined,
                    }
                  : null,
                draft: normalizeDraft(r.draft_data ?? r.draft, items),
              };
            });
            setProposal((prev) => (prev ? { ...prev, infoRequests: mapped } : prev));
          }
        } catch {
          // ignore — panel just won't render
        }
      } catch {
        if (!cancelled) {
          setLoadError("Network error. Please try again.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, id]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const displayName = authorName || "Author";
  const initials = initialsFromName(displayName);

  return (
    <main className="min-h-screen bg-[#F9F7F2] font-sans text-stone-900">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/author" className="flex items-center gap-3">
              <img src={cspLogo} alt="CSP" width={32} height={32} />
              <span className="font-serif text-xl font-bold text-stone-900">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-base text-stone-700">Author Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0E3D2F] font-sans text-xs font-semibold text-white">
              {initials}
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

      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          to="/dashboard/author"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900 transition-colors mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {loading && (
          <p className="mt-6 text-sm text-stone-500">Loading proposal…</p>
        )}
        {loadError && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        )}

        {!loading && !loadError && proposal && (
          <ProposalBody proposal={proposal} />
        )}
      </div>
    </main>
  );
}

function ProposalBody({ proposal }: { proposal: ProposalState }) {
  const { cd } = proposal;
  const [contractSigned, setContractSigned] = useState(false);
  const [reviewerFeedbackOpen, setReviewerFeedbackOpen] = useState(false);
  const [contractTitleOverride, setContractTitleOverride] = useState<string | undefined>();
  const [contractSubtitleOverride, setContractSubtitleOverride] = useState<string | undefined>();
  const lastContractKeyRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetchProposalTitles = async () => {
      try {
        const token = getPortalToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await proposalApiFetch(`/${encodeURIComponent(proposal.ticket)}`, { headers });
        if (!res.ok) return;
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const cdLatest = (body.current_data as CurrentData) || {};
        if (cancelled) return;
        if (cdLatest.main_title) setContractTitleOverride(cdLatest.main_title);
        if (cdLatest.sub_title) setContractSubtitleOverride(cdLatest.sub_title);
      } catch {
        // ignore
      }
    };
    const load = async () => {
      try {
        const list = await getContract(proposal.ticket);
        if (cancelled) return;
        const latest = list[0];
        if (latest?.title) setContractTitleOverride(latest.title);
        if (latest?.subtitle) setContractSubtitleOverride(latest.subtitle);
        // When a new contract version is detected, refetch the proposal so the
        // title/subtitle that the DR reviewer edited at send time appear here
        // without requiring a manual refresh.
        const key = latest
          ? `${latest.id ?? ""}:${latest.contract_version ?? ""}:${latest.updated_at ?? ""}`
          : "";
        if (key && key !== lastContractKeyRef.current) {
          lastContractKeyRef.current = key;
          await refetchProposalTitles();
        }
        const s = (latest?.status || "").toLowerCase();
        const completed = !!latest?.docusign_completed_at;
        if (s === "signed" || s === "completed" || completed) {
          setContractSigned(true);
          return; // stop polling
        }
        // Keep polling while contract is awaiting signature so the hero
        // flips to "Contract Signed" automatically once DocuSign completes.
        if (s === "sent" || s === "draft") {
          timer = setTimeout(load, 10000);
        }
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [proposal.ticket]);
  const baseStatus = statusFromTimeline(proposal.timeline) || normalizeStatus(proposal.status, proposal.displayStatus);
  // If the author has already approved the metadata, keep the "approved"
  // status even though the underlying contract is signed.
  const status: StatusKey =
    contractSigned && baseStatus !== "approved" ? "signed" : baseStatus;
  const rawApprovalStatus = [proposal.internalStatus, proposal.status, proposal.displayStatus]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const isPostApproval =
    status === "approved" ||
    status === "signed" ||
    rawApprovalStatus.includes("author_approved") ||
    rawApprovalStatus.includes("confirmed_and_finalised") ||
    rawApprovalStatus.includes("confirmed_and_finalized") ||
    rawApprovalStatus.includes("confirmed & finalised") ||
    rawApprovalStatus.includes("confirmed & finalized");
  const tint = STATUS_TINT[status];
  const isContractView =
    status === "contract" || status === "signed" || status === "approved";
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewFile, setPreviewFile] = useState<ManuscriptFile | null>(null);
  const title = contractTitleOverride || cd.main_title || proposal.ticket;
  const subtitle = contractSubtitleOverride || cd.sub_title;
  const kind = cd.book_type || "Proposal";
  const files = cd.manuscript_files || {};
  const allFiles: ManuscriptFile[] = [
    ...(files.sampleChapter ? [files.sampleChapter] : []),
    ...(files.additionalFiles || []),
    ...(() => {
      const sd = (cd as any).supporting_documents ?? (cd as any).supporting_materials;
      if (!sd) return [];
      const arr = Array.isArray(sd) ? sd : [sd];
      return arr
        .map((d: any): ManuscriptFile | null => {
          if (!d) return null;
          if (typeof d === "string") {
            return { url: d, filename: d.split("/").pop() || d };
          }
          const url = d.url || d.file_url || d.href || d.link;
          if (!url) return null;
          return {
            url,
            filename: d.filename || d.name || d.title || url.split("/").pop() || "Document",
            size_bytes: d.size_bytes || d.size,
          };
        })
        .filter((x): x is ManuscriptFile => !!x);
    })(),
  ];
  const fmtBool = (v?: boolean | string) => {
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["yes", "true", "y", "1"].includes(s)) return "Yes";
      if (["no", "false", "n", "0", ""].includes(s)) return "No";
      return v;
    }
    return v ? "Yes" : "No";
  };
  const authorFullName =
    cd.corresponding_author_name ||
    [cd.author_title, cd.author_first_name, cd.author_last_name]
      .filter(Boolean)
      .join(" ") ||
    "—";

  const wordCount = cd.estimated_word_count ?? cd.word_count;
  const completionDate = cd.estimated_completion_date || cd.expected_completion_date;
  const illustrationCount = cd.illustration_count ?? cd.number_of_illustrations;
  const illustrationsValue = fmtBool(cd.has_illustrations);
  const overviewText = cd.short_description || cd.detailed_description || cd.overview;
  const keyFeaturesText = cd.key_features || cd.detailed_description;
  const audienceText = cd.target_audience || cd.marketing_info;
  const whyNeededText = cd.unique_selling_points || cd.marketing_info;
  const reviewersRaw = cd.recommended_reviewers || cd.referees_reviewers;
  const keywordTags: string[] = cd.secondary_subjects && cd.secondary_subjects.length > 0
    ? cd.secondary_subjects
    : (cd.keywords ? cd.keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : []);
  const coAuthorsList: Array<Record<string, unknown>> = (() => {
    if (Array.isArray(cd.co_authors) && cd.co_authors.length > 0) {
      return cd.co_authors as Array<Record<string, unknown>>;
    }
    if (cd.co_authors_editors) {
      return cd.co_authors_editors
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
    }
    return [];
  })();
  const hasNotes = !!(
    cd.additional_info ||
    (typeof cd.permissions_required === "string" && cd.permissions_required) ||
    cd.under_review_elsewhere
  );

  return (
    <>
      <InfoRequestPanel
        ticket={proposal.ticket}
        infoRequests={proposal.infoRequests}
      />
      {/* Hero card: title + status pill + stepper */}
      <section id="section-hero" className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {cd.proposed_title && (
              <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Proposed Title:{" "}
                <span className="font-serif text-sm font-normal normal-case tracking-normal text-stone-700">
                  {cd.proposed_title}
                  {cd.proposed_subtitle ? `: ${cd.proposed_subtitle}` : ""}
                </span>
              </p>
            )}
            <h1 className="font-serif text-2xl font-bold leading-tight md:text-3xl" style={{ color: "#2C1A0E" }}>
              {cd.main_title || proposal.ticket}
            </h1>
            {cd.sub_title && (
              <p className="mt-1.5 font-sans text-sm font-medium" style={{ color: "#A6814A" }}>{cd.sub_title}</p>
            )}
            <p className="mt-2 inline-flex items-center gap-1.5 font-sans text-xs" style={{ color: "#7A6A5A" }}>
              <Calendar className="h-4 w-4" />
              Submitted {formatDate(proposal.submittedAt)}
            </p>
          </div>
          {status === "signed" || status === "approved" ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 font-sans text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
              {STATUS_LABEL[status]}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1 font-sans text-xs font-semibold ${tint.bg} ${tint.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tint.dot}`} />
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>

        <ProgressStepper
          timeline={proposal.timeline}
          status={status}
          hasOpenInfoRequest={!!pickOpenInfoRequest(proposal.infoRequests)}
        />
      </section>

      <AuthorMetadataPanel
        ticket={proposal.ticket}
        proposalStatus={proposal.status}
        isPostApproval={isPostApproval}
        fallbackData={{
          ticket_number: proposal.ticket,
          metadata_status: "approved",
          proposal_status: proposal.status,
          approved_at: proposal.updatedAt,
          metadata: {
            full_title:
              ((cd as Record<string, unknown>).full_title as string | undefined) ||
              [cd.main_title, cd.sub_title].filter(Boolean).join(": "),
            title:
              ((cd as Record<string, unknown>).title as string | undefined) ||
              cd.main_title,
            subtitle:
              ((cd as Record<string, unknown>).subtitle as string | undefined) ||
              cd.sub_title,
            category: cd.book_type,
            display_names: cd.corresponding_author_name || authorFullName,
            display_bios: cd.biography,
            book_description:
              cd.detailed_description || cd.short_description || cd.overview,
            keywords: Array.isArray(cd.secondary_subjects) && cd.secondary_subjects.length
              ? cd.secondary_subjects.join(", ")
              : cd.keywords,
            website_classification: cd.subject,
            authors: [
              {
                title: cd.author_title,
                first_name: cd.author_first_name,
                last_name: cd.author_last_name,
                email: cd.email,
                email_2: cd.secondary_email,
                institution: cd.institution,
                country: cd.country,
              },
              ...(Array.isArray(cd.co_authors)
                ? (cd.co_authors as Array<Record<string, unknown>>).map((c) => ({
                    first_name: (c.first_name as string) || "",
                    last_name: (c.last_name as string) || "",
                    email: (c.email as string) || "",
                    institution: (c.institution as string) || "",
                    country: (c.country as string) || "",
                  }))
                : []),
            ],
          },
        }}
      />

      {/* Reviewer Feedback — only after the proposal has left the
          "submitted/new" state, otherwise there is nothing to show. */}
      {status !== "submitted" && (
      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setReviewerFeedbackOpen((v) => !v)}
          aria-expanded={reviewerFeedbackOpen}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-stone-50"
        >
          <div>
            <h2 className="font-serif text-lg font-bold text-[#2C1A0E]">
              Reviewer Feedback
            </h2>
            <p className="mt-1 font-sans text-xs text-[#7A6A5A]">
              Editor's recommendation and peer reviewer comments on your proposal.
            </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[#7A6A5A] transition-transform ${reviewerFeedbackOpen ? "rotate-180" : ""}`}
          />
        </button>
        {reviewerFeedbackOpen && (
          <div className="border-t border-stone-200 px-6 py-5">
            <ReviewerCommentsList ticket={proposal.ticket} />
          </div>
        )}
      </section>
      )}

      <ContractIssuedView ticket={proposal.ticket} proposal={proposal} authorFullName={authorFullName} />

      {isContractView && (
        <div className="mt-6 overflow-hidden rounded-xl border border-stone-200">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="flex w-full items-center justify-between gap-3 bg-white px-5 py-3.5 font-sans text-sm font-semibold text-[#7A6A5A] transition-colors hover:bg-stone-50 cursor-pointer"
            aria-expanded={showOriginal}
          >
            View original proposal details
            <ChevronDown className={`h-4 w-4 text-[#7A6A5A] transition-transform ${showOriginal ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}

      {(!isContractView || showOriginal) && (
        <div id="original-proposal-details">
      {/* Tabs */}
      <div className="mt-6 inline-flex gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
        <button
          className="rounded-lg px-5 py-1.5 font-sans text-sm font-medium text-white"
          style={{ backgroundColor: "#00422F" }}
        >
          Proposal Details
        </button>
        <button
          className="rounded-lg px-5 py-1.5 font-sans text-sm font-medium transition-colors hover:text-stone-900"
          style={{ color: "#7A6A5A" }}
        >
          Status History
        </button>
      </div>

      {/* Stats row + Documents sidebar */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Type" value={kind} />
          <StatCard
            label="Word Count"
            value={wordCount ? Number(wordCount).toLocaleString() : "—"}
          />
          <StatCard
            label="Completion"
            value={formatMonthYear(completionDate)}
          />
        </div>


        <aside id="section-documents" className="row-span-2 scroll-mt-24 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50/60">
          <h3 className="px-5 py-3.5 font-serif text-base font-bold" style={{ color: "#2C1A0E" }}>Documents</h3>
          {allFiles.length === 0 ? (
            <p className="border-t border-stone-200 px-5 py-4 text-sm text-stone-500">No documents uploaded.</p>
          ) : (
            <ul className="space-y-3 border-t border-stone-200 p-5">
              {allFiles.map((f, i) => (
                <li key={`${f.filename}-${i}`}>
                  <div className="group flex items-start gap-2 rounded-lg border border-transparent p-2 hover:border-stone-200 hover:bg-white">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {f.filename}
                      </p>
                      {f.size_bytes ? (
                        <p className="text-xs text-stone-500">{formatBytes(f.size_bytes)}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewFile(f)}
                      title="Preview"
                      aria-label={`Preview ${f.filename}`}
                      className="shrink-0 rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content stack (under stats, beside Documents) */}
        <div className="space-y-5">
          {/* Primary author card */}
          <Card title="Primary Author / Editor" id="section-author">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <Field label="Name" value={authorFullName} />
              <Field label="Email" value={cd.email || "—"} />
              {cd.institution && <Field label="Institution" value={cd.institution} />}
              {cd.country && <Field label="Country" value={cd.country} />}
              {cd.job_title && <Field label="Job Title" value={cd.job_title} />}
              {cd.phone && <Field label="Phone" value={cd.phone} />}
              {cd.secondary_email && <Field label="Secondary Email" value={cd.secondary_email} />}
            </div>
            {cd.address && (
              <div className="mt-6 border-t border-stone-200 pt-5">
                <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>Mailing Address</p>
                <p className="mt-0.5 font-sans text-sm font-medium" style={{ color: "#2C1A0E" }}>{cd.address}</p>
              </div>
            )}
            {cd.biography && (
              <div className="mt-5 border-t border-stone-200 pt-5">
                <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>Biography</p>
                <p className="mt-0.5 whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>
                  {cd.biography}
                </p>
              </div>
            )}
          </Card>

          {/* Additional Authors / Editors */}
          {coAuthorsList.length > 0 && (
            <Card
              title="Additional Authors / Editors"
              subtitle={`${coAuthorsList.length} co-author${coAuthorsList.length > 1 ? "s" : ""}`}
              id="section-co-authors"
            >
              <div className="space-y-6">
                {coAuthorsList.map((ca, i) => {
                  const name = (ca.name as string) || [ca.first_name, ca.last_name].filter(Boolean).join(" ") || `Co-author ${i + 1}`;
                  return (
                    <div key={i} className="border-t border-stone-200 pt-5 first:border-t-0 first:pt-0">
                      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                        <Field label="Name" value={String(name)} />
                        {ca.email ? <Field label="Email" value={String(ca.email)} /> : null}
                        {ca.institution ? <Field label="Institution" value={String(ca.institution)} /> : null}
                        {ca.country ? <Field label="Country" value={String(ca.country)} /> : null}
                      </div>
                      {ca.address ? (
                        <div className="mt-4">
                          <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>Mailing Address</p>
                          <p className="mt-0.5 font-sans text-sm font-medium" style={{ color: "#2C1A0E" }}>{String(ca.address)}</p>
                        </div>
                      ) : null}
                      {ca.biography ? (
                        <div className="mt-4">
                          <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>Biography</p>
                          <p className="mt-0.5 whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>{String(ca.biography)}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Summary & Description */}
          {(overviewText || keyFeaturesText || audienceText || keywordTags.length > 0) && (
            <Card title="Summary & Description" id="section-summary">
              <p className="-mt-2 font-sans text-sm font-medium" style={{ color: "#A6814A" }}>
                {[cd.subject, cd.secondary_subjects?.join(" / ")]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <div className="mt-5 space-y-4">
                {overviewText && (
                  <SubCard label="Overview">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>
                      {overviewText}
                    </p>
                    {keywordTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {keywordTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-amber-100/70 px-3 py-1 text-xs font-medium text-amber-900"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </SubCard>
                )}
                {keyFeaturesText && keyFeaturesText !== overviewText && (
                  <SubCard label="Key Features & Unique Contribution">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>
                      {keyFeaturesText}
                    </p>
                  </SubCard>
                )}
                {cd.unique_selling_points && (
                  <SubCard label="Unique Selling Points">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>
                      {cd.unique_selling_points}
                    </p>
                  </SubCard>
                )}
                {audienceText && (
                  <SubCard label="Intended Audience">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed" style={{ color: "#2C1A0E" }}>
                      {audienceText}
                    </p>
                  </SubCard>
                )}
                {cd.language && (
                  <SubCard label="Contains Non-English Content">
                    <p className="font-sans text-sm font-medium" style={{ color: "#2C1A0E" }}>
                      {cd.language.toLowerCase() === "english" ? "No" : `Yes (${cd.language})`}
                    </p>
                  </SubCard>
                )}
              </div>
            </Card>
          )}

          {/* TOC */}
          {cd.table_of_contents && (
            <Card title="Table of Contents" id="section-toc">
              <TocList raw={cd.table_of_contents} />
            </Card>
          )}

          {/* Marketing & Promotion */}
          {(whyNeededText ||
            cd.competing_titles ||
            cd.primary_market ||
            cd.unique_contribution ||
            cd.conferences ||
            cd.promotional_channels ||
            cd.marketing_info) && (
            <Card title="Marketing & Promotion" id="section-market">
              <div className="space-y-4">
                {cd.primary_market && (
                  <SubCard label="Primary Market">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.primary_market}
                    </p>
                  </SubCard>
                )}
                {whyNeededText && (
                  <SubCard label="Why is this book needed?">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {whyNeededText}
                    </p>
                  </SubCard>
                )}
                {cd.competing_titles && (
                  <SubCard label="Competing Titles">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.competing_titles}
                    </p>
                  </SubCard>
                )}
                {cd.unique_contribution && (
                  <SubCard label="Unique Contribution vs Competing Titles">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.unique_contribution}
                    </p>
                  </SubCard>
                )}
                {cd.conferences && (
                  <SubCard label="Relevant Conferences / Academic Events">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.conferences}
                    </p>
                  </SubCard>
                )}
                {cd.promotional_channels && (
                  <SubCard label="Promotional Channels">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.promotional_channels}
                    </p>
                  </SubCard>
                )}
                {cd.marketing_info &&
                  cd.marketing_info !== cd.competing_titles &&
                  cd.marketing_info !== cd.primary_market &&
                  cd.marketing_info !== whyNeededText &&
                  cd.marketing_info !== audienceText && (
                    <SubCard label="Additional Marketing Notes">
                      <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                        {cd.marketing_info}
                      </p>
                    </SubCard>
                  )}
              </div>
            </Card>
          )}

          {/* Suggested reviewers */}
          {reviewersRaw && (
            <Card title="Suggested Reviewers" subtitle="Nominated for consideration" id="section-reviewers">
              <ReviewersList raw={reviewersRaw} />
            </Card>
          )}

          {/* Manuscript details / extras */}
          <Card title="Manuscript Details" id="section-manuscript">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MiniStat
                label="Word Count"
                value={
                  typeof wordCount === "number"
                    ? wordCount.toLocaleString()
                    : wordCount
                      ? String(wordCount)
                      : "—"
                }
              />
              <MiniStat label="Has tables" value={fmtBool(cd.has_tables)} />
              <MiniStat
                label="Has illustrations"
                value={illustrationsValue}
              />
              <MiniStat
                label="Illustration count"
                value={illustrationCount !== undefined && illustrationCount !== null ? String(illustrationCount) : "—"}
              />
              <MiniStat
                label="Languages"
                value={cd.language || "—"}
              />
              <MiniStat
                label="Est. Completion"
                value={completionDate || "—"}
              />
              <MiniStat
                label="Previously published"
                value={fmtBool(cd.under_review_elsewhere ?? cd.is_previously_published)}
              />
              {cd.permissions_required !== undefined && (
                <MiniStat label="Permissions Required" value={fmtBool(cd.permissions_required)} />
              )}
            </div>
          </Card>

          {/* Additional Comments & Permissions */}
          {hasNotes && (
            <Card title="Additional Comments & Permissions" subtitle="Copyright, permissions, special considerations" id="section-notes">
              <div className="space-y-4">
                {cd.additional_info && (
                  <SubCard label="Additional Notes from Author">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.additional_info}
                    </p>
                  </SubCard>
                )}
                {typeof cd.permissions_required === "string" && cd.permissions_required && (
                  <SubCard label="Permissions Required from Copyright Holders">
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-[#2C1A0E]">
                      {cd.permissions_required}
                    </p>
                  </SubCard>
                )}
              </div>
            </Card>
          )}

          {/* Dynamic: every other key present in current_data */}
          <DynamicProposalFields data={cd as unknown as Record<string, unknown>} />

        </div>
      </div>
      </div>
      )}
      {previewFile && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-5 w-5 shrink-0 text-amber-700" />
                <p className="truncate font-sans text-sm font-semibold text-stone-900">
                  {previewFile.filename}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-3 py-1.5 font-sans text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open / Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  aria-label="Close preview"
                  className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-stone-100">
              {/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(previewFile.filename) ? (
                <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                  <img
                    src={previewFile.url}
                    alt={previewFile.filename}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  src={previewFile.url}
                  title={previewFile.filename}
                  className="h-full w-full border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/60 px-4 py-4 text-center">
      <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>{label}</p>
      <p className="mt-1 font-sans text-sm font-bold" style={{ color: "#2C1A0E" }}>{value}</p>
    </div>
  );
}

// Keys already surfaced by the curated cards above — exclude from the
// generic "Additional Proposal Information" renderer so we don't duplicate.
const CONSUMED_CD_KEYS = new Set<string>([
  "email",
  "secondary_email",
  "address",
  "biography",
  "institution",
  "country",
  "job_title",
  "phone",
  "main_title",
  "sub_title",
  "book_type",
  "word_count",
  "expected_completion_date",
  "corresponding_author_name",
  "first_name",
  "last_name",
  "title",
  "subject",
  "secondary_subjects",
  "keywords",
  "language",
  "overview",
  "key_features",
  "key_features_and_unique_contribution",
  "unique_selling_points",
  "intended_audience",
  "audience",
  "table_of_contents",
  "primary_market",
  "competing_titles",
  "why_needed",
  "why_is_this_book_needed",
  "suggested_reviewers",
  "reviewers",
  "has_tables",
  "has_illustrations",
  "illustrations",
  "illustration_count",
  "number_of_illustrations",
  "under_review_elsewhere",
  "is_previously_published",
  "permissions_required",
  "additional_info",
  "conferences",
  "promotional_channels",
  "manuscript_files",
  "co_authors",
  "additional_authors",
  "contributors",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUrl\b/g, "URL")
    .replace(/\bId\b/g, "ID");
}

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

function renderDynamicValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (isUrl(value)) {
      const filename = value.split("/").pop() || value;
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="break-all font-medium text-amber-800 underline-offset-2 hover:underline"
        >
          {filename}
        </a>
      );
    }
    return (
      <span className="whitespace-pre-wrap break-words">{value}</span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return value.join(", ");
    }
    return (
      <pre className="whitespace-pre-wrap break-words rounded bg-stone-100 p-2 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === "object") {
    return (
      <pre className="whitespace-pre-wrap break-words rounded bg-stone-100 p-2 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return String(value);
}

function DynamicProposalFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k, v]) => {
    if (CONSUMED_CD_KEYS.has(k)) return false;
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
  if (entries.length === 0) return null;
  return (
    <Card
      title="Additional Proposal Information"
      subtitle="All other details submitted with this proposal"
      id="section-extra-fields"
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p
              className="font-sans text-xs font-medium"
              style={{ color: "#7A6A5A" }}
            >
              {humanizeKey(k)}
            </p>
            <div
              className="mt-0.5 font-sans text-sm font-medium leading-relaxed"
              style={{ color: "#2C1A0E" }}
            >
              {renderDynamicValue(v)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3">
      <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>{label}</p>
      <p className="mt-0.5 font-sans text-sm font-medium" style={{ color: "#2C1A0E" }}>{value}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="px-5 py-3.5 md:px-5">
        <h2 className="font-serif text-base font-bold" style={{ color: "#2C1A0E" }}>{title}</h2>
        {subtitle && <p className="mt-1 font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>{subtitle}</p>}
      </div>
      <div className="border-t border-stone-200 px-6 py-6 md:px-7">{children}</div>
    </section>
  );
}

function ContractIssuedView({
  ticket,
  proposal,
  authorFullName,
}: {
  ticket: string;
  proposal: ProposalState;
  authorFullName: string;
}) {
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signLoading, setSignLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showQueries, setShowQueries] = useState(false);
  const [queriesCount, setQueriesCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queryCategory, setQueryCategory] = useState("contract");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [querySuccess, setQuerySuccess] = useState(false);
  const [proposalStatus, setProposalStatus] = useState<string>("");
  const awaitingKey = `csp:awaiting-signature:${ticket}`;
  const [awaitingSignature, setAwaitingSignature] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(awaitingKey) === "1";
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const list = await getContract(ticket);
        if (cancelled) return;
        const latest = list[0] || null;
        setContract(latest);
        // Poll while the contract is still awaiting signature so the author
        // dashboard flips to "Contract Signed" automatically.
        const st = (latest?.status || "").toLowerCase();
        const completed = !!latest?.docusign_completed_at;
        const pending = (st === "sent" || st === "draft") && !completed;
        if (pending) {
          // Poll faster (4s) right after the author clicked "Sign", so the
          // page flips to "Contract Signed" as soon as DocuSign confirms.
          // Tightened so the page flips to "Contract Signed" as soon as
          // DocuSign confirms (2s right after Sign click, 5s passive).
          const delay = awaitingSignature ? 2000 : 5000;
          timer = setTimeout(() => load(false), delay);
        }
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };
    load(true);
    // Refresh as soon as the author returns to this tab (after signing on
    // DocuSign), so they immediately see the signed state.
    const onFocus = () => load(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ticket, reloadKey, awaitingSignature, awaitingKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await getQueries(ticket);
        if (!cancelled) {
          setProposalStatus(body.proposal_status || "");
          setQueriesCount((body.queries || []).length);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket, reloadKey]);

  if (loading || !contract) return null;

  const cstatus = (contract.status || "").toLowerCase();
  const dsStatus = (contract.docusign_status || "").toLowerCase();
  const isSigned =
    cstatus === "signed" ||
    cstatus === "completed" ||
    dsStatus === "signed" ||
    dsStatus === "completed" ||
    !!contract.docusign_completed_at;
  // Once the contract is confirmed signed, clear the awaiting flag so the
  // reassurance banner disappears and the success view takes over.
  if (isSigned && awaitingSignature) {
    try {
      window.sessionStorage.removeItem(awaitingKey);
    } catch {
      // ignore
    }
    // Defer state update to next tick to avoid setState during render.
    setTimeout(() => setAwaitingSignature(false), 0);
  }
  const isDeclined =
    cstatus === "declined" ||
    cstatus === "voided" ||
    dsStatus === "declined" ||
    dsStatus === "voided";
  const canSign =
    (cstatus === "sent" || dsStatus === "sent" || dsStatus === "delivered") &&
    !isSigned &&
    !isDeclined;
  const hasOpenQuery =
    proposalStatus === "queries_raised" || proposalStatus === "question_raised";
  const signDisabled = !canSign || hasOpenQuery;

  const submitQuery = async () => {
    if (!queryText.trim()) return;
    setQuerySubmitting(true);
    setQueryError(null);
    try {
      await raiseQuery(ticket, queryText.trim(), queryCategory || "contract");
      setQuerySuccess(true);
      setQueryText("");
      setReloadKey((k) => k + 1);
      setTimeout(() => {
        setQueryOpen(false);
        setQuerySuccess(false);
        setShowQueries(true);
      }, 900);
    } catch (e) {
      setQueryError((e as Error).message || "Failed to submit query.");
    } finally {
      setQuerySubmitting(false);
    }
  };

  const pillCls = isSigned
    ? "bg-emerald-50 text-emerald-700"
    : isDeclined
      ? "bg-rose-50 text-rose-700"
      : "bg-violet-50 text-violet-700";
  const pillDot = isSigned ? "bg-emerald-500" : isDeclined ? "bg-rose-500" : "bg-violet-500";
  const pillLabel = isSigned
    ? "Contract Signed"
    : isDeclined
      ? "Contract Declined"
      : "Contract Issued";

  const issuedAt = contract.docusign_sent_at || contract.created_at;
  const contractTypeLabel =
    contract.contract_type === "editor"
      ? "Edited Collection Agreement"
      : "Publishing Agreement";

  const editorNote =
    contract.note_to_author ||
    contract.author_note ||
    contract.message_to_author ||
    contract.notes ||
    "";
  const editorialFeedback = contract.addendum || "";
  const cd = proposal.cd;
  const titleStr = cd.main_title || proposal.ticket;
  const contractTitle = contract.title || titleStr;
  const contractSubtitle = contract.subtitle || cd.sub_title || "";
  const contractFieldRows = [
    { label: "Language", value: contract.language },
    { label: "Author Copies", value: contract.author_copies },
    { label: "If Two Authors — Copies Each", value: contract.if_two_author_copies },
    { label: "If 3–4 Authors — Copies Each", value: contract.if_three_or_four_author_copies },
    { label: "Copies Sold Revenue", value: formatPercentValue(contract.copies_sold_revenue) },
    { label: "Secondary Rights Revenue", value: formatPercentValue(contract.secondary_rights_revenue) },
    { label: "Publishing Agreement", value: contract.publishing_agreement },
  ].filter((row): row is { label: string; value: string | number } => row.value !== undefined && row.value !== null && String(row.value).trim() !== "");

  const formatLabel =
    contract.contract_type === "editor"
      ? "Edited Collection"
      : cd.book_type
        ? cd.book_type.charAt(0).toUpperCase() + cd.book_type.slice(1)
        : "—";
  const expectedCompletion = formatMonthYear(
    cd.estimated_completion_date || cd.expected_completion_date,
  );

  const handleSign = async () => {
    setSignLoading(true);
    setSignError(null);
    try {
      const url = await getSigningUrl(ticket);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setAwaitingSignature(true);
        try {
          window.sessionStorage.setItem(awaitingKey, "1");
        } catch {
          // ignore storage errors
        }
      } else {
        setSignError("No signing URL returned.");
      }
    } catch (e) {
      setSignError((e as Error).message);
    } finally {
      setSignLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { fetchContractPdfBlob } = await import("@/lib/contractsApi");
      const url = await fetchContractPdfBlob(ticket);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticket}-contract.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setSignError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    isSigned ? (
      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-violet-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-violet-200 bg-gradient-to-br from-violet-50 to-violet-100/40 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="mb-1 inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wider text-emerald-600">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              Contract Signed
            </p>
            <h2 className="font-serif text-xl font-bold leading-snug text-[#2C1A0E]">
              Thank you — your contract is confirmed
            </h2>
            <p className="mt-1.5 font-sans text-sm text-violet-600">
              Issued {formatDate(issuedAt)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 font-sans text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
            Contract Signed
          </span>
        </div>

        {/* Document Card */}
        <div className="bg-stone-50/40 p-6 sm:p-10 md:p-14">
          <div className="mx-auto w-full max-w-lg rounded-xl bg-white p-8 shadow-sm">
          {/* Contract Heading */}
          <div className="mb-8 text-center">
            <p className="mb-5 font-sans text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-700/70">
              Cambridge Scholars Publishing
            </p>
            <div className="mx-auto mb-1.5 h-2 w-3/5 rounded bg-stone-200" />
            <div className="mx-auto mb-6 h-1.5 w-2/5 rounded bg-stone-200" />
            <div className="my-6 flex items-center justify-center gap-4">
              <div className="h-px flex-1 max-w-[40%] bg-stone-200" />
              <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-teal-700/70">
                Publishing Agreement
              </h3>
              <div className="h-px flex-1 max-w-[40%] bg-stone-200" />
            </div>
          </div>

          {/* Metadata Rows */}
          <div className="divide-y divide-stone-200/70 border-t border-stone-200/70">
            <StackedRow label="Author" value={contract.recipient_name || authorFullName} />
            <StackedRow label="Title" value={contractTitle} />
            {contractSubtitle && <StackedRow label="Subtitle" value={contractSubtitle} />}
            <StackedRow label="Format" value={formatLabel} />
            <StackedRow label="Expected Completion" value={expectedCompletion} />
            {contractFieldRows.map((row) => (
              <StackedRow key={row.label} label={row.label} value={row.value} />
            ))}
            {contract.addendum && <StackedRow label="Addendum" value={contract.addendum} />}
          </div>

          {editorNote && (
            <div className="mt-6 rounded-lg border border-violet-100 bg-violet-50/70 px-4 py-3">
              <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-violet-700">
                Note from your editor
              </p>
              <p className="mt-1.5 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                {editorNote}
              </p>
            </div>
          )}

          {/* Skeleton "terms" bars */}
          <div className="mt-10 space-y-3">
            <div className="h-1.5 w-[92%] rounded bg-stone-200" />
            <div className="h-1.5 w-[88%] rounded bg-stone-200" />
            <div className="h-1.5 w-[82%] rounded bg-stone-200" />
            <div className="h-1.5 w-[78%] rounded bg-stone-200" />
            <div className="h-1.5 w-[70%] rounded bg-stone-200" />
          </div>

          {/* Signature footer */}
          <div className="mt-10 border-t border-stone-200/70 pt-6">
            <div className="mb-3 flex items-center justify-between gap-6">
              <div className="h-2 w-2/5 rounded bg-stone-200" />
              <div className="h-2 w-1/5 rounded bg-stone-200" />
            </div>
            <div className="flex items-center justify-between gap-6">
              <p className="font-sans text-sm text-stone-600">Publisher</p>
              <p className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Signed
              </p>
            </div>
          </div>
        </div>
        </div>

        {/* Download link below card */}
        <div className="bg-stone-50/40 px-6 pb-6 text-center">
          <button
            type="button"
            onClick={() => setPdfOpen(true)}
            className="font-sans text-xs text-slate-400 hover:text-slate-600 hover:underline"
          >
            Download full contract for complete terms and conditions
          </button>
        </div>

        {/* Welcome Footer (inside card) */}
        <div className="flex items-start gap-2.5 border-t border-emerald-900/20 bg-emerald-900/5 px-6 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#00422F]" strokeWidth={2} />
          <div className="min-w-0">
            <p className="font-sans text-sm font-semibold text-[#00422F]">
              Contract signed
            </p>
            <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">
              A member of our team will be in touch with you shortly to discuss the next steps
            </p>
          </div>
        </div>

        <ContractPdfModal
          open={pdfOpen}
          ticket={ticket}
          onClose={() => setPdfOpen(false)}
        />
      </section>
    ) : (
    <section
      className={`mt-6 overflow-hidden rounded-2xl border-2 shadow-sm ${
        isSigned
          ? "border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white"
          : "border-violet-200 bg-white"
      }`}
    >
      {/* Header */}
      <div
        className={`flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5 ${
          isSigned
            ? "border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100/40"
            : "border-violet-200 bg-gradient-to-br from-violet-50 to-violet-100/40"
        }`}
      >
        <div className="min-w-0">
          <p
            className={`inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wider ${
              isSigned ? "text-emerald-700" : isDeclined ? "text-rose-700" : "text-violet-600"
            }`}
          >
            {isSigned && <Check className="h-3.5 w-3.5" />}
            {isSigned ? "Contract Signed" : isDeclined ? "Contract Declined" : "Proposal Accepted"}
          </p>
          <h2 className="font-serif text-xl font-bold leading-snug text-[#2C1A0E]">
            {isSigned
              ? "Thank you — your contract is confirmed"
              : "Read the reviewer's feedback, then sign your contract"}
          </h2>
          <p
            className={`mt-1.5 font-sans text-sm ${
              isSigned ? "text-emerald-700" : "text-violet-600"
            }`}
          >
            Issued {formatDate(issuedAt)} · {contractTypeLabel}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-sans text-xs font-semibold ${
            isSigned
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : isDeclined
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-violet-300 bg-violet-50 text-violet-800"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pillDot}`} />
          {pillLabel}
        </span>
      </div>

      {/* Step 1 — Feedback (hidden once contract is signed) */}
      <div>
        <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-50/60 px-6 py-3">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-sans text-xs font-bold text-white ${isSigned ? "bg-emerald-600" : "bg-violet-600"}`}>
            {isSigned ? <Check className="h-3.5 w-3.5" /> : "1"}
          </span>
          <h3 className="font-sans text-sm font-semibold text-[#2C1A0E]">
            Read the reviewer's feedback
          </h3>
        </div>

        <div className="px-6 py-4">
          {editorialFeedback && (
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                Overall assessment
              </p>
              <p className="mt-2 whitespace-pre-line font-sans text-sm italic leading-relaxed text-[#2C1A0E]">
                "{editorialFeedback}"
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Step 2 — Sign */}
      <div className="px-6 py-6 md:px-8">
        {!isSigned && (
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full font-sans text-sm font-bold text-white ${
              isSigned ? "bg-emerald-600" : "bg-violet-600"
            }`}
          >
            {isSigned ? <Check className="h-4 w-4" /> : "2"}
          </span>
          <h3 className="font-serif text-base font-bold text-[#2C1A0E]">
            Review and sign your publishing contract
          </h3>
        </div>
        )}

        {!isSigned && editorNote && (
          <div className="mt-5">
            <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-stone-500">
              Note from your editor
            </p>
            <p className="mt-2 whitespace-pre-line font-sans text-[15px] leading-relaxed text-stone-700">
              {editorNote}
            </p>
          </div>
        )}

        {/* Contract preview */}
        <div className={`${isSigned ? "mt-2" : "mt-6"} rounded-2xl border border-stone-200 bg-white p-6 md:p-8`}>
          <p className="text-center font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Cambridge Scholars Publishing
          </p>
          {isSigned ? (
            <p className="mx-auto mt-3 max-w-md text-center font-serif text-[13px] italic leading-relaxed text-stone-600">
              This agreement is made between Cambridge Scholars Publishing and the Author
              named below for the work described herein.
            </p>
          ) : (
            <div className="mx-auto mt-4 max-w-xs space-y-1.5">
              <div className="h-2 rounded-full bg-stone-200" />
              <div className="mx-auto h-2 w-2/3 rounded-full bg-stone-200" />
            </div>
          )}
          <p
            className={`mt-6 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.18em] ${
              isSigned ? "text-emerald-700" : "text-violet-700"
            }`}
          >
            {contractTypeLabel}
          </p>
          <div className="mt-3 h-px bg-stone-200" />

          <dl className="mt-4 divide-y divide-stone-100">
            <PreviewRow label="Author" value={contract.recipient_name || authorFullName} />
            <PreviewRow label="Title" value={truncate(contractTitle, 36)} />
            {contractSubtitle && <PreviewRow label="Subtitle" value={truncate(contractSubtitle, 42)} />}
            <PreviewRow label="Format" value={formatLabel} />
            <PreviewRow label="Expected Completion" value={expectedCompletion} />
            {contractFieldRows.map((row) => (
              <PreviewRow key={row.label} label={row.label} value={String(row.value)} />
            ))}
            {contract.addendum && <PreviewRow label="Addendum" value={contract.addendum} />}
            {isSigned && (
              <>
                <PreviewRow label="Contract Version" value={`v${contract.contract_version}`} />
                <PreviewRow label="Issued" value={formatDate(issuedAt)} />
                <PreviewRow
                  label="Signed"
                  value={formatDate(contract.docusign_completed_at ?? undefined)}
                />
              </>
            )}
          </dl>

          {isSigned ? (
            <p className="mt-6 font-serif text-[13px] leading-relaxed text-stone-600">
              The Publisher and the Author have agreed to the terms governing rights,
              royalties, manuscript delivery, editorial standards, and publication of the
              Work as set out in the full agreement. Both parties have executed this
              contract electronically via DocuSign.
            </p>
          ) : (
            <div className="mt-6 space-y-1.5">
              <div className="h-2 rounded-full bg-stone-100" />
              <div className="h-2 w-11/12 rounded-full bg-stone-100" />
              <div className="h-2 w-10/12 rounded-full bg-stone-100" />
              <div className="h-2 w-9/12 rounded-full bg-stone-100" />
              <div className="h-2 w-11/12 rounded-full bg-stone-100" />
            </div>
          )}

          <div className="mt-8 flex items-end justify-between gap-6">
            <div className="flex-1">
              {isSigned ? (
                <p className="font-serif text-sm font-semibold text-stone-800">
                  Cambridge Scholars Publishing
                </p>
              ) : (
                <div className="h-1.5 w-3/5 rounded bg-stone-200" />
              )}
              <p className="mt-1.5 font-sans text-xs text-stone-500">Publisher</p>
            </div>
            <div className="flex-1 text-right">
              {isSigned ? (
                <>
                  <p className="font-serif text-sm font-semibold text-stone-800">
                    {contract.recipient_name || authorFullName}
                  </p>
                  <p className="mt-0.5 inline-flex items-center justify-end gap-1 font-sans text-xs font-semibold text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                    Signed {formatDate(contract.docusign_completed_at ?? undefined)}
                  </p>
                </>
              ) : (
                <div className="ml-auto h-1.5 w-3/5 rounded bg-stone-200" />
              )}
              {!isSigned && (
                <p className="mt-1.5 font-sans text-xs text-stone-500">Your signature</p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPdfOpen(true)}
          className={`mx-auto mt-4 block font-sans text-sm font-medium hover:underline ${
            isSigned ? "text-emerald-700" : "text-violet-700"
          }`}
        >
          Download full contract for complete terms and conditions
        </button>

        {/* Signed confirmation callout */}
        {isSigned && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 md:px-6 md:py-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="font-serif text-base font-bold text-emerald-900">
                  Contract signed
                </p>
                <p className="mt-1 font-sans text-sm leading-relaxed text-emerald-800/90">
                  A member of our team will be in touch with you shortly to discuss the next steps
                </p>
                {contract.docusign_completed_at && (
                  <p className="mt-2 font-sans text-xs text-emerald-700/80">
                    Signed {formatDate(contract.docusign_completed_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 sm:inline-flex"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        )}

        {/* CTA bar */}
        {!isDeclined && !isSigned && (
          <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 md:p-6">
            {awaitingSignature && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-violet-300 bg-white px-4 py-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 animate-pulse items-center justify-center rounded-full bg-violet-600 text-white">
                  <Check className="h-3 w-3" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="font-sans text-sm font-semibold text-violet-900">
                    Waiting for DocuSign to confirm your signature…
                  </p>
                  <p className="mt-1 font-sans text-xs leading-relaxed text-violet-800/90">
                    You can safely close the DocuSign tab once you finish signing — this page
                    will update to "Contract Signed" automatically within a few seconds. If
                    the DocuSign page shows an error or completion screen after signing, your
                    signature is still recorded; just return here to confirm.
                  </p>
                </div>
              </div>
            )}
            {!isSigned && (
              <p className="text-center font-sans text-sm text-stone-700">
                Once you have read the feedback above, please sign your contract to confirm
                your agreement with Cambridge Scholars Publishing.
              </p>
            )}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center">
              {canSign && !hasOpenQuery && (
                <button
                  type="button"
                  onClick={handleSign}
                  disabled={signLoading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-sans text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 sm:flex-none sm:min-w-[220px]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {signLoading ? "Opening…" : "Sign my contract"}
                </button>
              )}
              {isSigned && (
                <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-6 py-3 font-sans text-sm font-bold text-emerald-700 ring-1 ring-emerald-200 sm:flex-none sm:min-w-[220px]">
                  <CheckCircle2 className="h-4 w-4" />
                  Signed{contract.docusign_completed_at ? ` · ${formatDate(contract.docusign_completed_at)}` : ""}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setQueryOpen(true);
                  setQueryError(null);
                  setQuerySuccess(false);
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-3 font-sans text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 sm:flex-none"
              >
                <HelpCircle className="h-4 w-4" />
                I have a question
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 font-sans text-sm font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-60 sm:flex-none"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Preparing…" : "Download contract"}
              </button>
            </div>
          </div>
        )}

        {signError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
            {signError}
          </p>
        )}
        {contract.docusign_decline_reason && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
            {contract.docusign_decline_reason}
          </p>
        )}

        {(showQueries || queriesCount > 0) && (
          <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
            <ContractQueries
              ticket={ticket}
              viewer="author"
              onChanged={() => setReloadKey((k) => k + 1)}
              hideRaiseForm
            />
          </div>
        )}

        {hasOpenQuery && !showQueries && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800 ring-1 ring-amber-200">
            You have an open query. Signing is disabled until the editor responds.{" "}
            <button
              type="button"
              onClick={() => setShowQueries(true)}
              className="font-semibold underline"
            >
              View thread
            </button>
          </p>
        )}
      </div>

      {queryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4"
          onClick={() => !querySubmitting && setQueryOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-emerald-700" />
                <h3 className="font-serif text-base font-bold text-stone-900">
                  Raise a contract query
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQueryOpen(false)}
                disabled={querySubmitting}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="font-sans text-sm text-stone-600">
                Your question will be sent to the editor. Signing will be paused until they
                respond.
              </p>
              <div className="space-y-1.5">
                <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
                  Category
                </label>
                <select
                  value={queryCategory}
                  onChange={(e) => setQueryCategory(e.target.value)}
                  disabled={querySubmitting}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                >
                  <option value="contract">Contract terms</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
                  Your question <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  disabled={querySubmitting}
                  placeholder="e.g. I have a concern about clause 3 regarding intellectual property rights."
                  className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                />
                <p className="text-right font-sans text-[11px] text-stone-400">
                  {queryText.length}/2000
                </p>
              </div>
              {queryError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
                  {queryError}
                </p>
              )}
              {querySuccess && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 font-sans text-xs text-emerald-700 ring-1 ring-emerald-200">
                  Query submitted. The editor has been notified.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setQueryOpen(false)}
                disabled={querySubmitting}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitQuery}
                disabled={querySubmitting || !queryText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {querySubmitting ? "Submitting…" : "Submit query"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ContractPdfModal
        ticket={ticket}
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
      />
    </section>
    )
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="shrink-0 font-sans text-sm text-stone-500">{label}</dt>
      <dd className="max-w-full break-words font-sans text-sm font-semibold text-[#2C1A0E] sm:max-w-[62%] sm:text-right">
        {value}
      </dd>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatPercentValue(value?: string | number): string | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const text = String(value).trim();
  return text.includes("%") ? text : `${text}%`;
}

function SubCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-stone-200 pt-5 first:border-t-0 first:pt-0">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide" style={{ color: "#7A6A5A" }}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-xs font-medium" style={{ color: "#7A6A5A" }}>{label}</p>
      <p className="mt-0.5 font-sans text-sm font-medium" style={{ color: "#2C1A0E" }}>{value}</p>
    </div>
  );
}

function StackedRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3">
      <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line break-words font-sans text-sm font-medium text-stone-800">
        {value}
      </p>
    </div>
  );
}

function TocList({ raw }: { raw: string }) {
  const items = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[\).\s-]*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ol className="space-y-3 text-[15px] text-stone-800">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-semibold text-amber-800/80">{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function ReviewersList({ raw }: { raw: string }) {
  const blocks = raw
    .split(/\n\s*\n|;\s*/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <ol>
      {blocks.map((block, i) => {
        const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return (
          <li key={i} className="flex gap-4 border-t border-stone-200 py-4 first:border-t-0 first:pt-0">
            <span className="font-sans text-sm font-semibold" style={{ color: "#7A6A5A" }}>{i + 1}.</span>
            <div className="space-y-0.5">
              {lines.map((l, j) => (
                <p
                  key={j}
                  className={j === 0 ? "font-sans text-sm font-bold" : "font-sans text-xs font-medium"}
                  style={{ color: j === 0 ? "#2C1A0E" : "#7A6A5A" }}
                >
                  {l}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}


function ProgressStepper({
  timeline,
  status,
  hasOpenInfoRequest,
}: {
  timeline?: TimelineStage[];
  status: StatusKey;
  hasOpenInfoRequest?: boolean;
}) {
  const declined = status === "declined";

  function anchorFor(stageName?: string, label?: string): string {
    const s = `${stageName || ""} ${label || ""}`.toLowerCase();
    if (/submit|new|receiv/.test(s)) return "section-hero";
    if (/review|peer|assess/.test(s)) return "section-reviewers";
    if (/contract|sign|approv|lock/.test(s)) return "section-documents";
    if (/decision|editor/.test(s)) return "section-summary";
    if (/revis|info|question|quer/.test(s)) return "section-summary";
    if (/declin|reject/.test(s)) return "section-hero";
    if (/final|publish|product/.test(s)) return "section-documents";
    return "section-hero";
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Prefer the timeline returned by the API; fall back to a 4-stage default.
  const stages: { label: string; done: boolean; current: boolean; failed: boolean; anchor: string }[] =
    timeline && timeline.length > 0
      ? timeline.map((t) => {
          const isDeclineStage = /declin|reject/i.test(t.stage_name) || /declin|reject/i.test(t.display_name);
          return {
            label: t.display_name || t.stage_name,
            done: !!t.is_completed,
            current: !!t.is_current,
            failed: isDeclineStage && (!!t.is_completed || !!t.is_current),
            anchor: anchorFor(t.stage_name, t.display_name),
          };
        })
      : [
          { label: "Submitted", done: true, current: false, failed: false, anchor: "section-hero" },
          {
            label: "Peer Review",
            done: ["review_returned", "contract", "signed", "approved", "declined", "major_revisions"].includes(status),
            current: status === "in_review",
            failed: false,
            anchor: "section-reviewers",
          },
          {
            label: "Decision",
            done: ["contract", "signed", "approved", "declined"].includes(status),
            current: status === "review_returned",
            failed: false,
            anchor: "section-summary",
          },
          {
            label: declined ? "Declined" : status === "approved" ? "Approved" : status === "signed" ? "Signed" : status === "contract" ? "Contract" : "Decision",
            done: ["signed", "approved", "declined"].includes(status),
            current: status === "contract",
            failed: declined,
            anchor: "section-documents",
          },
        ];

  // When the DR has requested more info from the author, the proposal is
  // effectively back at the early review stage. Override any later "done"
  // markers from the API so the timeline reflects the awaiting-info state.
  if (hasOpenInfoRequest) {
    let currentSet = false;
    for (let i = 0; i < stages.length; i++) {
      const label = stages[i].label.toLowerCase();
      const isSubmitted = /submit|new|receiv/.test(label);
      if (isSubmitted) {
        stages[i] = { ...stages[i], done: true, current: false, failed: false };
        continue;
      }
      if (!currentSet) {
        stages[i] = { ...stages[i], done: false, current: true, failed: false };
        currentSet = true;
      } else {
        stages[i] = { ...stages[i], done: false, current: false, failed: false };
      }
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-start">
        {stages.map((s, i) => (
          <div key={s.label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div
                  className={`h-[3px] flex-1 ${
                    stages[i - 1].done ? "bg-[#0f3a2e]" : "bg-stone-200"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => scrollTo(s.anchor)}
                title={`Jump to ${s.label}`}
                className={
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-300 " +
                  (s.failed
                    ? "bg-stone-300 text-white"
                    : s.done
                      ? "bg-[#0f3a2e] text-white"
                      : s.current
                        ? "bg-amber-500 text-white ring-4 ring-amber-100"
                        : "bg-stone-200 text-stone-500")
                }
              >
                {s.failed ? (
                  <X className="h-4 w-4" />
                ) : s.done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-sm font-semibold">{i + 1}</span>
                )}
              </button>
              {i < stages.length - 1 && (
                <div
                  className={`h-[3px] flex-1 ${
                    s.done ? "bg-[#0f3a2e]" : "bg-stone-200"
                  }`}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => scrollTo(s.anchor)}
              className={
                "mt-2 text-center font-sans text-xs font-medium hover:underline focus:outline-none " +
                (s.current ? "text-amber-700" : s.done ? "text-stone-900" : "text-stone-500")
              }
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickOpenInfoRequest(reqs?: InfoRequest[]): InfoRequest | null {
  if (!reqs || reqs.length === 0) return null;
  const isClosed = (s?: string) => {
    const v = (s || "").toLowerCase();
    return v === "closed" || v === "completed" || v === "submitted" || v === "responded";
  };
  const open = reqs.find((r) => !isClosed(r.status) && !r.response?.submitted_at);
  return open || null;
}

function InfoRequestPanel({
  ticket,
  infoRequests,
}: {
  ticket: string;
  infoRequests?: InfoRequest[];
}) {
  const req = useMemo(() => pickOpenInfoRequest(infoRequests), [infoRequests]);
  const initialDraft = req?.draft || req?.response || null;
  const isAlreadySubmitted = !!req?.response?.submitted_at && !req?.response?.is_draft;

  const initialItems: InfoRequestItem[] = useMemo(() => {
    const base = req?.items || [];
    const draftItems = initialDraft?.items || [];
    return base.map((it) => {
      const d = draftItems.find((d) => d.key === it.key);
      return { ...it, response_text: d?.response_text || "" };
    });
  }, [req, initialDraft]);

  const [items, setItems] = useState<InfoRequestItem[]>(initialItems);
  const [note, setNote] = useState<string>(initialDraft?.note || "");
  const [uploads, setUploads] = useState<Record<string, { url: string; filename: string }>>(() => {
    const m: Record<string, { url: string; filename: string }> = {};
    for (const f of initialDraft?.files || []) {
      const key = (f as InfoRequestFile & { field_key?: string }).field_key;
      if (key && f.url) m[key] = { url: f.url, filename: f.filename || "file" };
    }
    return m;
  });
  const [busy, setBusy] = useState<"" | "save" | "submit">("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setNote(initialDraft?.note || "");
  }, [initialItems, initialDraft]);

  if (!req) return null;

  const updateItem = (idx: number, text: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, response_text: text } : it)));
  };

  const authHeaders = (json = true): Record<string, string> => {
    const token = getPortalToken();
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const buildUpdatedFields = (): Record<string, string> => {
    const fields: Record<string, string> = {};
    for (const it of items) {
      if (!it.key) continue;
      const upload = uploads[it.key];
      const text = (it.response_text || "").trim();
      // File upload takes precedence (its s3_url is already stored server-side,
      // but we resend it so /respond writes it deterministically into proposal_data).
      if (upload?.url) fields[it.key] = upload.url;
      else if (text) fields[it.key] = text;
    }
    return fields;
  };

  const uploadFile = async (fieldKey: string, file: File) => {
    setError(null);
    setSuccess(null);
    setUploadingKey(fieldKey);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field_key", fieldKey);
      fd.append("request_id", String(req.id ?? ""));
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/request-info/upload`,
        { method: "POST", headers: authHeaders(false), body: fd },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.error as string) || (body.message as string) || `Upload failed (${res.status}).`);
        return;
      }
      const url = (body.s3_url as string) || "";
      const filename = (body.filename as string) || file.name;
      if (url) {
        setUploads((prev) => ({ ...prev, [fieldKey]: { url, filename } }));
        setSuccess(`Uploaded "${filename}".`);
      }
    } catch {
      setError("Network error during upload. Please try again.");
    } finally {
      setUploadingKey(null);
    }
  };

  const removeUpload = (fieldKey: string) => {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const doSave = async () => {
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      const updated_fields = buildUpdatedFields();
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/request-info/save`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ request_id: req.id, updated_fields }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.error as string) || (body.message as string) || `Failed to save (${res.status}).`);
        return;
      }
      const saved = Array.isArray(body.saved_fields) ? (body.saved_fields as string[]) : [];
      const labelFor = (k: string) =>
        items.find((it) => it.key === k)?.label || k;
      if (saved.length > 0) {
        setSuccess(`Draft saved — ${saved.length} field${saved.length === 1 ? "" : "s"}: ${saved.map(labelFor).join(", ")}.`);
      } else {
        setSuccess((body.message as string) || "Draft saved.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const doSubmit = async () => {
    const updated_fields = buildUpdatedFields();
    if (!note.trim() && Object.keys(updated_fields).length === 0) {
      setError("Please add a response, fill in at least one item, or upload a file before submitting.");
      return;
    }
    setBusy("submit");
    setError(null);
    setSuccess(null);
    try {
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/request-info/respond`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            request_id: req.id,
            response_note: note.trim(),
            updated_fields,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.error as string) || (body.message as string) || `Failed to submit (${res.status}).`);
        return;
      }
      setSuccess((body.message as string) || "Response submitted to the editor.");
      // Refresh to reflect status change.
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy("");
    }
  };


  const deadline = req.resubmission_deadline || req.deadline;

  const totalItems = items.length;
  const completedItems = items.filter(
    (it) => (it.key && uploads[it.key]) || (it.response_text || "").trim().length > 0,
  ).length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <section
      id="section-info-request"
      className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm scroll-mt-24"
    >
      {/* Status banner */}
      <div className="flex items-center justify-between gap-4 border-b border-amber-100 bg-amber-50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-amber-900">
              Awaiting More Info
            </h2>
            <p className="font-sans text-xs font-medium text-amber-700">
              {deadline ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Respond by {formatDate(deadline)}
                </span>
              ) : (
                "Action required from author"
              )}
            </p>
          </div>
        </div>
        {totalItems > 0 && (
          <div className="flex flex-col items-end">
            <span className="rounded bg-amber-200/60 px-2 py-1 font-sans text-xs font-bold text-amber-900">
              {completedItems}/{totalItems} Completed
            </span>
            <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-amber-200">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8 p-8">
        {/* Editor's request context */}
        <div>
          <h1 className="mb-2 font-serif text-2xl font-bold text-stone-900">
            Editor needs additional information
          </h1>
          {(req.note || req.message) && !items.some((it) => (it.note || "").trim()) && (
            <div className="flex items-start gap-4">
              <div className="w-1 shrink-0 self-stretch rounded-full bg-stone-200" />
              <p className="whitespace-pre-wrap font-sans text-sm italic leading-relaxed text-stone-600">
                {req.note || req.message}
              </p>
            </div>
          )}
        </div>

        {isAlreadySubmitted && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
            You submitted a response on {formatDate(req.response?.submitted_at)}. You can update it below if needed.
          </div>
        )}

        {/* Numbered field cards */}
        {items.length > 0 && (
          <div className="space-y-8">
            {items.map((it, idx) => {
              const isDone =
                (it.key && !!uploads[it.key]) ||
                (it.response_text || "").trim().length > 0;
              const isSupportingDocs =
                it.key === "supporting_materials" ||
                /supporting|material|document|file|attachment/i.test(
                  it.label || "",
                );
              return (
                <div key={(it.key || "") + idx} className="relative">
                  <div className="mb-4 flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                        isDone
                          ? "bg-emerald-600 text-white"
                          : "bg-stone-900 text-white"
                      }`}
                    >
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <h3 className="font-sans text-sm font-semibold text-stone-800">
                      {it.label || it.key || `Item ${idx + 1}`}
                    </h3>
                  </div>

                  <div className="space-y-4 rounded-lg border border-stone-100 bg-stone-50 p-5">
                    {(it.note || "").trim() && (
                      <div className="space-y-1.5">
                        <label className="block font-sans text-xs font-bold uppercase tracking-tight text-stone-500">
                          Editor's request
                        </label>
                        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                          <div className="w-1 shrink-0 self-stretch rounded-full bg-amber-300" />
                          <p className="whitespace-pre-wrap font-sans text-sm italic leading-relaxed text-stone-700">
                            {it.note}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="block font-sans text-xs font-bold uppercase tracking-tight text-stone-500">
                        Your updated text
                      </label>
                      <textarea
                        value={it.response_text || ""}
                        onChange={(e) => updateItem(idx, e.target.value)}
                        placeholder="Enter the requested information here…"
                        rows={4}
                        className="min-h-[120px] w-full rounded-md border border-stone-200 bg-white p-4 font-sans text-sm text-stone-700 placeholder-stone-400 shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>

                    {it.key && isSupportingDocs && (
                      <div className="space-y-2">
                        <label className="block font-sans text-xs font-bold uppercase tracking-tight text-stone-500">
                          Supporting documents
                        </label>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-200 bg-white px-4 py-2 font-sans text-sm font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50">
                            <Upload className="h-4 w-4 text-stone-400" />
                            {uploadingKey === it.key ? "Uploading…" : "Upload file"}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingKey !== null}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f && it.key) uploadFile(it.key, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {!uploads[it.key] && (
                            <span className="font-sans text-xs text-stone-400">
                              Max file size: 10MB
                            </span>
                          )}
                          {uploads[it.key] && (
                            <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 font-sans text-xs text-emerald-700">
                              <Paperclip className="h-3.5 w-3.5" />
                              <a
                                href={uploads[it.key].url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {uploads[it.key].filename}
                              </a>
                              <button
                                type="button"
                                onClick={() => removeUpload(it.key!)}
                                className="text-emerald-700/70 hover:text-rose-600"
                                aria-label="Remove uploaded file"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
            {success}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-8 py-5">
        <button
          type="button"
          onClick={doSave}
          disabled={busy !== ""}
          className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-stone-500 transition-colors hover:text-stone-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={doSubmit}
            disabled={busy !== ""}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-sans text-sm font-bold text-white shadow-sm transition-all hover:bg-orange-700 disabled:opacity-60"
          >
            {busy === "submit" ? "Submitting…" : "Submit response"}
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}