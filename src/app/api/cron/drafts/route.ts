import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purgeExpiredDrafts, purgeOldTraces } from "@/lib/onboarding/visit-trace";

export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Purge quotidienne (addendum §6) : chaque brouillon du parcours d'entrée expiré (24 h) laisse sa trace anonyme puis est effacé (#311) ;
// les traces de plus de 25 mois sont effacées. Promise par la page de confidentialité.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré côté serveur" }, { status: 500 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const now = new Date();
  const deleted = await purgeExpiredDrafts(prisma, now);
  const tracesDeleted = await purgeOldTraces(prisma, now);
  return NextResponse.json({ deleted, tracesDeleted });
}
