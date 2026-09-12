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
  ticket: fallback(z.string().optional(), undefined),
  event: fallback(contractEventSchema.optional(), undefined),
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

function ContractCompletePage() {
  const { ticket, event } = Route.useSearch();

  const dashboardLink = ticket
    ? { to: "/dashboard/author_proposal/$id" as const, params: { id: ticket } }
    : { to: "/dashboard/author" as const, params: {} };

  const { title, message, variant, Icon } = describeContractSigningEvent(event);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f7f2] px-4 py-12">
      <div
        className={`w-full max-w-lg rounded-2xl border p-8 shadow-sm ${contractVariantStyles[variant]}`}
      >
        <div className="flex flex-col items-center text-center">
          <Icon className={`h-14 w-14 ${contractIconStyles[variant]}`} aria-hidden="true" />
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
