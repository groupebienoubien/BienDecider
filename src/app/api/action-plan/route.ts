import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { FINDING_ACTION_AGENTS } from "@/lib/finding-shared";
import { PLAN_THEMES } from "@/lib/plan-themes";
import { readJsonObject } from "@/lib/request-body";

/**
 * Création directe d'une action du plan, sans passer par Paul (donc sans
 * appel modèle) — utilisée pour transformer en un clic une action suggérée
 * par un constat d'audit (cf. finding-card.tsx) en vraie action du plan.
 * Le texte est déjà écrit par l'agent qui a produit le constat ; le
 * dirigeant valide en l'ajoutant, puis la lance depuis le dashboard comme
 * n'importe quelle autre action du plan — même garde-fou de validation
 * humaine partout ailleurs.
 */
export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { agent, title, rationale, theme, priority } = body;
  if (typeof agent !== "string" || !(FINDING_ACTION_AGENTS as readonly string[]).includes(agent)) {
    return NextResponse.json({ error: `agent doit être l'un de : ${FINDING_ACTION_AGENTS.join(", ")}` }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim() || typeof rationale !== "string" || !rationale.trim()) {
    return NextResponse.json({ error: "title et rationale (non vides) requis" }, { status: 400 });
  }
  if (title.length > 300 || rationale.length > 3000) {
    return NextResponse.json({ error: "title (300 caractères) ou rationale (3 000 caractères) trop long" }, { status: 400 });
  }
  if ((theme !== undefined && !(PLAN_THEMES as readonly unknown[]).includes(theme)) ||
    (priority !== undefined && (!Number.isInteger(priority) || Number(priority) < 1 || Number(priority) > 5))) {
    return NextResponse.json({ error: "theme ou priority invalide" }, { status: 400 });
  }

  const item = await prisma.actionPlanItem.create({
    data: {
      companyId: company.id,
      agent,
      title: title.trim(),
      rationale: rationale.trim(),
      timing: "dès que possible",
      theme: typeof theme === "string" ? theme : null,
      priority: typeof priority === "number" ? priority : null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
