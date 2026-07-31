import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  getContributorConfirmInfo,
  submitContributorResponse,
  type ContributorConfirmInfo,
} from "@/lib/contributorsApi";

export const Route = createFileRoute("/proposals/contributor/confirm/$token")({
  head: () => ({
    meta: [
      { title: "Contributor Confirmation — Cambridge Scholars Publishing" },
      {
        name: "description",
        content:
          "Confirm your involvement as a contributing author to an edited collection published by Cambridge Scholars Publishing.",
      },
      { property: "og:title", content: "Contributor Confirmation" },
      {
        property: "og:description",
        content: "Confirm your involvement as a contributing author.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContributorConfirmPage,
});

function fmt(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function ContributorConfirmPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<ContributorConfirmInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await getContributorConfirmInfo(token));
    } catch (e) {
      setError((e as Error).message || "This confirmation link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (action: "accept" | "decline") => {
    setSubmitting(action);
    setError(null);
    try {
      await submitContributorResponse(token, action);
      setDone("Thank you, your response has been recorded.");
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        setDone("You have already responded to this invitation.");
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(null);
    }
  };

  const already =
    info?.current_status === "accepted" || info?.current_status === "declined";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <p className="font-serif text-lg font-bold tracking-tight text-[#0E3D2F]">
            Cambridge Scholars Publishing
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-200 bg-stone-50/70 px-7 py-5">
            <h1 className="font-serif text-2xl font-bold text-stone-900">
              Contributor Confirmation
            </h1>
          </div>

          <div className="px-7 py-6">
            {loading && (
              <p className="flex items-center gap-2 font-sans text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your invitation…
              </p>
            )}

            {!loading && error && !info && (
              <p className="font-sans text-sm text-rose-600">{error}</p>
            )}

            {!loading && info && (
              <>
                <p className="font-sans text-sm leading-relaxed text-stone-800">
                  You have been listed by{" "}
                  <strong>{info.editor_name || "the editor"}</strong> as a contributor to{" "}
                  <strong>{info.book_title || "this edited collection"}</strong>.
                </p>

                <dl className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-stone-200 bg-stone-50/60 px-5 py-4 font-sans text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-stone-500">Name</dt>
                    <dd className="mt-1 font-medium text-stone-900">
                      {info.contributor_name || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-stone-500">
                      Affiliation
                    </dt>
                    <dd className="mt-1 text-stone-800">{info.affiliation || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-stone-500">
                      Chapter title
                    </dt>
                    <dd className="mt-1 text-stone-800">{info.chapter_title || "—"}</dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <h2 className="font-serif text-base font-bold text-stone-900">
                    By accepting, you confirm that:
                  </h2>
                  <ul className="mt-3 space-y-2 font-sans text-sm leading-relaxed text-stone-700">
                    {[
                      "you are a contributor to this collection;",
                      `you authorise ${info.editor_name || "the editor"} to include your contribution in this collection;`,
                      "your contribution is your own original work and does not infringe the rights of any third party;",
                      "you consent to your name and details being used in connection with the publication.",
                    ].map((t) => (
                      <li key={t} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0E3D2F]" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {done ? (
                  <p className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-sans text-sm font-medium text-emerald-800">
                    {done}
                  </p>
                ) : already ? (
                  <p className="mt-7 rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 font-sans text-sm text-stone-700">
                    You have already {info.current_status} this invitation
                    {info.responded_at ? ` on ${fmt(info.responded_at)}` : ""}.
                  </p>
                ) : (
                  <>
                    {error && (
                      <p className="mt-5 font-sans text-sm text-rose-600">{error}</p>
                    )}
                    <div className="mt-7 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={submitting !== null}
                        onClick={() => void respond("accept")}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {submitting === "accept" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={submitting !== null}
                        onClick={() => void respond("decline")}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-5 py-2.5 font-sans text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {submitting === "decline" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Decline
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
