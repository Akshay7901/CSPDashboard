import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  bookTypeLabel,
  toBookTypeValue,
  updateBookType,
  type BookTypeValue,
} from "@/lib/bookTypeApi";

/**
 * Book type label with an inline Monograph ↔ Edited Volume switcher.
 * The edit control only renders when `canEdit` (decision reviewers / admins).
 */
export function BookTypeEditor({
  ticket,
  value,
  canEdit,
  onChanged,
  className = "",
}: {
  ticket: string;
  value?: string;
  canEdit: boolean;
  onChanged: (newType: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<BookTypeValue>(toBookTypeValue(value));
  const [saving, setSaving] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  const startEdit = () => {
    setSelected(toBookTypeValue(value));
    setEditing(true);
  };

  const save = async (confirm = false) => {
    if (!confirm && selected === toBookTypeValue(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await updateBookType(ticket, selected, confirm);
      if (!res.ok) {
        setConfirmCount(res.contributorCount);
        return;
      }
      setConfirmCount(null);
      setEditing(false);
      onChanged(res.new_book_type);
      toast.success(`Book type changed to ${bookTypeLabel(res.new_book_type)}`);
    } catch (err) {
      setConfirmCount(null);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const label = bookTypeLabel(value) || "—";

  return (
    <>
      {editing ? (
        <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as BookTypeValue)}
            disabled={saving}
            autoFocus
            className="rounded-lg border border-stone-300 bg-white px-2 py-1 font-sans text-sm font-medium text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
          >
            <option value="monograph">Monograph</option>
            <option value="edited-volume">Edited Volume</option>
          </select>
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
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </span>
      ) : (
        <span className={`inline-flex items-center gap-1.5 ${className}`}>
          {label}
          {canEdit && (
            <button
              type="button"
              onClick={startEdit}
              title="Change book type"
              aria-label="Change book type"
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      )}

      <Dialog
        open={confirmCount !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirmCount(null);
        }}
      >
        <DialogContent className="max-w-md bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Change to Monograph?</DialogTitle>
            <DialogDescription>
              This proposal has {confirmCount} contributor{confirmCount === 1 ? "" : "s"}.
              Changing to Monograph will prevent new contributors from being added. Existing
              records will be kept. Do you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Yes, change"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCount(null)}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
