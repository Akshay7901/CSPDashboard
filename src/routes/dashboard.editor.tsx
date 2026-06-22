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
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, isAdmin as checkIsAdmin } from "@/lib/auth";
import { deleteProposal } from "@/lib/adminApi";
import { toast } from "sonner";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import {
  PROPOSALS,
  STATUS_META,
  type StatusKey,
  formatDate,
  initialsFromName,
  displayNameFromEmail,
} from "@/lib/proposals";

export const Route = createFileRoute("/dashboard/editor")({
  head: () => ({
    meta: [{ title: "Editor Portal — Proposal Intake" }],
  }),
  component: EditorDashboard,
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

function EditorDashboard() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [userEmail, setUserEmail] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("csp.deletedProposalIds");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | StatusKey>("all");
  const [search, setSearch] = useState("");
  const [field, setField] = useState<"all" | "title" | "author" | "country">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusKey>>({});
  const [assignedProposalIds, setAssignedProposalIds] = useState<Set<string>>(new Set());
  type PeerReviewer = {
    id: string;
    name: string;
    email: string;
    affiliation: string;
    expertise: string;
  };
  const [reviewers, setReviewers] = useState<PeerReviewer[]>(() => {
    const seed: PeerReviewer[] = [
      {
        id: "pr-9012",
        name: "Dr. Test Reviewer",
        email: "reviewer@cambridge.ac.uk",
        affiliation: "University of Cambridge",
        expertise: "Testing, Peer Review",
      },
    ];
    try {
      const raw = localStorage.getItem("csp.peerReviewers");
      if (!raw) return seed;
      const parsed = JSON.parse(raw) as PeerReviewer[];
      return parsed.some((r) => r.email === "reviewer@cambridge.ac.uk")
        ? parsed
        : [...seed, ...parsed];
    } catch {
      return seed;
    }
  });
  const [newReviewer, setNewReviewer] = useState({
    name: "",
    email: "",
    affiliation: "",
    expertise: "",
  });

  useEffect(() => {
    try {
      localStorage.setItem("csp.peerReviewers", JSON.stringify(reviewers));
    } catch {
      // ignore
    }
  }, [reviewers]);

  const addReviewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewer.name.trim() || !newReviewer.email.trim()) return;
    setReviewers((prev) => [...prev, { id: `pr-${Date.now()}`, ...newReviewer }]);
    setNewReviewer({ name: "", email: "", affiliation: "", expertise: "" });
  };

  const removeReviewer = (id: string) => {
    setReviewers((prev) => prev.filter((r) => r.id !== id));
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
      if (session.role !== "editor") {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(session.email);
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

  const mergedProposals = useMemo(
    () =>
      PROPOSALS.filter((p) => !deletedIds.has(p.id)).map((p) => {
        const status = statusOverrides[p.id] ?? p.status;
        return {
          ...p,
          status: status === "submitted" && assignedProposalIds.has(p.id) ? "in_review" : status,
        };
      }),
    [assignedProposalIds, statusOverrides, deletedIds],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: mergedProposals.length };
    for (const k of Object.keys(STATUS_META)) map[k] = 0;
    for (const p of mergedProposals) map[p.status] = (map[p.status] ?? 0) + 1;
    return map;
  }, [mergedProposals]);

  const filtered = useMemo(() => {
    let list = mergedProposals.slice();
    if (activeFilter !== "all") list = list.filter((p) => p.status === activeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const inTitle = p.title.toLowerCase().includes(q);
        const inAuthor = p.authorName.toLowerCase().includes(q);
        const inCountry = p.country.toLowerCase().includes(q);
        if (field === "title") return inTitle;
        if (field === "author") return inAuthor;
        if (field === "country") return inCountry;
        return inTitle || inAuthor || inCountry;
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

  const onConfirmDelete = async () => {
    const id = confirmId;
    if (!id) return;
    setDeletingId(id);
    try {
      await deleteProposal(id);
      const next = new Set(deletedIds);
      next.add(id);
      setDeletedIds(next);
      try {
        localStorage.setItem("csp.deletedProposalIds", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      toast.success(`Proposal ${id} deleted.`);
      setConfirmId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete proposal.");
    } finally {
      setDeletingId(null);
    }
  };

  const displayName = displayNameFromEmail(userEmail);

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
            <ChangePasswordButton
              triggerClassName="inline-flex items-center gap-1.5 font-sans text-sm text-stone-600 hover:text-stone-900"
            />
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

      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-stone-900">
              Proposal Intake
            </h1>
            <p className="mt-2 font-sans text-base text-stone-600">
              Review and manage incoming book proposals
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReviewersOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#0E3D2F] bg-[#0E3D2F] px-4 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0a2e23]"
          >
            <Users className="h-4 w-4" />
            Peer Reviewers
            <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 font-sans text-xs font-medium">
              {reviewers.length}
            </span>
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
              onChange={(e) => setField(e.target.value as "all" | "title" | "author" | "country")}
              className="appearance-none rounded-xl border border-stone-200 bg-white py-2.5 pl-4 pr-9 font-sans text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="all">All fields</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="country">Country</option>
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
          <div className="hidden grid-cols-[1.6fr_1.1fr_0.9fr_0.9fr_1fr_auto] items-center gap-4 border-b border-stone-200 bg-stone-50/60 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 md:grid">
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
                  className="relative grid grid-cols-1 items-center gap-4 border-b border-stone-100 px-6 py-5 last:border-b-0 md:grid-cols-[1.6fr_1.1fr_0.9fr_0.9fr_1fr_auto]"
                >
                  <span
                    className={`absolute left-0 top-0 h-full w-1.5 ${meta.rowBar}`}
                    aria-hidden="true"
                  />
                  <div className="pl-2">
                    <p className="font-sans text-[15px] font-semibold leading-snug text-stone-900">
                      {p.title}
                    </p>
                    <p className="mt-1 font-sans text-xs text-stone-500">{p.kind}</p>
                  </div>
                  <div>
                    <p className="font-sans text-sm font-semibold text-stone-900">{p.authorName}</p>
                    <p className="mt-0.5 font-sans text-xs text-stone-500">{p.authorAffiliation}</p>
                  </div>
                  <div className="font-sans text-sm text-stone-700">{p.country}</div>
                  <div className="font-sans text-sm text-stone-700">
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
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 justify-self-end">
                    <Link
                      to="/dashboard/editor/submission/$id"
                      params={{ id: p.id }}
                      className="inline-flex items-center gap-1 font-sans text-sm font-medium text-stone-700 hover:text-stone-900"
                    >
                      Review
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmId(p.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 font-sans text-xs font-medium text-red-700 hover:bg-red-50"
                        title="Permanently delete proposal (admin only)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                No proposals match your filters.
              </li>
            )}
          </ul>

          <div className="border-t border-stone-200 bg-stone-50/60 px-6 py-3 font-sans text-xs text-stone-500">
            {filtered.length} results
          </div>
        </div>
      </main>

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => deletingId === null && setConfirmId(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-200 px-6 py-4">
              <h2 className="font-serif text-xl font-bold text-stone-900">
                Delete proposal?
              </h2>
              <p className="mt-1 font-sans text-sm text-stone-600">
                This will permanently delete proposal <span className="font-semibold">{confirmId}</span> and all related data (contracts, queries, reviews, metadata, events). This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 bg-stone-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={deletingId !== null}
                className="rounded-lg px-3 py-2 font-sans text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deletingId !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 font-sans text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId ? "Deleting…" : "Delete permanently"}
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
                  Add and manage peer reviewers for proposals
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
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0E3D2F] px-4 py-2 font-sans text-sm font-medium text-white hover:bg-[#0a2e23]"
                >
                  <Plus className="h-4 w-4" />
                  Add reviewer
                </button>
              </div>
            </form>

            <div className="max-h-[40vh] overflow-y-auto">
              {reviewers.length === 0 ? (
                <p className="px-6 py-10 text-center font-sans text-sm text-stone-500">
                  No peer reviewers added yet.
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
                          <p className="font-sans text-sm font-semibold text-stone-900">{r.name}</p>
                          <p className="font-sans text-xs text-stone-500">{r.email}</p>
                          {(r.affiliation || r.expertise) && (
                            <p className="mt-1 font-sans text-xs text-stone-600">
                              {r.affiliation}
                              {r.affiliation && r.expertise ? " · " : ""}
                              {r.expertise}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReviewer(r.id)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
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
