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
} from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";
import { ChangePasswordButton } from "@/components/change-password-dialog";

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
};

const STATUS_MAP: Record<string, StatusKey> = {
  new: "submitted",
  in_review: "in_review",
  review_returned: "review_returned",
  contract_issued: "contract",
  queries_raised: "question",
  awaiting_author_approval: "contract",
  author_approved: "signed",
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
  contract: ["contract_issued", "awaiting_author_approval"],
  question: ["queries_raised"],
  signed: ["author_approved", "locked", "contract_signed", "contract_received"],
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
  "awaiting author approval": "contract",
  "queries raised": "question",
  "question raised": "question",
  "author approved": "signed",
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
  return {
    id: p.ticket_number,
    title: p.title,
    proposedTitle:
      cd.proposed_title || cd.proposed_book_title || undefined,
    proposedSubtitle:
      cd.proposed_subtitle ||
      cd.proposed_sub_title ||
      cd.proposed_book_subtitle ||
      undefined,
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

const FILTER_ORDER: ("all" | StatusKey)[] = [
  "all",
  "submitted",
  "revisions",
  "in_review",
  "review_returned",
  "major_revisions",
  "contract",
  "question",
  "signed",
  "declined",
];

function DecisionReviewerDashboard() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"all" | StatusKey>("all");
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

  // Reassign / assign peer reviewer modal
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
        setReviewersError((data.error as string) || "Failed to load peer reviewers.");
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
      setApiProposals(Array.from(merged.values()).map(mapApiProposal));
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
        setReviewersError((data.error as string) || "Unable to create peer reviewer.");
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
    if (!confirm("Delete this peer reviewer?")) return;
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
          "Unable to delete peer reviewer.";
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

  const counts = useMemo(() => {
    const s = statusSummary;
    const sum = (...keys: string[]) =>
      keys.reduce((acc, k) => acc + (Number(s[k]) || 0), 0);
    return {
      all: Number(s.total) || mergedProposals.length,
      submitted: sum("new"),
      revisions: sum("awaiting_more_info"),
      in_review: sum("in_review"),
      review_returned: sum("review_returned"),
      major_revisions: 0,
      contract: sum("contract_issued", "awaiting_author_approval"),
      question: sum("queries_raised"),
      signed: sum("author_approved", "locked", "contract_received"),
      declined: sum("declined"),
    } as Record<string, number>;
  }, [statusSummary, mergedProposals.length]);

  const filtered = useMemo(() => {
    let list = mergedProposals.slice();
    if (activeFilter !== "all") list = list.filter((p) => p.status === activeFilter);
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
            Peer Reviewers
            {reviewers.length > 0 && (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 font-sans text-xs font-medium">
                {reviewers.length}
              </span>
            )}
          </button>
        </div>

        {/* Filter pills */}
        <div className="mb-5 flex flex-wrap gap-2.5">
          {FILTER_ORDER.map((key) => {
            const isAll = key === "all";
            const meta = isAll ? null : STATUS_META[key as StatusKey];
            const count = counts[key] ?? 0;
            const active = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 font-sans text-sm transition-colors ${
                  active
                    ? "border-[#0E3D2F] bg-[#0E3D2F] text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isAll ? (active ? "bg-white" : "bg-stone-400") : meta!.dot
                  }`}
                />
                <span className="font-medium">{isAll ? "All" : meta!.filterLabel}</span>
                <span
                  className={`ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-sans text-xs font-medium ${
                    active ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
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
          <div className="hidden grid-cols-[2.2fr_1.3fr_1fr_1fr_1.4fr_140px] items-center gap-6 border-b border-stone-200 bg-stone-50/60 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A] md:grid">
            <HeaderCell label="Title" />
            <HeaderCell label="Author" />
            <HeaderCell label="Country" />
            <HeaderCell label="Submitted" active sort={sort === "newest" ? "desc" : "asc"} />
            <HeaderCell label="Status" />
            <div />
          </div>

          <ul>
            {filtered.map((p) => {
              const meta = STATUS_META[p.status];
              return (
                <li
                  key={p.id}
                  className="relative grid grid-cols-1 items-center gap-6 border-b border-stone-100 px-6 py-5 last:border-b-0 md:grid-cols-[2.2fr_1.3fr_1fr_1fr_1.4fr_140px]"
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
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium ${meta.badgeClass}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          p.status === "signed" ? "bg-white" : meta.dot
                        }`}
                      />
                      {p.displayStatus || meta.label}
                    </span>
                  </div>
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
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
                <h2 className="font-serif text-2xl font-bold text-stone-900">Peer Reviewers</h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Add and manage peer reviewers. New reviewers receive an email OTP to set
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
                  Loading peer reviewers…
                </p>
              ) : reviewers.length === 0 ? (
                <p className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                  No peer reviewers yet.
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
                      <button
                        type="button"
                        onClick={() => removeReviewer(r.id)}
                        disabled={deletingId === r.id}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label="Remove reviewer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                  {assignFor.currentReviewerEmail ? "Reassign peer reviewer" : "Assign peer reviewer"}
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
                  Loading peer reviewers…
                </p>
              ) : reviewers.length === 0 ? (
                <p className="py-10 text-center font-sans text-sm text-stone-500">
                  No peer reviewers available. Add one from the Peer Reviewers panel first.
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