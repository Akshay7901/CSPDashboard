import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Plus,
  ChevronRight,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  HelpCircle,
  FileText,
  XCircle,
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, getPortalToken } from "@/lib/auth";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { formatDate, initialsFromName, type Proposal, type StatusKey } from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";
import { getContract } from "@/lib/contractsApi";
import { ContractQueries } from "@/components/contract-queries";
import { MetadataQueries } from "@/components/metadata-queries";
import { MessageSquare, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/dashboard/author")({
  head: () => ({ meta: [{ title: "Author Portal — My Proposals" }] }),
  component: AuthorDashboard,
});

type PillKey =
  | "submitted"
  | "additional_info_required"
  | "peer_review"
  | "feedback_and_contract_issued"
  | "final_review_and_confirmation"
  | "confirmed_and_finalised"
  | "declined";

// Statuses where the author needs to take action.
// "question" means we are preparing a response for the author → in progress, not attention.
const ATTENTION: StatusKey[] = ["revisions", "contract", "major_revisions"];

function isAwaitingInfoRaw(raw?: string, display?: string) {
  const r = (raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  const d = (display || "").trim().toLowerCase();
  return (
    r === "awaiting_more_info" ||
    r === "additional_info_required" ||
    r === "additional_information_required" ||
    d === "awaiting more info" ||
    d === "additional info required" ||
    d === "additional information required"
  );
}

type LocalProposal = Proposal & {
  rawStatus?: string;
  rawDisplayStatus?: string;
  proposedTitle?: string;
  proposedSubtitle?: string;
};

type InfoRequestItem = { key?: string; label?: string; response_text?: string };
type InfoRequest = {
  id?: string | number;
  status?: string;
  note?: string;
  message?: string;
  resubmission_deadline?: string;
  deadline?: string;
  created_at?: string;
  items?: InfoRequestItem[];
  response?: { submitted_at?: string; is_draft?: boolean } | null;
};

type OpenInfoRequest = {
  items: { key?: string; label?: string }[];
  note?: string;
  deadline?: string;
  createdAt?: string;
};

type LocalProposalWithInfo = LocalProposal & {
  openInfoRequest?: OpenInfoRequest | null;
  metadataNeedsApproval?: boolean;
};

function pickOpenInfoRequest(reqs?: InfoRequest[]): OpenInfoRequest | null {
  if (!Array.isArray(reqs) || reqs.length === 0) return null;
  const open = reqs.find((r) => {
    const s = (r.status || "").toLowerCase();
    const responded = !!r.response?.submitted_at && !r.response?.is_draft;
    return !responded && s !== "completed" && s !== "closed" && s !== "resolved";
  });
  const chosen = open || reqs[reqs.length - 1];
  if (!chosen) return null;
  return {
    items: (chosen.items || []).map((i) => ({ key: i.key, label: i.label })),
    note: chosen.note || chosen.message,
    deadline: chosen.resubmission_deadline || chosen.deadline,
    createdAt: chosen.created_at,
  };
}

// API → local status mapping (mirrors dashboard.decision_reviewer.tsx).
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
  final_review_and_confirmation: "signed",
  feedback_and_contract_issued: "contract",
  declined: "declined",
  awaiting_more_info: "revisions",
  revisions_requested: "revisions",
  additional_info_required: "revisions",
  additional_information_required: "revisions",
  major_revisions: "major_revisions",
};

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
  "feedback & contract issued": "contract",
  "feedback and contract issued": "contract",
  "final review & confirmation": "signed",
  "final review and confirmation": "signed",
  "confirmed & finalised": "approved",
  "confirmed and finalised": "approved",
  "confirmed & finalized": "approved",
  "submitted": "submitted",
  "awaiting more info": "revisions",
  "additional info required": "revisions",
  "additional information required": "revisions",
  "revisions requested": "revisions",
  "major revisions required": "major_revisions",
  "major revisions": "major_revisions",
};

const EXTRA_STATUSES = [
  "submitted",
  "additional_info_required",
  "peer_review",
  "feedback_and_contract_issued",
  "final_review_and_confirmation",
  "confirmed_and_finalised",
  "declined",
];

