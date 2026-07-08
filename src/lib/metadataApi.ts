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
  dpi?: number;
};

export const COVER_MIN_DIM = 2360;
export const COVER_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MIN_DPI = 300;

function isJpegHeader(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPngHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isTiffHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d)) &&
    ((bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[2] === 0x00 && bytes[3] === 0x2a))
  );
}

function readUint16(bytes: Uint8Array, offset: number, bigEndian: boolean): number {
  if (bigEndian) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }
  return (bytes[offset + 1] << 8) | bytes[offset];
}

function readUint32(bytes: Uint8Array, offset: number, bigEndian: boolean): number {
  if (bigEndian) {
    return (
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]
    );
  }
  return (
    (bytes[offset + 3] << 24) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 1] << 8) |
    bytes[offset]
  );
}

function readRationalDpi(
  bytes: Uint8Array,
  offset: number,
  bigEndian: boolean,
): number | null {
  const num = readUint32(bytes, offset, bigEndian);
  const den = readUint32(bytes, offset + 4, bigEndian);
  if (!den) return null;
  return Math.round(num / den);
}

function parseTiffDpi(
  bytes: Uint8Array,
  tiffStart: number,
): number | null {
  const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  const magic = readUint16(bytes, tiffStart + 2, bigEndian);
  if (magic !== 0x002a) return null;
  const ifdOffset = readUint32(bytes, tiffStart + 4, bigEndian);
  let ifd = tiffStart + ifdOffset;
  if (ifd + 2 > bytes.length) return null;
  const entries = readUint16(bytes, ifd, bigEndian);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) break;
    const tag = readUint16(bytes, entry, bigEndian);
    if (tag === 0x011a) {
      // XResolution
      const valueOffset = readUint32(bytes, entry + 8, bigEndian);
      return readRationalDpi(bytes, tiffStart + valueOffset, bigEndian);
    }
  }
  return null;
}

function readJpegDpi(bytes: Uint8Array): number | null {
  let i = 2;
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    if (i + 3 >= bytes.length) break;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;
    const segStart = i + 4;
    const segEnd = segStart + length - 2;
    if (segEnd > bytes.length) break;
    if (marker === 0xe1 && segEnd - segStart >= 6) {
      // APP1 (Exif)
      if (
        bytes[segStart] === 0x45 && // E
        bytes[segStart + 1] === 0x78 && // x
        bytes[segStart + 2] === 0x69 && // i
        bytes[segStart + 3] === 0x66 && // f
        bytes[segStart + 4] === 0x00 &&
        bytes[segStart + 5] === 0x00
      ) {
        const tiffStart = segStart + 6;
        const dpi = parseTiffDpi(bytes, tiffStart);
        if (dpi) return dpi;
      }
    }
    i = segEnd;
  }
  return null;
}

function readPngDpi(bytes: Uint8Array): number | null {
  let i = 8;
  while (i + 12 < bytes.length) {
    const length = readUint32(bytes, i, true);
    const type = String.fromCharCode(
      bytes[i + 4],
      bytes[i + 5],
      bytes[i + 6],
      bytes[i + 7],
    );
    if (type === "pHYs" && length === 9 && i + 21 <= bytes.length) {
      const ppux = readUint32(bytes, i + 8, true);
      const unit = bytes[i + 16];
      if (unit === 1) {
        // pixels per metre -> dpi
        return Math.round(ppux / 39.3701);
      }
      return null;
    }
    if (type === "IDAT" || type === "IEND") break;
    i += 12 + length;
  }
  return null;
}

function readTiffDpi(bytes: Uint8Array): number | null {
  return parseTiffDpi(bytes, 0);
}

async function readImageDpi(file: File): Promise<number | null> {
  // Only the first ~256KB is needed for metadata in normal images.
  const slice = file.slice(0, 256 * 1024);
  const buf = await slice.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (isJpegHeader(bytes)) return readJpegDpi(bytes);
  if (isPngHeader(bytes)) return readPngDpi(bytes);
  if (isTiffHeader(bytes)) return readTiffDpi(bytes);
  return null;
}

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

  // Browser-side DPI check for JPEG/PNG. TIFF metadata is deferred to the server.
  if (isJpeg || isPng) {
    const dpi = await readImageDpi(file);
    if (!dpi) {
      return {
        ok: false,
        error:
          "Could not read DPI metadata from the image. Please ensure the file has DPI information embedded (minimum 300 dpi).",
      };
    }
    if (dpi < COVER_MIN_DPI) {
      return {
        ok: false,
        error: `Image DPI must be at least ${COVER_MIN_DPI} (got ${dpi}).`,
        dpi,
      };
    }
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
      error: `Image must be at least ${COVER_MIN_DIM}×${COVER_MIN_DIM} px (got ${dims.width}×${dims.height}).`,
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