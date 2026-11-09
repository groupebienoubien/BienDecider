import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Purge quotidienne des brouillons du parcours d'entrée expirés (24 h), promise par la page de confidentialité.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré côté serveur" }, { status: 500 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { count } = await prisma.onboardingDraft.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return NextResponse.json({ deleted: count });
}
