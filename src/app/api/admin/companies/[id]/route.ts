import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";
import { deleteCompanySitePhotoFiles } from "@/lib/site/photo-store";

/**
 * Suppression définitive d'une entreprise (nettoyage pilote) — cascade sur toutes ses données, cf. prisma/schema.prisma.
 * Confirmation renforcée (story 7.1) : il faut renvoyer exactement le nom de l'entreprise (à défaut, son adresse e-mail).
 * Pour bloquer un compte sans rien détruire, utiliser la suspension (./suspension).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  }
  const ownerEmail = await getSessionEmail();
  if (!isAdminEmail(ownerEmail)) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { name: true, ownerEmail: true } });
  if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  const body = await readJsonObject(request);
  const expected = company.name || company.ownerEmail;
  if (!body || body.confirmName !== expected) {
    return NextResponse.json({ error: "Saisissez exactement le nom de l'entreprise pour confirmer la suppression définitive." }, { status: 400 });
  }
  await deleteCompanySitePhotoFiles(id);
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
