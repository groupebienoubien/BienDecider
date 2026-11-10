import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { confirmCompetitor, dismissCompetitor, type CompetitorActionResult } from "@/lib/findings/competitor-service";

/**
 * « Confirmer » ou « Écarter » un concurrent potentiel du diagnostic courant (#292).
 * POST `{ action: "confirmer" | "ecarter" }` sur un constat de catégorie concurrence de l'entreprise de la session.
 */
function reply(result: CompetitorActionResult) {
  if (result.ok) return NextResponse.json({ ok: true, status: result.status });
  return NextResponse.json({ error: "Concurrent introuvable." }, { status: result.status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour confirmer ou écarter un concurrent." }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || (body.action !== "confirmer" && body.action !== "ecarter")) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  const result = await (body.action === "confirmer" ? confirmCompetitor(company.id, id) : dismissCompetitor(company.id, id));
  return reply(result);
}
