import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import minioClient, {
    MINIO_BUCKET,
} from "../config/minio";

const router = Router();

function contentTypeByExt(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".svg") return "image/svg+xml";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    return "application/octet-stream";
}

function streamFromMinio(bucket: string, objectName: string) {
    return async (req: Request, res: Response) => {
        try {
            const stat = await minioClient.statObject(bucket, objectName);
            const stream = await minioClient.getObject(bucket, objectName);
            const contentType = stat.metaData?.["content-type"];
            if (contentType) res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Length", stat.size.toString());
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return stream.pipe(res);
        } catch (error) {
            console.error("MinIO file retrieval error:", error);
            return res.status(404).json({ success: false, message: "File not found" });
        }
    };
}

/** Stream a stored asset with a local-disk fallback (used for uploads that were
 *  persisted when MinIO was unavailable, e.g. local dev). */
function serveWithDiskFallback(bucket: string, folder: string) {
    return async (req: Request, res: Response) => {
        const objectName = `${folder}/${req.params[0]}`;
        // Company assets live in a nested subfolder (logo/x.png), so slashes
        // are allowed here; only path-traversal segments are rejected.
        const isSafe = !req.params[0].split(/[\\/]/).includes("..");
        try {
            const stat = await minioClient.statObject(bucket, objectName);
            const stream = await minioClient.getObject(bucket, objectName);
            const contentType = stat.metaData?.["content-type"];
            if (contentType) res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Length", stat.size.toString());
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return stream.pipe(res);
        } catch (minioErr) {
            const localFile = path.join(process.cwd(), "uploads", folder, req.params[0]);
            if (isSafe && fs.existsSync(localFile)) {
                res.setHeader("Content-Type", contentTypeByExt(localFile));
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                return fs.createReadStream(localFile).pipe(res);
            }
            return res.status(404).json({ success: false, message: "File not found" });
        }
    };
}

// Company payslip assets (/uploads/company/*) — MinIO first, local-disk fallback.
router.get("/company/*", serveWithDiskFallback(MINIO_BUCKET, "company"));

// Employee profile photos (/uploads/employee/*) — MinIO first, local-disk fallback.
router.get("/employee/*", serveWithDiskFallback(MINIO_BUCKET, "employee"));

// LMS content (/uploads/lms/*) — MinIO only (as before).
router.get("/lms/*", async (req: Request, res: Response) => {
    await streamFromMinio(MINIO_BUCKET, `lms/${req.params[0]}`)(req, res);
});

export default router;