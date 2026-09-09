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

/** Company payslip assets (/uploads/company/*) — MinIO first, local-disk fallback. */
router.get(
    "/company/*",
    async (req: Request, res: Response) => {
        try {
            const objectName = `company/${req.params[0]}`;
            try {
                const stat = await minioClient.statObject(MINIO_BUCKET, objectName);
                const stream = await minioClient.getObject(MINIO_BUCKET, objectName);
                const contentType = stat.metaData?.["content-type"];
                if (contentType) res.setHeader("Content-Type", contentType);
                res.setHeader("Content-Length", stat.size.toString());
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                return stream.pipe(res);
            } catch (minioErr) {
                // Fallback: file persisted on local disk (uploaded without MinIO).
                const localFile = path.join(process.cwd(), "uploads", "company", req.params[0]);
                if (!localFile.includes("..") && fs.existsSync(localFile)) {
                    res.setHeader("Content-Type", contentTypeByExt(localFile));
                    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                    return fs.createReadStream(localFile).pipe(res);
                }
                return res.status(404).json({ success: false, message: "File not found" });
            }
        } catch (error) {
            console.error("MinIO company asset retrieval error:", error);
            return res.status(404).json({ success: false, message: "File not found" });
        }
    }
);

router.get(
    "/lms/*",
    async (req: Request, res: Response) => {
        try {
            const objectName =
                `lms/${req.params[0]}`;

            const stat =
                await minioClient.statObject(
                    MINIO_BUCKET,
                    objectName
                );

            const stream =
                await minioClient.getObject(
                    MINIO_BUCKET,
                    objectName
                );

            const contentType =
                stat.metaData?.["content-type"];

            if (contentType) {
                res.setHeader(
                    "Content-Type",
                    contentType
                );
            }

            res.setHeader(
                "Content-Length",
                stat.size.toString()
            );

            res.setHeader(
                "Cross-Origin-Resource-Policy",
                "cross-origin"
            );

            stream.pipe(res);
        } catch (error) {
            console.error(
                "MinIO file retrieval error:",
                error
            );

            return res.status(404).json({
                success: false,
                message: "File not found",
            });
        }
    }
);

export default router;