function normalizeStatus(raw?: string, display?: string): StatusKey {
  if (display) {
    const k = display.trim().toLowerCase();
    if (DISPLAY_STATUS_MAP[k]) return DISPLAY_STATUS_MAP[k];
  }
  if (raw) {
    const lower = raw.trim().toLowerCase();
    const snake = lower.replace(/\s+/g, "_");
    if (STATUS_MAP[snake]) return STATUS_MAP[snake];
    if (DISPLAY_STATUS_MAP[lower]) return DISPLAY_STATUS_MAP[lower];
  }
  return "submitted";
}

type ApiProposalItem = {
  ticket_number: string;
  title?: string;
  status?: string;
  display_status?: string;
  submitted_at?: string;
  updated_at?: string;
  corresponding_author?: string;
  email?: string;
  current_data?: Record<string, string | undefined>;
};

function toProposal(p: ApiProposalItem): LocalProposal {
  const cd = p.current_data || {};
  const title = p.title || cd.main_title || p.ticket_number;
  const kind = cd.book_type || cd.proposal_type || "Proposal";
  const origTitle = (cd.main_title || p.title || "").trim();
  const origSubtitle = ((cd as Record<string, string | undefined>).sub_title || "").trim();
  const rawPT = (cd.proposed_title || cd.proposed_book_title || "").trim();
  const rawPS = (
    cd.proposed_subtitle ||
    cd.proposed_sub_title ||
    cd.proposed_book_subtitle ||
    ""
  ).trim();
  return {
    id: p.ticket_number,
    ref: p.ticket_number,
    title,
    kind,
    proposedTitle: rawPT && rawPT !== origTitle ? rawPT : undefined,
    proposedSubtitle: rawPS && rawPS !== origSubtitle ? rawPS : undefined,
    status: normalizeStatus(p.status, p.display_status),
    rawStatus: p.status,
    rawDisplayStatus: p.display_status,
    authorName: p.corresponding_author || cd.author_name || "",
    authorEmail: p.email || "",
    authorAffiliation: cd.affiliation || cd.institution || "",
    country: cd.country || "",
    mailingAddress: "",
    biography: "",
    submittedAt: p.submitted_at || "",
    updatedAt: p.updated_at || p.submitted_at || "",
    wordCount: 0,
    illustrations: 0,
    nonEnglish: false,
    estCompletion: "",
    discipline: cd.discipline || "",
    subdiscipline: "",
    overview: cd.overview || "",
    keywords: [],
    keyFeatures: "",
    intendedAudience: "",
    tableOfContents: [],
    whyNeeded: "",
    competingTitles: "",
    suggestedReviewers: [],
    additionalNotes: "",
    supportingDocs: [],
    decisionSummary: "",
  };
}

const PILLS: { key: PillKey; label: string; dot: string; match: (p: LocalProposal) => boolean }[] = [
  {
    key: "submitted",
    label: "Submitted",
    dot: "bg-amber-400",
    match: (p) => p.status === "submitted",
  },
  {
    key: "additional_info_required",
    label: "Additional Info Required",
    dot: "bg-amber-500",
    match: (p) =>
      p.status === "revisions" || isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus),
  },
  {
    key: "peer_review",
    label: "Peer Review",
    dot: "bg-sky-500",
    match: (p) => p.status === "in_review",
  },
  {
    key: "feedback_and_contract_issued",
    label: "Feedback & Contract Issued",
    dot: "bg-violet-500",
    match: (p) => p.status === "contract",
  },
  {
    key: "final_review_and_confirmation",
    label: "Final Review & Confirmation",
    dot: "bg-emerald-500",
    match: (p) => p.status === "signed",
  },
  {
    key: "confirmed_and_finalised",
    label: "Confirmed & Finalised",
    dot: "bg-emerald-600",
    match: (p) => p.status === "approved",
  },
  {
    key: "declined",
    label: "Declined",
    dot: "bg-stone-400",
    match: (p) => p.status === "declined",
  },
];

interface CardConfig {
  bannerLabel: string;
  bannerDot: string;
  bannerTint: string;
  bannerText: string;
  tag?: "ACTION REQUIRED";
  iconBg: string;
  iconColor: string;
  Icon: typeof Pencil;
  eyebrow: string;
  eyebrowColor: string;
  body: string;
  cta?: { label: string; className: string };
  footnote?: string;
}

