import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { pinoHttp } from "pino-http";
import crypto from "crypto";
import { env, corsOrigins } from "./config/env";
import { logger } from "./lib/logger";
import { AppError } from "./lib/errors";
import { globalRateLimiter } from "./middlewares/rateLimiter";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler";
import { sendSuccess } from "./lib/response";
import { prisma } from "./lib/prisma";
import routes from "./routes";
import fileRoutes from "./routes/file.routes";

const app = express();

app.set("trust proxy", 1);

// Security headers
const assetOrigins: string[] = [env.APP_URL, env.ASSET_HOST].filter(
  (origin): origin is string => Boolean(origin)
);

app.use(compression());

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },

    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),

        "img-src": [
          "'self'",
          "data:",
          "blob:",
          ...assetOrigins,
        ],

        "media-src": [
          "'self'",
          "blob:",
          ...assetOrigins,
        ],
      },
    },
  })
);


// CORS
app.use(
  cors({
    origin: (origin, callback) => {

      if (!origin) return callback(null, true);
      if (
        corsOrigins.includes(origin) ||
        (env.NODE_ENV === "development" && (origin.includes("localhost") || origin.includes("127.0.0.1")))
      ) {
        return callback(null, true);
      }
      return callback(AppError.forbidden("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Request logging + request id
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers["x-request-id"] as string) || crypto.randomUUID(),
    customProps: (req) => ({ requestId: (req as Request & { id?: string }).id }),
    serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ statusCode: r.statusCode }) },
    autoLogging: { ignore: (req) => req.url === "/api/health" },
  })
);

// Set requestId on the request object for error handler + audit correlation
app.use((req, _res, next) => {
  req.requestId = (req as Request & { id?: string }).id;
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limiting
app.use("/api", globalRateLimiter);

// Health check (no auth)
app.get("/api/health", async (_req: Request, res: Response) => {
  let db = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    db = "down";
  }
  sendSuccess(res, { status: "ok", uptime: process.uptime(), db, env: env.NODE_ENV, timestamp: new Date().toISOString() });
});

app.use("/uploads", fileRoutes);

// API routes
app.use("/api", routes);

// 404 + error handling 
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
