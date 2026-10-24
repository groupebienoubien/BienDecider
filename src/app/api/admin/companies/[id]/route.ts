import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { deleteCompanySitePhotoFiles } from "@/lib/site/photo-store";

/** Suppression définitive d'une entreprise (nettoyage pilote) — cascade sur toutes ses données, cf. prisma/schema.prisma. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerEmail = await getSessionEmail();
  if (!isAdminEmail(ownerEmail)) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  await deleteCompanySitePhotoFiles(id);
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
