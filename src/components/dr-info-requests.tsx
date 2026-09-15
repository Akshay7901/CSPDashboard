import { useState, useEffect, useCallback } from "react";
import { proposalApiFetch } from "@/lib/proposalApi";
import { getPortalToken } from "@/lib/auth";
import { formatDate } from "@/lib/proposals";
import {
  Clock,
  Pencil,
  Trash2,
  MessageSquare,
  Plus,
  X,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  SquarePen,
} from "lucide-react";

type InfoRequestItem = { key?: string; label?: string; response_text?: string };
type InfoRequestFile = { url?: string; filename?: string; size_bytes?: number; field_key?: string };

type InfoRequest = {
  id: string | number;
  status?: string;
  note?: string;
  message?: string;
  resubmission_deadline?: string;
  deadline?: string;
  created_at?: string;
  requested_at?: string;
  items?: InfoRequestItem[];
  response?: {
    note?: string;
    items?: InfoRequestItem[];
    files?: InfoRequestFile[];
    submitted_at?: string;
    is_draft?: boolean;
  } | null;
  draft?: {
    note?: string;
    items?: InfoRequestItem[];
    files?: InfoRequestFile[];
  } | null;
};

type Props = {
  ticket: string;
  onChanged?: () => void;
  // When true, shows the request/response history only — hides the
  // create/edit/delete controls. Used to surface this same history on
  // dashboards that already have their own request-creation flow (or
  // shouldn't have one at all, e.g. the author's view).
  readOnly?: boolean;
};

// Kept in sync with the canonical list in dashboard.proposal.$ticket.tsx —
// update both together.
const REVISION_AREAS = [
  { key: "abstract_blurb", label: "Abstract / Blurb" },
  { key: "table_of_contents", label: "Table of Contents" },
  { key: "author_credentials", label: "Author Credentials" },
  { key: "market_analysis", label: "Market Analysis" },
  { key: "scope_framing", label: "Scope / Framing" },
  { key: "word_count", label: "Word Count / Length" },
  { key: "primary_author", label: "Primary Author Info" },
  { key: "mailing_address", label: "Mailing Address" },
  { key: "biography", label: "Biography" },
  { key: "additional_authors", label: "Additional Authors / Contributors" },
  { key: "manuscript_details", label: "Manuscript Details" },
  { key: "expected_completion", label: "Expected Completion Date" },
  { key: "overview", label: "Overview" },
  { key: "key_features", label: "Key Features / Selling Points" },
  { key: "marketing_promotion", label: "Marketing & Promotion" },
  { key: "competition", label: "Competing Titles" },
  { key: "audience", label: "Target Audience" },
  { key: "suggested_reviewers", label: "Author-Suggested Reviewers" },
  { key: "permissions", label: "Copyright & Permissions" },
  {
    key: "supporting_documents",
    label: "Supporting Documents (CV, manuscript files, attachments)",
  },
  { key: "other", label: "Other" },
];

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">{children}</div>;
}

