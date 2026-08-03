import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Send, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listContributors,
  addContributor,
  removeContributor,
  resendContributorInvite,
  type Contributor,
  type ContributorCounts,
} from "@/lib/contributorsApi";

const ROLES = [
  "Contributor — independent agreement",
  "Author",
  "Co-Editor",
  "Chapter Author",
] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
    declined: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-semibold capitalize ${
        map[status] || "border-stone-200 bg-stone-50 text-stone-700"
      }`}
    >
      {status || "—"}
    </span>
  );
}

function RolePill({ role }: { role?: string | null }) {
  const label = (role || "Contributor").replace(/\s*—.*$/, "").trim() || "Contributor";
  return (
    <span className="inline-flex items-center rounded-full border border-stone-300 bg-white px-3 py-1 font-sans text-[12px] font-medium text-stone-700">
      {label}
    </span>
  );
}

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#0E3D2F]";

export function ContributorsPanel({ ticket }: { ticket: string }) {
  const [rows, setRows] = useState<Contributor[]>([]);
  const [counts, setCounts] = useState<ContributorCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Contributor | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    affiliation: "",
    country: "",
    role: ROLES[0] as string,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await listContributors(ticket);
      setRows(body.contributors || []);
      setCounts(body.counts || {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const affiliation = [form.affiliation.trim(), form.country.trim()]
        .filter(Boolean)
        .join(", ");
      const res = await addContributor(ticket, {
        name: form.name.trim(),
        email: form.email.trim(),
        affiliation: affiliation || undefined,
        notes: form.role || undefined,
      });
      setForm({ name: "", email: "", affiliation: "", country: "", role: ROLES[0] });
      if (res.email_sent === false) {
        toast.warning("Contributor added but invite email failed");
      } else {
        toast.success("Contributor added — invite email sent");
      }
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onResend = async (c: Contributor) => {
    setBusyId(c.id);
    try {
      await resendContributorInvite(ticket, c.id);
      toast.success(`Invite resent to ${c.name}`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (c: Contributor) => {
    setBusyId(c.id);
    try {
      await removeContributor(ticket, c.id);
      setConfirmRemove(null);
      toast.success(`${c.name} removed`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const total = counts.total ?? rows.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold text-stone-900">Contributors</h2>
          <p className="mt-0.5 font-sans text-sm text-stone-500">
            All contributors on this book
          </p>
        </div>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-stone-100 px-2 font-sans text-xs font-semibold text-stone-700">
          {total}
        </span>
      </div>

      <form onSubmit={onAdd} className="border-t border-stone-100 px-6 py-5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Institution"
            value={form.affiliation}
            onChange={(e) => setForm((f) => ({ ...f, affiliation: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Country"
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className={`${inputCls} min-w-0 max-w-[320px]`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="shrink-0 justify-self-end rounded-lg bg-[#0E3D2F]/85 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#0E3D2F] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Contributor"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-stone-500">
          Loading contributors…
        </p>
      ) : error ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-rose-600">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-stone-500">
          No contributors added yet.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {rows.map((c) => (
            <li
              key={c.id}
              className="group flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-[15px] font-semibold text-stone-900">{c.name}</p>
                <p className="mt-0.5 truncate font-sans text-sm text-stone-500">
                  {[c.affiliation, c.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(c.status === "pending" || c.status === "declined") && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void onResend(c)}
                    title="Resend invite"
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 font-sans text-xs font-semibold text-stone-700 opacity-0 transition hover:bg-stone-50 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                  >
                    {busyId === c.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Resend
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => setConfirmRemove(c)}
                  title="Remove contributor"
                  className="inline-flex items-center rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 opacity-0 transition hover:bg-rose-50 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {c.status !== "accepted" && <StatusBadge status={c.status} />}
                <RolePill role={c.notes} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="font-serif text-lg font-bold text-stone-900">
              Remove {confirmRemove.name} from this proposal?
            </h3>
            <p className="mt-2 font-sans text-sm text-stone-600">
              This will delete their invitation and confirmation record.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === confirmRemove.id}
                onClick={() => void onRemove(confirmRemove)}
                className="rounded-lg bg-rose-600 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