function configFor(p: LocalProposal): CardConfig {
  if ((p as LocalProposalWithInfo).metadataNeedsApproval) {
    return {
      bannerLabel: "Action Required",
      bannerDot: "bg-orange-500",
      bannerTint: "bg-orange-50",
      bannerText: "text-orange-700",
      tag: "ACTION REQUIRED",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      Icon: Pencil,
      eyebrow: "Please review and approve your book metadata",
      eyebrowColor: "text-orange-700",
      body: "Our editorial team has sent the metadata for your book (title, description, keywords, cover etc.) for your review. Please approve it or raise a query so we can proceed.",
      cta: {
        label: "Review and approve metadata",
        className: "bg-orange-500 hover:bg-orange-600 text-white",
      },
      footnote: "Production cannot move forward until you approve the metadata.",
    };
  }
  if (isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus)) {
    return {
      bannerLabel: "Revisions Requested",
      bannerDot: "bg-orange-500",
      bannerTint: "bg-orange-50",
      bannerText: "text-orange-700",
      tag: "ACTION REQUIRED",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      Icon: Pencil,
      eyebrow: "Your input is needed",
      eyebrowColor: "text-orange-700",
      body: "Our editorial team has reviewed your proposal and would like you to address a few points before we can continue.",
      cta: {
        label: "Read feedback and edit your submission",
        className: "bg-orange-500 hover:bg-orange-600 text-white",
      },
      footnote: "Please open the submission, read the editor's feedback, and update your proposal accordingly.",
    };
  }
  switch (p.status) {
    case "revisions":
      return {
        bannerLabel: "Revisions Requested",
        bannerDot: "bg-orange-500",
        bannerTint: "bg-orange-50",
        bannerText: "text-orange-700",
        tag: "ACTION REQUIRED",
        iconBg: "bg-orange-100",
        iconColor: "text-orange-600",
        Icon: Pencil,
        eyebrow: "Your input is needed",
        eyebrowColor: "text-orange-700",
        body: "Our editorial team has reviewed your proposal and would like you to address a few points before we can continue.",
        cta: {
          label: "Read feedback and edit your submission",
          className: "bg-orange-500 hover:bg-orange-600 text-white",
        },
        footnote: "Please open the submission, read the editor's feedback, and update your proposal accordingly.",
      };
    case "contract":
      return {
        bannerLabel: "Contract Issued",
        bannerDot: "bg-violet-500",
        bannerTint: "bg-violet-50",
        bannerText: "text-violet-700",
        tag: "ACTION REQUIRED",
        iconBg: "bg-violet-100",
        iconColor: "text-violet-600",
        Icon: CheckCircle2,
        eyebrow: "Your proposal has been accepted",
        eyebrowColor: "text-violet-700",
        body: "Congratulations — the reviewer's feedback and your publishing contract have been sent together. Please read the feedback, then sign your contract.",
        cta: {
          label: "Read feedback and sign your contract",
          className: "bg-violet-600 hover:bg-violet-700 text-white",
        },
        footnote: "Once you sign, our production team will get in touch to begin the editorial process.",
      };
    case "major_revisions":
      return {
        bannerLabel: "Major Revisions Required",
        bannerDot: "bg-rose-500",
        bannerTint: "bg-rose-50",
        bannerText: "text-rose-700",
        tag: "ACTION REQUIRED",
        iconBg: "bg-rose-100",
        iconColor: "text-rose-600",
        Icon: AlertTriangle,
        eyebrow: "Revisions needed following review",
        eyebrowColor: "text-rose-700",
        body: "Following expert peer review, there are areas of your proposal that need to be addressed before we can move forward.",
        cta: {
          label: "Read the reviewer's feedback",
          className: "bg-rose-600 hover:bg-rose-700 text-white",
        },
        footnote: "Please open the submission to read the reviewer's detailed comments and resubmit your revised proposal.",
      };
    case "question":
      return {
        bannerLabel: "Question Raised",
        bannerDot: "bg-teal-500",
        bannerTint: "bg-teal-50",
        bannerText: "text-teal-700",
        tag: "ACTION REQUIRED",
        iconBg: "bg-teal-100",
        iconColor: "text-teal-600",
        Icon: HelpCircle,
        eyebrow: "A question is awaiting your reply",
        eyebrowColor: "text-teal-700",
        body: "Our editor has a question about your proposal. Please respond so we can keep moving forward.",
        cta: {
          label: "Read the editor's question",
          className: "bg-teal-600 hover:bg-teal-700 text-white",
        },
      };
    case "in_review":
      return {
        bannerLabel: "Under Review",
        bannerDot: "bg-sky-500",
        bannerTint: "bg-sky-50",
        bannerText: "text-sky-700",
        iconBg: "bg-sky-100",
        iconColor: "text-sky-600",
        Icon: ClipboardList,
        eyebrow: "Being reviewed by an expert",
        eyebrowColor: "text-sky-700",
        body: "Your proposal is currently being assessed by one of our academic specialists. This is a normal and important part of the publishing process.",
        footnote: "This typically takes 4–6 weeks. We will contact you as soon as the review is complete.",
      };
    case "review_returned":
      return {
        bannerLabel: "Review Returned",
        bannerDot: "bg-indigo-500",
        bannerTint: "bg-indigo-50",
        bannerText: "text-indigo-700",
        iconBg: "bg-indigo-100",
        iconColor: "text-indigo-600",
        Icon: FileText,
        eyebrow: "The review is back with our editors",
        eyebrowColor: "text-indigo-700",
        body: "The reviewer's report has been returned to our editorial team. We will share the outcome with you shortly.",
      };
    case "submitted":
      return {
        bannerLabel: "Submitted",
        bannerDot: "bg-amber-400",
        bannerTint: "bg-amber-50",
        bannerText: "text-amber-700",
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
        Icon: FileText,
        eyebrow: "Awaiting editor assignment",
        eyebrowColor: "text-amber-700",
        body: "Your proposal has been received and is awaiting assignment to a commissioning editor.",
      };
    case "signed":
      return {
        bannerLabel: "Contract Signed",
        bannerDot: "bg-emerald-500",
        bannerTint: "bg-emerald-50",
        bannerText: "text-emerald-700",
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
        Icon: CheckCircle2,
        eyebrow: "You're in production",
        eyebrowColor: "text-emerald-700",
        body: "Your contract is signed and our production team is now working with you on the editorial process.",
      };
    case "approved":
      return {
        bannerLabel: "Metadata Approved",
        bannerDot: "bg-emerald-500",
        bannerTint: "bg-emerald-50",
        bannerText: "text-emerald-700",
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
        Icon: CheckCircle2,
        eyebrow: "Approved & finalised",
        eyebrowColor: "text-emerald-700",
        body: "You have approved the metadata. Our production team will now finalise your record for publication.",
      };
    case "declined":
    default:
      return {
        bannerLabel: "Declined",
        bannerDot: "bg-stone-400",
        bannerTint: "bg-stone-100",
        bannerText: "text-stone-600",
        iconBg: "bg-stone-100",
        iconColor: "text-stone-500",
        Icon: XCircle,
        eyebrow: "Not progressing at this time",
        eyebrowColor: "text-stone-600",
        body: "Unfortunately your proposal does not align with our current list. Thank you for considering Cambridge Scholars Publishing.",
      };
  }
}

