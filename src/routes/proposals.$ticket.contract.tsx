import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  contractEventSchema,
  contractVariantStyles,
  contractIconStyles,
  describeContractSigningEvent,
} from "@/lib/contractSigningEvent";

const searchSchema = z.object({
  stage: fallback(z.string().optional(), undefined),
  status: fallback(z.string().optional(), undefined),
  event: fallback(contractEventSchema.optional(), undefined),
});

export const Route = createFileRoute("/proposals/$ticket/contract")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Contract signing — Cambridge Scholars" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProposalContractReturnPage,
});

const STAGE_LABELS: Record<string, string> = {
  publishing_agreement: "Publishing Agreement",
  author_contract: "Contract",
};

function ProposalContractReturnPage() {
  const { ticket } = Route.useParams();
  const { stage, event } = Route.useSearch();

  const stageLabel = stage ? STAGE_LABELS[stage] : undefined;
  const { title, message, variant, Icon } = describeContractSigningEvent(event, stageLabel);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className={`w-full max-w-lg rounded-2xl border p-8 shadow-sm ${contractVariantStyles[variant]}`}
      >
        <div className="flex flex-col items-center text-center">
          <Icon className={`h-14 w-14 ${contractIconStyles[variant]}`} aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed opacity-90">{message}</p>

          {stageLabel && (
            <p className="mt-4 text-xs uppercase tracking-wide opacity-70">{stageLabel}</p>
          )}
          <p className="mt-1 text-xs uppercase tracking-wide opacity-70">Reference: {ticket}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dashboard/author_proposal/$id"
              params={{ id: ticket }}
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Open proposal
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
