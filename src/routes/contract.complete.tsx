import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

const eventSchema = z.enum([
  "signing_complete",
  "cancel",
  "decline",
  "session_timeout",
  "ttl_expired",
  "exception",
  "fax_pending",
  "viewing_complete",
  "access_code_failed",
  "id_check_failed",
]);

const searchSchema = z.object({
  ticket: fallback(z.string().optional(), undefined),
  event: fallback(eventSchema.optional(), undefined),
});

export const Route = createFileRoute("/contract/complete")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Contract signing — Cambridge Scholars" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContractCompletePage,
});

type Variant = "success" | "warning" | "error" | "info";

function ContractCompletePage() {
  const { ticket, event } = Route.useSearch();

  const dashboardLink = ticket
    ? { to: "/dashboard/author_proposal/$id" as const, params: { id: ticket } }
    : { to: "/dashboard/author" as const, params: {} };

  const { title, message, variant, Icon } = describeEvent(event);

  const variantStyles: Record<Variant, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    info: "border-slate-200 bg-slate-50 text-slate-900",
  };

  const iconStyles: Record<Variant, string> = {
    success: "text-emerald-600",
    warning: "text-amber-600",
    error: "text-red-600",
    info: "text-slate-600",
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className={`w-full max-w-lg rounded-2xl border p-8 shadow-sm ${variantStyles[variant]}`}
      >
        <div className="flex flex-col items-center text-center">
          <Icon className={`h-14 w-14 ${iconStyles[variant]}`} aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed opacity-90">{message}</p>

          {ticket && (
            <p className="mt-4 text-xs uppercase tracking-wide opacity-70">
              Reference: {ticket}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              {...dashboardLink}
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              {ticket ? "Open proposal" : "Back to dashboard"}
            </Link>
            {variant === "success" && (
              <button
                type="button"
                onClick={() => window.close()}
                className="inline-flex items-center rounded-md border border-current px-4 py-2 text-sm font-medium hover:bg-white/40"
              >
                Close tab
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function describeEvent(event: string | undefined): {
  title: string;
  message: string;
  variant: Variant;
  Icon: typeof CheckCircle2;
} {
  switch (event) {
    case "signing_complete":
    case "viewing_complete":
      return {
        variant: "success",
        Icon: CheckCircle2,
        title: "Thank you — your contract has been signed",
        message:
          "DocuSign has recorded your signature. You can safely close this tab; your proposal dashboard will update automatically once the signed copy is processed.",
      };
    case "cancel":
      return {
        variant: "warning",
        Icon: AlertTriangle,
        title: "Signing cancelled",
        message:
          "You cancelled the DocuSign session before signing. No changes were made — you can return to your proposal and start the signing flow again whenever you're ready.",
      };
    case "decline":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Contract declined",
        message:
          "You declined to sign the contract in DocuSign. Our editorial team will be notified. If this was a mistake, please contact us from your proposal dashboard.",
      };
    case "session_timeout":
    case "ttl_expired":
      return {
        variant: "warning",
        Icon: Clock,
        title: "Signing session timed out",
        message:
          "Your DocuSign session expired before signing completed. Head back to your proposal to request a fresh signing link.",
      };
    case "access_code_failed":
    case "id_check_failed":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Identity verification failed",
        message:
          "DocuSign couldn't verify your identity for this envelope. Please return to your proposal and try again, or contact us for assistance.",
      };
    case "exception":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Something went wrong during signing",
        message:
          "DocuSign reported an unexpected error. Your proposal is unchanged — please return to the dashboard and request a fresh signing link.",
      };
    default:
      return {
        variant: "info",
        Icon: AlertTriangle,
        title: "Signing status unknown",
        message:
          "We didn't receive a recognised status from DocuSign. Open your proposal dashboard to see the current state of your contract.",
      };
  }
}