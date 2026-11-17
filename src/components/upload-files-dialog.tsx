import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload, X, XCircle } from "lucide-react";
import {
  FILE_UPLOADED_EVENT,
  formatBytes,
  getNamingRules,
  UPLOAD_FOLDERS,
  uploadInternalFile,
  type FolderKey,
  type NamingRules,
} from "@/lib/internalFilesApi";

/** Admin-only header option (same pattern as Change password) that opens the dialog. */
export function UploadFilesTrigger({
  className,
  label = "Upload files",
  onClick,
}: {
  className?: string;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-[#2C1A0E]"
      }
    >
      <Upload className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * Upload dialog. Mounts on first open and is then only hidden on close, so
 * an upload in progress keeps going (large eBooks can take a while).
 * Render one instance per page, outside menus that unmount their contents.
 */
export function UploadFilesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8 ${
        open ? "flex" : "hidden"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-files-title"
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-5">
          <div>
            <h2 id="upload-files-title" className="font-serif text-xl font-bold text-stone-900">
              Upload files
            </h2>
            <p className="mt-1 font-sans text-sm text-stone-600">
              Upload a book file or cover to the master S3 folders. File names must follow the
              folder's naming rule.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <UploadForm />
      </div>
    </div>
  );
}

function UploadForm() {
  const [folder, setFolder] = useState<FolderKey>("ebooks");
  const [file, setFile] = useState<File | null>(null);
  const [rules, setRules] = useState<NamingRules>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<
    { ok: true; filename: string; size: number; key: string } | { ok: false; error: string } | null
  >(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Naming-rule examples come from the server; local ones are the fallback.
  useEffect(() => {
    getNamingRules()
      .then(setRules)
      .catch(() => {
        // Keep the built-in examples.
      });
  }, []);

  const config = UPLOAD_FOLDERS.find((f) => f.key === folder)!;
  const example = rules[folder]?.example || config.fallbackExample;
  const nameOk = file ? config.test(file.name) : false;
  const uploading = progress !== null;

  const resetFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFolderChange = (next: FolderKey) => {
    setFolder(next);
    // A file picked for another folder (different type/rule) no longer applies.
    resetFile();
    setResult(null);
  };

  const onUpload = async () => {
    if (!file || !nameOk || uploading) return;
    setResult(null);
    setProgress(0);
    const { xhr, done } = uploadInternalFile(folder, file, setProgress);
    xhrRef.current = xhr;
    try {
      const res = await done;
      setResult({ ok: true, filename: file.name, size: res.size_bytes ?? file.size, key: res.s3_key });
      // Lets a Files list showing this folder refresh itself.
      window.dispatchEvent(new CustomEvent(FILE_UPLOADED_EVENT, { detail: { folder, s3_key: res.s3_key } }));
      resetFile();
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      xhrRef.current = null;
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5 px-6 py-5">
      <div>
        <label
          htmlFor="upload-folder"
          className="block font-sans text-sm font-semibold uppercase tracking-wide text-black"
        >
          Folder
        </label>
        <select
          id="upload-folder"
          value={folder}
          onChange={(e) => onFolderChange(e.target.value as FolderKey)}
          disabled={uploading}
          className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100 disabled:opacity-60"
        >
          {UPLOAD_FOLDERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="upload-file"
          className="block font-sans text-sm font-semibold uppercase tracking-wide text-black"
        >
          File
        </label>
        <input
          id="upload-file"
          ref={inputRef}
          type="file"
          accept={config.accept}
          disabled={uploading}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setResult(null);
          }}
          className="mt-1.5 block w-full font-sans text-sm text-stone-700 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-2 file:font-sans file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-50 disabled:opacity-60"
        />
        <p className="mt-2 font-sans text-xs text-stone-500">
          Naming rule: <span className="font-mono text-stone-700">{example}</span>
        </p>
        {file && !nameOk && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
          >
            Filename must match: <span className="font-mono">{example}</span>
          </p>
        )}
        {file && nameOk && (
          <p className="mt-2 font-sans text-xs text-stone-600">
            {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>

      {uploading && (
        <div>
          <div className="mb-1.5 flex items-center justify-between font-sans text-xs text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress! < 100 ? "Uploading…" : "Processing…"}
            </span>
            <span>{progress}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? 0}
            aria-label="Upload progress"
          >
            <div
              className="h-full rounded-full bg-[#0E3D2F] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {result?.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            Uploaded <span className="font-semibold">{result.filename}</span> (
            {formatBytes(result.size)})
            {result.key && (
              <p className="mt-0.5 break-all font-mono text-xs text-emerald-700">{result.key}</p>
            )}
          </div>
        </div>
      )}
      {result && !result.ok && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {result.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
        {uploading && (
          <button
            type="button"
            onClick={() => xhrRef.current?.abort()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-sans text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel upload
          </button>
        )}
        <button
          type="button"
          onClick={() => void onUpload()}
          disabled={!file || !nameOk || uploading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0E3D2F] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#0a2e23] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
    </div>
  );
}
