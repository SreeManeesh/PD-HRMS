/**
 * Shared loader for company payslip branding images (logo / signature).
 * Fetches the stored MinIO object via a presigned URL and returns a safe
 * data URI for PDF embedding. PNGs are sanitized through pngjs first —
 * pdfkit's bundled decoder ignores chunk CRC errors and can spend ~50s+ on
 * malformed files, so decode+re-encode normalizes the image (or returns null
 * to skip the broken asset entirely).
 */
import minioClient, { MINIO_BUCKET } from "../../../config/minio";
import { PNG } from "pngjs";
import path from "path";
import fs from "fs";

const MAX_PIXELS = 4_000_000;

export function sanitizePng(buffer: Buffer): Buffer | null {
  try {
    const img = PNG.sync.read(buffer);
    if (!img.width || !img.height || img.width * img.height > MAX_PIXELS) return null;
    return PNG.sync.write(img) as Buffer;
  } catch {
    return null;
  }
}

function contentTypeByExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function toDataUri(bytes: Buffer, contentType: string): string | null {
  if (contentType.includes("svg")) return null;
  if (contentType.includes("png")) {
    const clean = sanitizePng(bytes);
    if (!clean) return null;
    return `data:image/png;base64,${clean.toString("base64")}`;
  }
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

/** Load `/uploads/company/...` asset as an embeddable data URI, or null.
 *  Tries MinIO first; falls back to the local uploads disk (dev without MinIO). */
export async function fetchStoredCompanyAssetDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const match = /^\/uploads\/company\/(logo|signature)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const objectName = `company/${match[1]}/${match[2]}`;

  // 1) MinIO
  try {
    const stat = await minioClient.statObject(MINIO_BUCKET, objectName);
    const contentType = stat.metaData?.["content-type"] ?? "";
    if (!contentType.startsWith("image/")) return null;
    const signedUrl = await minioClient.presignedGetObject(MINIO_BUCKET, objectName);
    const resp = await fetch(signedUrl);
    if (resp.ok) {
      const bytes = Buffer.from(await resp.arrayBuffer());
      return toDataUri(bytes, contentType);
    }
  } catch {
    /* fall through to local disk */
  }

  // 2) Local disk fallback
  try {
    const localFile = path.join(process.cwd(), "uploads", "company", match[1], match[2]);
    if (!fs.existsSync(localFile)) return null;
    const bytes = fs.readFileSync(localFile);
    const contentType = contentTypeByExt(localFile);
    if (!contentType.startsWith("image/")) return null;
    return toDataUri(bytes, contentType);
  } catch {
    return null;
  }
}