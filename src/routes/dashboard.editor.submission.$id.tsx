import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  UserRound,
  Mail,
  Building2,
  MapPin,
  Calendar,
  FileText,
  Download,
  LogOut,
  X,
  CheckCircle2,
  Edit3,
  ChevronDown,
  Plus,
} from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession } from "@/lib/auth";
import { getContract, type ContractDetail } from "@/lib/contractsApi";
import {
  PROPOSALS,
  STATUS_META,
  formatDate,
  initialsFromName,
  displayNameFromEmail,
  type Proposal,
} from "@/lib/proposals";

export const Route = createFileRoute("/dashboard/editor/submission/$id")({
  head: () => ({
    meta: [{ title: "Submission — Editor Portal" }],
  }),
  loader: ({ params }) => {
    const proposal = PROPOSALS.find((p) => p.id === params.id);
    if (!proposal) throw notFound();
    return { proposal };
  },
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-[#FAF6EE] p-10 font-sans text-stone-700">
      <p>Could not load submission: {error.message}</p>
      <Link to="/dashboard/editor" className="mt-4 inline-block text-stone-900 underline">
        Back to dashboard
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#FAF6EE] p-10 font-sans text-stone-700">
      <p>Submission not found.</p>
      <Link to="/dashboard/editor" className="mt-4 inline-block text-stone-900 underline">
        Back to dashboard
      </Link>
    </div>
  ),
  component: SubmissionDetail,
});

