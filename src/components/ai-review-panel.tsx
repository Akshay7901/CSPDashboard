import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAiReview, runAiReview, type AiReview } from "@/lib/aiReviewApi";
import { formatDate } from "@/lib/proposals";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  not_run: { label: "Not Run", className: "bg-stone-100 text-stone-700 border-stone-200" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800 border-amber-200" },
  running: { label: "Running", className: "bg-sky-50 text-sky-800 border-sky-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
};

export function AiReviewPanel({ ticket }: { ticket: string }) {
  const [review, setReview] = useState<AiReview>({ status: "not_run" });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await getAiReview(ticket);
      if (mounted.current) setReview(data);
    } catch {
      // keep previous state on transient failures
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const status = String(review.status || "not_run");
  const inFlight = status === "pending" || status === "running";

  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(id);
  }, [inFlight, load]);

  const onRun = async () => {
    setStarting(true);
    try {
      await runAiReview(ticket);
      // Clear previous score/report while the new review runs so the UI
      // doesn't show stale results from an earlier run.
      setReview({ status: "pending", final_score: null, report_url: null, error_message: null });
      toast.success("AI review started");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start AI review");
    } finally {
      setStarting(false);
      setConfirmOpen(false);
    }
  };

  const meta = STATUS_STYLE[status] ?? STATUS_STYLE.not_run;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-stone-500" />
          <h3 className="font-sans text-sm font-semibold text-stone-800">AI Proposal Review</h3>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium ${meta.className}`}
          >
            {status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          disabled={inFlight || starting || loading}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Run AI Review
        </button>
      </div>

      {status === "completed" && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {typeof review.final_score === "number" && (
            <p className="font-sans text-sm font-semibold text-stone-800">
              Score: {review.final_score} / 10
            </p>
          )}
          {review.report_url && (
            <a
              href={review.report_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-800 hover:border-stone-300 hover:bg-stone-50"
            >
              <ExternalLink className="h-4 w-4 text-stone-500" />
              View Full Report
            </a>
          )}
        </div>
      )}

      {status === "failed" && review.error_message && (
        <p className="mt-3 font-sans text-sm text-red-600">{review.error_message}</p>
      )}

      {(review.triggered_by || review.completed_at) && (
        <p className="mt-3 font-sans text-xs text-stone-500">
          {review.triggered_by ? `Triggered by ${review.triggered_by}` : ""}
          {review.triggered_by && review.completed_at ? " · " : ""}
          {review.completed_at ? `Completed ${formatDate(review.completed_at)}` : ""}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Run AI review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will run a Gemini AI analysis on the uploaded proposal files. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onRun();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
