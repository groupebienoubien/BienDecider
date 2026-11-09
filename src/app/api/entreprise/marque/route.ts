import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { confirmBrand } from "@/lib/brand/service";

/**
 * Confirmer ma marque (#290, FR-33) : POST `{ primary, accent, tone, confirmed: true }`.
 * 200 `{ ok, changed }` ; 422 `{ errors }` si le formulaire est incomplet ; 422 `{ code: "M-94" }` si un visuel est programmé.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const result = await confirmBrand(company.id, body);
    if (!result.ok) return NextResponse.json({ error: "Vérifiez les éléments de votre marque.", errors: result.errors }, { status: 422 });
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (error) {
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
