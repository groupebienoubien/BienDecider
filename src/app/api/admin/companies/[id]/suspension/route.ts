import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";

/**
 * Suspend ou réactive une entreprise (story 7.1) : réversible, données et site public conservés.
 * Un administrateur ne peut pas suspendre son propre compte (il se verrouillerait dehors).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const adminEmail = await getSessionEmail();
  if (!isAdminEmail(adminEmail)) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || typeof body.suspended !== "boolean") return NextResponse.json({ error: "Indiquez si l'entreprise doit être suspendue ou réactivée." }, { status: 400 });

  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { ownerEmail: true } });
  if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  if (body.suspended && company.ownerEmail.toLowerCase() === adminEmail!.toLowerCase()) {
    return NextResponse.json({ error: "Vous ne pouvez pas suspendre votre propre compte." }, { status: 400 });
  }
  // Idempotent : une suspension déjà posée garde sa date.
  if (body.suspended) await prisma.company.updateMany({ where: { id, suspendedAt: null }, data: { suspendedAt: new Date() } });
  else await prisma.company.update({ where: { id }, data: { suspendedAt: null } });
  const updated = await prisma.company.findUniqueOrThrow({ where: { id }, select: { suspendedAt: true } });
  return NextResponse.json({ suspended: updated.suspendedAt !== null, suspendedAt: updated.suspendedAt });
}
