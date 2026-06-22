import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getPortalSession, getPortalToken, portalLogout } from "@/lib/auth";
import {
  fetchAiEnrichStatus,
  deleteProposal,
  type DeleteProposalResponse,
  type AiEnrichStatusResponse,
} from "@/lib/adminApi";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({ meta: [{ title: "Admin — CSP Proposal Portal" }] }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [data, setData] = useState<AiEnrichStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [deletingTicket, setDeletingTicket] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteProposalResponse | null>(null);

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    setEmail(session.email);
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAiEnrichStatus(getPortalToken());
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(
    async (ticket: string) => {
      const t = ticket.trim();
      if (!t) return;
      const confirmed = window.confirm(
        `Permanently delete proposal ${t} and ALL related data? This cannot be undone.`,
      );
      if (!confirmed) return;
      setDeletingTicket(t);
      setDeleteError(null);
      setDeleteResult(null);
      try {
        const res = await deleteProposal(t, getPortalToken());
        setDeleteResult(res);
        setTicketInput("");
        void load();
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "Failed to delete proposal");
      } finally {
        setDeletingTicket(null);
      }
    },
    [load],
  );

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  const summaryEntries = data ? Object.entries(data.summary) : [];

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="font-sans text-xs uppercase tracking-wider text-foreground/50">
              Admin Portal
            </p>
            <h1 className="font-serif text-2xl font-bold">
              Welcome{email ? `, ${email}` : ""}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="font-sans text-sm text-foreground/60 hover:text-foreground"
            >
              Switch portal
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl bg-foreground/10 px-3 py-2 font-sans text-sm hover:bg-foreground/20"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold">
                AI Enrichment Status
              </h2>
              <p className="mt-1 font-sans text-sm text-foreground/60">
                Count breakdown across all proposals, plus any proposals
                currently failed or pending.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl bg-foreground/10 px-3 py-2 font-sans text-sm hover:bg-foreground/20 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-sans text-sm text-red-600">
              {error}
            </div>
          )}

          {!error && !data && loading && (
            <p className="font-sans text-sm text-foreground/60">Loading…</p>
          )}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summaryEntries.length === 0 && (
                  <p className="font-sans text-sm text-foreground/60">
                    No summary data.
                  </p>
                )}
                {summaryEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-foreground/10 bg-background p-4"
                  >
                    <p className="font-sans text-xs uppercase tracking-wider text-foreground/50">
                      {key}
                    </p>
                    <p className="mt-1 font-serif text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <h3 className="font-serif text-base font-semibold">
                  Actionable proposals
                </h3>
                {data.actionable.length === 0 ? (
                  <p className="mt-2 font-sans text-sm text-foreground/60">
                    Nothing requires attention. 🎉
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-foreground/10">
                    <table className="w-full text-left font-sans text-sm">
                      <thead className="bg-foreground/5 text-xs uppercase tracking-wider text-foreground/60">
                        <tr>
                          <th className="px-3 py-2">Ticket</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Attempts</th>
                          <th className="px-3 py-2">Error</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.actionable.map((item) => (
                          <tr
                            key={item.ticket_number}
                            className="border-t border-foreground/10"
                          >
                            <td className="px-3 py-2 font-medium">
                              {item.ticket_number}
                            </td>
                            <td className="px-3 py-2 capitalize">
                              {item.ai_enrichment_status}
                            </td>
                            <td className="px-3 py-2">
                              {item.ai_enrichment_attempts}
                            </td>
                            <td className="px-3 py-2 text-foreground/70">
                              {item.ai_enrichment_error || "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => void onDelete(item.ticket_number)}
                                disabled={deletingTicket === item.ticket_number}
                                className="rounded-lg bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {deletingTicket === item.ticket_number ? "Deleting…" : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <h2 className="font-serif text-lg font-semibold text-red-700">
            Delete proposal
          </h2>
          <p className="mt-1 font-sans text-sm text-foreground/60">
            Permanently deletes a proposal and all related data (contracts,
            queries, reviews, metadata, events…). This action is irreversible.
          </p>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void onDelete(ticketInput);
            }}
          >
            <input
              type="text"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="EIP-2025-12345-1"
              className="flex-1 rounded-xl border border-foreground/15 bg-background px-3 py-2 font-sans text-sm outline-none focus:border-foreground/40"
            />
            <button
              type="submit"
              disabled={!ticketInput.trim() || deletingTicket === ticketInput.trim()}
              className="rounded-xl bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deletingTicket === ticketInput.trim() ? "Deleting…" : "Delete proposal"}
            </button>
          </form>

          {deleteError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-sans text-sm text-red-700">
              {deleteError}
            </div>
          )}

          {deleteResult && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 font-sans text-sm text-emerald-800">
              <p className="font-medium">{deleteResult.message}</p>
              {deleteResult.deleted_counts && (
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  {Object.entries(deleteResult.deleted_counts).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-foreground/60">{k}</span>
                      <span className="font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}