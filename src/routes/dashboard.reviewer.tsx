import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  LogOut,
  User2,
  FileText,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession, getPortalToken } from "@/lib/auth";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { initialsFromName, displayNameFromEmail } from "@/lib/proposals";
import { proposalApiFetch } from "@/lib/proposalApi";

export const Route = createFileRoute("/dashboard/reviewer")({
  head: () => ({ meta: [{ title: "Reviewer Portal — Your Reviews" }] }),
  component: ReviewerDashboard,
});

type ReviewStatus = "pending" | "in_progress" | "completed";

interface ReviewItem {
  id: string;
  proposalId: string;
  subject: string;
  kind: string;
  title: string;
  subtitle?: string;
  proposedTitle?: string;
  proposedSubtitle?: string;
  authorName: string;
  authorAffiliation: string;
  wordCount: string;
  assignedAt: string;
  completedAt?: string;
  decision?: "accept" | "minor" | "major" | "reject";
  abstract: string;
  status: ReviewStatus;
}

const REVIEWS: ReviewItem[] = [];

type ApiAssignment = {
  reviewer_email: string;
  assigned_at?: string;
  peer_reviewer_status?: string;
  display_status?: string;
};

type ApiProposalListItem = {
  ticket_number: string;
  status?: string;
  internal_status?: string;
  submitted_at?: string;
  current_data?: Record<string, string | undefined>;
  assignments?: ApiAssignment[];
};

type ApiProposalDetail = ApiProposalListItem & {
  current_data: Record<string, string | undefined>;
};

