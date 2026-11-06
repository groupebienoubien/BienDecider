import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { removeIdea } from "@/lib/ideas";

// « Retirer l'idée » (US #312) : idée ouverte de l'entreprise de la session supprimée, J-30 ; 404 si absente, d'une autre entreprise ou déjà cadrée.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour retirer une idée." }, { status: 401 });
  const { id } = await params;
  const removed = await removeIdea(company.id, id);
  if (!removed) return NextResponse.json({ error: "Idée introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
