import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, LogOut, ChevronRight, FileText, Download, CheckCircle2, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import cspLogo from "@/assets/csp-logo.png";
import { initialsFromName, displayNameFromEmail } from "@/lib/proposals";
import { portalLogout, getPortalSession, getPortalToken } from "@/lib/auth";
import { proposalApiFetch } from "@/lib/proposalApi";

export const Route = createFileRoute("/dashboard/reviewer/submission/$id")({
  head: () => ({ meta: [{ title: "Review Submission — Reviewer Portal" }] }),
  component: ReviewerSubmission,
});

type RecKey = "proceed" | "minor" | "major" | "reject";

const RECOMMENDATIONS: { key: RecKey; label: string; sub: string }[] = [
  {
    key: "proceed",
    label: "Proceed without changes",
    sub: "The manuscript is ready for publication as submitted.",
  },
  {
    key: "minor",
    label: "Minor revisions needed",
    sub: "Small corrections required; no further review needed.",
  },
  {
    key: "major",
    label: "Major revisions needed",
    sub: "Substantial changes required before publication can be considered.",
  },
  {
    key: "reject",
    label: "Reject",
    sub: "The manuscript is not suitable for publication.",
  },
];

function ReviewerSubmission() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  type ManuscriptFile = { url: string; filename: string; size_bytes?: number };
  type ManuscriptFiles = {
    sampleChapter?: ManuscriptFile;
    additionalFiles?: ManuscriptFile[];
  };
  type CurrentData = Record<string, unknown> & {
    main_title?: string;
    sub_title?: string;
    proposed_title?: string;
    proposed_subtitle?: string;
    book_type?: string;
    subject?: string;
    language?: string;
    secondary_subjects?: string[];
    corresponding_author_name?: string;
    author_first_name?: string;
    author_last_name?: string;
    author_title?: string;
    email?: string;
    phone?: string;
    institution?: string;
    address?: string;
    country?: string;
    biography?: string;
    co_authors?: unknown[];
    estimated_word_count?: number;
    estimated_pages?: number | null;
    estimated_completion_date?: string;
    has_tables?: boolean;
    has_illustrations?: boolean;
    illustration_count?: number;
    is_previously_published?: boolean;
    detailed_description?: string;
    table_of_contents?: string;
    key_features?: string;
    unique_selling_points?: string;
    target_audience?: string;
    primary_market?: string;
    competing_titles?: string;
    conferences?: string;
    promotional_channels?: string;
    unique_contribution?: string;
    marketing_info?: string;
    additional_info?: string;
    additional_notes?: string;
    permissions_required?: string;
    permissions_notes?: string;
    co_authors_editors?: string;
    recommended_reviewers?: string;
    website_reference_number?: string;
    source?: string;
    manuscript_files?: ManuscriptFiles;
  };
  type ProposalState = {
    ticket: string;
    status?: string;
    internalStatus?: string;
    submittedAt?: string;
    updatedAt?: string;
    assignments?: Array<{ assigned_at?: string; note?: string; reviewer_email?: string }>;
    cd: CurrentData;
  };
  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [reviewIsSubmitted, setReviewIsSubmitted] = useState(false);
  const [reviewerName, setReviewerName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  type ReviewForm = {
    scope: string;
    purpose_value: string;
    title: string;
    originality: string;
    credibility: string;
    structure: string;
    clarity_quality: string;
    other_comments: string;
    red_flags: string;
    note_to_dr: string;
    dr_note: string;
  };
  const [recommendation, setRecommendation] = useState<RecKey | null>(null);
  const [form, setForm] = useState<ReviewForm>({
    scope: "",
    purpose_value: "",
    title: "",
    originality: "",
    credibility: "",
    structure: "",
    clarity_quality: "",
    other_comments: "",
    red_flags: "",
    note_to_dr: "",
    dr_note: "",
  });
  const updateField = (k: keyof ReviewForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    try {
      const session = getPortalSession();
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      if (session.role !== "reviewer") {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(session.email);
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
            internalStatus: body.internal_status as string | undefined,
            submittedAt: body.submitted_at as string | undefined,
            updatedAt: body.updated_at as string | undefined,
            assignments: (body.assignments as ProposalState["assignments"]) || [],
            cd,
          });
          setLoading(false);
        }
        // Load existing draft / submitted review for this peer reviewer
        try {
          const rr = await proposalApiFetch(`/${encodeURIComponent(id)}/review`, { headers });
          if (rr.ok) {
            const rb = (await rr.json().catch(() => ({}))) as Record<string, unknown>;
            const reviews = Array.isArray(rb.reviews)
              ? (rb.reviews as Array<Record<string, unknown>>)
              : rb.review
                ? [rb.review as Record<string, unknown>]
                : [];
            const mine =
              reviews.find((r) => r.reviewer_role === "peer_reviewer") || reviews[0];
            if (mine && !cancelled) {
              if ((mine.is_submitted as boolean) === true) {
                setReviewIsSubmitted(true);
              }
              const rd = (mine.review_data as Record<string, unknown>) || {};
              setForm((f) => ({
                ...f,
                scope: (rd.scope as string) ?? f.scope,
                purpose_value: (rd.purpose_value as string) ?? f.purpose_value,
                title: (rd.title as string) ?? f.title,
                originality: (rd.originality as string) ?? f.originality,
                credibility: (rd.credibility as string) ?? f.credibility,
                structure: (rd.structure as string) ?? f.structure,
                clarity_quality: (rd.clarity_quality as string) ?? f.clarity_quality,
                other_comments: (rd.other_comments as string) ?? f.other_comments,
                red_flags: (rd.red_flags as string) ?? f.red_flags,
                note_to_dr: (rd.note_to_dr as string) ?? f.note_to_dr,
                dr_note: (rd.dr_note as string) ?? f.dr_note,
              }));
              const rec = rd.recommendation as RecKey | undefined;
              if (rec) setRecommendation(rec);
            }
          }
        } catch {
          // ignore — draft load is best-effort
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

  const noteToReviewer = useMemo(() => {
    if (!proposal) return "";
    const match = proposal.assignments?.find(
      (a) => a.reviewer_email?.toLowerCase() === userEmail.toLowerCase(),
    );
    return (match?.note || proposal.assignments?.[0]?.note || "").trim();
  }, [proposal, userEmail]);

  if (loading || !proposal) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] p-10 font-sans text-stone-700">
        {loadError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        ) : (
          <p>Loading submission…</p>
        )}
        <Link to="/dashboard/reviewer" className="mt-4 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const displayedReviewerName =
    reviewerName || (userEmail ? displayNameFromEmail(userEmail) : "Reviewer");
  const canSubmit = recommendation !== null;

  const buildHeaders = () => {
    const token = getPortalToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    } as Record<string, string>;
  };

  const draftPayload = () => ({
    scope: form.scope,
    purpose_value: form.purpose_value,
    title: form.title,
    originality: form.originality,
    credibility: form.credibility,
    structure: form.structure,
    clarity_quality: form.clarity_quality,
    other_comments: form.other_comments,
    red_flags: form.red_flags,
  });

  const onSaveDraft = async () => {
    if (!proposal || saving || submitting) return;
    setSaving(true);
    setActionMessage(null);
    try {
      const res = await proposalApiFetch(
        `/${encodeURIComponent(proposal.ticket)}/review/save`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify(draftPayload()),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setActionMessage({
          kind: "error",
          text: (body.error as string) || `Failed to save draft (${res.status}).`,
        });
      } else {
        setActionMessage({
          kind: "success",
          text: (body.message as string) || "Draft saved successfully.",
        });
      }
    } catch {
      setActionMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const onSubmitReview = async () => {
    if (!canSubmit || !proposal || saving || submitting) return;
    setSubmitting(true);
    setActionMessage(null);
    try {
      const payload = {
        ...draftPayload(),
        note_to_dr: form.note_to_dr,
        dr_note: form.dr_note,
        recommendation:
          recommendation === "minor"
            ? "minor_revision"
            : recommendation === "major"
              ? "major_revision"
              : recommendation,
      };
      const res = await proposalApiFetch(
        `/${encodeURIComponent(proposal.ticket)}/review/submit`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setActionMessage({
          kind: "error",
          text: (body.error as string) || `Failed to submit review (${res.status}).`,
        });
        setSubmitting(false);
        return;
      }
      setSubmitSuccess(true);
    } catch {
      setActionMessage({ kind: "error", text: "Network error. Please try again." });
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF6EE] font-sans text-stone-800">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/reviewer" className="flex items-center gap-3">
              <img src={cspLogo} alt="CSP" width={32} height={32} />
              <span className="font-serif text-xl font-bold text-stone-900">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-sm font-medium text-sky-600">Reviewer Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 font-sans text-xs font-semibold text-sky-700">
              {initialsFromName(displayedReviewerName)}
            </div>
            <span className="font-sans text-sm font-medium text-stone-800">
              {displayedReviewerName}
            </span>
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

      {/* Two-pane layout */}
      <div className="grid w-full flex-1 grid-cols-1 items-start gap-6 px-0 py-0 lg:grid-cols-[minmax(0,550px)_1fr]">
        {/* LEFT — Review form */}
        <section className="bg-white px-6 py-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-68px)] lg:overflow-y-auto">
          <Link
            to="/dashboard/reviewer"
            className="mb-1 inline-flex items-center gap-1 font-sans text-xs text-[#7A6A5A] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <h1 className="mt-3 font-serif text-base font-bold leading-snug text-[#2C1A0E] line-clamp-2">
            {proposal.cd.main_title || proposal.ticket}
          </h1>
          {(() => {
            const rec = proposal.cd as Record<string, unknown>;
            const pt = ((rec.proposed_title as string | undefined) || "").trim();
            const ps = ((rec.proposed_subtitle as string | undefined) || "").trim();
            const ot = ((proposal.cd.main_title as string | undefined) || "").trim();
            const os = ((rec.sub_title as string | undefined) || "").trim();
            const showT = pt && pt !== ot ? pt : "";
            const showS = ps && ps !== os ? ps : "";
            if (!showT && !showS) return null;
            return (
              <p className="mt-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
                Proposed Title:{" "}
                <span className="font-serif text-xs font-normal normal-case tracking-normal text-[#2C1A0E]">
                  {showT}
                  {showT && showS ? `: ${showS}` : showS}
                </span>
              </p>
            );
          })()}
          <p className="mt-1 font-sans text-xs text-[#7A6A5A]">
            {proposal.cd.corresponding_author_name || "—"} · {proposal.cd.institution || "—"}
          </p>

          <hr className="my-6 border-stone-200" />

          {reviewIsSubmitted ? (
            <>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="mt-4 font-serif text-lg font-bold text-emerald-900">
                Review Completed
              </h2>
              <p className="mt-1 font-sans text-sm text-emerald-700">
                You have already submitted this review. It has been sent to the decision reviewer.
              </p>
              <Link
                to="/dashboard/reviewer"
                className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-sky-700"
              >
                Back to Dashboard
              </Link>
            </div>
            <div className="mt-6">
              <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                Your Submitted Review
              </p>
              {noteToReviewer && (
                <div className="mb-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <div className="border-b border-indigo-200 bg-indigo-50 px-5 py-3.5">
                    <h2 className="font-serif text-base font-bold text-indigo-900">
                      Note to Reviewer
                    </h2>
                    <p className="mt-0.5 font-sans text-xs text-indigo-600">
                      From Decision Reviewer
                    </p>
                  </div>
                  <div className="px-7 py-6">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
                      Note
                    </p>
                    <p className="mt-3 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                      {noteToReviewer}
                    </p>
                  </div>
                </div>
              )}
              {/* Review Returned hero — matches Decision Reviewer UX */}
              <div className="mb-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-200 bg-indigo-50 px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="font-serif text-base font-bold text-indigo-900">
                      Review Returned
                    </h2>
                    <p className="mt-0.5 font-sans text-xs text-indigo-600">
                      <span>{displayedReviewerName}</span>
                    </p>
                  </div>
                  {recommendation && (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 font-sans text-xs font-semibold text-amber-800">
                      Recommended:{" "}
                      {RECOMMENDATIONS.find((r) => r.key === recommendation)?.label ||
                        recommendation}
                    </span>
                  )}
                </div>
                {form.note_to_dr?.trim() && (
                  <div className="px-7 py-6">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
                      Reviewer Summary
                    </p>
                    <p className="mt-3 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                      {form.note_to_dr}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {(
                  [
                    { key: "scope", label: "Scope" },
                    { key: "purpose_value", label: "Purpose & Value" },
                    { key: "title", label: "Title" },
                    { key: "originality", label: "Originality" },
                    { key: "credibility", label: "Credibility" },
                    { key: "structure", label: "Structure" },
                    { key: "clarity_quality", label: "Clarity & Quality" },
                    { key: "other_comments", label: "Other Comments" },
                    { key: "red_flags", label: "Red Flags" },
                  ] as Array<{ key: keyof ReviewForm; label: string }>
                ).map((f) => (
                  <div key={f.key}>
                    <label className="block mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                      {f.label}
                    </label>
                    <div className="w-full whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-sans text-xs text-slate-700">
                      {form[f.key]?.trim() ? form[f.key] : <span className="text-slate-400">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </>
          ) : (
            <>
              {/* Review fields */}
              <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                Review Assessment
              </p>
              {noteToReviewer && (
                <div className="mb-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <div className="border-b border-indigo-200 bg-indigo-50 px-5 py-3.5">
                    <h2 className="font-serif text-base font-bold text-indigo-900">
                      Note to Reviewer
                    </h2>
                    <p className="mt-0.5 font-sans text-xs text-indigo-600">
                      From Decision Reviewer
                    </p>
                  </div>
                  <div className="px-7 py-6">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#7A6A5A]">
                      Note
                    </p>
                    <p className="mt-3 whitespace-pre-line font-sans text-sm leading-relaxed text-stone-700">
                      {noteToReviewer}
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-5">
                {(
                  [
                    { key: "scope", label: "Scope", placeholder: "Assess the scope of the proposal…" },
                    { key: "purpose_value", label: "Purpose & Value", placeholder: "Assess the purpose and value of the work…" },
                    { key: "title", label: "Title", placeholder: "Comment on the suitability of the title…" },
                    { key: "originality", label: "Originality", placeholder: "Evaluate the originality of the contribution…" },
                    { key: "credibility", label: "Credibility", placeholder: "Evaluate the credibility of the author and content…" },
                    { key: "structure", label: "Structure", placeholder: "Comment on the structure and organisation…" },
                    { key: "clarity_quality", label: "Clarity & Quality", placeholder: "Assess the clarity and quality of writing…" },
                    { key: "other_comments", label: "Other Comments", placeholder: "Any other comments…" },
                    { key: "red_flags", label: "Red Flags", placeholder: "Note any red flags or concerns…" },
                  ] as Array<{ key: keyof ReviewForm; label: string; placeholder: string }>
                ).map((f) => (
                  <div key={f.key}>
                    <label className="block mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-[#7A6A5A]">
                      {f.label}
                    </label>
                    <textarea
                      value={form[f.key]}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      rows={3}
                      placeholder={f.placeholder}
                      className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-sans text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                ))}
              </div>

              <hr className="my-6 border-stone-200" />

              {/* Recommendation */}
              <div>
                <label className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Recommendation <span className="text-rose-500">*</span>
                </label>
                <div className="mt-3 space-y-3">
                  {RECOMMENDATIONS.map((r) => {
                    const checked = recommendation === r.key;
                    return (
                      <label
                        key={r.key}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          checked
                            ? "border-sky-400 bg-sky-50/60 ring-2 ring-sky-100"
                            : "border-stone-200 bg-white hover:border-stone-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="recommendation"
                          className="mt-1 h-4 w-4 cursor-pointer accent-sky-600"
                          checked={checked}
                          onChange={() => setRecommendation(r.key)}
                        />
                        <div>
                          <div className="font-sans text-sm font-semibold text-stone-900">
                            {r.label}
                          </div>
                          <div className="mt-0.5 font-sans text-sm text-stone-600">
                            {r.sub}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Footer actions */}
              {actionMessage && (
                <div
                  className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                    actionMessage.kind === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {actionMessage.text}
                </div>
              )}
              <div className="mt-6 mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={saving || submitting}
                  className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 font-sans text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                <button
                  type="button"
                  disabled={!canSubmit || saving || submitting}
                  onClick={() => {
                    if (!canSubmit || saving || submitting) return;
                    setActionMessage(null);
                    setSubmitOpen(true);
                  }}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-3 font-sans text-sm font-semibold transition-colors ${
                    canSubmit && !submitting && !saving
                      ? "bg-sky-600 text-white hover:bg-sky-700"
                      : "bg-sky-200 text-white"
                  }`}
                >
                  {submitting ? "Submitting…" : "Submit Review"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </section>

        {/* RIGHT — Proposal context */}
        <ProposalDetails proposal={proposal} />
      </div>
      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            {submitSuccess ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="mt-4 font-serif text-lg font-bold text-[#2C1A0E]">
                  Review Submitted
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Your review has been completed and sent to the decision reviewer.
                </p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard/reviewer" })}
                  className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Back to Dashboard
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-serif text-lg font-bold text-[#2C1A0E]">
                  Note to Decision Reviewer
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Add a private note for the decision reviewer before submitting your review.
                </p>
                <textarea
                  value={form.note_to_dr}
                  onChange={(e) => updateField("note_to_dr", e.target.value)}
                  rows={6}
                  placeholder="Private note to the decision reviewer…"
                  className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-sans text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  autoFocus
                />
                {actionMessage && actionMessage.kind === "error" && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {actionMessage.text}
                  </div>
                )}
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(false)}
                    disabled={submitting}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onSubmitReview();
                    }}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 font-sans text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {submitting ? "Submitting…" : "Submit to Decision Reviewer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 font-sans text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-sans text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-1 font-sans text-sm text-stone-800">{value}</div>
    </div>
  );
}

function formatDate(iso?: string) {
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

function formatBytes(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <h3 className="font-serif text-sm font-bold text-[#2C1A0E]">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Para({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="mt-4 first:mt-0">
      <div className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
        {value}
      </p>
    </div>
  );
}

const ADDITIONAL_DETAILS_SKIP = new Set<string>([
  "main_title", "title", "sub_title", "subtitle", "proposed_title", "proposed_subtitle",
  "book_type", "corresponding_author_name", "author_first_name", "author_last_name",
  "author_title", "email", "secondary_email", "email_2", "phone", "phone_number",
  "qualifications", "academic_qualifications", "professional_qualifications",
  "institution", "job_title", "address", "address_line_1", "address_line_2",
  "address_line1", "address_line2", "city", "state", "region", "province", "county",
  "postal_code", "zip", "zip_code", "country",
  "languages_used", "languages", "language",
  "intended_audience", "audience", "target_audience",
  "manuscript_stage", "stage", "current_stage",
  "expected_submission_date", "submission_date",
  "competing_titles", "unique_contribution", "primary_market", "market",
  "conferences", "relevant_conferences", "promotional_channels", "promotion_channels",
  "additional_notes", "additional_comments", "notes", "additional_info",
  "authors", "mailing", "book", "description", "marketing", "manuscript", "agreement",
  "biography", "co_authors_editors", "co_authors",
  "word_count", "estimated_word_count", "figures_tables_count", "illustration_count",
  "has_tables", "has_illustrations", "under_review_elsewhere", "is_previously_published",
  "expected_completion_date", "estimated_completion_date",
  "short_description", "detailed_description", "detailed_description_extra",
  "key_features", "unique_selling_points", "keywords", "marketing_info",
  "referees_reviewers", "recommended_reviewers",
  "permissions_required", "permissions_notes",
  "table_of_contents", "manuscript_files", "documents", "supporting_documents",
  "files", "attachments",
  "source", "website_reference_number",
  "author_cv", "author_cv_url", "cv", "cv_url",
  "subject", "secondary_subjects",
]);

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    <Section title="Additional Proposal Information">
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
              {humanizeKey(key)}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProposalDetails({
  proposal,
}: {
  proposal: {
    ticket: string;
    status?: string;
    internalStatus?: string;
    submittedAt?: string;
    updatedAt?: string;
    assignments?: Array<{ assigned_at?: string; note?: string; reviewer_email?: string }>;
    cd: Record<string, unknown>;
  };
}) {
  const rawCd = proposal.cd as Record<string, unknown>;

  // Mirror the Decision Reviewer's normalization so the Peer Reviewer sees
  // exactly the same field names and values.
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
    institution: pick("institution"),
    country: pick("country"),
    address: pick("address"),
    address_line_1: pick("address_line_1", "address_line1"),
    address_line_2: pick("address_line_2", "address_line2"),
    city: pick("city"),
    state: pick("state", "region", "province", "county"),
    postal_code: pick("postal_code", "zip", "zip_code"),
    biography: pick("biography"),
    co_authors_editors: pick("co_authors_editors", "co_authors"),
    word_count: pick("word_count", "estimated_word_count"),
    illustration_count: pick("illustration_count", "number_of_illustrations"),
    expected_completion_date: pick("expected_completion_date", "estimated_completion_date"),
    manuscript_stage: pick("manuscript_stage", "stage", "current_stage"),
    languages_used: pick("languages_used", "languages", "language"),
    intended_audience: pick("intended_audience", "target_audience", "audience"),
    under_review_elsewhere: pick(
      "under_review_elsewhere",
      "under_review_elsewhere_details",
      "review_elsewhere",
      "review_elsewhere_details",
    ),
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
    website_reference_number: pick("website_reference_number"),
  };

  const formatNumber = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return n.toLocaleString();
  };

  const manuscriptFiles = rawCd.manuscript_files as
    | {
        sampleChapter?: { url: string; filename: string; size_bytes?: number };
        additionalFiles?: Array<{ url: string; filename: string; size_bytes?: number }>;
      }
    | undefined;
  const sample = manuscriptFiles?.sampleChapter;
  const additional = manuscriptFiles?.additionalFiles ?? [];
  const cvFile = (() => {
    const cv = rawCd.author_cv as
      | { url?: string; filename?: string; size_bytes?: number }
      | undefined;
    const cvUrl = rawCd.author_cv_url as string | undefined;
    if (cv && typeof cv === "object" && cv.url) {
      return {
        url: cv.url,
        filename: cv.filename || cv.url.split("/").pop() || "Author CV",
        size_bytes: cv.size_bytes,
        label: "Author CV",
      };
    }
    if (typeof cvUrl === "string" && cvUrl) {
      return { url: cvUrl, filename: cvUrl.split("/").pop() || "Author CV", label: "Author CV" };
    }
    return null;
  })();
  const allFiles = [
    ...(cvFile ? [cvFile] : []),
    ...(sample ? [{ ...sample, label: "Sample Chapter" }] : []),
    ...additional.map((f) => ({ ...f, label: "Additional" })),
  ];

  const toc = (cd.table_of_contents || "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

  const keywords = (cd.keywords || "")
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter(Boolean);

  const suggestedReviewers = (cd.referees_reviewers || "")
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);

  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string } | null>(null);

  return (
    <section className="space-y-6 px-6 py-4">
      {/* Title card */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-stone-500">{proposal.ticket}</span>
          {proposal.status && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {proposal.status}
            </span>
          )}
        </div>
        <h2 className="mt-2 font-serif text-xl font-bold leading-tight text-[#2C1A0E]">
          {cd.main_title || proposal.ticket}
        </h2>
        {cd.sub_title && (
          <p className="mt-1 font-sans text-sm font-medium text-[#A6814A]">{cd.sub_title}</p>
        )}
        {(() => {
          const pt = (cd.proposed_title || "").trim();
          const ps = (cd.proposed_subtitle || "").trim();
          const ot = (cd.main_title || "").trim();
          const os = ((cd as Record<string, string | undefined>).sub_title || "").trim();
          const showT = pt && pt !== ot ? pt : "";
          const showS = ps && ps !== os ? ps : "";
          if (!showT && !showS) return null;
          return (
            <p className="mt-2 font-sans text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Proposed Title:{" "}
              <span className="font-serif text-sm font-normal normal-case tracking-normal text-stone-700">
                {showT}
                {showT && showS ? `: ${showS}` : showS}
              </span>
            </p>
          );
        })()}
      </div>

      {/* Primary Author / Editor */}
      <Section title="Primary Author / Editor">
        <div className="-mt-2 mb-4 flex flex-wrap gap-x-8 gap-y-2 font-sans text-sm">
          <Field label="Type" value={cd.book_type || "—"} />
          <Field label="Words" value={formatNumber(cd.word_count) || "—"} />
          <Field label="Completion" value={cd.expected_completion_date || "—"} />
        </div>
        <hr className="my-4 border-stone-100" />
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Name" value={cd.corresponding_author_name || "—"} />
          <Field label="Email" value={cd.email || "—"} />
          <Field label="Institution" value={cd.institution || "—"} />
          <Field label="Country" value={cd.country || "—"} />
        </div>
        {(cd.address ||
          cd.address_line_1 ||
          cd.city ||
          cd.state ||
          cd.postal_code ||
          cd.country) && (
          <>
            <hr className="my-4 border-stone-100" />
            <div>
              <div className="font-sans text-xs uppercase tracking-wide text-stone-500">
                Mailing Address
              </div>
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
        <Para label="Biography" value={cd.biography} />
      </Section>

      {/* Co-authors / Editors / Contributors / Translators */}
      {Array.isArray(rawCd.co_authors) && (rawCd.co_authors as unknown[]).length > 0 ? (
        <Section title="Co-authors / Editors / Contributors / Translators">
          <ul className="divide-y divide-stone-100">
            {(rawCd.co_authors as Array<Record<string, unknown>>).map((c, i) => {
              const name =
                [c.firstName || c.first_name, c.lastName || c.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim() ||
                (c.name as string) ||
                `Contributor ${i + 1}`;
              return (
                <li key={i} className="grid grid-cols-1 gap-4 py-4 first:pt-0 sm:grid-cols-2">
                  <Field label="Role" value={(c.role as string) || "—"} />
                  <Field label="Name" value={name} />
                  <Field label="Email" value={(c.email as string) || "—"} />
                  <Field
                    label="Affiliation"
                    value={(c.institution as string) || (c.affiliation as string) || "—"}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : cd.co_authors_editors ? (
        <Section title="Additional Authors / Editors">
          <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
            {cd.co_authors_editors}
          </p>
        </Section>
      ) : null}

      {/* Manuscript Details */}
      <Section title="Manuscript Details">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <Field label="Word Count" value={formatNumber(cd.word_count) || "—"} />
          <Field
            label="illustrations/figures/tables"
            value={formatNumber(cd.illustration_count) || "—"}
          />
          <Field label="Languages" value={cd.languages_used || "—"} />
          <Field label="Est. Completion" value={cd.expected_completion_date || "—"} />
          <Field label="Subject" value={cd.subject || "—"} />
        </div>
        {(cd.intended_audience || cd.manuscript_stage || cd.under_review_elsewhere) && (
          <div className="mt-4 flex flex-col gap-4 border-t border-stone-100 pt-4">
            <Para label="Intended Audience" value={cd.intended_audience} />
            {cd.manuscript_stage && (
              <Field label="Manuscript Stage" value={cd.manuscript_stage} />
            )}
            {cd.under_review_elsewhere && (
              <Field label="Under Review Elsewhere" value={cd.under_review_elsewhere} />
            )}
          </div>
        )}
      </Section>

      {/* Summary & Description */}
      {(cd.short_description || cd.detailed_description || keywords.length > 0) && (
        <Section title="Summary & Description">
          {cd.short_description && (
            <div>
              <div className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                Overview
              </div>
              <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
                {cd.short_description}
              </p>
              {keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
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
            <Para label="Key Features & Unique Contribution" value={cd.detailed_description} />
          )}
          {cd.key_features && cd.key_features !== cd.detailed_description && (
            <Para label="Key Features / Selling Points" value={cd.key_features} />
          )}
        </Section>
      )}

      {/* Table of Contents */}
      {toc.length > 0 && (
        <Section title="Table of Contents">
          <ol className="space-y-2 rounded-xl bg-[#FAF6EE] p-5">
            {toc.map((chapter, idx) => (
              <li key={idx} className="font-sans text-sm leading-relaxed text-stone-800">
                <span className="mr-1.5 text-stone-500">{idx + 1}.</span>
                {chapter}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Marketing & Promotion */}
      {(cd.primary_market ||
        cd.competing_titles ||
        cd.unique_contribution ||
        cd.conferences ||
        cd.promotional_channels ||
        cd.marketing_info) && (
        <Section title="Marketing & Promotion">
          <Para label="Primary Market" value={cd.primary_market} />
          <Para label="Competing Titles" value={cd.competing_titles} />
          <Para
            label="Unique Contribution vs Competing Titles"
            value={cd.unique_contribution}
          />
          <Para
            label="Relevant Conferences / Academic Events"
            value={cd.conferences}
          />
          <Para label="Promotional Channels" value={cd.promotional_channels} />
          {cd.marketing_info &&
            cd.marketing_info !== cd.competing_titles &&
            cd.marketing_info !== cd.primary_market && (
              <Para label="Additional Marketing Notes" value={cd.marketing_info} />
            )}
        </Section>
      )}

      {/* Author-Suggested Reviewers */}
      {suggestedReviewers.length > 0 && (
        <Section title="Author-Suggested Reviewers">
          <ol className="divide-y divide-stone-100">
            {suggestedReviewers.map((r, idx) => (
              <li key={idx} className="flex gap-4 py-3 first:pt-0">
                <span className="font-sans text-sm font-semibold text-stone-500">
                  {idx + 1}.
                </span>
                <p className="font-sans text-sm text-stone-800">{r}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Additional Comments & Permissions */}
      {(cd.additional_notes || cd.additional_info || cd.permissions_required) && (
        <Section title="Additional Comments & Permissions">
          <Para label="Additional Notes from Author" value={cd.additional_notes} />
          {cd.additional_info && (
            <p className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700 first:mt-0">
              {cd.additional_info}
            </p>
          )}
          <Para
            label="Permissions Required from Copyright Holders"
            value={cd.permissions_required}
          />
        </Section>
      )}

      {/* Supporting Documents */}
      {allFiles.length > 0 && (
        <Section title="Supporting Documents">
          <ul className="divide-y divide-stone-100">
            {allFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-semibold text-stone-900">
                      {f.filename}
                    </p>
                    <p className="mt-0.5 font-sans text-xs text-stone-500">
                      {f.label}
                      {f.size_bytes ? ` · ${formatBytes(f.size_bytes)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ url: f.url, filename: f.filename })}
                    title="Preview document"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-sans text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-sans text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Additional Proposal Information (catch-all) */}
      <AdditionalProposalDetails rawCd={rawCd} />

      {/* Submission Info */}
      <Section title="Submission Info">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Ref" value={cd.website_reference_number || proposal.ticket} />
          <Field label="Type" value={cd.book_type || "—"} />
          <Field label="Submitted" value={formatDate(proposal.submittedAt)} />
          <Field label="Updated" value={formatDate(proposal.updatedAt)} />
        </div>
        {proposal.assignments && proposal.assignments.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
              Assignment
            </div>
            {proposal.assignments.map((a, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 font-sans text-xs text-stone-600">
                  <span>{a.reviewer_email || "Reviewer"}</span>
                  <span>{formatDate(a.assigned_at)}</span>
                </div>
                {a.note && (
                  <p className="mt-1.5 font-sans text-sm text-stone-700">{a.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </section>
  );
}