import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookCopy,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  createJacketJob,
  downloadJacketZip,
  getJacketJob,
  listJacketJobs,
  MAX_JACKET_IDS,
  type JacketBookResult,
  type JacketJob,
  type JacketJobStatus,
  type JacketJobSummary,
} from "@/lib/jacketGenApi";

const POLL_MS = 4000;
const SECONDS_PER_BOOK = 8; // backend's rough per-book generation time
const ACTIVE_JOB_KEY = "csp.jacketGen.activeJob";

const isActive = (s?: JacketJobStatus) => s === "pending" || s === "running";

const STATUS_META: Record<JacketJobStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-stone-200 bg-stone-50 text-stone-700" },
  running: { label: "Running", className: "border-sky-200 bg-sky-50 text-sky-800" },
  done: { label: "Done", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  failed: { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-800" },
};

function StatusBadge({ status }: { status: JacketJobStatus }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-xs font-semibold ${meta.className}`}
    >
      {isActive(status) && <Loader2 className="h-3 w-3 animate-spin" />}
      {meta.label}
    </span>
  );
}

// Splits on commas / whitespace / newlines; reports anything that isn't a
// positive integer so it can be fixed before submitting.
function parseIds(raw: string) {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const invalid: string[] = [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t) || Number(t) <= 0) {
      if (!invalid.includes(t)) invalid.push(t);
      continue;
    }
    const n = Number(t);
    if (!seen.has(n)) {
      seen.add(n);
      ids.push(n);
    }
  }
  return { ids, invalid, duplicates: tokens.length - invalid.length - ids.length };
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function readActiveJob(): string | null {
  try {
    return localStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

function writeActiveJob(jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(ACTIVE_JOB_KEY, jobId);
    else localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    // Storage blocked — resuming after a reload just won't happen.
  }
}

/** Admin-only header option (same pattern as Change password) that opens the dialog. */
export function BatchJacketTrigger({
  className,
  label = "Batch jackets",
  onClick,
}: {
  className?: string;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-[#2C1A0E]"
      }
    >
      <BookCopy className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * The Batch Jacket Generation dialog. Mounts on first open and is then only
 * hidden on close, so a running job keeps being tracked in the background.
 * Render one instance per page (outside menus that unmount their contents).
 */
export function BatchJacketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {mounted && (
        <div
          className={`fixed inset-0 z-50 items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8 ${
            open ? "flex" : "hidden"
          }`}
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-jacket-title"
            className="w-full max-w-5xl rounded-2xl bg-[#FAF6EE] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-stone-200 bg-white px-6 py-5">
              <div>
                <h2
                  id="batch-jacket-title"
                  className="font-serif text-xl font-bold text-stone-900"
                >
                  Batch Jacket Generation
                </h2>
                <p className="mt-1 font-sans text-sm text-stone-600">
                  Generate jacket PDFs for a list of books and download them as one ZIP. Each book
                  takes about {SECONDS_PER_BOOK} seconds — you can close this window while a job
                  runs.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-6 p-4 sm:p-6">
              <JacketGenerator />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-3.5">
        <div>
          <h2 className="font-serif text-base font-bold text-[#2C1A0E]">{title}</h2>
          {subtitle && <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function JacketGenerator() {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [job, setJob] = useState<JacketJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // IDs submitted from this page, so not-yet-processed books show as queued.
  const [submittedIds, setSubmittedIds] = useState<number[]>([]);
  const [pollWarning, setPollWarning] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [recentReload, setRecentReload] = useState(0);

  const parsed = useMemo(() => parseIds(raw), [raw]);
  const tooMany = parsed.ids.length > MAX_JACKET_IDS;
  const jobRunning = isActive(job?.status);
  const canSubmit =
    !submitting && !jobRunning && parsed.ids.length > 0 && parsed.invalid.length === 0 && !tooMany;

  // ---- Polling: every 4s while pending/running; stops on done/failed. ----
  // pollKey restarts polling even when re-opening the job already shown.
  const [pollKey, setPollKey] = useState(0);
  const failuresRef = useRef(0);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;
    // Only announce completion for a job we actually watched run — not when
    // opening an already-finished job from Recent jobs.
    let sawActive = false;

    const tick = async () => {
      try {
        const next = await getJacketJob(jobId);
        if (cancelled) return;
        failuresRef.current = 0;
        setPollWarning(null);
        setJob(next);
        if (isActive(next.status)) {
          sawActive = true;
          timer = window.setTimeout(tick, POLL_MS);
        } else {
          writeActiveJob(null);
          if (sawActive) {
            setRecentReload((k) => k + 1);
            if (next.status === "done") toast.success("Jacket generation finished");
            else toast.error("Jacket generation failed");
          }
        }
      } catch (err) {
        if (cancelled) return;
        // A dropped request shouldn't end a 7-minute job's tracking — keep
        // polling, and only surface a warning once it keeps happening.
        failuresRef.current += 1;
        if (failuresRef.current >= 3) {
          setPollWarning(`Can't reach the server (${(err as Error).message}). Still retrying…`);
        }
        timer = window.setTimeout(tick, POLL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, pollKey]);

  // Resume a job this browser started before a reload.
  useEffect(() => {
    const saved = readActiveJob();
    if (saved) setJobId(saved);
  }, []);

  // Live clock while the job is active.
  useEffect(() => {
    if (!jobRunning) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [jobRunning]);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createJacketJob(parsed.ids);
      setSubmittedIds(parsed.ids);
      setJob({
        job_id: created.job_id,
        status: created.status || "pending",
        total: created.total ?? parsed.ids.length,
        completed: 0,
        results: {},
        created_at: new Date().toISOString(),
      });
      writeActiveJob(created.job_id);
      setJobId(created.job_id);
      setPollKey((k) => k + 1);
      setNow(Date.now());
      setRecentReload((k) => k + 1);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openJob = useCallback((id: string) => {
    setSubmittedIds([]);
    setSubmitError(null);
    setJob(null);
    setJobId(id);
    setPollKey((k) => k + 1);
    // Bring the progress section into view inside the dialog.
    window.setTimeout(() => {
      document
        .getElementById("jacket-current-job")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const onDownload = async () => {
    if (!job) return;
    setDownloading(true);
    try {
      await downloadJacketZip(job.job_id, job.download_url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {/* 1–2. ID input + submit */}
      <Card
        title="Book IDs"
        subtitle="Paste book_information IDs, separated by commas or new lines"
      >
        <div className="space-y-3 px-5 py-5">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={"15277, 14784\n15301"}
            aria-describedby="jacket-ids-help"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-mono text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
          />
          <div
            id="jacket-ids-help"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-sm"
          >
            <span className="font-semibold text-stone-900">
              {parsed.ids.length} unique ID{parsed.ids.length === 1 ? "" : "s"}
            </span>
            {parsed.duplicates > 0 && (
              <span className="text-stone-500">
                {parsed.duplicates} duplicate{parsed.duplicates === 1 ? "" : "s"} ignored
              </span>
            )}
            {parsed.ids.length > 0 && !tooMany && (
              <span className="text-stone-500">
                ≈ {formatDuration(parsed.ids.length * SECONDS_PER_BOOK)} to generate
              </span>
            )}
          </div>
          {parsed.invalid.length > 0 && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
            >
              Not valid IDs (whole numbers only):{" "}
              <span className="font-mono">
                {parsed.invalid.slice(0, 10).join(", ")}
                {parsed.invalid.length > 10 ? ` +${parsed.invalid.length - 10} more` : ""}
              </span>
            </p>
          )}
          {tooMany && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
            >
              A job can include at most {MAX_JACKET_IDS} books — you have {parsed.ids.length}.
            </p>
          )}
          {submitError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Couldn't start the job: {submitError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            {jobRunning && (
              <span className="font-sans text-xs text-stone-500">
                Wait for the current job to finish before starting another.
              </span>
            )}
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0E3D2F] px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-[#0a2e23] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Starting…" : "Generate Jackets"}
            </button>
          </div>
        </div>
      </Card>

      {/* 3–5. Progress, results, download */}
      {jobId && (
        <div id="jacket-current-job" className="scroll-mt-4">
          <JobProgress
            job={job}
            submittedIds={submittedIds}
            now={now}
            pollWarning={pollWarning}
            downloading={downloading}
            onDownload={() => void onDownload()}
          />
        </div>
      )}

      {/* 6. Recent jobs */}
      <RecentJobs reloadKey={recentReload} activeJobId={jobId} onOpen={openJob} />
    </>
  );
}

function JobProgress({
  job,
  submittedIds,
  now,
  pollWarning,
  downloading,
  onDownload,
}: {
  job: JacketJob | null;
  submittedIds: number[];
  now: number;
  pollWarning: string | null;
  downloading: boolean;
  onDownload: () => void;
}) {
  if (!job) {
    return (
      <Card title="Current job">
        <p className="flex items-center gap-2 px-5 py-6 font-sans text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading job…
        </p>
      </Card>
    );
  }

  const results = job.results || {};
  const total = job.total || submittedIds.length || 0;
  const completed = Math.min(job.completed || 0, total || Infinity);
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const active = isActive(job.status);

  const startMs = Date.parse(job.started_at || job.created_at || "") || now;
  const endMs = (job.finished_at && Date.parse(job.finished_at)) || now;
  const elapsed = (endMs - startMs) / 1000;
  const remaining = active ? Math.max(0, (total - completed) * SECONDS_PER_BOOK) : 0;

  const entries = Object.entries(results);
  const succeeded = entries.filter(([, r]) => r.status === "done").length;
  const failed = entries.filter(([, r]) => r.status === "failed").length;
  const flagged = entries.filter(
    ([, r]) => r.status === "done" && ((r.missing_images?.length || 0) + (r.warnings?.length || 0)) > 0,
  ).length;

  // Rows: books with results first (in submit order when known), then the
  // rest of this session's submitted IDs as "Queued".
  const order = submittedIds.length
    ? [
        ...submittedIds.map(String).filter((id) => results[id]),
        ...entries.map(([id]) => id).filter((id) => !submittedIds.map(String).includes(id)),
      ]
    : entries.map(([id]) => id);
  const queued = submittedIds.map(String).filter((id) => !results[id]);

  return (
    <Card
      title="Current job"
      subtitle={`Job ${job.job_id.slice(0, 8)} · started ${formatDateTime(job.started_at || job.created_at)}`}
      right={<StatusBadge status={job.status} />}
    >
      <div className="space-y-4 px-5 py-5">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-sans text-sm">
            <span className="font-semibold text-stone-900">
              {completed} of {total} book{total === 1 ? "" : "s"} processed
            </span>
            <span className="inline-flex items-center gap-3 text-stone-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(elapsed)} elapsed
              </span>
              {active && remaining > 0 && <span>≈ {formatDuration(remaining)} left</span>}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-label="Jacket generation progress"
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                job.status === "failed" ? "bg-rose-500" : job.status === "done" ? "bg-emerald-600" : "bg-[#0E3D2F]"
              } ${active && completed === 0 ? "animate-pulse" : ""}`}
              style={{ width: `${active && completed === 0 ? 4 : pct}%` }}
            />
          </div>
          {active && (
            <p className="mt-2 font-sans text-xs text-stone-500">
              {job.status === "pending"
                ? "Queued — generation will start shortly."
                : "Generating… you can leave this page; the job keeps running and you can pick it up from Recent jobs."}
            </p>
          )}
        </div>

        {pollWarning && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 font-sans text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {pollWarning}
          </p>
        )}

        {job.status === "failed" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            The job failed{job.error ? `: ${job.error}` : "."}
          </p>
        )}

        {job.status === "done" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <p className="flex items-center gap-2 font-sans text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              {succeeded} succeeded · {failed} failed
              {flagged > 0 && ` · ${flagged} with warnings`}
            </p>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading || succeeded === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0E3D2F] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#0a2e23] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Preparing…" : `Download ZIP (${succeeded} succeeded, ${failed} failed)`}
            </button>
          </div>
        )}
      </div>

      {(order.length > 0 || queued.length > 0) && (
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[640px] font-sans text-[13px]">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Book ID</th>
                <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">PB ISBN</th>
                <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Status</th>
                <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {order.map((id) => (
                <ResultRow key={id} id={id} result={results[id]} />
              ))}
              {queued.map((id) => (
                <tr key={`q-${id}`} className="text-stone-400">
                  <td className="px-5 py-3 font-mono">{id}</td>
                  <td className="px-5 py-3">—</td>
                  <td className="px-5 py-3">Queued</td>
                  <td className="px-5 py-3">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ResultRow({ id, result }: { id: string; result: JacketBookResult }) {
  const issues = [...(result.missing_images || []).map((m) => `Missing image: ${m}`), ...(result.warnings || [])];
  const failed = result.status === "failed";
  const warn = !failed && issues.length > 0;
  return (
    <tr
      className={failed ? "bg-rose-50/70 text-rose-900" : warn ? "bg-amber-50/70 text-amber-900" : "text-stone-900"}
    >
      <td className="px-5 py-3 align-top font-mono">{id}</td>
      <td className="px-5 py-3 align-top font-mono">{result.pb_isbn || "—"}</td>
      <td className="px-5 py-3 align-top">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {failed ? (
            <XCircle className="h-4 w-4 text-rose-600" />
          ) : warn ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          {failed ? "Failed" : warn ? "Done with warnings" : "Done"}
        </span>
      </td>
      <td className="px-5 py-3 align-top">
        {failed ? (
          <span>{result.error || "Generation failed"}</span>
        ) : issues.length ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        ) : (
          <span className="text-stone-400">—</span>
        )}
      </td>
    </tr>
  );
}

function RecentJobs({
  reloadKey,
  activeJobId,
  onOpen,
}: {
  reloadKey: number;
  activeJobId: string | null;
  onOpen: (jobId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [jobs, setJobs] = useState<JacketJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await listJacketJobs(20));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const download = async (job: JacketJobSummary) => {
    setDownloadingId(job.job_id);
    try {
      await downloadJacketZip(job.job_id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-stone-50"
      >
        <div>
          <h2 className="font-serif text-base font-bold text-[#2C1A0E]">Recent jobs</h2>
          <p className="mt-0.5 font-sans text-xs text-[#7A6A5A]">
            The last 20 jobs — open one to pick up where you left off
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-stone-200">
          <div className="flex justify-end px-5 py-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 font-sans text-xs font-medium text-stone-600 hover:text-stone-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          {error ? (
            <p className="px-5 pb-5 font-sans text-sm text-rose-600">{error}</p>
          ) : loading && jobs.length === 0 ? (
            <p className="px-5 pb-5 font-sans text-sm text-stone-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="px-5 pb-5 font-sans text-sm text-stone-500">No jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] font-sans text-[13px]">
                <thead>
                  <tr className="border-y border-stone-200 text-left">
                    <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Date</th>
                    <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Created by</th>
                    <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Progress</th>
                    <th className="px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {jobs.map((j) => (
                    <tr key={j.job_id} className={j.job_id === activeJobId ? "bg-stone-50" : ""}>
                      <td className="px-5 py-3 text-stone-900">{formatDateTime(j.created_at)}</td>
                      <td className="px-5 py-3 text-stone-900">{j.created_by || "—"}</td>
                      <td className="px-5 py-3 text-stone-900">
                        {j.completed ?? 0} / {j.total ?? 0}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => onOpen(j.job_id)}
                            className="font-sans text-xs font-semibold text-[#00422F] hover:underline"
                          >
                            {isActive(j.status) ? "Watch" : "View results"}
                          </button>
                          {j.status === "done" && (
                            <button
                              type="button"
                              onClick={() => void download(j)}
                              disabled={downloadingId === j.job_id}
                              className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-[#00422F] hover:underline disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {downloadingId === j.job_id ? "Preparing…" : "Download"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
