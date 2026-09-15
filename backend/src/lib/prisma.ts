import { PrismaClient } from "@prisma/client";

function getResilientDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    const poolSize = process.env.DATABASE_POOL_SIZE || "25";
    const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || "30";

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", poolSize);
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", poolTimeout);
    }
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "15");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl = getResilientDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

