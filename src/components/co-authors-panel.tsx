import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  listCoAuthors,
  addCoAuthor,
  removeCoAuthor,
  updateCoAuthor,
  type CoAuthor,
  type CoAuthorRole,
} from "@/lib/coAuthorsApi";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#0E3D2F]";

function RoleBadge({ role }: { role?: string | null }) {
  const isEditor = (role || "").toLowerCase() === "editor";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-semibold ${
        isEditor
          ? "border-indigo-200 bg-indigo-50 text-indigo-800"
          : "border-stone-200 bg-stone-50 text-stone-700"
      }`}
    >
      {isEditor ? "Editor" : "Author"}
    </span>
  );
}

export function CoAuthorsPanel({ ticket }: { ticket: string }) {
  const [rows, setRows] = useState<CoAuthor[]>([]);
  const [editable, setEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "author" as CoAuthorRole,
  });

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "author" as CoAuthorRole,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await listCoAuthors(ticket);
      setRows(body.co_authors);
      setEditable(body.editable !== false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (addError) setAddError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) return;
    setSaving(true);
    setAddError(null);
    try {
      await addCoAuthor(ticket, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setForm({ first_name: "", last_name: "", email: "", role: "author" });
      toast.success("Co-author added");
      await load();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async (row: CoAuthor) => {
    const snapshot = rows;
    setBusyIndex(row.index);
    setRows((prev) => prev.filter((r) => r.index !== row.index));
    try {
      await removeCoAuthor(ticket, row.index);
      toast.success("Co-author removed");
      await load();
    } catch (err) {
      setRows(snapshot);
      toast.error((err as Error).message);
    } finally {
      setBusyIndex(null);
    }
  };

  const startEdit = (row: CoAuthor) => {
    setEditingIndex(row.index);
    setEditError(null);
    setEditForm({
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      role: ((row.role as CoAuthorRole) || "author"),
    });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditError(null);
  };

  const onSaveEdit = async (e: FormEvent, row: CoAuthor) => {
    e.preventDefault();
    if (!editForm.email.trim()) {
      setEditError("Email is required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateCoAuthor(ticket, row.index, {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
      });
      toast.success("Co-author updated");
      setEditingIndex(null);
      await load();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold text-stone-900">
            Co-Authors / Co-Editors
          </h2>
          <p className="mt-0.5 font-sans text-sm text-stone-500">
            Listed on the submitted proposal
          </p>
        </div>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-stone-100 px-2 font-sans text-xs font-semibold text-stone-700">
          {rows.length}
        </span>
      </div>

      {!loading && !editable && (
        <p className="flex items-start gap-2 border-t border-stone-100 bg-amber-50 px-6 py-3 font-sans text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Co-authors cannot be changed after a contract is issued
        </p>
      )}

      {editable && (
        <form onSubmit={onAdd} className="border-t border-stone-100 px-6 py-5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <input
              required
              placeholder="First name"
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              className={inputCls}
            />
            <input
              required
              placeholder="Last name"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              className={inputCls}
            />
            <input
              type="email"
              required
              placeholder="Email *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputCls}
            />
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as CoAuthorRole }))
              }
              className={inputCls}
            >
              <option value="author">Author</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <div className="mt-3.5 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#0E3D2F]/85 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#0E3D2F] disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add Co-Author"}
            </button>
          </div>
          {addError && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
              {addError}
            </p>
          )}
        </form>
      )}

      {loading ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-stone-500">
          Loading co-authors…
        </p>
      ) : error ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-rose-600">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="border-t border-stone-100 px-6 py-8 text-center font-sans text-sm text-stone-500">
          No co-authors added yet
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {rows.map((c) =>
            editingIndex === c.index ? (
              <li key={c.index} className="bg-stone-50 px-6 py-4">
                <form onSubmit={(e) => void onSaveEdit(e, c)} className="grid gap-3.5 sm:grid-cols-2">
                  <input
                    required
                    placeholder="First name"
                    value={editForm.first_name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, first_name: e.target.value }))
                    }
                    className={inputCls}
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={editForm.last_name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, last_name: e.target.value }))
                    }
                    className={inputCls}
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email *"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className={inputCls}
                  />
                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, role: e.target.value as CoAuthorRole }))
                    }
                    className={inputCls}
                  >
                    <option value="author">Author</option>
                    <option value="editor">Editor</option>
                  </select>
                  <div className="flex items-center gap-2 sm:col-span-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={editSaving}
                      className="rounded-lg px-4 py-2 font-sans text-sm font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editSaving}
                      className="rounded-lg bg-[#0E3D2F]/85 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#0E3D2F] disabled:opacity-60"
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {editError && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200 sm:col-span-2">
                      {editError}
                    </p>
                  )}
                </form>
              </li>
            ) : (
              <li
                key={c.index}
                className="group flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="font-sans text-[15px] font-semibold text-stone-900">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </p>
                  {c.email ? (
                    <p className="mt-0.5 truncate font-sans text-sm text-stone-500">
                      {c.email}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-sans text-sm italic text-amber-700">
                      No email on file
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={c.role} />
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    title="Edit co-author"
                    className="inline-flex items-center rounded-md border border-stone-200 bg-white p-1.5 text-stone-600 opacity-0 transition hover:bg-stone-50 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {editable && (
                    <button
                      type="button"
                      disabled={busyIndex === c.index}
                      onClick={() => void onRemove(c)}
                      title="Remove co-author"
                      className="inline-flex items-center rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 opacity-0 transition hover:bg-rose-50 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
