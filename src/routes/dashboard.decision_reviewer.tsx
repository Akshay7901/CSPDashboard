import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  LogOut,
  Users,
  Plus,
  X,
  Trash2,
  History,
  UserCog,
  Lock,
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, getPortalToken, isAdmin as checkIsAdmin } from "@/lib/auth";
import { deleteProposal } from "@/lib/adminApi";
import { toast } from "sonner";
import {
  STATUS_META,
  type StatusKey,
  formatDate,
  initialsFromName,
  displayNameFromEmail,
  getStatusMeta,
} from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";
import { getMetadata, getMetadataQueries } from "@/lib/metadataApi";
import {
  getProofreaderQueue,
  type ProofreaderQueueItem,
  type ProofreaderQueueTab,
} from "@/lib/proofreaderApi";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { getDefaultReviewerEmail, setDefaultReviewerEmail } from "@/lib/defaultReviewer";
import { fetchAiScores } from "@/lib/aiReviewApi";

type PeerReviewer = {
  id: number;
  name: string;
  email: string;
  assigned_proposals_count?: number;
  created_at?: string;
};

type ApiProposal = {
  ticket_number: string;
  corresponding_author: string;
  email: string;
  country: string;
  title: string;
  submitted_at: string;
  status: string;
  display_status?: string;
  action_required?: boolean;
  current_data?: Record<string, string | undefined>;
  assignments?:
    | Array<{
        reviewer_email?: string;
        assigned_at?: string;
        peer_reviewer_status?: string;
        display_status?: string;
      }>
    | {
        reviewer_email?: string;
        assigned_at?: string;
        peer_reviewer_status?: string;
        display_status?: string;
      }
    | null;
};

// API may return `assignments` as a single object (current shape) or an array.
// Normalize so consumers can always iterate.
const toAssignmentsArray = (
  a: ApiProposal["assignments"],
): Array<{
  reviewer_email?: string;
  assigned_at?: string;
  peer_reviewer_status?: string;
  display_status?: string;
}> => {
  if (!a) return [];
  return Array.isArray(a) ? a : [a];
};

type ProposalRow = {
  id: string;
  title: string;
  proposedTitle?: string;
  proposedSubtitle?: string;
  kind: string;
  authorName: string;
  authorAffiliation: string;
  country: string;
  institution: string;
  subject: string;
  submittedAt: string;
  status: StatusKey;
  rawStatus: string;
  displayStatus?: string;
  actionRequired?: boolean;
  currentReviewerEmail?: string;
  currentReviewerStatus?: string;
  aiScore?: number | null;
};

const STATUS_MAP: Record<string, StatusKey> = {
  new: "submitted",
  in_review: "in_review",
  review_returned: "review_returned",
  contract_issued: "contract",
  queries_raised: "question",
  awaiting_author_approval: "proofreader_review",
  author_approved: "author_approved",
  locked: "signed",
  declined: "declined",
  awaiting_more_info: "revisions",
};

// Reverse mapping: which raw API status values feed each local bucket.
// Used to fetch every status when the user picks "All" (the API's default
// list omits terminal states like declined / signed).
const API_STATUSES_BY_KEY: Record<StatusKey, string[]> = {
  submitted: ["new"],
  revisions: ["awaiting_more_info"],
  in_review: ["in_review"],
  review_returned: ["review_returned"],
  major_revisions: [],
  contract: ["contract_issued"],
  proofreader_review: ["awaiting_author_approval"],
  author_approved: ["author_approved"],
  question: ["queries_raised"],
  signed: ["locked", "contract_signed", "contract_received"],
  approved: [],
  declined: ["declined"],
};
const ALL_API_STATUSES = Array.from(
  new Set(Object.values(API_STATUSES_BY_KEY).flat()),
);

// Normalize a free-form display_status string (e.g. "Review Returned",
// "Contract Issued") to our local StatusKey so the badge style + filter
// bucket stay in sync with the API's status_summary.
const DISPLAY_STATUS_MAP: Record<string, StatusKey> = {
  submitted: "submitted",
  new: "submitted",
  "in review": "in_review",
  "under review": "in_review",
  "review returned": "review_returned",
  "contract issued": "contract",
  "contract received": "signed",
  "awaiting author approval": "proofreader_review",
  "proofreader review": "proofreader_review",
  "queries raised": "question",
  "question raised": "question",
  "author approved": "author_approved",
  locked: "signed",
  "contract signed": "signed",
  declined: "declined",
  "awaiting more info": "revisions",
  "additional info required": "revisions",
  "revisions requested": "revisions",
};

const normalizeStatus = (raw: string, display?: string): StatusKey => {
  if (display) {
    const key = display.trim().toLowerCase();
    if (DISPLAY_STATUS_MAP[key]) return DISPLAY_STATUS_MAP[key];
  }
  if (raw) {
    const lower = raw.trim().toLowerCase();
    const snake = lower.replace(/\s+/g, "_");
    if (STATUS_MAP[snake]) return STATUS_MAP[snake];
    if (DISPLAY_STATUS_MAP[lower]) return DISPLAY_STATUS_MAP[lower];
  }
  return "submitted";
};

