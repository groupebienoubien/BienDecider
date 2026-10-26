import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// PostgreSQL en dev comme en prod (cf. docs/architecture-technique.md) —
// DATABASE_URL pointe vers Vercel Postgres en prod, vers une base locale/
// distante au choix en dev.
// Pool volontairement petit : en serverless chaque instance ouvre son propre
// pool, et la valeur par défaut de pg (10) sature vite la limite du rôle.
const poolMax = Number(process.env.DATABASE_POOL_MAX) || 5;
const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  max: poolMax,
  idleTimeoutMillis: 5_000,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
