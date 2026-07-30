import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, LogOut, User2 } from "lucide-react";
import { toast } from "sonner";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession } from "@/lib/auth";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { initialsFromName, displayNameFromEmail, formatDate } from "@/lib/proposals";
import {
  getProofreaderQueue,
  type ProofreaderQueueItem,
  type ProofreaderQueueTab,
} from "@/lib/proofreaderApi";

export const Route = createFileRoute("/dashboard/proofreader")({
  head: () => ({
    meta: [
      { title: "Proofreader Portal — Metadata Queue" },
      {
        name: "description",
        content:
          "Compile and confirm publication metadata for contract-signed proposals in the Cambridge Scholars proofreader queue.",
      },
      { property: "og:title", content: "Proofreader Portal — Metadata Queue" },
      {
        property: "og:description",
        content: "Contract-signed proposals pending metadata confirmation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProofreaderDashboard,
});

const TABS: {
  key: ProofreaderQueueTab;
  label: string;
  dot: string;
  card: string;
  bar: string;
}[] = [
  {
    key: "needs_compiling",
    label: "Needs Compiling",
    dot: "bg-orange-500",
    card: "border-orange-200 bg-orange-50/70 text-orange-700",
    bar: "bg-orange-500",
  },
  {
    key: "with_author",
    label: "With Author",
    dot: "bg-blue-500",
    card: "border-blue-200 bg-blue-50/70 text-blue-700",
    bar: "bg-blue-500",
  },
  {
    key: "confirmed",
    label: "Author Approved",
    dot: "bg-emerald-500",
    card: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
    bar: "bg-emerald-500",
  },
];

function ProofreaderDashboard() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [tab, setTab] = useState<ProofreaderQueueTab>("needs_compiling");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Record<ProofreaderQueueTab, ProofreaderQueueItem[]>>({
    needs_compiling: [],
    with_author: [],
    confirmed: [],
  });
  const [counts, setCounts] = useState<Record<ProofreaderQueueTab, number>>({
    needs_compiling: 0,
    with_author: 0,
    confirmed: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getProofreaderQueue();
    setQueue(res.data.queue);
    setCounts(res.data.counts);
    setError(res.ok ? null : (res.error ?? "Could not load the queue."));
    if (!res.ok) toast.error(res.error ?? "Could not load the queue.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    setDisplayName(session.name || displayNameFromEmail(session.email));
    void load();
  }, [navigate, load]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6]">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/login" className="flex items-center gap-3">
              <img src={cspLogo} alt="Cambridge Scholars Publishing" width={32} height={32} />
              <span className="font-serif text-xl font-bold text-stone-900">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <span className="font-sans text-base text-stone-700">Proofreader Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 font-sans text-xs font-semibold text-violet-700">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm font-medium text-stone-800">{displayName}</span>
            <span className="h-5 w-px bg-stone-300" />
            <ChangePasswordButton triggerClassName="inline-flex items-center gap-1.5 font-sans text-sm text-stone-600 hover:text-stone-900 transition-colors" />
            <span className="h-5 w-px bg-stone-300" />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-stone-600 hover:text-stone-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2C1A0E]">
              Metadata Queue
            </h1>
            <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
              Contract-signed proposals pending metadata compilation and author approval
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-xl border px-4 py-5 text-center transition-shadow ${t.card} ${
                tab === t.key ? "ring-2 ring-offset-2 ring-stone-300" : "hover:shadow-sm"
              }`}
            >
              <p className="font-serif text-2xl font-bold leading-none">{counts[t.key]}</p>
              <p className="mt-2 font-sans text-xs">{t.label}</p>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
            {error}
          </p>
        )}

        {TABS.filter((t) => t.key === tab).map((t) => (
          <div key={t.key}>
            <SectionHeading dotClass={t.dot} title={t.label} />
            <div className="space-y-3">
              {loading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 animate-pulse rounded-xl border border-stone-200 bg-white"
                    />
                  ))}
                </div>
              )}
              {queue[t.key].length === 0 && !loading && (
                <p className="rounded-xl border border-dashed border-stone-200 bg-white px-5 py-8 text-center font-sans text-sm text-[#7A6A5A]">
                  Nothing in this list right now.
                </p>
              )}
              {!loading && queue[t.key].map((item) => (
                <QueueRow key={item.ticket_number} item={item} accentClass={t.bar} tab={t.key} />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

function SectionHeading({ dotClass, title }: { dotClass: string; title: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-[#7A6A5A]">
        {title}
      </h2>
    </div>
  );
}

function QueueRow({
  item,
  accentClass,
  tab,
}: {
  item: ProofreaderQueueItem;
  accentClass: string;
  tab: ProofreaderQueueTab;
}) {
  return (
    <Link
      to="/dashboard/proofreader_proposal/$ticket"
      params={{ ticket: item.ticket_number }}
      className="flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-stone-200 bg-white transition-shadow hover:shadow-sm"
    >
      <span className={`w-1 self-stretch ${accentClass}`} aria-hidden />
      <div className="flex flex-1 items-center justify-between gap-4 px-4 py-4">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-xs font-medium text-[#7A6A5A]">
              {item.ticket_number}
            </span>
            {item.is_locked && (
              <span className="rounded-md border border-stone-300 bg-stone-100 px-2 py-0.5 font-sans text-xs text-stone-600">
                Locked
              </span>
            )}
            {item.current_version != null && (
              <span className="font-sans text-xs text-[#9A8A7A]">v{item.current_version}</span>
            )}
          </div>
          <h3 className="font-serif text-base font-semibold text-[#2C1A0E]">
            {item.title || "Untitled proposal"}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 font-sans text-xs text-[#7A6A5A]">
            <User2 className="h-3.5 w-3.5" />
            {item.author_name || item.author_email || "Unknown author"}
            {item.author_name && item.author_email ? ` · ${item.author_email}` : ""}
          </p>
          <p className="mt-1.5 font-sans text-xs text-[#9A8A7A]">
            {item.compiled_at ? `Compiled ${formatDate(item.compiled_at)}` : "Not yet compiled"}
            {" · "}
            {item.sent_for_confirmation_at
              ? `Sent ${formatDate(item.sent_for_confirmation_at)}`
              : "Not yet sent"}
            {item.updated_at ? ` · Updated ${relativeTime(item.updated_at)}` : ""}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-sans text-sm text-[#7A6A5A]">
          {tab === "needs_compiling" ? "Compile metadata" : "View"}
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return formatDate(iso);
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}