const mapApiProposal = (p: ApiProposal): ProposalRow => {
  const cd = p.current_data || {};
  const institution = cd.affiliation || cd.institution || "";
  const subject = cd.discipline || cd.subject_area || cd.subject || "";
  const assignsList = toAssignmentsArray(p.assignments);
  const activeAssign =
    assignsList.find(
      (a) => !/complete|returned|done/i.test(a.peer_reviewer_status || a.display_status || ""),
    ) || assignsList[0];
  const origTitle = (p.title || "").trim();
  const origSubtitle = ((cd as Record<string, string | undefined>).sub_title || "").trim();
  const rawProposedTitle = (cd.proposed_title || cd.proposed_book_title || "").trim();
  const rawProposedSubtitle = (
    cd.proposed_subtitle ||
    cd.proposed_sub_title ||
    cd.proposed_book_subtitle ||
    ""
  ).trim();
  return {
    id: p.ticket_number,
    title: p.title,
    proposedTitle:
      rawProposedTitle && rawProposedTitle !== origTitle ? rawProposedTitle : undefined,
    proposedSubtitle:
      rawProposedSubtitle && rawProposedSubtitle !== origSubtitle ? rawProposedSubtitle : undefined,
    kind: "Proposal",
    authorName: p.corresponding_author || displayNameFromEmail(p.email || ""),
    authorAffiliation: institution || p.email || "",
    country: p.country || "—",
    institution,
    subject,
    submittedAt: p.submitted_at,
    status: deriveProposalStatus(p),
    rawStatus: p.status,
    displayStatus: deriveDisplayStatus(p),
    actionRequired: p.action_required,
    currentReviewerEmail: activeAssign?.reviewer_email,
    currentReviewerStatus: activeAssign?.peer_reviewer_status || activeAssign?.display_status,
    aiScore: null,
  };
};

// When the API still reports raw status="new" but a peer review has been
// returned, the proposal effectively belongs in In Review / Review Returned.
// Promote it based on assignment state so the row matches status_summary.
function deriveProposalStatus(p: ApiProposal): StatusKey {
  const fromDisplay = normalizeStatus(p.status, p.display_status);
  if (fromDisplay !== "submitted") return fromDisplay;
  const assigns = toAssignmentsArray(p.assignments);
  if (assigns.length === 0) return fromDisplay;
  const anyCompleted = assigns.some((a) =>
    /complete|returned|submitted|done/i.test(
      a.peer_reviewer_status || a.display_status || "",
    ),
  );
  if (anyCompleted) return "review_returned";
  return "in_review";
}

function deriveDisplayStatus(p: ApiProposal): string | undefined {
  // Prefer the API's own status text so the badge mirrors the backend
  // verbatim (e.g. "Contract Received", "Awaiting More Info", "In Review").
  if (p.display_status && p.display_status.trim()) return p.display_status;
  if (p.status && p.status.trim()) return p.status;
  return undefined; // fallback to STATUS_META label
}

export const Route = createFileRoute("/dashboard/decision_reviewer")({
  head: () => ({
    meta: [{ title: "Editor Portal — Proposal Intake" }],
  }),
  component: DecisionReviewerDashboard,
});

// 11 tabs (All + 10 raw API statuses) — keyed by the raw DB status
// returned in status_summary so each tab mirrors the API 1:1.
type TabKey =
  | "all"
  | "new"
  | "awaiting_more_info"
  | "in_review"
  | "review_returned"
  | "contract_issued"
  | "queries_raised"
  | "awaiting_author_approval"
  | "author_approved"
  | "locked"
  | "declined";

// Derive each tab's dot from STATUS_META so the tab indicator matches
// the badge color used in the row for the same status. Pass the tab's
// display label so display-aware mappings (e.g. "Contract Received" →
// signed/green) win over the raw key bucket.
const tabDot = (raw: string, label: string): string =>
  getStatusMeta(raw, label).dot;
const TABS: { key: TabKey; label: string; dot: string }[] = (
  [
    { key: "all", label: "All" },
    { key: "new", label: "New" },
    { key: "awaiting_more_info", label: "Additional Info Required" },
    { key: "in_review", label: "In Review" },
    { key: "review_returned", label: "Review Returned" },
    { key: "contract_issued", label: "Contract Issued" },
    { key: "queries_raised", label: "Queries Raised" },
    { key: "awaiting_author_approval", label: "Proofreader Review" },
    { key: "author_approved", label: "Author Approved" },
    { key: "locked", label: "Locked" },
    { key: "declined", label: "Declined" },
  ] as { key: TabKey; label: string }[]
).map((t) => ({
  ...t,
  dot: t.key === "all" ? "bg-stone-400" : tabDot(t.key, t.label),
}));

const ACTIVE_TAB_CLASS: Record<TabKey, string> = {
  all: "border-stone-300 bg-stone-100 text-black",
  new: "border-amber-200 bg-amber-50 text-black",
  awaiting_more_info: "border-orange-200 bg-orange-50 text-black",
  in_review: "border-sky-200 bg-sky-50 text-black",
  review_returned: "border-indigo-200 bg-indigo-50 text-black",
  contract_issued: "border-violet-200 bg-violet-50 text-black",
  queries_raised: "border-red-200 bg-red-50 text-black",
  awaiting_author_approval: "border-purple-200 bg-purple-50 text-black",
  author_approved: "border-green-200 bg-green-50 text-black",
  locked: "border-emerald-200 bg-emerald-50 text-black",
  declined: "border-stone-200 bg-stone-100 text-black",
};

const normalizeRaw = (raw?: string) =>
  (raw || "").trim().toLowerCase().replace(/\s+/g, "_");

