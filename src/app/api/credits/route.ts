import { NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readCredits } from "@/lib/credits";

// Solde et huit derniers mouvements de l'entreprise de la session (story 9.3, #56).
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour voir vos crédits." }, { status: 401 });
  return NextResponse.json(await readCredits(company.id));
}