function formatDateShort(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isCompletedStatus(s?: string) {
  if (!s) return false;
  const v = s.toLowerCase();
  return (
    v.includes("complete") ||
    v.includes("returned") ||
    v.includes("submitted") ||
    v.includes("done")
  );
}

const REVIEWER_PROFILE = {
  name: "Dr. Anna Hoffmann",
  affiliation: "Freie Universität Berlin",
  expertise: ["Environmental Policy", "Agricultural Economics", "Climate Studies"],
};

const SUBJECT_STYLES: Record<string, string> = {
  "Life Sciences": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Social Sciences": "bg-sky-50 text-sky-700 border-sky-200",
  Humanities: "bg-amber-50 text-amber-700 border-amber-200",
};

function ReviewerDashboard() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [userEmail, setUserEmail] = useState<string>("");
  const [reviewerName, setReviewerName] = useState<string>("");
  const [assigned, setAssigned] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isSubmissionDetail = Boolean(
    matchRoute({ to: "/dashboard/reviewer/submission/$id", fuzzy: true }),
  );

  const loadReviewerProposals = useCallback(async (email: string, silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const token = getPortalToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const EXTRA_STATUSES = [
          "peer_review_complete",
          "peer_reviewed",
          "review_complete",
          "reviewed",
          "decision_pending",
          "accepted",
          "minor_revisions",
          "major_revisions",
          "declined",
          "contract_issued",
          "awaiting_author_approval",
          "contract_received",
          "author_approved",
          "locked",
          "contract_signed",
        ];
        const fetchList = async (qs = "") => {
          const r = await proposalApiFetch(qs, { headers });
          const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          if (!r.ok) return { ok: false, status: r.status, error: b.error as string };
          const arr =
            (b.proposals as ApiProposalListItem[]) ||
            (Array.isArray(b) ? (b as unknown as ApiProposalListItem[]) : []);
          return { ok: true, items: arr };
        };
        const defaultRes = await fetchList("");
        if (!defaultRes.ok) {
          if (!silent) setLoadError(defaultRes.error || `Failed to load proposals (${defaultRes.status}).`);
          return;
        }
        const extraResults = await Promise.all(
          EXTRA_STATUSES.map((s) => fetchList(`?status=${encodeURIComponent(s)}`)),
        );
        const merged = new Map<string, ApiProposalListItem>();
        for (const it of defaultRes.items || []) merged.set(it.ticket_number, it);
        for (const r of extraResults) {
          if (!r.ok) continue;
          for (const it of r.items || []) {
            if (!merged.has(it.ticket_number)) merged.set(it.ticket_number, it);
          }
        }
        const proposals = Array.from(merged.values());

        // API already scopes the list to the logged-in peer reviewer.
        // Assignments in the list payload may omit reviewer_email, so trust the server filter.
        const mine = proposals.filter((p) => (p.assignments || []).length > 0);
        void email;

        const details = await Promise.all(
          mine.map(async (p) => {
            try {
              const r = await proposalApiFetch(`/${encodeURIComponent(p.ticket_number)}`, { headers });
              if (!r.ok) return p as ApiProposalDetail;
              const b = (await r.json()) as ApiProposalDetail;
              return b;
            } catch {
              return p as ApiProposalDetail;
            }
          }),
        );

        // Check per-reviewer review status: submitted, draft (in progress), or none.
        const submittedMap = new Map<string, boolean>();
        const draftMap = new Map<string, boolean>();
        await Promise.all(
          details.map(async (d) => {
            try {
              const r = await proposalApiFetch(
                `/${encodeURIComponent(d.ticket_number)}/review`,
                { headers },
              );
              if (!r.ok) return;
              const body = (await r.json()) as {
                reviews?: Array<{
                  reviewer_email?: string;
                  reviewer_role?: string;
                  is_submitted?: boolean;
                }>;
              };
              const reviews = body.reviews || [];
              const mineReview =
                reviews.find(
                  (rv) => rv.reviewer_email?.toLowerCase() === email.toLowerCase(),
                ) ||
                reviews.find((rv) => rv.reviewer_role === "peer_reviewer");
              if (!mineReview) return;
              if (mineReview.is_submitted) {
                submittedMap.set(d.ticket_number, true);
              } else {
                draftMap.set(d.ticket_number, true);
              }
            } catch {
              // ignore
            }
          }),
        );

        const items: ReviewItem[] = details.map((d) => {
          const cd = d.current_data || {};
          const assigns = d.assignments || [];
          const myAssign =
            assigns.find(
              (a) => a.reviewer_email?.toLowerCase() === email.toLowerCase(),
            ) || assigns[0];
          const isCompleted =
            submittedMap.get(d.ticket_number) ||
            isCompletedStatus(myAssign?.peer_reviewer_status || myAssign?.display_status) ||
            isCompletedStatus(d.status || d.internal_status);
          const status: ReviewStatus = isCompleted
            ? "completed"
            : draftMap.get(d.ticket_number)
              ? "in_progress"
              : "pending";
          const wc = cd.word_count || cd.estimated_word_count || "";
          const cdAny = cd as Record<string, string | undefined>;
          const firstLast = [cdAny.author_first_name, cdAny.author_last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          const authorNameResolved =
            cdAny.corresponding_author_name ||
            cd.author_name ||
            cd.primary_author_name ||
            (firstLast ? firstLast : "") ||
            "—";
          const abstractResolved =
            cdAny.short_description ||
            cdAny.detailed_description ||
            cd.overview ||
            cd.abstract ||
            cd.description ||
            cdAny.book_overview ||
            cdAny.synopsis ||
            "";
          return {
            id: d.ticket_number,
            proposalId: d.ticket_number,
            subject: cd.discipline || cd.subject_area || "General",
            kind: cd.book_type || cd.proposal_type || "Proposal",
            title: cd.main_title || d.ticket_number,
            subtitle: cd.subtitle,
            proposedTitle: (() => {
              const raw = (
                (cd as Record<string, string | undefined>).proposed_title ||
                (cd as Record<string, string | undefined>).proposed_book_title ||
                ""
              ).trim();
              const orig = (cd.main_title || "").trim();
              return raw && raw !== orig ? raw : undefined;
            })(),
            proposedSubtitle: (() => {
              const raw = (
                (cd as Record<string, string | undefined>).proposed_subtitle ||
                (cd as Record<string, string | undefined>).proposed_sub_title ||
                (cd as Record<string, string | undefined>).proposed_book_subtitle ||
                ""
              ).trim();
              const orig = ((cd as Record<string, string | undefined>).sub_title || cd.subtitle || "").trim();
              return raw && raw !== orig ? raw : undefined;
            })(),
            authorName: authorNameResolved,
            authorAffiliation: cd.affiliation || cd.institution || "—",
            wordCount: wc ? `${wc} words` : "—",
            assignedAt: formatDateShort(myAssign?.assigned_at || d.submitted_at),
            completedAt: status === "completed" ? formatDateShort(myAssign?.assigned_at) : undefined,
            abstract: abstractResolved,
            status,
          };
        });

        setAssigned(items);
      } catch {
        if (!silent) setLoadError("Network error. Please try again.");
      } finally {
        if (!silent) setLoading(false);
      }
  }, []);

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session || session.role !== "reviewer") {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(session.email);
      void loadReviewerProposals(session.email);
      // Fetch reviewer's display name from API
      (async () => {
        try {
          const token = getPortalToken();
          const res = await proposalApiFetch("/users/peer-reviewers", {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (!res.ok) return;
          const body = (await res.json()) as {
            peer_reviewers?: Array<{ name?: string; email?: string }>;
          };
          const me = (body.peer_reviewers || []).find(
            (r) => r.email?.toLowerCase() === session.email.toLowerCase(),
          );
          if (me?.name) setReviewerName(me.name);
        } catch {
          // ignore
        }
      })();
    } catch {
      navigate({ to: "/login" });
    }
  }, [navigate, loadReviewerProposals]);

  useEffect(() => {
    if (!userEmail) return;
    const id = window.setInterval(() => {
      void loadReviewerProposals(userEmail, true);
    }, 300000);
    return () => window.clearInterval(id);
  }, [userEmail, loadReviewerProposals]);

  // Refresh when tab/window regains focus or becomes visible (e.g. after
  // returning from the submission detail page once a review is submitted).
  useEffect(() => {
    if (!userEmail) return;
    const refresh = () => void loadReviewerProposals(userEmail, true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userEmail, loadReviewerProposals]);

  // Refresh whenever we return to the list view from the submission detail route.
  useEffect(() => {
    if (!userEmail) return;
    if (!isSubmissionDetail) {
      void loadReviewerProposals(userEmail, true);
    }
  }, [isSubmissionDetail, userEmail, loadReviewerProposals]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const displayName =
    reviewerName || (userEmail ? displayNameFromEmail(userEmail) : REVIEWER_PROFILE.name);

  const allReviews = [...assigned, ...REVIEWS];
  const assignedCount = allReviews.length;
  const pending = allReviews.filter((r) => r.status === "pending").length;
  const inProgress = allReviews.filter((r) => r.status === "in_progress").length;
  const completed = allReviews.filter((r) => r.status === "completed").length;

  const pendingItems = allReviews.filter((r) => r.status === "pending");
  const inProgressItems = allReviews.filter((r) => r.status === "in_progress");
  const completedItems = allReviews.filter((r) => r.status === "completed");

  if (isSubmissionDetail) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2] font-sans text-stone-800">
      {/* Top bar */}
      <header className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Link to="/login" className="flex items-center gap-3">
              <img src={cspLogo} alt="CSP" width={32} height={32} />
              <span className="font-serif text-base font-bold leading-none text-[#2C1A0E]">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-1 text-stone-300">|</span>
            <span className="font-sans text-sm font-medium text-sky-600">Reviewer Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 font-sans text-xs font-semibold text-sky-700">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm text-[#2C1A0E]">
              {displayName}
            </span>
            <span className="text-stone-300">|</span>
            <ChangePasswordButton
              triggerClassName="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900 transition-colors"
            />
            <span className="text-stone-300">|</span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2C1A0E]">
            Your Reviews
          </h1>
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-sans text-sm text-rose-700">
            {loadError}
          </div>
        )}

        {/* Stat cards */}
        <div className="mb-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <StatCard label="Assigned" value={assignedCount} tone="sky" />
          <StatCard label="Pending" value={pending} tone="amber" />
          <StatCard label="In Progress" value={inProgress} tone="indigo" />
          <StatCard label="Completed" value={completed} tone="green" />
        </div>

        {/* Awaiting Your Review */}
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-bold text-[#2C1A0E]">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Awaiting Your Review
          </h2>

          {loading ? (
            <EmptyState text="Loading your assignments…" />
          ) : pendingItems.length === 0 ? (
            <EmptyState text="No reviews awaiting your attention." />
          ) : (
            <ul className="space-y-4">
              {pendingItems.map((r) => (
              <ReviewCard
                key={r.id}
                item={r}
                ctaLabel="Start Review"
                ctaTone="sky"
                onCta={() =>
                  navigate({
                    to: "/dashboard/reviewer/submission/$id",
                    params: { id: r.proposalId || r.id },
                  })
                }
              />
              ))}
            </ul>
          )}
        </section>

        {/* In Progress */}
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-bold text-[#2C1A0E]">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            In Progress
          </h2>

          {loading ? (
            <EmptyState text="Loading your assignments…" />
          ) : inProgressItems.length === 0 ? (
            <EmptyState text="No reviews in progress." />
          ) : (
            <ul className="space-y-4">
              {inProgressItems.map((r) => (
                <ReviewCard
                  key={r.id}
                  item={r}
                  ctaLabel="Continue Review"
                  ctaTone="indigo"
                  onCta={() =>
                    navigate({
                      to: "/dashboard/reviewer/submission/$id",
                      params: { id: r.proposalId || r.id },
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {/* Completed */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-bold text-[#2C1A0E]">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Completed Reviews
          </h2>

          {completedItems.length === 0 ? (
            <EmptyState text="You haven't completed any reviews yet." />
          ) : (
            <ul className="space-y-4">
              {completedItems.map((r) => (
                <ReviewCard
                  key={r.id}
                  item={r}
                  ctaLabel="View Review"
                  ctaTone="muted"
                onCta={() =>
                  navigate({
                    to: "/dashboard/reviewer/submission/$id",
                    params: { id: r.proposalId || r.id },
                  })
                }
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "amber" | "green" | "indigo";
}) {
  const tones: Record<
    "sky" | "amber" | "green" | "indigo",
    { wrap: string; value: string; label: string }
  > = {
    sky: {
      wrap: "bg-sky-50 border border-sky-200",
      value: "text-sky-700",
      label: "text-sky-700",
    },
    amber: {
      wrap: "bg-amber-50 border border-amber-200",
      value: "text-amber-700",
      label: "text-amber-700",
    },
    green: {
      wrap: "bg-emerald-50 border border-emerald-200",
      value: "text-emerald-700",
      label: "text-emerald-700",
    },
    indigo: {
      wrap: "bg-indigo-50 border border-indigo-200",
      value: "text-indigo-700",
      label: "text-indigo-700",
    },
  };
  const t = tones[tone];
  return (
    <div className={`rounded-xl p-5 text-center ${t.wrap}`}>
      <div className={`font-serif text-3xl font-bold leading-none ${t.value}`}>
        {value}
      </div>
      <div className={`mt-1 font-sans text-xs font-medium ${t.label}`}>{label}</div>
    </div>
  );
}

function ReviewCard({
  item,
  ctaLabel,
  ctaTone,
  onCta,
}: {
  item: ReviewItem;
  ctaLabel: string;
  ctaTone: "sky" | "muted" | "indigo";
  onCta?: () => void;
}) {
  const subjectClass =
    SUBJECT_STYLES[item.subject] ??
    "bg-stone-50 text-stone-700 border-stone-200";

  const ctaClass =
    ctaTone === "sky"
      ? "bg-sky-600 text-white hover:bg-sky-700"
      : ctaTone === "indigo"
        ? "bg-indigo-600 text-white hover:bg-indigo-700"
        : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-xs font-medium ${subjectClass}`}
          >
            {item.subject}
          </span>
          <span className="font-sans text-xs text-[#7A6A5A]">{item.kind}</span>
        </div>
        <button
          type="button"
          onClick={onCta}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 font-sans text-sm font-medium transition-colors ${ctaClass}`}
        >
          {ctaTone === "muted" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {ctaLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {item.proposedTitle && (
        <p className="mt-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
          Proposed Title:{" "}
          <span className="font-serif text-sm font-normal normal-case tracking-normal text-[#2C1A0E]">
            {item.proposedTitle}
            {item.proposedSubtitle ? `: ${item.proposedSubtitle}` : ""}
          </span>
        </p>
      )}
      <h3 className={`${item.proposedTitle ? "mt-1" : "mt-3"} font-serif text-base font-bold leading-snug text-[#2C1A0E]`}>
        {item.title}
      </h3>
      {item.subtitle && (
        <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">{item.subtitle}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-sans text-xs text-[#7A6A5A]">
        <span className="inline-flex items-center gap-1">
          <User2 className="h-3.5 w-3.5 text-[#7A6A5A]" />
          {item.authorName}, {item.authorAffiliation}
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-[#7A6A5A]" />
          {item.wordCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5 text-[#7A6A5A]" />
          {item.status === "completed" && item.completedAt
            ? `Completed ${item.completedAt}`
            : `Assigned ${item.assignedAt}`}
        </span>
      </div>

      {item.abstract && (
        <p className="mt-3 font-sans text-xs leading-relaxed text-[#7A6A5A] line-clamp-2">
          {item.abstract}
        </p>
      )}
    </li>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-6 py-10 text-center font-sans text-sm text-stone-500">
      {text}
    </div>
  );
}