import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionCompany } from "@/lib/session";
import { decidePendingAction } from "@/lib/agents/pending-actions";
import { INACTIVE_MESSAGE, expiredMessage } from "@/lib/agents/pending-action-view";

const bodySchema = z.object({ decision: z.enum(["confirm", "cancel"]) }).strict();

/**
 * Clic du dirigeant sur une proposition de Paul (§16.3) : « Accepter » l'exécute par le service des missions,
 * « Garder le cap actuel » la retire et Paul le confirme dans le fil de la carte. Un refus des règles
 * renvoie le message M-xx (422, 409 pour une version changée) et la carte reste en attente ; une
 * proposition de lancement renvoie l'adresse du dialogue de cadre. Filtré sur l'entreprise de la session (404 sinon).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Décision invalide." }, { status: 400 });

  const { id } = await params;
  try {
    const result = await decidePendingAction(company.id, id, parsed.data.decision);
    if (result.ok) {
      return NextResponse.json({ action: result.action, ...(result.redirect ? { redirect: result.redirect } : {}), ...(result.reply ? { reply: result.reply } : {}) });
    }
    if (result.error === "not_found") return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
    if (result.error === "refused") {
      return NextResponse.json({ error: result.message, reason: "refused", code: result.code, action: result.action }, { status: result.status });
    }
    if (result.error === "expired") {
      return NextResponse.json({ error: expiredMessage(result.action.type), reason: "expired", action: result.action }, { status: 409 });
    }
    return NextResponse.json({ error: INACTIVE_MESSAGE, reason: "inactive", action: result.action }, { status: 409 });
  } catch (error) {
    console.error("Erreur de décision sur une carte de Paul:", error);
    return NextResponse.json({ error: "Impossible d'enregistrer cette décision. Réessayez." }, { status: 500 });
  }
}
