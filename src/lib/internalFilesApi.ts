import { API_BASE_URL } from "./proposalApi";
import { getPortalToken } from "./auth";

// Internal file uploads to S3 — admin only. Lives under /api/internal/files.

export type FolderKey = "ebooks" | "samples" | "croppedcovers" | "amazoncroppedcovers" | "allbooks";

export type FolderConfig = {
  key: FolderKey;
  label: string;
  accept: string;
  /** Client-side check mirroring the backend's naming rule. */
  test: (filename: string) => boolean;
  /** Shown until /naming-rules loads (and if it fails). */
  fallbackExample: string;
};

// 13-digit ISBN starting 978/979.
const ISBN13 = "97[89]\\d{10}";

export const UPLOAD_FOLDERS: FolderConfig[] = [
  {
    key: "allbooks",
    label: "All books",
    accept: ".pdf",
    // Title+Words_paper|hard_man|ebk_v{n}.pdf
    test: (n) => /^[^_\s/\\]+_(paper|hard)_(man|ebk)_v\d+\.pdf$/i.test(n),
    fallbackExample: "Title+Of+Book_paper_man_v1.pdf  (binding: paper|hard, type: man|ebk)",
  },
  {
    key: "ebooks",
    label: "eBooks",
    accept: ".pdf",
    test: (n) => new RegExp(`^${ISBN13}\\.pdf$`, "i").test(n),
    fallbackExample: "9781234567890.pdf  (13-digit ISBN + .pdf)",
  },
  {
    key: "samples",
    label: "Samples",
    accept: ".pdf",
    // Hyphenated ISBN (13 digits in total) + -sample, optional _v{n}.
    test: (n) => {
      const m = /^(97[89](?:-\d+){3}-\d)-sample(?:_v\d+)?\.pdf$/i.exec(n);
      return !!m && m[1].replace(/-/g, "").length === 13;
    },
    fallbackExample: "978-1-1234-5678-9-sample.pdf  or  978-1-1234-5678-9-sample_v2.pdf",
  },
  {
    key: "croppedcovers",
    label: "Cropped covers",
    accept: ".jpg,.jpeg",
    test: (n) => new RegExp(`^${ISBN13}\\.jpg$`, "i").test(n),
    fallbackExample: "9781234567890.jpg  (13-digit ISBN + .jpg)",
  },
  {
    key: "amazoncroppedcovers",
    label: "Amazon cropped covers",
    accept: ".jpg,.jpeg",
    test: (n) => new RegExp(`^${ISBN13}\\.MAIN\\.jpg$`).test(n),
    fallbackExample: "9781234567890.MAIN.jpg  (13-digit ISBN + .MAIN.jpg)",
  },
];

export type NamingRules = Partial<Record<FolderKey, { pattern?: string; example?: string }>>;

export type UploadResult = { ok: true; s3_key: string; size_bytes: number };

const BASE = `${API_BASE_URL}/api/internal/files`;

/** Fired on window after a successful upload, for any file list to refresh. */
export const FILE_UPLOADED_EVENT = "internal-files:uploaded";

export async function getNamingRules(): Promise<NamingRules> {
  const token = getPortalToken();
  const res = await fetch(`${BASE}/naming-rules`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Couldn't load naming rules (${res.status}).`);
  return (await res.json()) as NamingRules;
}

/**
 * Uploads one file with XMLHttpRequest so progress can be reported.
 * Returns the xhr (for cancelling) and a promise for the result; rejects
 * with the server's error message on failure.
 */
export function uploadInternalFile(
  folder: FolderKey,
  file: File,
  onProgress: (pct: number) => void,
): { xhr: XMLHttpRequest; done: Promise<UploadResult> } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<UploadResult>((resolve, reject) => {
    const fd = new FormData();
    fd.append("folder", folder);
    fd.append("file", file);
    xhr.open("POST", `${BASE}/upload`);
    const token = getPortalToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        // Non-JSON error page.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResult);
      } else {
        reject(
          new Error(
            (body.error as string) ||
              (body.message as string) ||
              (xhr.status === 401
                ? "Your session has expired — please log in again."
                : xhr.status === 403
                  ? "Only admins can upload files."
                  : `Upload failed (${xhr.status}).`),
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error — couldn't reach the upload service."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(fd);
  });
  return { xhr, done };
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