export function DrInfoRequests({ ticket, onChanged, readOnly = false }: Props) {
  const [requests, setRequests] = useState<InfoRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingRequest, setEditingRequest] = useState<InfoRequest | null>(null);
  const [modalAreas, setModalAreas] = useState<string[]>([]);
  const [modalNote, setModalNote] = useState("");
  const [modalDeadline, setModalDeadline] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InfoRequest | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const authHeaders = (json = true): Record<string, string> => {
    const token = getPortalToken();
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/request-info`, {
        headers: authHeaders(),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.error as string) || `Failed to load (${res.status})`);
        return;
      }
      const raw = (body.requests as Array<Record<string, unknown>>) || [];
      const mapped: InfoRequest[] = raw.map((r) => ({
        id: r.id as string | number,
        status: r.status as string | undefined,
        note: (r.note as string | undefined) ?? (r.message as string | undefined),
        resubmission_deadline: r.resubmission_deadline as string | undefined,
        deadline: r.deadline as string | undefined,
        created_at: (r.requested_at as string | undefined) ?? (r.created_at as string | undefined),
        items: (r.items as InfoRequestItem[]) || [],
        response: r.responded_at
          ? {
              note: r.response_note as string | undefined,
              items: (r.response_items as InfoRequestItem[]) || [],
              files: (r.response_files as InfoRequestFile[]) || [],
              submitted_at: r.responded_at as string | undefined,
              is_draft: !!r.is_draft,
            }
          : null,
        draft: (r.draft_data as InfoRequest["draft"]) || null,
      }));
      setRequests(mapped);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openCreate = () => {
    setModalMode("create");
    setEditingRequest(null);
    setModalAreas([]);
    setModalNote("");
    setModalDeadline("");
    setModalError(null);
    setModalSuccess(null);
    setModalOpen(true);
  };

  const openEdit = (req: InfoRequest) => {
    setModalMode("edit");
    setEditingRequest(req);
    const keys = (req.items || []).map((i) => i.key).filter(Boolean) as string[];
    setModalAreas(keys);
    setModalNote(req.note || "");
    setModalDeadline(req.resubmission_deadline || req.deadline || "");
    setModalError(null);
    setModalSuccess(null);
    setModalOpen(true);
  };

  const toggleArea = (key: string) =>
    setModalAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const submitModal = async () => {
    if (modalAreas.length === 0 || !modalNote.trim()) {
      setModalError("Please select at least one area and provide a note.");
      return;
    }
    setModalSubmitting(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const items = REVISION_AREAS.filter((a) => modalAreas.includes(a.key)).map(
        ({ key, label }) => ({ key, label }),
      );
      const payload: Record<string, unknown> = {
        items,
        note: modalNote.trim(),
        ...(modalDeadline ? { resubmission_deadline: modalDeadline } : {}),
      };

      let res: Response;
      if (modalMode === "edit" && editingRequest) {
        res = await proposalApiFetch(
          `/${encodeURIComponent(ticket)}/request-info/${encodeURIComponent(String(editingRequest.id))}`,
          {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          },
        );
      } else {
        res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/request-info`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
      }
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setModalError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to ${modalMode} (${res.status}).`,
        );
        return;
      }
      setModalSuccess(
        (body.message as string) ||
          (modalMode === "edit" ? "Request updated." : "Revision request sent to author."),
      );
      await fetchRequests();
      onChanged?.();
      setTimeout(() => setModalOpen(false), 1000);
    } catch {
      setModalError("Network error. Please try again.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const openDelete = (req: InfoRequest) => {
    setDeleteTarget(req);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await proposalApiFetch(
        `/${encodeURIComponent(ticket)}/request-info/${encodeURIComponent(String(deleteTarget.id))}`,
        { method: "DELETE", headers: authHeaders() },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setDeleteError(
          (body.error as string) ||
            (body.message as string) ||
            `Failed to delete (${res.status}).`,
        );
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchRequests();
      onChanged?.();
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const isPending = (r: InfoRequest) => {
    const s = (r.status || "").toLowerCase();
    return s !== "closed" && s !== "completed" && s !== "submitted" && s !== "responded" && !r.response?.submitted_at;
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
          <div>
            <h2 className="font-serif text-base font-bold text-stone-900">Info Requests</h2>
            <p className="mt-0.5 font-sans text-sm text-stone-500">
              {requests.length === 0
                ? "No requests yet"
                : `${requests.length} request${requests.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Request more info
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {loading && (
            <p className="text-center font-sans text-sm text-stone-500">Loading…</p>
          )}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}
          {!loading && !error && requests.length === 0 && (
            <p className="text-center font-sans text-sm text-stone-500">
              No information requests have been sent.
            </p>
          )}
          <div className="space-y-3">
            {requests.map((req) => {
              const pending = isPending(req);
              const expanded = expandedId === req.id;
              const deadline = req.resubmission_deadline || req.deadline;
              return (
                <div
                  key={String(req.id)}
                  className={`rounded-xl border p-3.5 ${
                    pending
                      ? "border-amber-200 bg-amber-50/40"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wide ring-1 ${
                            pending
                              ? "bg-amber-100 text-amber-800 ring-amber-200"
                              : req.response?.submitted_at
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-stone-100 text-stone-600 ring-stone-200"
                          }`}
                        >
                          {pending ? "Pending" : req.response?.submitted_at ? "Responded" : req.status || "Sent"}
                        </span>
                        {deadline && (
                          <span className="inline-flex items-center gap-1 font-sans text-[11px] text-stone-500">
                            <Clock className="h-3 w-3" />
                            {formatDate(deadline)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 font-sans text-sm font-medium text-stone-900">
                        {(req.items || [])
                          .map((i) => i.label || i.key)
                          .filter(Boolean)
                          .join(", ") || "General request"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!readOnly && pending && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(req)}
                            className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDelete(req)}
                            className="rounded-md p-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : req.id)}
                        className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-3 border-t border-stone-200 pt-3">
                      {req.note && (
                        <div className="mb-3">
                          <p className="flex items-center gap-1.5 font-sans text-xs font-semibold text-stone-500">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Note to author
                          </p>
                          <p className="mt-1 whitespace-pre-line font-sans text-sm text-stone-700">
                            {req.note}
                          </p>
                        </div>
                      )}
                      {req.response?.submitted_at && (
                        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                          <p className="font-sans text-xs font-semibold text-emerald-800">
                            Author responded on {formatDate(req.response.submitted_at)}
                          </p>
                          {req.response.note && (
                            <p className="mt-1 whitespace-pre-line font-sans text-sm text-emerald-900">
                              {req.response.note}
                            </p>
                          )}
                        </div>
                      )}
                      {req.draft && (
                        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
                          <p className="font-sans text-xs font-semibold text-sky-800">
                            Author saved a draft
                          </p>
                          {(req.draft.items || []).map((it, i) =>
                            it.response_text ? (
                              <div key={i} className="mt-1">
                                <p className="font-sans text-xs font-medium text-sky-700">
                                  {it.label || it.key}
                                </p>
                                <p className="font-sans text-sm text-sky-900 line-clamp-3">
                                  {it.response_text}
                                </p>
                              </div>
                            ) : null,
                          )}
                        </div>
                      )}
                      <p className="font-sans text-[11px] text-stone-400">
                        Created {formatDate(req.created_at || req.requested_at || "")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 py-8">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <SquarePen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#2C1A0E]">
                    {modalMode === "edit" ? "Edit Info Request" : "Request More Info"}
                  </h2>
                  <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
                    {modalMode === "edit"
                      ? "Update the pending request before the author responds."
                      : "Specify what additional information the author needs to provide."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-7 pb-5">
              <div>
                <p className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Areas Requiring Information <span className="text-rose-600">*</span>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REVISION_AREAS.map((area) => {
                    const checked = modalAreas.includes(area.key);
                    return (
                      <label
                        key={area.key}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 font-sans text-sm transition-colors ${
                          checked
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleArea(area.key)}
                          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>{area.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5">
                <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Editorial Note <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  rows={5}
                  placeholder="Explain what the author needs to provide and why…"
                  className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
              </div>
              <div className="mt-5">
                <label className="font-sans text-sm font-semibold text-[#2C1A0E]">
                  Resubmission Deadline{" "}
                  <span className="font-normal text-[#7A6A5A]">(optional)</span>
                </label>
                <input
                  type="date"
                  value={modalDeadline}
                  onChange={(e) => setModalDeadline(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-sans text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
              </div>
              {modalError && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                  {modalError}
                </p>
              )}
              {modalSuccess && (
                <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700 ring-1 ring-emerald-200">
                  {modalSuccess}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-7 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitModal}
                disabled={modalSubmitting || modalAreas.length === 0 || !modalNote.trim()}
                className="rounded-xl bg-[#C97A6A] px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#b56656] disabled:cursor-not-allowed disabled:bg-[#E9C8C0] disabled:text-white/80"
              >
                {modalSubmitting
                  ? "Saving…"
                  : modalMode === "edit"
                    ? "Update Request"
                    : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 py-8">
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#2C1A0E]">Delete Request</h2>
                  <p className="mt-1 font-sans text-sm text-[#7A6A5A]">
                    This will permanently remove the pending info request.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-7 pb-5">
              <p className="font-sans text-sm text-stone-700">
                Are you sure you want to delete this request? The author will no longer see it, and
                any saved draft will be lost.
              </p>
              {deleteError && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                  {deleteError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-7 py-4">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={deleteLoading}
                className="rounded-xl bg-rose-600 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 disabled:text-white/80"
              >
                {deleteLoading ? "Deleting…" : "Delete Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
