import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { writeJournal } from "@/lib/journal";
import { renderMissionMessage } from "@/lib/missions/messages";
import { capacityLabel, checkCapacity } from "@/lib/capacity";

/**
 * Capacité disponible (#292, « Vos repères ») : POST `{ capacity }`, nombre entier de 0 à 99 nouveaux projets clients par mois,
 * ou null pour l'effacer. Enregistrer, même à l'identique, la reconfirme pour 30 jours (J-37). Rien d'autre ne change.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour indiquer votre capacité." }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const checked = checkCapacity(body.capacity);
  if (!checked.ok) return NextResponse.json({ error: renderMissionMessage("M-100"), code: "M-100" }, { status: 422 });
  const confirmedAt = checked.capacity === null ? null : new Date();
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: company.id }, data: { availableCapacity: checked.capacity, capacityConfirmedAt: confirmedAt } });
    if (checked.capacity !== null) await writeJournal(tx, { companyId: company.id, code: "J-37", params: { capacite: capacityLabel(checked.capacity).toLowerCase() }, actor: "owner" });
  }, { maxWait: 5000, timeout: 20000 });
  return NextResponse.json({ ok: true, capacity: checked.capacity, confirmedAt: confirmedAt?.toISOString() ?? null });
}
