import { useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateAuthorName } from "@/lib/metadataApi";

/**
 * Primary author name with an inline edit control. The name is the DocuSign
 * signer name, so admins / decision reviewers can correct it before a
 * contract goes out. The pencil only renders when `canEdit`.
 */
export function AuthorNameEditor({
  ticket,
  value,
  canEdit,
  onChanged,
  className = "",
}: {
  ticket: string;
  value?: string;
  canEdit: boolean;
  onChanged: (name: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value || "");
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      toast.error("Author name can't be empty.");
      return;
    }
    if (name === (value || "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateAuthorName(ticket, name);
      onChanged(name);
      setEditing(false);
      toast.success("Author name updated");
    } catch (err) {
      toast.error((err as Error).message);
      // Revert to the last saved name.
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  if (editing) {
    return (
      <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          autoFocus
          aria-label="Primary author name"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1 font-sans text-[13px] text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-stone-900 px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {value || "—"}
      {canEdit && (
        <button
          type="button"
          onClick={startEdit}
          title="Edit author name"
          aria-label="Edit author name"
          className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