function AuthorDashboard() {
  const navigate = useNavigate();
  const [activePill, setActivePill] = useState<PillKey | null>(null);
  const [authorEmail, setAuthorEmail] = useState<string>("");
  const [authorName, setAuthorName] = useState<string>("");
  const [myProposals, setMyProposals] = useState<LocalProposalWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<Record<PillKey, number> | null>(null);

  const loadMyProposals = useCallback(async (email: string, silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const token = getPortalToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const fetchList = async (qs = "") => {
        const r = await proposalApiFetch(qs, { headers });
        const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) return { ok: false as const, status: r.status, error: b.error as string };
        const arr =
          (b.proposals as ApiProposalItem[]) ||
          (Array.isArray(b) ? (b as unknown as ApiProposalItem[]) : []);
        return {
          ok: true as const,
          items: arr,
          status_summary: b.status_summary as Record<string, number> | undefined,
        };
      };
      const def = await fetchList("?limit=100&sort_order=desc");
      if (!def.ok) {
        if (!silent) setLoadError(def.error || `Failed to load proposals (${def.status}).`);
        return;
      }
      if (def.status_summary) {
        setStatusSummary({
          submitted: def.status_summary.submitted ?? 0,
          additional_info_required: def.status_summary.additional_info_required ?? 0,
          peer_review: def.status_summary.peer_review ?? 0,
          feedback_and_contract_issued: def.status_summary.feedback_and_contract_issued ?? 0,
          final_review_and_confirmation: def.status_summary.final_review_and_confirmation ?? 0,
          confirmed_and_finalised: def.status_summary.confirmed_and_finalised ?? 0,
          declined: def.status_summary.declined ?? 0,
        });
      }
      const extras = await Promise.all(
        EXTRA_STATUSES.map((s) =>
          fetchList(`?limit=100&sort_order=desc&status=${encodeURIComponent(s)}`),
        ),
      );
      const merged = new Map<string, ApiProposalItem>();
      for (const it of def.items || []) merged.set(it.ticket_number, it);
      for (const r of extras) {
        if (!r.ok) continue;
        for (const it of r.items || []) {
          if (!merged.has(it.ticket_number)) merged.set(it.ticket_number, it);
        }
      }
      const lowerEmail = email.toLowerCase();
      const mine = Array.from(merged.values()).filter((p) => {
        const e = (p.email || p.current_data?.email || "").toLowerCase();
        return !e || e === lowerEmail;
      });
      const mapped: LocalProposalWithInfo[] = mine.map(toProposal);
      setMyProposals(mapped);
      // Fetch detail for proposals awaiting more info so the card can show
      // the items + note that the DR requested via /request-info.
      const needDetail = mapped.filter((p) =>
        isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus),
      );
      if (needDetail.length > 0) {
        const details = await Promise.all(
          needDetail.map(async (p) => {
            try {
              const r = await proposalApiFetch(`/${encodeURIComponent(p.id)}`, {
                headers,
              });
              const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
              if (!r.ok) return { id: p.id, info: null as OpenInfoRequest | null };
              // Primary source: dedicated /request-info endpoint.
              let reqs: InfoRequest[] = [];
              try {
                const r2 = await proposalApiFetch(
                  `/${encodeURIComponent(p.id)}/request-info`,
                  { headers },
                );
                const b2 = (await r2.json().catch(() => ({}))) as Record<string, unknown>;
                if (r2.ok) {
                  const raw = (b2.requests as Array<Record<string, unknown>>) || [];
                  reqs = raw.map((rr) => ({
                    id: rr.id as string | number | undefined,
                    status: rr.status as string | undefined,
                    note: (rr.note as string | undefined) ?? (rr.message as string | undefined),
                    resubmission_deadline: rr.resubmission_deadline as string | undefined,
                    deadline: rr.deadline as string | undefined,
                    created_at:
                      (rr.requested_at as string | undefined) ??
                      (rr.created_at as string | undefined),
                    items: (rr.items as InfoRequestItem[]) || [],
                    response: rr.responded_at
                      ? { submitted_at: rr.responded_at as string }
                      : null,
                  }));
                }
              } catch {
                // fall back to detail-embedded fields below
              }
              if (reqs.length === 0) {
                reqs =
                  (b.info_requests as InfoRequest[]) ||
                  (b.request_info as InfoRequest[]) ||
                  [];
              }
              return { id: p.id, info: pickOpenInfoRequest(reqs) };
            } catch {
              return { id: p.id, info: null as OpenInfoRequest | null };
            }
          }),
        );
        const byId = new Map(details.map((d) => [d.id, d.info]));
        setMyProposals((prev) =>
          prev.map((p) =>
            byId.has(p.id) ? { ...p, openInfoRequest: byId.get(p.id) || null } : p,
          ),
        );
      }
      // For "signed" proposals, check if metadata is awaiting author approval.
      // Backend keeps proposal status as signed/locked while metadata flips to
      // sent_to_author, so we must fetch metadata to surface the action.
      const signedList = mapped.filter(
        (p) => p.status === "signed" || p.status === "approved",
      );
      if (signedList.length > 0) {
        const metaResults = await Promise.all(
          signedList.map(async (p) => {
            try {
              const r = await proposalApiFetch(
                `/${encodeURIComponent(p.id)}/metadata`,
                { headers },
              );
              if (!r.ok) return { id: p.id, needs: false };
              const b = (await r.json().catch(() => ({}))) as {
                metadata_status?: string;
                approved_at?: string;
              };
              const needs =
                b.metadata_status === "sent_to_author" && !b.approved_at;
              return { id: p.id, needs };
            } catch {
              return { id: p.id, needs: false };
            }
          }),
        );
        const needsById = new Map(metaResults.map((m) => [m.id, m.needs]));
        setMyProposals((prev) =>
          prev.map((p) =>
            needsById.has(p.id)
              ? { ...p, metadataNeedsApproval: needsById.get(p.id) || false }
              : p,
          ),
        );
      }
      // For "contract" proposals, check whether the contract has actually
      // been signed by the author. The backend may keep proposal_status as
      // "Feedback & Contract Issued" until production confirms, so we
      // promote to "signed" locally once the contract is completed.
      const contractList = mapped.filter((p) => p.status === "contract");
      if (contractList.length > 0) {
        const results = await Promise.all(
          contractList.map(async (p) => {
            try {
              const contracts = await getContract(p.id);
              const signed = contracts.some((c) => {
                const ds = (c.docusign_status || "").toLowerCase();
                const st = (c.status || "").toLowerCase();
                return (
                  !!c.docusign_completed_at ||
                  ds === "completed" ||
                  ds === "signed" ||
                  st === "signed" ||
                  st === "completed" ||
                  st === "countersigned"
                );
              });
              return { id: p.id, signed };
            } catch {
              return { id: p.id, signed: false };
            }
          }),
        );
        const signedMap = new Map(results.map((r) => [r.id, r.signed]));
        setMyProposals((prev) =>
          prev.map((p) =>
            signedMap.get(p.id)
              ? { ...p, status: "signed" as StatusKey }
              : p,
          ),
        );
      }
    } catch {
      if (!silent) setLoadError("Network error. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session || session.role !== "author") {
        navigate({ to: "/login" });
        return;
      }
      setAuthorEmail(session.email);
      if (session.name) setAuthorName(session.name);
      void loadMyProposals(session.email);
    } catch {
      navigate({ to: "/login" });
    }
  }, [navigate, loadMyProposals]);

  useEffect(() => {
    if (!authorEmail) return;
    const id = window.setInterval(() => {
      void loadMyProposals(authorEmail, true);
    }, 300000);
    return () => window.clearInterval(id);
  }, [authorEmail, loadMyProposals]);

  // Fast poll while any proposal is awaiting contract signature, so the
  // dashboard reflects the DocuSign webhook update on api.cambridgescholars.com
  // within ~10s of the author signing. Pauses when the tab is hidden.
  const hasPendingContract = useMemo(
    () => myProposals.some((p) => p.status === "contract"),
    [myProposals],
  );
  useEffect(() => {
    if (!authorEmail || !hasPendingContract) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void loadMyProposals(authorEmail, true);
    };
    const id = window.setInterval(tick, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authorEmail, hasPendingContract, loadMyProposals]);

  const displayName = authorName || (myProposals[0]?.authorName ?? "Author");
  const initials = initialsFromName(displayName);

  const counts = useMemo(() => {
    if (statusSummary) return statusSummary;
    const c: Record<PillKey, number> = {
      submitted: 0,
      additional_info_required: 0,
      peer_review: 0,
      feedback_and_contract_issued: 0,
      final_review_and_confirmation: 0,
      confirmed_and_finalised: 0,
      declined: 0,
    };
    for (const p of myProposals) {
      for (const pill of PILLS) if (pill.match(p)) c[pill.key]++;
    }
    return c;
  }, [myProposals, statusSummary]);

  const visible = useMemo(() => {
    if (!activePill) return myProposals;
    const pill = PILLS.find((p) => p.key === activePill);
    return pill ? myProposals.filter(pill.match) : myProposals;
  }, [activePill, myProposals]);

  const attentionList = visible.filter(
    (p) =>
      ATTENTION.includes(p.status) ||
      isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus) ||
      (p as LocalProposalWithInfo).metadataNeedsApproval,
  );
  const progressList = visible.filter(
    (p) =>
      ["in_review", "review_returned", "submitted", "question"].includes(p.status) &&
      !isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus) &&
      !(p as LocalProposalWithInfo).metadataNeedsApproval,
  );
  const doneList = visible.filter(
    (p) =>
      ["signed", "approved", "declined"].includes(p.status) &&
      !(p as LocalProposalWithInfo).metadataNeedsApproval,
  );

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const metadataApprovalCount = myProposals.filter(
    (p) => (p as LocalProposalWithInfo).metadataNeedsApproval,
  ).length;
  const attentionCount =
    counts.additional_info_required + counts.feedback_and_contract_issued + metadataApprovalCount;

  return (
    <main className="min-h-screen bg-[#FAF6EE] font-sans text-stone-900">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <img src={cspLogo} alt="CSP" className="h-10 w-10" />
            <div className="flex items-center gap-3">
              <span className="font-serif text-base font-bold text-text">
                Cambridge Scholars Publishing
              </span>
              <span className="text-stone-300">|</span>
              <span className="font-sans text-sm font-medium text-portal-author">Author Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-100 text-sm font-semibold text-orange-700">
                {initials}
              </span>
              <span className="font-sans text-sm text-text">{displayName}</span>
            </div>
            <span className="text-stone-300">|</span>
            <ChangePasswordButton
              triggerClassName="font-sans text-sm text-text-muted transition-colors hover:text-text inline-flex items-center gap-1.5"
            />
            <span className="text-stone-300">|</span>
            <button onClick={onLogout} className="font-sans text-sm text-text-muted transition-colors hover:text-text">
              Logout
            </button>
          </div>
        </div>
        <div className="h-[3px] bg-orange-500/80" />
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <h1 className="font-serif text-3xl font-bold text-text">My Proposals</h1>
        <p className="mt-1.5 font-sans text-sm leading-relaxed text-text-muted">
          Here you can see all of your book proposals and what is happening with each one.
        </p>

        {loading && (
          <p className="mt-6 text-sm text-stone-500">Loading your proposals…</p>
        )}
        {loadError && (
          <p className="mt-6 text-sm text-rose-600">{loadError}</p>
        )}
        {!loading && !loadError && myProposals.length === 0 && (
          <p className="mt-6 text-sm text-stone-500">
            You don't have any proposals yet.
          </p>
        )}

        {/* Attention banner */}
        {attentionCount > 0 && (
          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-600">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-orange-700">
                {attentionCount} proposals need your attention
              </p>
              <p className="text-sm text-stone-600">
                Please scroll down to see what is needed and take action.
              </p>
            </div>
          </div>
        )}

        {/* Pills */}
        <div className="mt-6 flex flex-wrap gap-2">
          {PILLS.map((pill) => {
            const active = activePill === pill.key;
            return (
              <button
                key={pill.key}
                onClick={() => setActivePill(pill.key)}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors " +
                  (active
                    ? "border-[#00422F] bg-[#00422F] text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300")
                }
              >
                {pill.dot && <span className={`h-2 w-2 rounded-full ${pill.dot}`} />}
                <span>{pill.label}</span>
                <span
                  className={
                    "inline-grid min-w-[22px] place-items-center rounded-full px-2 text-xs " +
                    (active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600")
                  }
                >
                  {counts[pill.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Submit a proposal */}
        <div className="mb-6 mt-6 flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
          <div>
            <p className="font-sans text-sm font-semibold text-text">Have a new book idea?</p>
            <p className="font-sans text-xs text-text-muted mt-0.5">Submit a new proposal to our editorial team.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-[#E6674A] px-4 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#d35a3f]">
            <Plus className="h-4 w-4" />
            Submit a proposal
          </button>
        </div>

        {/* Sections */}
        {attentionList.length > 0 && (
          <Section title="ACTION REQUIRED" dot="bg-orange-500">
            {attentionList.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
          </Section>
        )}
        {progressList.length > 0 && (
          <Section title="IN PROGRESS" dot="bg-sky-500">
            {progressList.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
          </Section>
        )}
        {doneList.length > 0 && (
          <Section title="WITH PUBLISHER" dot="bg-emerald-500">
            {doneList.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  dot,
  children,
}: {
  title: string;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</h2>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function ProposalCard({ p }: { p: LocalProposalWithInfo }) {
  const cfg = configFor(p);
  const Icon = cfg.Icon;
  const info = p.openInfoRequest;
  const showInfo =
    isAwaitingInfoRaw(p.rawStatus, p.rawDisplayStatus) &&
    info &&
    ((info.items && info.items.length > 0) || (info.note && info.note.trim()));
  return (
    <article
      className={
        "overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
      }
    >
      {/* Banner */}
      <div className={`flex items-center justify-between gap-3 border-b border-orange-100 px-5 py-3 ${cfg.bannerTint}`}>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${cfg.bannerDot}`} />
          <span className={`font-sans text-sm font-semibold ${cfg.bannerText}`}>{cfg.bannerLabel}</span>
          {cfg.tag && (
            <>
              <span className="text-stone-400">—</span>
              <span className={`font-sans text-xs font-bold tracking-wider ${cfg.bannerText}`}>
                {cfg.tag}
              </span>
            </>
          )}
        </div>
        <span className="font-sans text-xs text-text-muted">{formatDate(p.updatedAt)}</span>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cfg.iconBg}`}>
            <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-sans text-xs font-semibold ${cfg.eyebrowColor}`}>{cfg.eyebrow}</p>
            {p.proposedTitle && (
              <p className="mt-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Proposed Title:{" "}
                <span className="font-serif text-xs font-normal normal-case tracking-normal text-text">
                  {p.proposedTitle}
                  {p.proposedSubtitle ? `: ${p.proposedSubtitle}` : ""}
                </span>
              </p>
            )}
            <h3 className="mt-0.5 font-serif text-base font-bold leading-snug text-text">{p.title}</h3>
            <p className="mt-1 font-sans text-xs text-text-muted">{p.kind}</p>
          </div>
        </div>

        <p className="mt-4 font-sans text-sm leading-relaxed text-text">{cfg.body}</p>

        {showInfo && info && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-orange-700">
              Additional information requested
            </p>
            {info.items && info.items.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 font-sans text-sm text-text">
                {info.items.map((it, i) => (
                  <li key={(it.key || "") + i}>{it.label || it.key}</li>
                ))}
              </ul>
            )}
            {info.note && info.note.trim() && (
              <p className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-text">
                <span className="font-semibold">Note from editor: </span>
                {info.note}
              </p>
            )}
            {info.deadline && (
              <p className="mt-2 font-sans text-xs text-text-muted">
                Please respond by {formatDate(info.deadline)}.
              </p>
            )}
          </div>
        )}

        {cfg.cta && (
          <Link
            to="/dashboard/author_proposal/$id"
            params={{ id: p.id }}
            className={
              "mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-sans text-sm font-semibold shadow-sm transition-colors " +
              cfg.cta.className
            }
          >
            {cfg.cta.label}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}

        {cfg.footnote && (
          <p className="mt-4 flex items-start gap-2 font-sans text-xs text-text-muted">
            <span className="mt-0.5">→</span>
            <span>{cfg.footnote}</span>
          </p>
        )}

        {!cfg.cta && !cfg.footnote && (
          <div className="mt-4 flex justify-end border-t border-stone-100 pt-3">
            <Link
              to="/dashboard/author_proposal/$id"
              params={{ id: p.id }}
              className="inline-flex items-center gap-1 font-sans text-sm font-medium text-[#00422F] transition-colors hover:text-[#00321f]"
            >
              View full details <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {!cfg.cta && cfg.footnote && (
          <div className="mt-4 flex justify-end border-t border-stone-100 pt-3">
            <Link
              to="/dashboard/author_proposal/$id"
              params={{ id: p.id }}
              className="inline-flex items-center gap-1 font-sans text-sm font-medium text-[#00422F] transition-colors hover:text-[#00321f]"
            >
              View full details <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

      </div>
    </article>
  );
}

function QueriesSection({ p }: { p: LocalProposalWithInfo }) {
  const [open, setOpen] = useState(false);
  const showMetadata =
    p.status === "signed" ||
    p.status === "approved" ||
    !!p.metadataNeedsApproval;
  return (
    <div className="mt-4 border-t border-stone-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-stone-500" />
          Queries &amp; responses
        </span>
        <ChevronDown
          className={`h-4 w-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <ContractQueries ticket={p.id} viewer="author" />
          {showMetadata && (
            <MetadataQueries
              ticket={p.id}
              viewer="author"
              canRaise={!!p.metadataNeedsApproval}
            />
          )}
        </div>
      )}
    </div>
  );
}