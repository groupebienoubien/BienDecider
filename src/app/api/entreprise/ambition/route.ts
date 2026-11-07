import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { recordUsage } from "@/lib/usage";
import { AgentRunQuotaError, reserveUsageBudget } from "@/lib/agent-runs";
import { writeJournal } from "@/lib/journal";
import { capLabel } from "@/lib/ambition-rules";
import { signInterpretation, verifyInterpretation } from "@/lib/ambition-token";
import { ambitionModelConfigured, interpretAmbition, readAmbitionWithModel, type AmbitionModel, type AmbitionModelResult } from "@/lib/ambition";
import { checkAmbition, checkConfirmation } from "@/lib/onboarding/draft-rules";

export const maxDuration = 30;

/**
 * Ambition depuis Entreprise (#282, FR-52) : la même mécanique qu'à l'étape 3 du parcours d'entrée.
 * POST `{ action: "interpret", ambition }` → interprétation et jeton, rien d'enregistré ;
 * POST `{ action: "confirm", ambition, terms, token }` → texte, éléments, `objective` et J-03 dans une transaction.
 * Aucune mission n'est modifiée, mise en pause ni recréée.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || (body.action !== "interpret" && body.action !== "confirm")) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const checked = checkAmbition(body.ambition);
  if (!checked.ok) return NextResponse.json({ error: checked.error, code: checked.code, errors: checked.errors }, { status: 422 });
  const text = checked.ambition;

  if (body.action === "interpret") {
    const { interpretation } = await interpretAmbition(text, { model: await modelFor(company.id) });
    return NextResponse.json({ interpretation, token: signInterpretation(interpretation.text, interpretation.terms) });
  }

  const confirmed = checkConfirmation(text, body.terms, body.token, verifyInterpretation);
  if (!confirmed.ok) return NextResponse.json({ error: confirmed.error, code: confirmed.code, errors: confirmed.errors }, { status: 422 });
  const cap = capLabel(text, confirmed.terms);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      // « Votre cap » de la navigation lit l'objectif : il reprend le texte confirmé.
      data: { ambitionText: text, ambitionTerms: { ...confirmed.terms } as Prisma.InputJsonObject, ambitionConfirmedAt: new Date(), objective: text },
    });
    await writeJournal(tx, { companyId: company.id, code: "J-03", params: { cap }, actor: "owner" });
  }, { maxWait: 5000, timeout: 20000 });
  return NextResponse.json({ ok: true, cap });
}

/**
 * Lecture par le modèle pour un compte connecté : budget réservé puis usage enregistré, comme `/api/onboarding/interpret`.
 * Sans clé ou budget atteint : null, l'analyseur de secours répond sans message d'erreur.
 */
async function modelFor(companyId: string): Promise<AmbitionModel | null> {
  if (!ambitionModelConfigured()) return null;
  let reservationId: string;
  try {
    reservationId = (await reserveUsageBudget(companyId, "ambition_interpret")).id;
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return null;
    throw error;
  }
  return async (text) => {
    const result = await readAmbitionWithModel(text).catch((): AmbitionModelResult => ({ ok: false }));
    // Sans usage (délai dépassé, réseau) : un usage nul libère la réservation, pour ne pas bloquer le budget du jour.
    const usage = result.usage ?? { input_tokens: 0, output_tokens: 0 };
    const model = result.model ?? (await import("@/lib/anthropic")).AGENT_MODEL;
    await recordUsage({ companyId, reservationId, agent: "onboarding", model, usage }).catch(() => undefined);
    return result;
  };
}