function DecisionReviewerDashboard() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [userEmail, setUserEmail] = useState<string>("");
  const [defaultReviewerEmail, setDefaultReviewerEmailState] = useState<string>("");
  useEffect(() => {
    setDefaultReviewerEmailState(getDefaultReviewerEmail());
  }, []);
  const [userName, setUserName] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [field, setField] = useState<
    "all" | "title" | "author" | "institution" | "country" | "subject"
  >("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusKey>>({});
  const [assignedProposalIds, setAssignedProposalIds] = useState<Set<string>>(new Set());
  const [apiProposals, setApiProposals] = useState<ProposalRow[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({});
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const [reviewers, setReviewers] = useState<PeerReviewer[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewersError, setReviewersError] = useState<string | null>(null);
  const [reviewersInfo, setReviewersInfo] = useState<string | null>(null);
  const [newReviewer, setNewReviewer] = useState({ name: "", email: "" });
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [confirmDeleteTicket, setConfirmDeleteTicket] = useState<string | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<string | null>(null);
  const [deletedTickets, setDeletedTickets] = useState<Set<string>>(new Set());
  const [lockingTicket, setLockingTicket] = useState<string | null>(null);
  const [openMetaQueryTickets, setOpenMetaQueryTickets] = useState<Set<string>>(new Set());
  const [pendingMetaApprovalTickets, setPendingMetaApprovalTickets] = useState<Set<string>>(new Set());

  const handleLock = async (ticket: string) => {
    if (!confirm(`Lock proposal ${ticket} and generate production files? This cannot be undone.`)) return;
    setLockingTicket(ticket);
    try {
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/lock`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        toast.error((body.error as string) || (body.message as string) || `Failed to lock (${res.status}).`);
        return;
      }
      toast.success((body.message as string) || `Proposal ${ticket} locked.`);
      void fetchProposals(true);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLockingTicket(null);
    }
  };

  // Reassign / assign proposal reviewer modal
  const [assignFor, setAssignFor] = useState<ProposalRow | null>(null);
  const [assignSelectedId, setAssignSelectedId] = useState<number | null>(null);
  const [assignNote, setAssignNote] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const openAssign = async (row: ProposalRow) => {
    setAssignFor(row);
    setAssignSelectedId(null);
    setAssignNote("");
    setAssignError(null);
    setAssignSuccess(null);
    if (reviewers.length === 0) void fetchReviewers();
    // Fetch latest detail to know the current reviewer (list endpoint may omit assignments)
    try {
      const res = await proposalApiFetch(`/${encodeURIComponent(row.id)}`, {
        headers: authHeaders(),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        const assigns = toAssignmentsArray(body.assignments as ApiProposal["assignments"]);
        const active =
          assigns.find(
            (a) =>
              !/complete|returned|done/i.test(
                a.peer_reviewer_status || a.display_status || "",
              ),
          ) || assigns[0];
        if (active?.reviewer_email) {
          setAssignFor((prev) =>
            prev
              ? {
                  ...prev,
                  currentReviewerEmail: active.reviewer_email,
                  currentReviewerStatus:
                    active.peer_reviewer_status || active.display_status,
                }
              : prev,
          );
        }
      }
    } catch {
      // ignore — modal still works for fresh assignment
    }
  };

  const closeAssign = () => {
    if (assignSubmitting) return;
    setAssignFor(null);
  };

  const submitAssign = async () => {
    if (!assignFor) return;
    const reviewer = reviewers.find((r) => r.id === assignSelectedId);
    if (!reviewer) {
      setAssignError("Please select a reviewer.");
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    setAssignSuccess(null);
    try {
      const res = await proposalApiFetch(
        `/${encodeURIComponent(assignFor.id)}/assign`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            reviewer_email: reviewer.email,
            ...(assignNote.trim() ? { note: assignNote.trim() } : {}),
          }),
        },
      );
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
        (body.message as string) ||
          `Assigned to ${reviewer.name || reviewer.email}.`,
      );
      toast.success(`Reviewer assigned to ${reviewer.name || reviewer.email}.`);
      void fetchProposals(true);
      void fetchReviewers();
      setTimeout(() => setAssignFor(null), 1000);
    } catch {
      setAssignError("Network error. Please try again.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Events / audit trail modal
  type ProposalEvent = {
    id: number;
    event_type: string;
    old_status: string | null;
    new_status: string | null;
    description: string;
    changed_by: string;
    changed_by_role: string;
    created_at: string;
  };
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsTicket, setEventsTicket] = useState<string>("");
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const openEvents = async (ticket: string) => {
    setEventsOpen(true);
    setEventsTicket(ticket);
    setEvents([]);
    setEventsError(null);
    setEventsLoading(true);
    try {
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/events`, {
        headers: authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setEventsError((data.error as string) || `Failed to load events (${res.status}).`);
      } else {
        setEvents((data.events as ProposalEvent[]) || []);
      }
    } catch {
      setEventsError("Network error. Please try again.");
    } finally {
      setEventsLoading(false);
    }
  };

  const authHeaders = (): HeadersInit => {
    const token = getPortalToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchReviewers = async () => {
    setReviewersLoading(true);
    setReviewersError(null);
    try {
      const res = await proposalApiFetch("/users/peer-reviewers", {
        headers: authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setReviewersError((data.error as string) || "Failed to load proposal reviewers.");
        return;
      }
      setReviewers((data.peer_reviewers as PeerReviewer[]) || []);
    } catch {
      setReviewersError("Network error. Please try again.");
    } finally {
      setReviewersLoading(false);
    }
  };

  const openReviewers = () => {
    setReviewersOpen(true);
    setReviewersInfo(null);
    setReviewersError(null);
    fetchReviewers();
  };

  useEffect(() => {
    fetchReviewers();
  }, []);

  const fetchProposals = async (silent = false) => {
    if (!silent) setProposalsLoading(true);
    if (!silent) setProposalsError(null);
    try {
      // Fetch the default list (which carries the authoritative status_summary)
      // plus an explicit request per known status, then merge by ticket so
      // terminal states (declined / signed) that the default endpoint omits
      // are still shown under "All".
      const headers = authHeaders();
      const defaultRes = await proposalApiFetch("?limit=100&sort_order=desc", { headers });
      const defaultBody = (await defaultRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!defaultRes.ok) {
        if (!silent) setProposalsError((defaultBody.error as string) || "Failed to load proposals.");
        return;
      }
      const merged = new Map<string, ApiProposal>();
      for (const p of (defaultBody.proposals as ApiProposal[]) || []) {
        merged.set(p.ticket_number, p);
      }
      const extraLists = await Promise.all(
        ALL_API_STATUSES.map(async (status) => {
          try {
            const r = await proposalApiFetch(
              `?limit=100&sort_order=desc&status=${encodeURIComponent(status)}`,
              { headers },
            );
            if (!r.ok) return [] as ApiProposal[];
            const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
            return ((b.proposals as ApiProposal[]) || []);
          } catch {
            return [] as ApiProposal[];
          }
        }),
      );
      for (const list of extraLists) {
        for (const p of list) {
          if (!merged.has(p.ticket_number)) merged.set(p.ticket_number, p);
        }
      }
      const rows = Array.from(merged.values()).map(mapApiProposal);
      if (checkIsAdmin()) {
        try {
          const scores = await fetchAiScores(rows.map((r) => r.id));
          for (const row of rows) {
            if (scores[row.id] !== undefined) row.aiScore = scores[row.id];
          }
        } catch {
          // Non-fatal: AI scores are a dashboard convenience only.
        }
      }
      setApiProposals(rows);
      setStatusSummary((defaultBody.status_summary as Record<string, number>) || {});
    } catch {
      if (!silent) setProposalsError("Network error. Please try again.");
    } finally {
      if (!silent) setProposalsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchProposals(true);
    }, 300000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast poll while any proposal is awaiting contract signature so the DR
  // list reflects the DocuSign webhook update within ~5s. Pauses when the
  // tab is hidden.
  const hasPendingContract = useMemo(
    () => apiProposals.some((p) => p.status === "contract"),
    [apiProposals],
  );
  useEffect(() => {
    if (!hasPendingContract) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void fetchProposals(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingContract]);

  const addReviewer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewer.name.trim() || !newReviewer.email.trim()) return;
    setAdding(true);
    setReviewersError(null);
    setReviewersInfo(null);
    try {
      const res = await proposalApiFetch("/users/peer-reviewers", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: newReviewer.name.trim(),
          email: newReviewer.email.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setReviewersError((data.error as string) || "Unable to create proposal reviewer.");
        return;
      }
      setReviewersInfo(
        (data.message as string) ||
          "Peer reviewer created. A verification code has been emailed.",
      );
      setNewReviewer({ name: "", email: "" });
      fetchReviewers();
    } catch {
      setReviewersError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const removeReviewer = async (id: number) => {
    if (!confirm("Delete this proposal reviewer?")) return;
    setDeletingId(id);
    setReviewersError(null);
    setReviewersInfo(null);
    try {
      const res = await proposalApiFetch(`/users/peer-reviewers/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          (data.message as string) ||
          (data.error as string) ||
          "Unable to delete proposal reviewer.";
        setReviewersError(msg);
        return;
      }
      setReviewersInfo("Peer reviewer deleted.");
      setReviewers((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setReviewersError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const isSubmissionDetail = Boolean(
    matchRoute({ to: "/dashboard/editor/submission/$id", fuzzy: true }),
  );

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      if (session.role !== "decision_reviewer") {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(session.email);
      setUserName(session.name || "");
      setIsAdmin(checkIsAdmin());
    } catch {
      navigate({ to: "/login" });
    }
  }, [navigate]);

  useEffect(() => {
    if (isSubmissionDetail) return;
    try {
      const raw = localStorage.getItem("csp.proposalStatusOverrides");
      setStatusOverrides(raw ? JSON.parse(raw) : {});
    } catch {
      setStatusOverrides({});
    }
    try {
      const raw = localStorage.getItem("csp.assignments");
      const list = raw ? (JSON.parse(raw) as Array<{ proposalId?: string }>) : [];
      setAssignedProposalIds(new Set(list.map((a) => a.proposalId).filter(Boolean) as string[]));
    } catch {
      setAssignedProposalIds(new Set());
    }
  }, [isSubmissionDetail]);

  const mergedProposals = useMemo<ProposalRow[]>(
    () =>
      apiProposals.filter((p) => !deletedTickets.has(p.id)).map((p) => {
        const override = statusOverrides[p.id];
        let status: StatusKey = override ?? p.status;
        if (status === "submitted" && assignedProposalIds.has(p.id)) status = "in_review";
        return { ...p, status };
      }),
    [apiProposals, assignedProposalIds, statusOverrides, deletedTickets],
  );

  // Detect proposals with an unresolved author metadata query OR metadata
  // that has been sent to the author and is awaiting approval, so we can
  // badge their status pill on the DR dashboard list.
  useEffect(() => {
    // Only relevant after the contract is signed / metadata is in play.
    const relevant = apiProposals.filter((p) =>
      ["signed", "contract", "author_approved"].includes(p.status as string),
    );
    if (relevant.length === 0) {
      setOpenMetaQueryTickets((prev) => (prev.size === 0 ? prev : new Set()));
      setPendingMetaApprovalTickets((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        relevant.map(async (p) => {
          try {
            const [queriesBody, metaRes] = await Promise.all([
              getMetadataQueries(p.id),
              getMetadata(p.id),
            ]);
            const queries = queriesBody.queries || [];
            const respondedIds = new Set(
              queries
                .filter((q) => q.type === "response" && q.parent_query_id != null)
                .map((q) => q.parent_query_id as number),
            );
            const hasOpen = queries.some(
              (q) =>
                q.type === "query" &&
                (q.raised_by_role || "").toLowerCase() === "author" &&
                !respondedIds.has(q.id),
            );
            const meta = metaRes.data;
            const isPendingApproval =
              meta?.metadata_status === "sent_to_author" && !meta.approved_at;
            return { id: p.id, hasOpen, isPendingApproval };
          } catch {
            return { id: p.id, hasOpen: false, isPendingApproval: false };
          }
        }),
      );
      if (cancelled) return;
      setOpenMetaQueryTickets(
        new Set(results.filter((r) => r.hasOpen).map((r) => r.id)),
      );
      setPendingMetaApprovalTickets(
        new Set(results.filter((r) => r.isPendingApproval).map((r) => r.id)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [apiProposals]);

  const counts = useMemo(() => {
    // Counts come from the API's authoritative status_summary (keyed by
    // raw DB status); fall back to local row counts for any bucket the
    // summary omits. awaiting_author_approval has an alias contract_received.
    const s = statusSummary || {};
    const num = (k: string) => Number(s[k]) || 0;
    const fromApi: Record<TabKey, number> = {
      all: num("total") || mergedProposals.length,
      new: num("new"),
      awaiting_more_info: num("awaiting_more_info"),
      in_review: num("in_review"),
      review_returned: num("review_returned"),
      contract_issued: num("contract_issued"),
      queries_raised: num("queries_raised"),
      awaiting_author_approval: num("awaiting_author_approval") + num("contract_received"),
      author_approved: num("author_approved"),
      locked: num("locked"),
      declined: num("declined"),
    };
    const fromRows: Record<TabKey, number> = {
      all: mergedProposals.length,
      new: 0,
      awaiting_more_info: 0,
      in_review: 0,
      review_returned: 0,
      contract_issued: 0,
      queries_raised: 0,
      awaiting_author_approval: 0,
      author_approved: 0,
      locked: 0,
      declined: 0,
    };
    for (const p of mergedProposals) {
      const r = normalizeRaw(p.rawStatus);
      const k = (r === "contract_received" ? "awaiting_author_approval" : r) as TabKey;
      if (k in fromRows) fromRows[k] += 1;
    }
    const out = {} as Record<TabKey, number>;
    (Object.keys(fromRows) as TabKey[]).forEach((k) => {
      out[k] = Math.max(fromApi[k] || 0, fromRows[k] || 0);
    });
    return out;
  }, [statusSummary, mergedProposals]);

  const filtered = useMemo(() => {
    let list = mergedProposals.slice();
    if (activeFilter !== "all") {
      list = list.filter((p) => {
        const r = normalizeRaw(p.rawStatus);
        const k = r === "contract_received" ? "awaiting_author_approval" : r;
        return k === activeFilter;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const has = (v: unknown) =>
          typeof v === "string" && v.toLowerCase().includes(q);
        if (field === "title") return has(p.title);
        if (field === "author") return has(p.authorName);
        if (field === "institution") return has(p.institution);
        if (field === "country") return has(p.country);
        if (field === "subject") return has(p.subject);
        // All fields: match against every searchable proposal attribute
        return (
          has(p.id) ||
          has(p.title) ||
          has(p.kind) ||
          has(p.authorName) ||
          has(p.authorAffiliation) ||
          has(p.country) ||
          has(p.institution) ||
          has(p.subject) ||
          has(p.rawStatus) ||
          has(p.displayStatus) ||
          has(p.submittedAt)
        );
      });
    }
    list.sort((a, b) => {
      const da = new Date(a.submittedAt).getTime();
      const db = new Date(b.submittedAt).getTime();
      return sort === "newest" ? db - da : da - db;
    });
    return list;
  }, [mergedProposals, activeFilter, search, field, sort]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const displayName = userName || displayNameFromEmail(userEmail);

  if (isSubmissionDetail) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] font-sans text-stone-800">
      {/* Top bar */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Link to="/login" className="flex items-center gap-3">
              <img src={cspLogo} alt="CSP" width={32} height={32} />
              <span className="font-serif text-base font-bold text-[#2C1A0E]">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-sm font-medium text-[#00422F]">Editor Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00422F] font-sans text-xs font-bold text-white">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm text-[#2C1A0E]">{displayName}</span>
            <span className="h-5 w-px bg-stone-300" />
            <ChangePasswordButton
              triggerClassName="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-[#2C1A0E]"
            />
            <span className="h-5 w-px bg-stone-300" />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-[#2C1A0E]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2C1A0E]">
              Proposal Intake
            </h1>
            <p className="mt-1.5 font-sans text-sm text-[#7A6A5A]">
              Review and manage incoming book proposals
            </p>
          </div>
          <button
            type="button"
            onClick={openReviewers}
            className="inline-flex items-center gap-2 rounded-xl border border-[#0E3D2F] bg-[#0E3D2F] px-4 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0a2e23]"
          >
            <Users className="h-4 w-4" />
            Proposal Reviewers
            {reviewers.length > 0 && (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 font-sans text-xs font-medium">
                {reviewers.length}
              </span>
            )}
          </button>
        </div>

        <ProofreaderQueueOverview />

        {/* Filter pills */}
        <div className="mb-5 flex flex-wrap gap-2.5">
          {TABS.map(({ key, label, dot }) => {
            const isAll = key === "all";
            const count = counts[key] ?? 0;
            const active = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 font-sans text-sm transition-colors ${
                  active ? ACTIVE_TAB_CLASS[key] : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isAll && active ? "bg-black" : dot
                  }`}
                />
                <span className="font-medium">{label}</span>
                <span
                  className={`ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-sans text-xs font-medium ${
                    active ? "bg-black/10 text-black" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={field}
              onChange={(e) =>
                setField(
                  e.target.value as
                    | "all"
                    | "title"
                    | "author"
                    | "institution"
                    | "country"
                    | "subject",
                )
              }
              className="appearance-none rounded-xl border border-stone-200 bg-white py-2.5 pl-4 pr-9 font-sans text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="all">All fields</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="institution">Institution</option>
              <option value="country">Country</option>
              <option value="subject">Subject</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          </div>

          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search proposals..."
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-4 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
              className="appearance-none rounded-xl border border-stone-200 bg-white py-2.5 pl-4 pr-9 font-sans text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          </div>
        </div>

        <p className="mb-3 font-sans text-sm text-stone-600">{filtered.length} proposals</p>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div
            className={`hidden items-center gap-6 border-b border-stone-200 bg-stone-50/60 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A] md:grid ${
              isAdmin ? "grid-cols-[2fr_1.2fr_0.9fr_0.9fr_1fr_1fr_100px]" : "grid-cols-[2.2fr_1.3fr_1fr_1fr_1.1fr_100px]"
            }`}
          >
            <HeaderCell label="Title" />
            <HeaderCell label="Author" />
            <HeaderCell label="Country" />
            <HeaderCell label="Submitted" active sort={sort === "newest" ? "desc" : "asc"} />
            <HeaderCell label="Status" />
            {isAdmin && <HeaderCell label="AI Score" />}
            <div />
          </div>

          <ul>
            {filtered.map((p) => {
              const meta = STATUS_META[p.status];
              return (
                <li
                  key={p.id}
                  className={`relative grid grid-cols-1 items-center gap-6 border-b border-stone-100 px-6 py-5 last:border-b-0 ${
                    isAdmin
                      ? "md:grid-cols-[2fr_1.2fr_0.9fr_0.9fr_1fr_1fr_100px]"
                      : "md:grid-cols-[2.2fr_1.3fr_1fr_1fr_1.1fr_100px]"
                  }`}
                >
                  <span
                    className={`absolute left-0 top-0 h-full w-1.5 ${meta.rowBar}`}
                    aria-hidden="true"
                  />
                  <div className="pl-2">
                    {p.proposedTitle && (
                      <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
                        Proposed Title:{" "}
                        <span className="font-serif text-xs font-normal normal-case tracking-normal text-[#2C1A0E]">
                          {p.proposedTitle}
                          {p.proposedSubtitle ? `: ${p.proposedSubtitle}` : ""}
                        </span>
                      </p>
                    )}
                    <p className="font-sans text-sm font-medium leading-snug text-[#2C1A0E]">
                      {p.title}
                    </p>
                    <p className="mt-1 font-sans text-xs text-[#7A6A5A]">{p.kind}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-medium text-[#2C1A0E]">{p.authorName}</p>
                    <p className="mt-0.5 truncate font-sans text-xs text-[#7A6A5A]" title={p.authorAffiliation}>
                      {p.authorAffiliation}
                    </p>
                  </div>
                  <div className="font-sans text-sm text-[#7A6A5A]">{p.country}</div>
                  <div className="font-sans text-sm text-[#7A6A5A]">
                    {formatDate(p.submittedAt)}
                  </div>
                  <div>
                    <span
                      className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium ${meta.badgeClass}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                      />
                      {p.displayStatus || meta.label}
                      {(openMetaQueryTickets.has(p.id) || pendingMetaApprovalTickets.has(p.id)) && (
                        <span
                          className="absolute -right-1 -top-1 flex h-2.5 w-2.5"
                          title={
                            openMetaQueryTickets.has(p.id)
                              ? "Author raised a metadata query"
                              : "Metadata sent to author — awaiting approval"
                          }
                          aria-label={
                            openMetaQueryTickets.has(p.id)
                              ? "Author raised a metadata query"
                              : "Metadata sent to author — awaiting approval"
                          }
                        >
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                              openMetaQueryTickets.has(p.id) ? "bg-red-400" : "bg-amber-400"
                            }`}
                          />
                          <span
                            className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                              openMetaQueryTickets.has(p.id) ? "bg-red-500" : "bg-amber-500"
                            }`}
                          />
                        </span>
                      )}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="font-sans text-sm text-[#7A6A5A]">
                      {p.aiScore != null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-sans text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          {p.aiScore.toFixed(1)} / 10
                        </span>
                      ) : (
                        <span className="font-sans text-xs text-stone-400">—</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4 justify-self-end">
                    <Link
                      to="/dashboard/proposal/$ticket"
                      params={{ ticket: p.id }}
                      className="inline-flex items-center gap-1 font-sans text-sm font-medium text-stone-700 hover:text-stone-900"
                    >
                      Review
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTicket(p.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                        title="Permanently delete proposal (admin only)"
                        aria-label="Delete proposal"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                {proposalsLoading
                  ? "Loading proposals…"
                  : proposalsError
                    ? proposalsError
                    : "No proposals match your filters."}
              </li>
            )}
          </ul>

          <div className="border-t border-stone-200 bg-stone-50/60 px-6 py-3 font-sans text-xs text-stone-500">
            {filtered.length} results
          </div>
        </div>
      </main>

      {confirmDeleteTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => deletingTicket === null && setConfirmDeleteTicket(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-200 px-6 py-4">
              <h2 className="font-serif text-xl font-bold text-stone-900">Delete proposal?</h2>
              <p className="mt-1 font-sans text-sm text-stone-600">
                This will permanently delete proposal{" "}
                <span className="font-semibold">{confirmDeleteTicket}</span> and all related data
                (contracts, queries, reviews, metadata, events). This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 bg-stone-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteTicket(null)}
                disabled={deletingTicket !== null}
                className="rounded-lg px-3 py-2 font-sans text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const t = confirmDeleteTicket;
                  if (!t) return;
                  setDeletingTicket(t);
                  try {
                    await deleteProposal(t);
                    setDeletedTickets((prev) => {
                      const next = new Set(prev);
                      next.add(t);
                      return next;
                    });
                    toast.success(`Proposal ${t} deleted.`);
                    setConfirmDeleteTicket(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to delete proposal.");
                  } finally {
                    setDeletingTicket(null);
                  }
                }}
                disabled={deletingTicket !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 font-sans text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletingTicket ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setReviewersOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-stone-900">Proposal Reviewers</h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Add and manage proposal reviewers. New reviewers receive an email OTP to set
                  their password on first login.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewersOpen(false)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={addReviewer}
              className="grid gap-3 border-b border-stone-200 bg-stone-50/60 px-6 py-5 sm:grid-cols-2"
            >
              <input
                type="text"
                required
                value={newReviewer.name}
                onChange={(e) => setNewReviewer((r) => ({ ...r, name: e.target.value }))}
                placeholder="Full name *"
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <input
                type="email"
                required
                value={newReviewer.email}
                onChange={(e) => setNewReviewer((r) => ({ ...r, email: e.target.value }))}
                placeholder="Email *"
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <div className="text-xs">
                  {reviewersError && (
                    <p role="alert" className="text-red-600">
                      {reviewersError}
                    </p>
                  )}
                  {reviewersInfo && !reviewersError && (
                    <p className="text-emerald-700">{reviewersInfo}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={adding}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0E3D2F] px-4 py-2 font-sans text-sm font-medium text-white hover:bg-[#0a2e23] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {adding ? "Adding…" : "Add reviewer"}
                </button>
              </div>
            </form>

            <div className="max-h-[40vh] overflow-y-auto">
              {reviewersLoading ? (
                <p className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                  Loading proposal reviewers…
                </p>
              ) : reviewers.length === 0 ? (
                <p className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                  No proposal reviewers yet.
                </p>
              ) : (
                <ul>
                  {reviewers.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0E3D2F] font-sans text-xs font-semibold text-white">
                          {initialsFromName(r.name)}
                        </div>
                        <div>
                          <p className="font-sans text-sm font-semibold text-stone-900">
                            {r.name}
                          </p>
                          <p className="font-sans text-xs text-stone-500">{r.email}</p>
                          {typeof r.assigned_proposals_count === "number" && (
                            <p className="mt-1 font-sans text-xs text-stone-600">
                              {r.assigned_proposals_count} active assignment
                              {r.assigned_proposals_count === 1 ? "" : "s"}
                            </p>
                          )}
                        </div>
                      </div>
                       <div className="flex items-center gap-1.5">
                       <button
                         type="button"
                         onClick={() => {
                           const next = defaultReviewerEmail === (r.email || "").toLowerCase()
                             ? ""
                             : r.email;
                           setDefaultReviewerEmail(next);
                           setDefaultReviewerEmailState(next.toLowerCase());
                         }}
                         className={`rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold ring-1 transition ${
                           defaultReviewerEmail === (r.email || "").toLowerCase()
                             ? "bg-[#0E3D2F]/10 text-[#0E3D2F] ring-[#0E3D2F]/20"
                             : "bg-white text-stone-500 ring-stone-200 hover:bg-stone-50"
                         }`}
                       >
                         {defaultReviewerEmail === (r.email || "").toLowerCase()
                           ? "Default ✓"
                           : "Set default"}
                       </button>
                       <button
                        type="button"
                        onClick={() => removeReviewer(r.id)}
                        disabled={deletingId === r.id}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label="Remove reviewer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                       </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {assignFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={closeAssign}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-stone-900">
                  {assignFor.currentReviewerEmail ? "Reassign proposal reviewer" : "Assign proposal reviewer"}
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Proposal <span className="font-semibold">{assignFor.id}</span>
                  {assignFor.currentReviewerEmail && (
                    <>
                      {" · current reviewer "}
                      <span className="font-semibold">{assignFor.currentReviewerEmail}</span>
                      {assignFor.currentReviewerStatus && (
                        <span className="text-stone-500"> ({assignFor.currentReviewerStatus})</span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssign}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[45vh] overflow-y-auto px-6 py-4">
              {reviewersLoading ? (
                <p className="py-10 text-center font-sans text-sm text-stone-500">
                  Loading proposal reviewers…
                </p>
              ) : reviewers.length === 0 ? (
                <p className="py-10 text-center font-sans text-sm text-stone-500">
                  No proposal reviewers available. Add one from the Proposal Reviewers panel first.
                </p>
              ) : (
                <ul className="space-y-2">
                  {reviewers.map((r) => {
                    const isCurrent =
                      assignFor.currentReviewerEmail &&
                      r.email.toLowerCase() === assignFor.currentReviewerEmail.toLowerCase();
                    const selected = assignSelectedId === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={Boolean(isCurrent)}
                          onClick={() => setAssignSelectedId(r.id)}
                          className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                            selected
                              ? "border-[#0E3D2F] bg-emerald-50/50"
                              : "border-stone-200 hover:bg-stone-50"
                          } ${isCurrent ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0E3D2F] font-sans text-xs font-semibold text-white">
                              {initialsFromName(r.name)}
                            </div>
                            <div>
                              <p className="font-sans text-sm font-semibold text-stone-900">
                                {r.name}
                                {isCurrent && (
                                  <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">
                                    Current
                                  </span>
                                )}
                              </p>
                              <p className="font-sans text-xs text-stone-500">{r.email}</p>
                              {typeof r.assigned_proposals_count === "number" && (
                                <p className="mt-0.5 font-sans text-xs text-stone-600">
                                  {r.assigned_proposals_count} active assignment
                                  {r.assigned_proposals_count === 1 ? "" : "s"}
                                </p>
                              )}
                            </div>
                          </div>
                          {selected && !isCurrent && (
                            <span className="rounded-full bg-[#0E3D2F] px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-white">
                              Selected
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-stone-200 px-6 py-4">
              <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-600">
                Note for reviewer (optional)
              </label>
              <textarea
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                rows={2}
                placeholder="Context, deadline reminders, focus areas…"
                className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              {assignError && (
                <p role="alert" className="mt-2 font-sans text-xs text-red-600">
                  {assignError}
                </p>
              )}
              {assignSuccess && !assignError && (
                <p className="mt-2 font-sans text-xs text-emerald-700">{assignSuccess}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 bg-stone-50 px-6 py-3">
              <button
                type="button"
                onClick={closeAssign}
                disabled={assignSubmitting}
                className="rounded-lg px-3 py-2 font-sans text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAssign}
                disabled={assignSubmitting || assignSelectedId === null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E3D2F] px-3 py-2 font-sans text-sm font-medium text-white hover:bg-[#0a2e23] disabled:opacity-50"
              >
                <UserCog className="h-4 w-4" />
                {assignSubmitting
                  ? "Assigning…"
                  : assignFor.currentReviewerEmail
                    ? "Reassign reviewer"
                    : "Assign reviewer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {eventsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setEventsOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-stone-900">Audit Trail</h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  {eventsTicket} · {events.length} event{events.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEventsOpen(false)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
              {eventsLoading ? (
                <p className="py-10 text-center font-sans text-sm text-stone-500">
                  Loading events…
                </p>
              ) : eventsError ? (
                <p role="alert" className="py-10 text-center font-sans text-sm text-red-600">
                  {eventsError}
                </p>
              ) : events.length === 0 ? (
                <p className="py-10 text-center font-sans text-sm text-stone-500">
                  No events recorded yet.
                </p>
              ) : (
                <ol className="relative space-y-5 border-l-2 border-stone-200 pl-5">
                  {events.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-[#0E3D2F] ring-4 ring-white" />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-sans text-sm font-semibold text-stone-900">
                          {ev.event_type.replace(/_/g, " ")}
                        </p>
                        <p className="font-sans text-xs text-stone-500">
                          {formatDate(ev.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 font-sans text-sm text-stone-700">{ev.description}</p>
                      {(ev.old_status || ev.new_status) && (
                        <p className="mt-1 font-sans text-xs text-stone-500">
                          {ev.old_status || "—"} → {ev.new_status || "—"}
                        </p>
                      )}
                      <p className="mt-1 font-sans text-xs text-stone-500">
                        by {ev.changed_by}
                        {ev.changed_by_role ? ` (${ev.changed_by_role.replace(/_/g, " ")})` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({
  label,
  active,
  sort,
}: {
  label: string;
  active?: boolean;
  sort?: "asc" | "desc";
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 ${active ? "text-stone-700" : "text-stone-500"}`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
      {active && sort && <span className="sr-only">{sort}</span>}
    </button>
  );
}

const PROOFREADER_GROUPS: {
  key: ProofreaderQueueTab;
  label: string;
  hint: string;
  dot: string;
}[] = [
  {
    key: "needs_compiling",
    label: "Needs Compiling",
    hint: "Proofreader hasn't started yet",
    dot: "bg-orange-500",
  },
  {
    key: "with_author",
    label: "With Author",
    hint: "Sent to author, awaiting approval",
    dot: "bg-blue-500",
  },
  {
    key: "confirmed",
    label: "Author Approved",
    hint: "Author has confirmed",
    dot: "bg-green-500",
  },
];

/** Read-only oversight of the proofreader metadata queue for admin / DR. */
function ProofreaderQueueOverview() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [group, setGroup] = useState<ProofreaderQueueTab>("needs_compiling");
  const [queue, setQueue] = useState<Record<ProofreaderQueueTab, ProofreaderQueueItem[]>>({
    needs_compiling: [],
    with_author: [],
    confirmed: [],
  });
  const [counts, setCounts] = useState<Record<ProofreaderQueueTab, number>>({
    needs_compiling: 0,
    with_author: 0,
    confirmed: 0,
  });

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    void getProofreaderQueue().then((res) => {
      if (cancelled) return;
      setQueue(res.data.queue);
      setCounts(res.data.counts);
      if (!res.ok) toast.error(res.error ?? "Could not load the proofreader queue.");
      setLoading(false);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const rows = queue[group];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-purple-200 bg-purple-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <div>
          <h2 className="font-serif text-lg font-bold text-[#2C1A0E]">Proofreader Queue</h2>
          <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">
            Read-only oversight of proposals in the proofreader phase
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-purple-700 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-purple-200 bg-white px-6 py-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {PROOFREADER_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(g.key)}
                title={g.hint}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-sans text-sm transition-colors ${
                  group === g.key
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${group === g.key ? "bg-white" : g.dot}`}
                />
                {g.label}
                <span
                  className={`ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    group === g.key ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {counts[g.key]}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center font-sans text-sm text-[#7A6A5A]">
              Nothing in this group right now.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-stone-200">
              <div className="hidden grid-cols-[1.1fr_2fr_1.2fr_1.4fr_1fr] gap-4 border-b border-stone-200 bg-stone-50/60 px-4 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A] md:grid">
                <span>Ticket</span>
                <span>Title</span>
                <span>Author</span>
                <span>Proofreader</span>
                <span>Last updated</span>
              </div>
              <ul>
                {rows.map((item) => (
                  <li key={item.ticket_number} className="border-b border-stone-100 last:border-b-0">
                    <Link
                      to="/dashboard/proposal/$ticket"
                      params={{ ticket: item.ticket_number }}
                      className="grid grid-cols-1 gap-2 px-4 py-3 hover:bg-stone-50 md:grid-cols-[1.1fr_2fr_1.2fr_1.4fr_1fr] md:items-center md:gap-4"
                    >
                      <span className="font-mono text-xs text-[#7A6A5A]">{item.ticket_number}</span>
                      <span className="font-sans text-sm font-medium text-[#2C1A0E]">
                        {item.title || "Untitled proposal"}
                      </span>
                      <span className="font-sans text-sm text-[#7A6A5A]">
                        {item.author_name || item.author_email || "—"}
                      </span>
                      <span className="truncate font-sans text-sm text-[#7A6A5A]">
                        {item.proofreader_email || "Unassigned"}
                      </span>
                      <span className="font-sans text-xs text-[#9A8A7A]">
                        {item.updated_at ? formatDate(item.updated_at) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}