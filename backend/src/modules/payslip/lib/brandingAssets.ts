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

/** Load `/uploads/company/...` asset as an embeddable data URI, or null. */
export async function fetchStoredCompanyAssetDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const match = /^\/uploads\/company\/(logo|signature)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const objectName = `company/${match[1]}/${match[2]}`;
  try {
    const stat = await minioClient.statObject(MINIO_BUCKET, objectName);
    const contentType = stat.metaData?.["content-type"] ?? "";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return null;
    const signedUrl = await minioClient.presignedGetObject(MINIO_BUCKET, objectName);
    const resp = await fetch(signedUrl);
    if (!resp.ok) return null;
    let bytes: Buffer<ArrayBufferLike> = Buffer.from(await resp.arrayBuffer());
    let embedType = contentType;
    if (contentType.includes("png")) {
      const clean = sanitizePng(bytes);
      if (!clean) return null;
      bytes = clean;
      embedType = "image/png";
    }
    return `data:${embedType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}