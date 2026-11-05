import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";
import { evaluateCreditAlert, saveCredit } from "@/lib/llm-credit";
import { parseCreditInput } from "@/lib/llm-credit-rules";

// Solde constaté chez le fournisseur du modèle (story 8.2) : réservé aux administrateurs, écriture avec contrôle d'origine.
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const email = await getSessionEmail();
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const parsed = parseCreditInput(await readJsonObject(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await saveCredit(parsed.value, email!);
  await evaluateCreditAlert().catch((error) => console.error("Alerte de crédit impossible:", error instanceof Error ? error.name : "erreur inconnue"));
  return NextResponse.json(parsed.value);
}
