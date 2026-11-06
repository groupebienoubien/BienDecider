import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDuePublications } from "@/lib/contents/publish";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Ordonnanceur des programmations (story 12.4, #261) : appelé toutes les 5 minutes par GitHub Actions, protégé par CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré côté serveur" }, { status: 500 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json(await runDuePublications());
}
