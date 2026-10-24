import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";

const ALLOWED_STATUSES = ["lance", "termine", "ecarte"] as const;

/** Décision du dirigeant sur une action du plan : écarter (avec raison, relue par Paul), ou clore. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.actionPlanItem.findUnique({ where: { id } });
  if (!existing || existing.companyId !== company.id) {
    return NextResponse.json({ error: "Action introuvable" }, { status: 404 });
  }
  if (existing.status === "en_cours") {
    return NextResponse.json({ error: "Cette action est en cours. Attendez la fin avant de la modifier ou de l'écarter." }, { status: 409 });
  }

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { status, feedback } = body;

  if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status doit être l'un de : ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  if (feedback !== undefined && (typeof feedback !== "string" || feedback.length > 1000)) {
    return NextResponse.json({ error: "feedback doit être un texte de 1 000 caractères maximum" }, { status: 400 });
  }

  const [item] = await prisma.actionPlanItem.updateManyAndReturn({
    // L'état lu doit encore être courant : un lancement concurrent conserve
    // son état en_cours et la décision reçoit un conflit au lieu de l'écraser.
    where: { id, companyId: company.id, status: existing.status },
    data: {
      status: status as string,
      feedback: status === "ecarte" && typeof feedback === "string" ? feedback : undefined,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Cette action a changé depuis votre décision. Actualisez le plan avant de la modifier." }, { status: 409 });
  }
  return NextResponse.json(item);
}
