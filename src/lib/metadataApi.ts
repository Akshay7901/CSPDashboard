import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type MetadataAuthor = {
  title?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  email_2?: string;
  institution?: string;
  country?: string;
};

export type CoverImage = {
  id?: number;
  version?: number;
  s3_url?: string;
  url?: string;
  filename?: string;
  mime_type?: string;
  width_px?: number;
  height_px?: number;
  dpi?: number;
  file_size_bytes?: number;
  source?: string;
  uploaded_at?: string;
};

export type ProposalMetadata = {
  ticket_number?: string;
  current_version?: number;
  metadata_status?: string;
  proposal_status?: string;
  metadata?: {
    full_title?: string;
    title?: string;
    subtitle?: string;
    category?: string;
    display_names?: string;
    display_bios?: string;
    authors?: MetadataAuthor[];
    book_description?: string;
    keywords?: string;
    website_classification?: string;
    bic?: string;
    notes?: string;
  };
  created_at?: string;
  updated_at?: string;
  approved_at?: string;
  cover_image?: CoverImage | null;
};

export type MetadataQueryEntry = {
  id: number;
  type: "query" | "response";
  text: string;
  fields?: string[];
  raised_by?: string;
  raised_by_name?: string;
  raised_by_role?: string;
  parent_query_id?: number | null;
  created_at: string;
};

export type MetadataQueriesResponse = {
  status?: string;
  ticket_number?: string;
  total?: number;
  queries?: MetadataQueryEntry[];
};

function authHeaders(): HeadersInit {
  const token = getPortalToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getMetadata(
  ticket: string,
): Promise<{ ok: boolean; status: number; data: ProposalMetadata | null; error?: string }> {
  const res = await proposalApiFetch(`/${encodeURIComponent(ticket)}/metadata`, {
    headers: authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: (body.error as string) || `Failed to load metadata (${res.status}).`,
    };
  }
  return { ok: true, status: res.status, data: body as ProposalMetadata };
}

export async function approveMetadata(ticket: string, notes?: string) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/metadata/approve`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(notes ? { notes } : {}),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function getMetadataQueries(
  ticket: string,
): Promise<MetadataQueriesResponse> {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/metadata/queries`,
    { headers: authHeaders() },
  );
  if (!res.ok) return { queries: [] };
  return (await res.json().catch(() => ({}))) as MetadataQueriesResponse;
}

export async function raiseMetadataQuery(
  ticket: string,
  query_text: string,
  fields?: string[],
) {
  const payload: Record<string, unknown> = { query_text };
  if (fields && fields.length > 0) payload.fields = fields;
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/metadata/query`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export async function respondMetadataQuery(
  ticket: string,
  query_id: number,
  response_text: string,
) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/metadata/query/respond`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query_id, response_text }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Failed (${res.status})`);
  return body;
}

export type CoverImageValidation = {
  ok: boolean;
  error?: string;
  width?: number;
  height?: number;
};

export const COVER_MIN_DIM = 2360;
export const COVER_MAX_BYTES = 50 * 1024 * 1024;

export async function validateCoverImageFile(file: File): Promise<CoverImageValidation> {
  const name = file.name.toLowerCase();
  const isJpeg =
    file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg");
  const isTiff =
    file.type === "image/tiff" || name.endsWith(".tif") || name.endsWith(".tiff");
  const isPng =
    file.type === "image/png" || name.endsWith(".png");
  if (!isJpeg && !isTiff && !isPng) {
    return { ok: false, error: "File must be a JPEG, PNG, or TIFF image." };
  }
  if (file.size > COVER_MAX_BYTES) {
    return { ok: false, error: "File exceeds the 50 MB maximum size." };
  }
  // TIFF cannot be decoded by <img> in most browsers — defer dimension/DPI to server.
  if (isTiff) return { ok: true };

  const dims = await readImageDimensions(file).catch(() => null);
  if (!dims) {
    return { ok: true }; // let server enforce
  }
  if (dims.width < COVER_MIN_DIM || dims.height < COVER_MIN_DIM) {
    return {
      ok: false,
      error: `Image must be at least ${COVER_MIN_DIM}×${COVER_MIN_DIM} px (got ${dims.width}×${dims.height}). DPI and pixel dimensions are checked separately, so a 600 dpi image can still fail if its width or height is too small.`,
      width: dims.width,
      height: dims.height,
    };
  }
  return { ok: true, width: dims.width, height: dims.height };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

export async function uploadCoverImage(
  ticket: string,
  file: File,
  source: string,
  onProgress?: (pct: number) => void,
): Promise<CoverImage> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source", source);
  const token = getPortalToken();
  const url = `https://api.cambridgescholars.com/api/proposals/${encodeURIComponent(
    ticket,
  )}/metadata/cover-image`;

  return new Promise<CoverImage>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* noop */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((body.cover_image as CoverImage) || {});
      } else {
        reject(
          new Error(
            (body.error as string) || (body.message as string) || `Upload failed (${xhr.status})`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

export async function deleteCoverImage(ticket: string) {
  const res = await proposalApiFetch(
    `/${encodeURIComponent(ticket)}/metadata/cover-image`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || `Delete failed (${res.status})`);
  return body;
}