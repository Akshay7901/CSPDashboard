import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  FileText,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
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
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, getPortalToken } from "@/lib/auth";
import { formatDate, initialsFromName, displayNameFromEmail } from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function MetaRow({
  label,
  defaultValue,
  multiline,
}: {
  label: string;
  defaultValue?: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 border-t border-stone-200 first:border-t-0 sm:grid-cols-[220px_1fr]">
      <div className="flex items-start bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
        {label}
      </div>
      <div className="border-t border-stone-200 px-4 py-3 sm:border-l sm:border-t-0">
        {multiline ? (
          <Textarea
            defaultValue={defaultValue || ""}
            rows={3}
            className="w-full border-stone-200 bg-white font-sans text-sm text-stone-800"
          />
        ) : (
          <Input
            defaultValue={defaultValue || ""}
            className="h-10 w-full border-stone-200 bg-white font-sans text-sm text-stone-800"
          />
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
  current_data: Record<string, string | undefined>;
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
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
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
  const [editorialSummary, setEditorialSummary] = useState("");
  const [originalOpen, setOriginalOpen] = useState(false);

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
      filename?: string;
      width_px?: number;
      height_px?: number;
      uploaded_at?: string;
    } | null;
  };
  const [metadata, setMetadata] = useState<ProposalMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Request Revisions (request-info) modal state
  const REVISION_AREAS: { key: string; label: string }[] = [
    { key: "abstract_blurb", label: "Abstract / Blurb" },
    { key: "table_of_contents", label: "Table of Contents" },
    { key: "supporting_materials", label: "Supporting Materials" },
    { key: "author_credentials", label: "Author Credentials" },
    { key: "market_analysis", label: "Market Analysis" },
    { key: "scope_framing", label: "Scope / Framing" },
    { key: "word_count", label: "Word Count / Length" },
    { key: "other", label: "Other" },
  ];
  const [reqRevOpen, setReqRevOpen] = useState(false);
  const [reqRevAreas, setReqRevAreas] = useState<string[]>([]);
  const [reqRevNote, setReqRevNote] = useState("");
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
    language: "English",
    author_copies: "5",
    if_two_author_copies: "3",
    if_three_or_four_author_copies: "2",
    copies_sold_revenue: "10",
    secondary_rights_revenue: "50",
    publishing_agreement: "Standard Publishing Agreement",
  });

  const openIssueContract = () => {
    setContractType("author");
    setContractAmendments("");
    setContractNote("");
    setContractExpiryDays(14);
    setContractError(null);
    setContractSuccess(null);
    setContractStep(1);
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
        REVIEW_SECTIONS.forEach(({ key, label }) => {
          const v = sectionByLabel[label];
          if (key === "other_comments") {
            const merged = [v, ...otherBuckets].filter(Boolean).join("\n\n");
            if (merged) reviewPayload[key] = merged;
          } else if (v) {
            reviewPayload[key] = v;
          }
        });
        if (editorialSummary.trim()) reviewPayload.dr_note = editorialSummary.trim();
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

      const payload: Record<string, unknown> = {
        contract_type: contractType,
        title: cd.main_title || title,
        expiry_days: contractExpiryDays,
        language: contractFields.language,
        author_copies: contractFields.author_copies,
        if_two_author_copies: contractFields.if_two_author_copies,
        if_three_or_four_author_copies: contractFields.if_three_or_four_author_copies,
        copies_sold_revenue: Number(contractFields.copies_sold_revenue) || 0,
        secondary_rights_revenue: Number(contractFields.secondary_rights_revenue) || 0,
        publishing_agreement: contractFields.publishing_agreement,
      };
      if (cd.subtitle) payload.subtitle = cd.subtitle;
      if (contractAmendments.trim()) payload.addendum = contractAmendments.trim();
      if (contractNote.trim()) payload.notes = contractNote.trim();
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
    setReqRevAreas([]);
    setReqRevNote("");
    setReqRevDeadline("");
    setReqRevError(null);
    setReqRevSuccess(null);
    setReqRevOpen(true);
  };

  const openRequestMajorRevision = () => {
    setReqRevMode("major");
    setReqRevAreas([]);
    setReqRevNote("");
    setReqRevDeadline("");
    setReqRevError(null);
    setReqRevSuccess(null);
    setReqRevOpen(true);
  };

  const toggleReqRevArea = (key: string) =>
    setReqRevAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const submitRequestRevisions = async () => {
    if (reqRevAreas.length === 0 || !reqRevNote.trim()) return;
    setReqRevSubmitting(true);
    setReqRevError(null);
    setReqRevSuccess(null);
    try {
      const token = getPortalToken();
      const items = REVISION_AREAS.filter((a) => reqRevAreas.includes(a.key)).map(
        ({ key, label }) => ({ key, label }),
      );
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
            note: reqRevNote.trim(),
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
      REVIEW_SECTIONS.forEach(({ key, label }) => {
        const v = sectionByLabel[label];
        if (key === "other_comments") {
          const merged = [v, ...otherBuckets].filter(Boolean).join("\n\n");
          if (merged) payload[key] = merged;
        } else if (v) {
          payload[key] = v;
        }
      });
      if (editorialSummary.trim()) payload.dr_note = editorialSummary.trim();
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
        setReviews(list.filter((r) => r.is_submitted));
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
          timer = setTimeout(() => load(false), 20000);
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

  const cd = data?.current_data ?? {};
  const title = cd.main_title || ticket;

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
    return s === "review_returned" && reviews.length > 0;
  }, [data?.status, reviews.length]);

  const isDeclined = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "declined";
  }, [data?.status]);

  const isAwaitingMoreInfo = useMemo(() => {
    const s = (data?.status || "").toLowerCase().replace(/\s+/g, "_");
    return s === "awaiting_more_info";
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
  const isContractSigned = useMemo(() => {
    const cs = (latestContract?.status || "").toLowerCase();
    return cs === "signed";
  }, [latestContract]);

  useEffect(() => {
    if (!isContractSigned || !ticket) return;
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
  }, [isContractSigned, ticket]);

  const primaryReview = reviews[0];
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
    if (commentsSeeded || !primaryReview) return;
    const rd = (primaryReview.review_data || {}) as Record<string, unknown>;
    const seeded: ReviewComment[] = [];
    REVIEW_SECTIONS.forEach(({ key, label }) => {
      const v = rd[key];
      const text = typeof v === "string" ? v.trim() : "";
      if (!text) return;
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
  }, [commentsSeeded, primaryReview]);

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

  const onSaveNotes = (e: FormEvent) => {
    e.preventDefault();
    setSavedAt(new Date().toLocaleTimeString());
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
    <div className="min-h-screen bg-[#FAF6EE] font-sans text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-4">
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

      <main className="mx-auto max-w-7xl px-8 py-8">
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
                    {title}
                  </h1>
                  {cd.sub_title && (
                    <p className="mt-2 font-sans text-base font-medium text-amber-700">
                      {cd.sub_title}
                    </p>
                  )}
                </div>
                {isContractSigned ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" />
                    Contract Signed
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 font-sans text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {data.status?.toLowerCase().replace(/\s+/g, "_") === "awaiting_more_info"
                      ? "Request Revision"
                      : data.status}
                  </span>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2 font-sans text-sm text-stone-600">
                {cd.corresponding_author_name && (
                  <MetaItem icon="user" text={cd.corresponding_author_name} />
                )}
                {cd.email && <MetaItem icon="mail" text={cd.email} />}
                {cd.institution && <MetaItem icon="building" text={cd.institution} />}
                <MetaItem icon="calendar" text={formatDate(data.submitted_at)} />
              </div>
            </section>
                {isContractSigned && (
                  <Card className="mt-6 overflow-hidden border-stone-200">
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
                        const md = metadata.metadata || {};
                        const authorsList = md.authors || [];
                        const coverUrl = metadata.cover_image?.s3_url;
                        return (
                          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                            <MetaRow label="Title Full" defaultValue={md.full_title} />
                            <MetaRow label="Title" defaultValue={md.title} />
                            <MetaRow label="Subtitle" defaultValue={md.subtitle} />
                            <MetaRow label="Category Auth/Ed" defaultValue={md.category} />
                            <MetaRow label="Display Names" defaultValue={md.display_names} />
                            <MetaRow label="Display Bios" defaultValue={md.display_bios} multiline />
                            <MetaRow label="Book Description" defaultValue={md.book_description} multiline />
                            <MetaRow label="Keywords" defaultValue={md.keywords} />
                            <MetaRow label="Website Classification" defaultValue={md.website_classification} />
                            <MetaRow label="BIC Codes" defaultValue={md.bic} />
                            {coverUrl && (
                              <div className="grid grid-cols-[220px_1fr] gap-0 border-t border-stone-200">
                                <div className="flex items-center bg-stone-50/60 px-5 py-4 font-sans text-sm font-medium text-stone-700">
                                  Cover Image
                                </div>
                                <div className="border-l border-stone-200 px-4 py-4">
                                  <img src={coverUrl} alt="Cover" className="h-40 rounded-lg border border-stone-200 object-cover shadow-sm" />
                                </div>
                              </div>
                            )}

                            {authorsList.map((a, i) => {
                              const fullName = [a.title, a.first_name, a.last_name].filter(Boolean).join(" ");
                              const displayName = fullName || (a.email ? displayNameFromEmail(a.email) : `Author ${i + 1}`);
                              return (
                                <div key={`${a.email || i}`}>
                                  <div className="border-t border-stone-200 bg-emerald-700 px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-white">
                                    {authorsList.length > 1 ? `Primary Author(s) — ${i + 1}` : "Primary Author(s)"}
                                  </div>
                                  <MetaRow label="Display Name(s)" defaultValue={displayName} />
                                  <MetaRow label="Salutation" defaultValue={a.title} />
                                  <MetaRow label="First name" defaultValue={a.first_name} />
                                  <MetaRow label="Last name" defaultValue={a.last_name} />
                                  <MetaRow label="Email" defaultValue={a.email} />
                                  <MetaRow label="Email 2" defaultValue={a.email_2} />
                                  <MetaRow label="Institution" defaultValue={a.institution} />
                                  <MetaRow label="Country" defaultValue={a.country} />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </Card>
                )}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
              {/* Main column */}
              <div className="space-y-6">
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
                            (latestContract?.status || "").toLowerCase() === "signed"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : (latestContract?.status || "").toLowerCase() === "declined"
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-violet-50 text-violet-700 ring-violet-200"
                          }`}
                        >
                          {(latestContract?.status || "").toLowerCase() === "signed"
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
                          <div className="mt-8 space-y-2">
                            <div className="h-2 w-full rounded-full bg-stone-100" />
                            <div className="h-2 w-11/12 rounded-full bg-stone-100" />
                            <div className="h-2 w-10/12 rounded-full bg-stone-100" />
                            <div className="h-2 w-9/12 rounded-full bg-stone-100" />
                          </div>
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
                      </div>
                    </Card>

                    {/* Editorial Feedback Sent */}
                    {(latestContract?.addendum || latestContract?.notes || notes) && (
                      <Card>
                        <div className="border-b border-stone-200 px-6 py-4">
                          <h2 className="font-serif text-base font-bold text-stone-900">
                            Editorial Feedback Sent
                          </h2>
                          <p className="mt-0.5 font-sans text-sm text-stone-500">
                            This feedback was included with the contract
                          </p>
                        </div>
                        <div className="px-6 py-5">
                          <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                            {latestContract?.addendum ||
                              latestContract?.notes ||
                              notes}
                          </p>
                        </div>
                      </Card>
                    )}

                    {/* Author Question — prominent DR response panel */}
                    {hasOpenQuery && openQuery && (
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
                          <p className="mt-1 font-sans text-sm text-indigo-700/80">
                            <span className="font-semibold text-[#0E3D2F]">
                              {reviewerDisplayName}
                            </span>
                            {reviewerInstitution && (
                              <span className="text-indigo-700/70"> · {reviewerInstitution}</span>
                            )}
                          </p>
                        </div>
                        {recommendationLabel && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 font-sans text-xs font-semibold text-amber-800">
                            Recommended: {recommendationLabel}
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
                            <div className="flex flex-wrap items-start gap-3">
                              <input
                                type="text"
                                value={c.chapter}
                                onChange={(e) =>
                                  updateComment(c.id, { chapter: e.target.value })
                                }
                                placeholder="Chapter / Section"
                                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => removeComment(c.id)}
                                className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                                aria-label="Remove comment"
                              >
                                <XIcon className="h-4 w-4" />
                              </button>
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
                        <button
                          type="button"
                          onClick={addComment}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-3 font-sans text-sm font-medium text-stone-600 hover:border-[#0E3D2F] hover:text-[#0E3D2F]"
                        >
                          <Plus className="h-4 w-4" />
                          Add comment
                        </button>
                      </div>
                    </Card>

                    {/* Your Editorial Notes */}
                    <Card>
                      <CardHeader
                        title="Your Editorial Notes"
                        subtitle="These will be sent to the author along with the review comments"
                      />
                      <div className="px-7 py-6">
                        <textarea
                          value={editorialSummary}
                          onChange={(e) => setEditorialSummary(e.target.value)}
                          rows={6}
                          placeholder="Add your editorial summary, guidance, or context for the author before sending…"
                          className="w-full resize-y rounded-xl border border-stone-200 bg-white px-4 py-3 font-sans text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                        />
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
                {/* Primary Author */}
                <Card>
                  <CardHeader
                    title="Primary Author / Editor"
                    subtitle="Institutional affiliation and contact"
                    right={
                      <div className="flex items-start gap-7 font-sans text-sm">
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
                    }
                  />
                  <div className="divide-y divide-stone-300">
                    <div className="grid grid-cols-1 gap-5 px-7 py-6 sm:grid-cols-3">
                      <DataField label="Name" value={cd.corresponding_author_name} />
                      <DataField label="Email" value={cd.email} />
                      <DataField label="Institution" value={cd.institution} />
                      <DataField label="Job Title" value={cd.job_title} />
                      <DataField label="Secondary Email" value={cd.secondary_email} />
                    </div>
                    {cd.address && (
                      <div className="px-7 py-6">
                        <DataField label="Mailing Address" value={cd.address} />
                      </div>
                    )}
                    {cd.biography && (
                      <div className="px-7 py-6">
                        <DataField label="Biography" value={cd.biography} multiline />
                      </div>
                    )}
                  </div>
                </Card>

                {/* Additional Authors */}
                {cd.co_authors_editors && (
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
                )}

                {/* Manuscript Details */}
                <Card>
                  <CardHeader title="Manuscript Details" />
                  <div className="grid grid-cols-2 gap-6 px-7 py-6 sm:grid-cols-4">
                    <Stat label="Word Count" value={formatNumber(cd.word_count) || "—"} large />
                    <Stat
                      label="Illustrations / Tables"
                      value={cd.figures_tables_count || "—"}
                      large
                    />
                    <Stat
                      label="Under Review Elsewhere"
                      value={cd.under_review_elsewhere || "—"}
                      large
                    />
                    <Stat
                      label="Est. Completion"
                      value={cd.expected_completion_date || "—"}
                      large
                    />
                  </div>
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
                {cd.marketing_info && (
                  <Card>
                    <CardHeader
                      title="Market & Competition"
                      subtitle="Commercial viability and competitive landscape"
                    />
                    <div className="space-y-6 px-7 py-6">
                      <div>
                        <SectionLabel>Why is this book needed?</SectionLabel>
                        <p className="mt-2 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                          {cd.marketing_info}
                        </p>
                      </div>
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
                {(cd.additional_info || cd.permissions_required) && (
                  <Card>
                    <CardHeader
                      title="Additional Notes"
                      subtitle="Copyright, permissions, special considerations"
                    />
                    <div className="space-y-4 px-7 py-6">
                      {cd.additional_info && (
                        <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                          {cd.additional_info}
                        </p>
                      )}
                      {cd.permissions_required && (
                        <DataField
                          label="Permissions Required"
                          value={cd.permissions_required}
                          multiline
                        />
                      )}
                    </div>
                  </Card>
                )}
                  </>
                )}

                {/* Supporting Documents (placeholder — API does not return files) */}
                {!isReviewReturned && !isContractIssued && (
                  <Card>
                    <CardHeader
                      title="Supporting Documents"
                      subtitle="Files attached to this proposal"
                    />
                    <div className="px-7 py-8 text-center font-sans text-sm text-stone-500">
                      No supporting documents available.
                    </div>
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
                    </div>
                  )}
                  <div className="space-y-3 border-t border-stone-300 px-5 py-4">
                    {isDeclined ? (
                      <p className="py-6 text-center font-sans text-sm text-stone-500">
                        No actions available
                      </p>
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
                            <p className="font-sans text-sm font-semibold">Issue Contract</p>
                            <p className="font-sans text-xs text-white/85">
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



                {/* Contract — shown again once the query is resolved */}
                {contracts.length > 0 && !hasOpenQuery && contractResendPrompt !== "prompt" && contractResendPrompt !== "skip" && (
                  <Card>
                    <div className="border-b border-stone-200 px-5 py-3.5">
                      <h2 className="font-serif text-base font-bold text-stone-900">
                        Contract
                      </h2>
                      <p className="mt-1 font-sans text-sm text-stone-500">
                        {contracts.length === 1
                          ? "Latest contract issued for this proposal"
                          : `${contracts.length} contract versions issued`}
                      </p>
                    </div>
                    <div className="space-y-4 px-5 py-4">
                      {contracts.map((c) => {
                        const statusKey = (c.status || "").toLowerCase();
                        const statusClass =
                          statusKey === "signed"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : statusKey === "declined" || statusKey === "voided"
                              ? "bg-rose-50 text-rose-700 ring-rose-200"
                              : statusKey === "expired"
                                ? "bg-stone-100 text-stone-600 ring-stone-200"
                                : "bg-violet-50 text-violet-700 ring-violet-200";
                        return (
                          <div
                            key={c.id}
                            className="rounded-xl border border-stone-200 bg-white p-4"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Version {c.contract_version ?? "—"}
                                {c.contract_type ? ` · ${c.contract_type}` : ""}
                              </p>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide ring-1 ${statusClass}`}
                              >
                                {c.status || "sent"}
                              </span>
                            </div>
                            <p className="mt-2 font-serif text-base font-semibold text-stone-900">
                              {c.recipient_name ||
                                displayNameFromEmail(c.recipient_email || "")}
                            </p>
                            {c.recipient_email && (
                              <p className="font-sans text-xs text-stone-500">
                                {c.recipient_email}
                              </p>
                            )}
                            <dl className="mt-3 space-y-1.5 font-sans text-xs text-stone-600">
                              {c.docusign_sent_at && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Sent</dt>
                                  <dd>{formatDate(c.docusign_sent_at)}</dd>
                                </div>
                              )}
                              {c.docusign_completed_at && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Signed</dt>
                                  <dd>{formatDate(c.docusign_completed_at)}</dd>
                                </div>
                              )}
                              {c.docusign_declined_at && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Declined</dt>
                                  <dd>{formatDate(c.docusign_declined_at)}</dd>
                                </div>
                              )}
                              {c.docusign_expires_at && !c.docusign_completed_at && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Expires</dt>
                                  <dd>{formatDate(c.docusign_expires_at)}</dd>
                                </div>
                              )}
                              {c.created_by && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Issued by</dt>
                                  <dd className="truncate">{c.created_by}</dd>
                                </div>
                              )}
                              {c.docusign_envelope_id && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-stone-500">Envelope</dt>
                                  <dd className="truncate font-mono text-[11px]">
                                    {c.docusign_envelope_id}
                                  </dd>
                                </div>
                              )}
                            </dl>
                            {c.docusign_decline_reason && (
                              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 font-sans text-xs text-rose-700 ring-1 ring-rose-200">
                                {c.docusign_decline_reason}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPdfOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                View PDF
                              </button>
                              {(c.status === "sent" || c.status === "draft") && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidReason("");
                                    setVoidError(null);
                                    setVoidOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                  Void Contract
                                </button>
                              )}
                              {c.docusign_view_url && (
                                <a
                                  href={c.docusign_view_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
                                >
                                  Open in DocuSign
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {contracts.length > 0 && !hasOpenQuery && contractResendPrompt !== "prompt" && contractResendPrompt !== "skip" && (
                  <ContractQueries
                    ticket={ticket}
                    viewer="dr"
                    onChanged={() => setContractsReloadKey((k) => k + 1)}
                  />
                )}

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
                  <form onSubmit={onSaveNotes} className="space-y-3 px-5 pb-5">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Editorial notes, flags, or comments..."
                      rows={5}
                      className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-[#3D2A1E] px-4 py-3 font-sans text-sm font-semibold text-white hover:bg-[#2c1e15]"
                    >
                      Save Notes
                    </button>
                    {savedAt && (
                      <p className="text-center font-sans text-xs text-stone-500">
                        Saved at {savedAt}
                      </p>
                    )}
                  </form>
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
              <div>
                <p className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Areas Requiring Revision <span className="text-rose-600">*</span>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REVISION_AREAS.map((area) => {
                    const checked = reqRevAreas.includes(area.key);
                    return (
                      <label
                        key={area.key}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 font-sans text-sm transition-colors ${
                          checked
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleReqRevArea(area.key)}
                          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>{area.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5">
                <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Editorial Feedback <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={reqRevNote}
                  onChange={(e) => setReqRevNote(e.target.value)}
                  rows={5}
                  placeholder="Explain what needs to be updated and why — this will be shared with the author..."
                  className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
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
                  reqRevSubmitting || reqRevAreas.length === 0 || !reqRevNote.trim()
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
                      <select
                        value={contractFields.publishing_agreement}
                        onChange={(e) =>
                          setContractFields((f) => ({
                            ...f,
                            publishing_agreement: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-800 focus:border-[#5B2EBA] focus:outline-none focus:ring-2 focus:ring-[#EDE7FA]"
                      >
                        <option>Standard Publishing Agreement</option>
                        <option>Editor Agreement</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                        Author Copies <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
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
                        type="number"
                        min={0}
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
                        type="number"
                        min={0}
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

function MetaItem({ icon, text }: { icon: "user" | "mail" | "building" | "calendar"; text: string }) {
  const paths: Record<typeof icon, string> = {
    user:
      "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
    mail: "M4 6h16v12H4z M4 6l8 7 8-7",
    building: "M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M9 9h2M9 13h2M9 17h2",
    calendar:
      "M4 7h16M4 7v12a2 2 0 002 2h12a2 2 0 002-2V7M4 7l1-3h14l1 3M9 11h6M9 15h6",
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
    <div className="flex items-start justify-between gap-6 border-b border-stone-200 px-5 py-3.5">
      <div>
        <h2 className="font-serif text-base font-bold text-stone-900">{title}</h2>
        {subtitle && (
          <p className="mt-1 font-sans text-sm text-stone-500">{subtitle}</p>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-stone-500">
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
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p
        className={`mt-1.5 font-sans text-sm font-medium text-stone-900 ${
          multiline ? "whitespace-pre-line font-normal text-stone-700 leading-relaxed" : ""
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
    <div>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-stone-500">
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