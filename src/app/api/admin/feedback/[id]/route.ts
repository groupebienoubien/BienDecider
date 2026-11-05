import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";

/** Marque un signalement comme traité ou à traiter (story 7.4), réservé aux administrateurs. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  if (!isAdminEmail(await getSessionEmail())) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || typeof body.handled !== "boolean") return NextResponse.json({ error: "Indiquez si le signalement est traité." }, { status: 400 });
  const { id } = await params;
  const handledAt = body.handled ? new Date() : null;
  const updated = await prisma.feedback.updateMany({ where: { id }, data: { handledAt } });
  if (updated.count === 0) return NextResponse.json({ error: "Signalement introuvable" }, { status: 404 });
  return NextResponse.json({ handled: body.handled, handledAt });
}
