import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { correctFinding, restoreFinding, type CorrectionResult } from "@/lib/findings/correction-service";

/**
 * « Corriger cette information » (#169) sur un constat du diagnostic courant de l'entreprise de la session.
 * POST `{ title, content }` : le constat est corrigé, la version remplacée archivée, les missions reliées à réexaminer, J-34.
 * DELETE : retour à la version remplacée, J-35. Rien n'est relancé ni publié.
 */
async function guard(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return { response: NextResponse.json({ error: "Origine refusée." }, { status: 403 }) };
  const company = await getSessionCompany();
  if (!company) return { response: NextResponse.json({ error: "Connectez-vous pour corriger un constat." }, { status: 401 }) };
  return { company };
}

function reply(result: CorrectionResult) {
  if (result.ok) return NextResponse.json({ ok: true, id: result.id, missions: result.missions });
  return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}), ...(result.field ? { field: result.field } : {}) }, { status: result.status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { company, response } = await guard(request);
  if (!company) return response;
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  return reply(await correctFinding(company.id, id, body));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { company, response } = await guard(request);
  if (!company) return response;
  const { id } = await params;
  return reply(await restoreFinding(company.id, id));
}