function SubmissionDetail() {
  const { proposal } = Route.useLoaderData() as { proposal: Proposal };
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);
  const [reviewDueDate, setReviewDueDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [assignedReviewerName, setAssignedReviewerName] = useState<string | null>(null);
  const [assignedReviewer, setAssignedReviewer] = useState<PoolReviewer | null>(null);
  const [effectiveStatus, setEffectiveStatus] = useState<Proposal["status"]>(proposal.status);
  const [issuedContract, setIssuedContract] = useState<ContractDetail | null>(null);

  type SubmittedReview = {
    id: string;
    proposalId: string;
    reviewerName: string;
    recommendation: "proceed" | "minor" | "major" | "reject";
    summary: string;
    comments: Array<{ type: string; section: string; page: string; text: string }>;
    submittedAt: string;
  };
  const [submittedReview, setSubmittedReview] = useState<SubmittedReview | null>(null);
  type EditorComment = { type: string; section: string; page: string; text: string };
  const [editorComments, setEditorComments] = useState<EditorComment[]>([]);
  
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionAreas, setRevisionAreas] = useState<string[]>([]);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");

  useEffect(() => {
    if (submittedReview) {
      setEditorComments(submittedReview.comments.map((c) => ({ ...c })));
    }
  }, [submittedReview]);

  const isReviewReturned = effectiveStatus === "review_returned" && !!submittedReview;
  const recommendationLabel: Record<string, string> = {
    proceed: "Proceed without changes",
    minor: "Minor Revisions",
    major: "Major Revisions",
    reject: "Reject",
  };

  type PoolReviewer = {
    id: string;
    name: string;
    email: string;
    affiliation: string;
    expertise: string[];
    badge: { label: string; tone: "amber" | "emerald" };
  };
  const reviewerPool: PoolReviewer[] = [
    {
      id: "pr-okafor",
      name: "Prof. David Okafor",
      email: "d.okafor@cam.ac.uk",
      affiliation: "University of Cambridge",
      expertise: ["African Studies", "Literary Studies", "Postcolonial Theory"],
      badge: { label: "1 active", tone: "amber" },
    },
    {
      id: "pr-hoffmann",
      name: "Dr. Anna Hoffmann",
      email: "a.hoffmann@fu-berlin.de",
      affiliation: "Freie Universität Berlin",
      expertise: ["Environmental Policy", "Agricultural Economics", "Climate Studies"],
      badge: { label: "Available", tone: "emerald" },
    },
    {
      id: "pr-obrien",
      name: "Prof. Liam O'Brien",
      email: "l.obrien@tcd.ie",
      affiliation: "Trinity College Dublin",
      expertise: ["Medieval History", "Historical Geography", "Trade Networks"],
      badge: { label: "2 active", tone: "amber" },
    },
    {
      id: "pr-nair",
      name: "Dr. Priya Nair",
      email: "p.nair@lse.ac.uk",
      affiliation: "London School of Economics",
      expertise: ["Political Philosophy", "Technology Ethics", "AI Governance"],
      badge: { label: "Available", tone: "emerald" },
    },
    {
      id: "pr-santini",
      name: "Prof. Marco Santini",
      email: "m.santini@uniroma1.it",
      affiliation: "Sapienza University of Rome",
      expertise: ["Gender Studies", "Early Modern Europe", "Social History"],
      badge: { label: "1 active", tone: "amber" },
    },
    {
      id: "pr-tanaka",
      name: "Dr. Yuki Tanaka",
      email: "y.tanaka@kyoto-u.ac.jp",
      affiliation: "Kyoto University",
      expertise: ["Urban Studies", "Architecture", "City Planning"],
      badge: { label: "Available", tone: "emerald" },
    },
    {
      id: "pr-9012",
      name: "Dr. Test Reviewer",
      email: "reviewer@cambridge.ac.uk",
      affiliation: "University of Cambridge",
      expertise: ["Testing", "Peer Review"],
      badge: { label: "Available", tone: "emerald" },
    },
  ];

  const onConfirmAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedReviewerId) return;
    const r = reviewerPool.find((x) => x.id === selectedReviewerId);
    if (r) {
      setAssignedReviewer(r);
      setEffectiveStatus("in_review");
      try {
        const raw = localStorage.getItem("csp.assignments");
        const list: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const filtered = list.filter(
          (a) => !(a.proposalId === proposal.id && a.reviewerEmail === r.email),
        );
        filtered.push({
          id: `asg-${proposal.id}-${r.id}-${Date.now()}`,
          proposalId: proposal.id,
          reviewerId: r.id,
          reviewerEmail: r.email,
          reviewerName: r.name,
          dueDate: reviewDueDate || null,
          notes: reviewNotes || "",
          assignedAt: new Date().toISOString(),
          proposal: {
            id: proposal.id,
            title: proposal.title,
            kind: proposal.kind,
            subject: proposal.discipline,
            subtitle: proposal.subdiscipline,
            authorName: proposal.authorName,
            authorAffiliation: proposal.authorAffiliation,
            wordCount: proposal.wordCount,
            overview: proposal.overview,
          },
        });
        localStorage.setItem("csp.assignments", JSON.stringify(filtered));
        const sRaw = localStorage.getItem("csp.proposalStatusOverrides");
        const overrides: Record<string, string> = sRaw ? JSON.parse(sRaw) : {};
        overrides[proposal.id] = "in_review";
        localStorage.setItem("csp.proposalStatusOverrides", JSON.stringify(overrides));
      } catch {
        // ignore
      }
    }
    setAssignedReviewerName(r?.name ?? null);
    setReviewModalOpen(false);
  };

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
    } catch {
      navigate({ to: "/login" });
    }
  }, [navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("csp.assignments");
      if (!raw) return;
      const list = JSON.parse(raw) as Array<{
        proposalId: string;
        reviewerId: string;
      }>;
      const mine = list.find((a) => a.proposalId === proposal.id);
      if (mine) {
        const r = reviewerPool.find((x) => x.id === mine.reviewerId);
        if (r) {
          setAssignedReviewer(r);
          setAssignedReviewerName(r.name);
        }
        setEffectiveStatus((prev) => (prev === "submitted" ? "in_review" : prev));
      }
    } catch {
      // ignore
    }
    try {
      const sRaw = localStorage.getItem("csp.proposalStatusOverrides");
      if (sRaw) {
        const overrides = JSON.parse(sRaw) as Record<string, Proposal["status"]>;
        if (overrides[proposal.id]) {
          setEffectiveStatus(overrides[proposal.id]);
        }
      }
    } catch {
      // ignore
    }
    try {
      const rRaw = localStorage.getItem("csp.reviews");
      if (rRaw) {
        const reviews = JSON.parse(rRaw) as SubmittedReview[];
        const mine = reviews.find((r) => r.proposalId === proposal.id);
        if (mine) setSubmittedReview(mine);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.id]);

  // Fetch the issued contract (if any) so editors can see its signing state.
  useEffect(() => {
    let cancelled = false;
    const ref = proposal.ref || proposal.id;
    if (!ref) return;
    getContract(ref)
      .then((list) => {
        if (!cancelled && list.length > 0) setIssuedContract(list[list.length - 1]);
      })
      .catch(() => {
        // no contract issued yet (or endpoint unavailable) — hide the card
      });
    return () => {
      cancelled = true;
    };
  }, [proposal.id, proposal.ref]);

  const displayName = userEmail ? "James Mitchell" : displayNameFromEmail(userEmail);
  const meta = STATUS_META[effectiveStatus];

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const onSaveNotes = (e: FormEvent) => {
    e.preventDefault();
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] font-sans text-stone-800">
      {/* Top bar (same chrome as dashboard) */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/editor" className="flex items-center gap-3">
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <Link
          to="/dashboard/editor"
          className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-[#0E3D2F] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {/* Title card */}
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white px-4 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
            <h1 className="min-w-0 font-serif text-2xl font-bold leading-tight text-stone-900 sm:text-3xl">
              {proposal.title}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-medium ${meta.badgeClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  effectiveStatus === "signed" ? "bg-white" : meta.dot
                }`}
              />
              {meta.label}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2 font-sans text-sm text-stone-600">
            <Meta icon={UserRound} text={proposal.authorName} />
            <Meta icon={Mail} text={proposal.authorEmail} />
            <Meta icon={Building2} text={proposal.authorAffiliation} />
            <Meta icon={MapPin} text={proposal.country} />
            <Meta icon={Calendar} text={formatDate(proposal.submittedAt)} />
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          {/* Main column */}
          <div className="space-y-6">
            {isReviewReturned && submittedReview && (
              <>
                {/* Review Returned summary */}
                <section className="overflow-hidden rounded-xl border border-indigo-200 bg-[#F9F7F2] shadow-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-indigo-200 bg-indigo-50 px-5 py-3.5">
                    <div>
                      <h2 className="font-serif text-lg font-bold text-indigo-900">
                        Review Returned
                      </h2>
                      <p className="mt-0.5 font-sans text-sm text-indigo-700">
                        {submittedReview.reviewerName} · London School of Economics
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-3 py-1.5 font-sans text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      Recommended:{" "}
                      {recommendationLabel[submittedReview.recommendation] ??
                        submittedReview.recommendation}
                    </span>
                  </div>
                  {submittedReview.summary && (
                    <div className="px-5 py-4">
                      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Reviewer Summary
                      </p>
                      <p className="mt-2 font-sans text-sm leading-relaxed text-stone-800">
                        {submittedReview.summary}
                      </p>
                    </div>
                  )}
                </section>

                {/* Peer Review Comments (editable) */}
                <Card>
                  <div className="px-7 pt-6">
                    <h2 className="font-serif text-xl font-bold text-stone-900">
                      Peer Review Comments
                    </h2>
                    <p className="mt-1 font-sans text-sm text-stone-500">
                      Edit before sending — {editorComments.length} comments
                    </p>
                  </div>
                  <div className="space-y-4 px-7 py-6">
                    {editorComments.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start gap-2">
                          <select
                            value={c.type}
                            onChange={(e) =>
                              setEditorComments((arr) =>
                                arr.map((it, idx) =>
                                  idx === i ? { ...it, type: e.target.value } : it,
                                ),
                              )
                            }
                            className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-sans text-xs font-medium text-amber-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                          >
                            <option>General</option>
                            <option>Major Concern</option>
                            <option>Minor Concern</option>
                            <option>Suggestion</option>
                            <option>Question</option>
                          </select>
                          <input
                            type="text"
                            value={c.section}
                            onChange={(e) =>
                              setEditorComments((arr) =>
                                arr.map((it, idx) =>
                                  idx === i ? { ...it, section: e.target.value } : it,
                                ),
                              )
                            }
                            placeholder="Section / Chapter"
                            className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-sans text-xs font-medium text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                          />
                          <input
                            type="text"
                            value={c.page}
                            onChange={(e) =>
                              setEditorComments((arr) =>
                                arr.map((it, idx) =>
                                  idx === i ? { ...it, page: e.target.value } : it,
                                ),
                              )
                            }
                            placeholder="Page"
                            className="w-24 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-sans text-xs font-medium text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditorComments((arr) => arr.filter((_, idx) => idx !== i))
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                            aria-label="Remove comment"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <textarea
                          value={c.text}
                          onChange={(e) =>
                            setEditorComments((arr) =>
                              arr.map((it, idx) =>
                                idx === i ? { ...it, text: e.target.value } : it,
                              ),
                            )
                          }
                          rows={3}
                          className="mt-2 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-stone-700 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setEditorComments((arr) => [
                          ...arr,
                          { type: "General", section: "", page: "", text: "" },
                        ])
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-4 py-4 font-sans text-sm font-semibold text-stone-600 hover:border-stone-400 hover:bg-stone-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add comment
                    </button>
                  </div>
                </Card>

                {/* Collapsible: View original proposal details */}
                <Card>
                  <button
                    type="button"
                    onClick={() => setProposalDetailsOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-7 py-5 text-left"
                  >
                    <span className="font-serif text-base font-bold text-stone-900">
                      View original proposal details
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-stone-500 transition-transform ${proposalDetailsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </Card>
              </>
            )}

            {(!isReviewReturned || proposalDetailsOpen) && (
              <>
            {/* Primary Author / Editor */}
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
                <div className="flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm sm:gap-x-10">
                  <Stat label="Type" value={proposal.kind} />
                  <Stat label="Words" value={proposal.wordCount.toLocaleString()} />
                  <Stat label="Completion" value={proposal.estCompletion} />
                </div>
              </div>
              <Divider />
              <div className="grid grid-cols-1 gap-6 px-7 py-6 md:grid-cols-3">
                <Field label="Name" value={proposal.authorName} />
                <Field label="Email" value={proposal.authorEmail} />
                <Field label="Institution" value={proposal.authorAffiliation} />
                <Field label="Country" value={proposal.country} />
              </div>
              <Divider />
              <div className="px-7 py-6">
                <p className="font-sans text-xs uppercase tracking-wide text-stone-500">
                  Mailing Address
                </p>
                <p className="mt-2 font-sans text-sm text-stone-800">
                  {proposal.mailingAddress}
                </p>
              </div>
              <Divider />
              <div className="px-7 py-6">
                <p className="font-sans text-xs uppercase tracking-wide text-stone-500">
                  Biography
                </p>
                <p className="mt-2 font-sans text-sm leading-relaxed text-stone-800">
                  {proposal.biography}
                </p>
              </div>
            </Card>

            {/* Manuscript Details */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Manuscript Details
                </h2>
              </div>
              <Divider />
              <div className="grid grid-cols-2 gap-6 px-7 py-6 md:grid-cols-4">
                <Stat label="Word Count" value={proposal.wordCount.toLocaleString()} />
                <Stat label="Illustrations / Tables" value={String(proposal.illustrations)} />
                <Stat label="Non-English Content" value={proposal.nonEnglish ? "Yes" : "No"} />
                <Stat label="Est. Completion" value={proposal.estCompletion} />
              </div>
            </Card>

            {/* Summary & Description */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Summary &amp; Description
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  {proposal.discipline} · {proposal.subdiscipline}
                </p>
              </div>
              <Divider />
              <div className="space-y-5 px-7 py-6">
                <Block label="Overview">
                  <p className="font-sans text-sm leading-relaxed text-stone-800">
                    {proposal.overview}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {proposal.keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 font-sans text-xs text-stone-700"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </Block>
                <Block label="Key Features & Unique Contribution">
                  <p className="font-sans text-sm leading-relaxed text-stone-800">
                    {proposal.keyFeatures}
                  </p>
                </Block>
                <Block label="Intended Audience">
                  <p className="font-sans text-sm leading-relaxed text-stone-800">
                    {proposal.intendedAudience}
                  </p>
                </Block>
              </div>
            </Card>

            {/* Table of Contents */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Table of Contents
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  Is this coherently planned?
                </p>
              </div>
              <Divider />
              <div className="px-7 py-6">
                <ol className="space-y-3 rounded-xl bg-[#FAF6EE] p-5">
                  {proposal.tableOfContents.map((chapter, idx) => (
                    <li
                      key={idx}
                      className="font-sans text-sm leading-relaxed text-stone-800"
                    >
                      <span className="mr-1.5 text-stone-500">{idx + 1}.</span>
                      {chapter}
                    </li>
                  ))}
                </ol>
              </div>
            </Card>

            {/* Market & Competition */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Market &amp; Competition
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  Commercial viability and competitive landscape
                </p>
              </div>
              <Divider />
              <div className="space-y-5 px-7 py-6">
                <Block label="Why is this book needed?">
                  <p className="font-sans text-sm leading-relaxed text-stone-800">
                    {proposal.whyNeeded}
                  </p>
                </Block>
                <Block label="Competing Titles">
                  <p className="font-sans text-sm leading-relaxed text-stone-800">
                    {proposal.competingTitles}
                  </p>
                </Block>
              </div>
            </Card>

            {/* Author-Suggested Reviewers */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Author-Suggested Reviewers
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  Nominated by the author — for consideration only
                </p>
              </div>
              <Divider />
              <ol className="divide-y divide-stone-100">
                {proposal.suggestedReviewers.length === 0 && (
                  <li className="px-7 py-6 font-sans text-sm text-stone-500">
                    No reviewers suggested.
                  </li>
                )}
                {proposal.suggestedReviewers.map((r, idx) => (
                  <li key={idx} className="flex gap-6 px-7 py-5">
                    <span className="font-sans text-sm font-semibold text-stone-500">
                      {idx + 1}.
                    </span>
                    <div>
                      <p className="font-sans text-sm font-semibold text-stone-900">
                        {r.name}
                      </p>
                      <p className="font-sans text-sm text-stone-600">{r.affiliation}</p>
                      <p className="font-sans text-sm text-stone-500">{r.email}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {/* Additional Notes */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Additional Notes
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  Copyright, permissions, special considerations
                </p>
              </div>
              <Divider />
              <div className="px-7 py-6">
                <p className="font-sans text-sm leading-relaxed text-stone-800">
                  {proposal.additionalNotes}
                </p>
              </div>
            </Card>

            {/* Supporting Documents */}
            <Card>
              <div className="px-7 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Supporting Documents
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  {proposal.supportingDocs.length} files — click to preview
                </p>
              </div>
              <Divider />
              <ul className="divide-y divide-stone-100">
                {proposal.supportingDocs.map((doc, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-4 px-7 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-sans text-sm font-semibold text-stone-900">
                          {doc.name}
                        </p>
                        <p className="mt-0.5 font-sans text-xs text-stone-500">
                          {doc.sizeLabel} ·{" "}
                          <span className="text-[#0E3D2F]">Click to preview</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-sans text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {/* Editorial Decision */}
            <Card>
              <div className="px-6 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Editorial Decision
                </h2>
                <p className="mt-2 font-sans text-sm text-stone-600">
                  {isReviewReturned
                    ? "Review returned — add notes and send to author"
                    : assignedReviewer
                      ? "With peer reviewer"
                      : effectiveStatus === "submitted"
                        ? "Awaiting initial assessment"
                        : proposal.decisionSummary}
                </p>
                {assignedReviewerName && !assignedReviewer && (
                  <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 font-sans text-xs text-emerald-800 ring-1 ring-emerald-200">
                    Assigned to <span className="font-semibold">{assignedReviewerName}</span>
                  </p>
                )}
              </div>
              <div className="space-y-3 px-6 pb-6 pt-5">
                {isReviewReturned ? (
                  <>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#7C3AED] px-4 py-3 text-left font-sans text-sm text-white shadow-sm transition-colors hover:bg-[#6D28D9]"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <FileText className="h-4 w-4" />
                        Issue Contract
                      </span>
                      <span className="mt-1 block text-xs text-white/85">
                        Send contract &amp; review comments to author
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevisionModalOpen(true)}
                      className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left font-sans text-sm text-rose-900 hover:bg-rose-100"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <Edit3 className="h-4 w-4" />
                        Request Major Revisions
                      </span>
                      <span className="mt-1 block text-xs text-rose-800/80">
                        Send review comments back to author
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left font-sans text-sm text-stone-800 hover:bg-stone-50"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <X className="h-4 w-4" />
                        Decline
                      </span>
                      <span className="mt-1 block text-xs text-stone-500">
                        Not moving forward
                      </span>
                    </button>
                  </>
                ) : assignedReviewer ? (
                  <>
                    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-sky-700">
                        Assigned Reviewer
                      </p>
                      <p className="mt-2 font-serif text-base font-bold text-stone-900">
                        {assignedReviewer.name}
                      </p>
                      <p className="font-sans text-sm text-stone-600">
                        {assignedReviewer.affiliation}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {assignedReviewer.expertise.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-sky-100 px-2 py-0.5 font-sans text-[11px] font-medium text-sky-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left font-sans text-sm text-stone-800 hover:bg-stone-50"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <X className="h-4 w-4" />
                        Decline
                      </span>
                      <span className="mt-1 block text-xs text-stone-500">
                        Not moving forward
                      </span>
                    </button>
                  </>
                ) : effectiveStatus === "submitted" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReviewModalOpen(true)}
                      className="w-full rounded-xl bg-[#1F4D3A] px-4 py-3 text-left font-sans text-sm text-white shadow-sm transition-colors hover:bg-[#173A2C]"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        Move to Review
                      </span>
                      <span className="mt-1 block text-xs text-white/85">
                        Assign a peer reviewer
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left font-sans text-sm text-amber-900 hover:bg-amber-100"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <Edit3 className="h-4 w-4" />
                        Request Revisions
                      </span>
                      <span className="mt-1 block text-xs text-amber-800/80">
                        Needs more info before review
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left font-sans text-sm text-stone-800 hover:bg-stone-50"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <X className="h-4 w-4" />
                        Decline
                      </span>
                      <span className="mt-1 block text-xs text-stone-500">
                        Not moving forward
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#7C3AED] px-4 py-3 text-left font-sans text-sm text-white shadow-sm transition-colors hover:bg-[#6D28D9]"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <FileText className="h-4 w-4" />
                        Issue Contract
                      </span>
                      <span className="mt-1 block text-xs text-white/85">
                        Send contract &amp; review comments to author
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left font-sans text-sm text-stone-800 hover:bg-stone-50"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <X className="h-4 w-4" />
                        Decline
                      </span>
                      <span className="mt-1 block text-xs text-stone-500">
                        Not moving forward
                      </span>
                    </button>
                  </>
                )}
              </div>
            </Card>

            {/* Issued Contract */}
            {issuedContract && (
              <Card>
                <div className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50/70 px-6 py-4">
                  <h2 className="font-serif text-xl font-bold text-stone-900">Contract</h2>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 font-sans text-xs font-semibold ring-1 ${
                      (issuedContract.status || "").toLowerCase() === "signed"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : (issuedContract.status || "").toLowerCase() === "declined"
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : ["expired", "voided"].includes(
                                (issuedContract.status || "").toLowerCase(),
                              )
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : "bg-sky-50 text-sky-700 ring-sky-200"
                    }`}
                  >
                    {(issuedContract.status || "").toLowerCase() === "signed"
                      ? "Signed"
                      : (issuedContract.status || "").toLowerCase() === "declined"
                        ? "Declined"
                        : ["expired", "voided"].includes(
                              (issuedContract.status || "").toLowerCase(),
                            )
                          ? "Expired"
                          : "Awaiting Signature"}
                  </span>
                </div>
                <div className="space-y-3 px-6 py-5">
                  {issuedContract.stages ? (
                    (
                      [
                        ["Publishing Agreement", issuedContract.stages.publishing_agreement],
                        [
                          issuedContract.contract_type === "editor"
                            ? "Editor Contract"
                            : "Author Contract",
                          issuedContract.stages.author_contract,
                        ],
                      ] as const
                    ).map(([label, stage]) => {
                      const stageStatus = (stage?.status || "sent").toLowerCase();
                      const locked = !!stage?.locked;
                      const signed = stageStatus === "signed";
                      const declined = stageStatus === "declined";
                      const expired = stageStatus === "expired" || stageStatus === "voided";
                      const statusLabel = signed
                        ? "Signed"
                        : declined
                          ? "Declined"
                          : expired
                            ? "Expired"
                            : locked
                              ? "Locked"
                              : "Awaiting Signature";
                      const statusClass = signed
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : declined
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : expired
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : locked
                              ? "bg-stone-100 text-stone-600 ring-stone-200"
                              : "bg-sky-50 text-sky-700 ring-sky-200";
                      return (
                        <div
                          key={label}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                            locked ? "border-stone-200 bg-stone-50" : "border-stone-200 bg-white"
                          }`}
                        >
                          <p className="font-sans text-sm font-semibold text-stone-900">{label}</p>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-3 py-1 font-sans text-xs font-semibold ring-1 ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="space-y-2 font-sans text-sm text-stone-700">
                      <InfoRow
                        label="Type"
                        value={
                          issuedContract.contract_type
                            ? issuedContract.contract_type.charAt(0).toUpperCase() +
                              issuedContract.contract_type.slice(1)
                            : "—"
                        }
                      />
                      <InfoRow
                        label="Version"
                        value={String(issuedContract.contract_version ?? "—")}
                      />
                      <InfoRow
                        label="Recipient"
                        value={issuedContract.recipient_name || proposal.authorName}
                      />
                      <InfoRow
                        label="Sent"
                        value={
                          issuedContract.docusign_sent_at
                            ? formatDate(issuedContract.docusign_sent_at)
                            : "—"
                        }
                      />
                    </div>
                  )}
                  {issuedContract.docusign_expires_at &&
                    (issuedContract.status || "").toLowerCase() !== "signed" && (
                      <p className="font-sans text-xs text-stone-500">
                        Expires {formatDate(issuedContract.docusign_expires_at)}
                      </p>
                    )}
                </div>
              </Card>
            )}

            {/* Internal Notes */}
            <Card>
              <div className="px-6 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Internal Notes
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  Not visible to the author
                </p>
              </div>
              <form onSubmit={onSaveNotes} className="space-y-3 px-6 pb-6 pt-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Editorial notes, flags, or comments..."
                  className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#1A1208] py-2.5 font-sans text-sm font-semibold text-white hover:bg-stone-900"
                >
                  Save Notes
                </button>
                {savedAt && (
                  <p className="text-center font-sans text-xs text-emerald-700">
                    Saved at {savedAt}
                  </p>
                )}
              </form>
            </Card>

            {/* Peer Reviewer Pool */}
            {!isReviewReturned && (
            <Card>
              <div className="px-6 pt-6">
                <h2 className="font-serif text-xl font-bold text-stone-900">
                  Peer Reviewer Pool
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-500">
                  {reviewerPool.length} reviewers available
                </p>
              </div>
              <ul className="divide-y divide-stone-100">
                {reviewerPool.map((r) => (
                  <li key={r.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-sans text-sm font-semibold text-stone-900">
                          {r.name}
                        </p>
                        <p className="font-sans text-xs text-stone-600">
                          {r.affiliation}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          r.badge.tone === "emerald"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        }`}
                      >
                        {r.badge.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.expertise.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-stone-100 px-2 py-0.5 font-sans text-[11px] text-stone-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            )}

            {/* Submission Info */}
            <Card>
              <div className="px-6 pt-6">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Submission Info
                </p>
              </div>
              <div className="space-y-3 px-6 pb-6 pt-4 font-sans text-sm">
                <InfoRow label="Ref" value={proposal.ref} />
                <InfoRow label="Type" value={proposal.kind} />
                <InfoRow label="Submitted" value={formatDate(proposal.submittedAt)} />
                <InfoRow label="Updated" value={formatDate(proposal.updatedAt)} />
              </div>
            </Card>
          </aside>
        </div>
      </main>

      {reviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/50 p-4 sm:p-8"
          onClick={() => setReviewModalOpen(false)}
        >
          <div
            className="relative my-8 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-stone-200 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1F4D3A] text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  Submit for Peer Review
                </h3>
                <p className="mt-0.5 font-sans text-sm text-stone-600">
                  Assign a reviewer and set expectations before sending.
                </p>
                <p className="mt-1 font-sans text-xs italic text-stone-500">
                  &ldquo;{proposal.title}&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onConfirmAssign}>
              <div className="max-h-[55vh] space-y-3 overflow-y-auto px-6 py-5">
                <p className="font-sans text-sm font-semibold text-stone-900">
                  Assign Reviewer <span className="text-rose-500">*</span>
                </p>
                {reviewerPool.map((r) => {
                  const selected = selectedReviewerId === r.id;
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                        selected
                          ? "border-[#1F4D3A] bg-[#1F4D3A]/5"
                          : "border-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reviewer"
                        value={r.id}
                        checked={selected}
                        onChange={() => setSelectedReviewerId(r.id)}
                        className="mt-1 h-4 w-4 accent-[#1F4D3A]"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-sans text-sm font-semibold text-stone-900">
                              {r.name}
                            </p>
                            <p className="font-sans text-xs text-stone-600">
                              {r.affiliation}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              r.badge.tone === "emerald"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}
                          >
                            {r.badge.label}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.expertise.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-stone-100 px-2 py-0.5 font-sans text-[11px] text-stone-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}

                <div className="pt-2">
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="due-date"
                      className="font-sans text-sm font-semibold text-stone-900"
                    >
                      Review Due Date
                    </label>
                    <span className="font-sans text-xs text-stone-500">
                      (approx. 4 weeks)
                    </span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <input
                      id="due-date"
                      type="date"
                      value={reviewDueDate}
                      onChange={(e) => setReviewDueDate(e.target.value)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 focus:border-[#1F4D3A] focus:outline-none"
                    />
                    <p className="self-center font-sans text-xs text-stone-500">
                      Reviewer will be notified by email with the proposal details.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <label
                    htmlFor="review-notes"
                    className="font-sans text-sm font-semibold text-stone-900"
                  >
                    Notes for Reviewer{" "}
                    <span className="font-normal text-stone-500">(optional)</span>
                  </label>
                  <textarea
                    id="review-notes"
                    rows={3}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Any specific areas to focus on, context, or guidance..."
                    className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 focus:border-[#1F4D3A] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedReviewerId}
                  className="rounded-lg bg-[#1F4D3A] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#173A2C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm &amp; Assign Reviewer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revisionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/50 p-4 sm:p-8"
          onClick={() => setRevisionModalOpen(false)}
        >
          <div
            className="relative my-8 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-stone-200 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Edit3 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  Request Revisions
                </h3>
                <p className="mt-0.5 font-sans text-sm text-stone-600">
                  Specify what needs to be updated before the proposal can move forward.
                </p>
                <p className="mt-1 font-sans text-xs italic text-stone-500">
                  &ldquo;{proposal.title}&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setRevisionModalOpen(false);
              }}
            >
              <div className="max-h-[55vh] space-y-5 overflow-y-auto px-6 py-5">
                <div>
                  <p className="font-sans text-sm font-semibold text-stone-900">
                    Areas Requiring Revision <span className="text-rose-500">*</span>
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      "Abstract / Blurb",
                      "Table of Contents",
                      "Supporting Materials",
                      "Author Credentials",
                      "Market Analysis",
                      "Scope / Framing",
                      "Word Count / Length",
                      "Other",
                    ].map((area) => {
                      const checked = revisionAreas.includes(area);
                      return (
                        <label
                          key={area}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-sans text-sm transition-colors ${
                            checked
                              ? "border-rose-300 bg-rose-50 text-rose-900"
                              : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setRevisionAreas((prev) =>
                                prev.includes(area)
                                  ? prev.filter((a) => a !== area)
                                  : [...prev, area],
                              )
                            }
                            className="h-4 w-4 accent-rose-600"
                          />
                          {area}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="revision-feedback"
                    className="font-sans text-sm font-semibold text-stone-900"
                  >
                    Editorial Feedback <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="revision-feedback"
                    rows={5}
                    value={revisionFeedback}
                    onChange={(e) => setRevisionFeedback(e.target.value)}
                    placeholder="Explain what needs to be updated and why — this will be shared with the author..."
                    className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="revision-deadline"
                    className="font-sans text-sm font-semibold text-stone-900"
                  >
                    Resubmission Deadline{" "}
                    <span className="font-normal text-stone-500">(optional)</span>
                  </label>
                  <input
                    id="revision-deadline"
                    type="date"
                    value={revisionDeadline}
                    onChange={(e) => setRevisionDeadline(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setRevisionModalOpen(false)}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revisionAreas.length === 0 || !revisionFeedback.trim()}
                  className="rounded-lg bg-rose-600 px-5 py-2 font-sans text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Revision Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {children}
    </section>
  );
}

function Divider() {
  return <hr className="border-stone-100" />;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1.5 font-sans text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-sans text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-stone-900">{value}</span>
    </div>
  );
}

function Meta({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 text-stone-400" />
      {text}
    </span>
  );
}