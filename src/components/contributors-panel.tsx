import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Users, Plus, Send, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listContributors,
  addContributor,
  removeContributor,
  resendContributorInvite,
  type Contributor,
  type ContributorCounts,
} from "@/lib/contributorsApi";

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

export function ContributorsPanel({ ticket }: { ticket: string }) {
  const [rows, setRows] = useState<Contributor[]>([]);
  const [counts, setCounts] = useState<ContributorCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Contributor | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    affiliation: "",
    chapter_title: "",
    notes: "",
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
      const res = await addContributor(ticket, {
        name: form.name.trim(),
        email: form.email.trim(),
        affiliation: form.affiliation.trim() || undefined,
        chapter_title: form.chapter_title.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setOpen(false);
      setForm({ name: "", email: "", affiliation: "", chapter_title: "", notes: "" });
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
  const accepted = counts.accepted ?? rows.filter((r) => r.status === "accepted").length;
  const pending = counts.pending ?? rows.filter((r) => r.status === "pending").length;
  const declined = counts.declined ?? rows.filter((r) => r.status === "declined").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/70 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0E3D2F] text-white">
            <Users className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-bold text-stone-900">Contributors</h2>
            <p className="font-sans text-xs text-stone-500">
              Contributing authors invited to confirm their involvement
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E3D2F] px-3.5 py-2 font-sans text-sm font-semibold text-white hover:bg-[#0b3126]"
        >
          <Plus className="h-4 w-4" />
          Add Contributor
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-6 py-3 font-sans text-xs text-stone-600">
        <span className="font-semibold text-stone-800">{total} total</span>
        <span className="text-stone-300">—</span>
        <span className="text-emerald-700">{accepted} accepted</span>
        <span className="text-stone-300">—</span>
        <span className="text-amber-700">{pending} pending</span>
        <span className="text-stone-300">—</span>
        <span className="text-rose-700">{declined} declined</span>
      </div>

      {loading ? (
        <p className="px-6 py-8 text-center font-sans text-sm text-stone-500">
          Loading contributors…
        </p>
      ) : error ? (
        <p className="px-6 py-8 text-center font-sans text-sm text-rose-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-8 text-center font-sans text-sm text-stone-500">
          No contributors added yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Affiliation</th>
                <th className="px-4 py-2.5 font-semibold">Chapter Title</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Invited</th>
                <th className="px-4 py-2.5 font-semibold">Responded</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-stone-900">{c.name}</td>
                  <td className="px-4 py-3 text-stone-700">{c.email}</td>
                  <td className="px-4 py-3 text-stone-700">{c.affiliation || "—"}</td>
                  <td className="px-4 py-3 text-stone-700">{c.chapter_title || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-stone-600">{fmt(c.invited_at)}</td>
                  <td className="px-4 py-3 text-stone-600">{fmt(c.responded_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(c.status === "pending" || c.status === "declined") && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => void onResend(c)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
                        >
                          {busyId === c.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Resend Invite
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => setConfirmRemove(c)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="font-serif text-lg font-bold text-stone-900">Add Contributor</h3>
            <p className="mt-1 font-sans text-xs text-stone-500">
              An invite email will be sent asking them to confirm their involvement.
            </p>
            <form onSubmit={onAdd} className="mt-4 space-y-3">
              {([
                ["name", "Name", true],
                ["email", "Email", true],
                ["affiliation", "Affiliation", false],
                ["chapter_title", "Chapter title", false],
              ] as const).map(([key, label, req]) => (
                <div key={key}>
                  <label className="font-sans text-xs font-semibold text-stone-700">
                    {label}
                    {req && <span className="text-rose-600"> *</span>}
                  </label>
                  <input
                    required={req}
                    type={key === "email" ? "email" : "text"}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-sans text-sm text-stone-900 outline-none focus:border-[#0E3D2F]"
                  />
                </div>
              ))}
              <div>
                <label className="font-sans text-xs font-semibold text-stone-700">
                  Internal note
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-sans text-sm text-stone-900 outline-none focus:border-[#0E3D2F]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0E3D2F] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#0b3126] disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add & Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
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
