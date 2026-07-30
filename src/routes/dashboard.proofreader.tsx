import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut, User2 } from "lucide-react";
import cspLogo from "@/assets/csp-logo.png";
import { portalLogout, getPortalSession } from "@/lib/auth";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { initialsFromName, displayNameFromEmail } from "@/lib/proposals";

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

type QueueItem = {
  id: string;
  title: string;
  author: string;
  meta: string;
  kind?: string;
};

const NEEDS_COMPILING: QueueItem[] = [
  {
    id: "CSP-2026-0141",
    title: "Sound and Silence: Acoustic Ecologies of the Post-Industrial North",
    author: "Dr. Elena Vasquez, Sorbonne University",
    meta: "Contract signed 20 Jul 2026",
    kind: "Monograph",
  },
];

const WITH_AUTHOR: QueueItem[] = [
  {
    id: "CSP-2026-0126",
    title: "Weaving the Commons: Craft Guilds and Civic Life in Renaissance Flanders",
    author: "Dr. Willem De Groot",
    meta: "Sent 10 Jul 2026",
  },
];

const CONFIRMED: QueueItem[] = [
  {
    id: "CSP-2026-0098",
    title: "The Ethics of Algorithmic Care: Machine Learning in Community Health Systems",
    author: "Dr. Priya Nair",
    meta: "Confirmed 2 Jun 2026",
  },
];

function ProofreaderDashboard() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    setDisplayName(session.name || displayNameFromEmail(session.email));
  }, [navigate]);

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6]">
      <header className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Link to="/login" className="flex items-center gap-3">
              <img src={cspLogo} alt="Cambridge Scholars Publishing" width={32} height={32} />
              <span className="font-serif text-base font-bold leading-none text-[#2C1A0E]">
                Cambridge Scholars Publishing
              </span>
            </Link>
            <span className="mx-1 text-stone-300">|</span>
            <span className="font-sans text-sm font-medium text-violet-600">Proofreader Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 font-sans text-xs font-semibold text-violet-700">
              {initialsFromName(displayName)}
            </div>
            <span className="font-sans text-sm text-[#2C1A0E]">{displayName}</span>
            <span className="text-stone-300">|</span>
            <ChangePasswordButton triggerClassName="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900 transition-colors" />
            <span className="text-stone-300">|</span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-stone-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2C1A0E]">
          Metadata Queue
        </h1>
        <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
          Contract-signed proposals pending metadata confirmation
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            value={NEEDS_COMPILING.length}
            label="Needs Compiling"
            className="border-amber-200 bg-amber-50/70 text-amber-700"
          />
          <StatCard
            value={WITH_AUTHOR.length}
            label="With Author"
            className="border-emerald-200 bg-emerald-50/70 text-emerald-700"
          />
          <StatCard
            value={CONFIRMED.length}
            label="Confirmed"
            className="border-slate-200 bg-slate-50/70 text-slate-700"
          />
        </div>

        <SectionHeading dotClass="bg-amber-500" title="Needs metadata compiled" />
        <div className="space-y-3">
          {NEEDS_COMPILING.map((item) => (
            <article
              key={item.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4"
            >
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-xs font-medium text-amber-700">
                    Contract Signed
                  </span>
                  {item.kind && (
                    <span className="font-sans text-xs text-[#7A6A5A]">{item.kind}</span>
                  )}
                </div>
                <h2 className="font-serif text-base font-bold text-[#2C1A0E]">{item.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A]">
                  <User2 className="h-3.5 w-3.5" />
                  {item.author}
                </p>
                <p className="mt-1 font-sans text-xs text-[#9A8A7A]">{item.meta}</p>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2C1A0E] px-4 py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Compile metadata
                <ChevronRight className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>

        <SectionHeading dotClass="bg-emerald-500" title="With author — awaiting confirmation" />
        <div className="space-y-3">
          {WITH_AUTHOR.map((item) => (
            <QueueRow key={item.id} item={item} accentClass="bg-emerald-400" />
          ))}
        </div>

        <SectionHeading dotClass="bg-slate-400" title="Confirmed" />
        <div className="space-y-3">
          {CONFIRMED.map((item) => (
            <QueueRow key={item.id} item={item} accentClass="bg-slate-300" />
          ))}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-5 text-center ${className}`}>
      <p className="font-serif text-2xl font-bold leading-none">{value}</p>
      <p className="mt-2 font-sans text-xs">{label}</p>
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

function QueueRow({ item, accentClass }: { item: QueueItem; accentClass: string }) {
  return (
    <article className="flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <span className={`w-1 self-stretch ${accentClass}`} aria-hidden />
      <div className="flex flex-1 items-center justify-between gap-4 px-4 py-4">
        <div>
          <h3 className="font-serif text-base font-semibold text-[#2C1A0E]">{item.title}</h3>
          <p className="mt-1 font-sans text-xs text-[#7A6A5A]">
            {item.author} · {item.meta}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 font-sans text-sm text-[#7A6A5A] transition-colors hover:text-stone-900"
        >
          View
        </button>
      </div>
    </article>
  );
}
