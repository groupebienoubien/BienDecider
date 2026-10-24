import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeBusinessTarget, formatEuros } from "@/lib/business-target";
import { getWeeklyDelta } from "@/lib/funnel";
import { WEEKLY_REVIEW_MARKER as MARKER } from "@/lib/weekly-review";

/**
 * "Events" : le seul trigger qui ne vient pas d'un clic ou d'un message de
 * l'utilisateur (cf. docs/backlog.md "partenaire de croissance" — l'écart
 * entre un assistant qui répond et un partenaire qui remarque les choses
 * seul). Déclenché par Vercel Cron (cf. vercel.json), une fois par semaine.
 *
 * Volontairement déterministe, PAS un appel au modèle : un message envoyé
 * sans supervision humaine (contrairement au chat, où le dirigeant voit
 * immédiatement une réponse et peut la challenger) ne doit jamais pouvoir
 * halluciner une action ou un résultat — même principe que la page Rapport.
 * Paul garde son rôle de synthèse et de plan uniquement dans les flux
 * déclenchés par l'utilisateur (chat, "Compléter le plan").
 */

function buildMessage(params: {
  company: { objective: string | null } & Parameters<typeof computeBusinessTarget>[0];
  delta: Awaited<ReturnType<typeof getWeeklyDelta>>;
  pendingCount: number;
}): string | null {
  const { company, delta, pendingCount } = params;
  const target = computeBusinessTarget(company);
  const hasActivity = Object.values(delta).some((n) => n > 0);
  if (!hasActivity && pendingCount === 0) return null; // semaine calme : pas de message, pas de bruit

  const lines = [MARKER];
  if (target) {
    lines.push(
      `Objectif : ${formatEuros(target.target)}/mois — situation déclarée ${formatEuros(target.current)}/mois (écart ${
        target.gap >= 0 ? "+" : ""
      }${formatEuros(target.gap)}).`,
    );
  }
  if (hasActivity) {
    lines.push(
      `Cette semaine côté prospection : ${delta.identifies} prospect(s) identifié(s), ${delta.contactes} contacté(s), ${delta.reponses} réponse(s), ${delta.rdv} RDV, ${delta.clients} client(s) déclaré(s).`,
    );
  } else {
    lines.push("Aucun mouvement côté prospection cette semaine.");
  }
  if (pendingCount > 0) {
    lines.push(`${pendingCount} proposition(s) en attente de votre validation — ça n'avance pas tant qu'elles n'y sont pas.`);
  }
  if (target && target.monthsRemaining === 0) {
    lines.push("L'échéance de votre objectif est atteinte : mettez-la à jour dans \"Mon entreprise\" pour la suite.");
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET non configuré côté serveur" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const companies = await prisma.company.findMany({
    where: { name: { not: "" } },
  });

  let created = 0;
  for (const company of companies) {
    // Garde-fou anti-doublon : si Vercel ré-exécute le cron (retry), ou si le
    // job tourne deux fois dans la même fenêtre, on ne renvoie pas deux fois
    // le même point.
    const already = await prisma.chatMessage.findFirst({
      where: { companyId: company.id, role: "assistant", content: { startsWith: MARKER }, createdAt: { gte: since } },
    });
    if (already) continue;

    const [delta, pendingCount] = await Promise.all([
      getWeeklyDelta(company.id, since),
      prisma.agentProposal.count({ where: { companyId: company.id, status: "en_attente" } }),
    ]);

    const content = buildMessage({ company, delta, pendingCount });
    if (!content) continue;

    await prisma.chatMessage.create({ data: { companyId: company.id, role: "assistant", content } });
    created++;
  }

  return NextResponse.json({ companiesChecked: companies.length, messagesCreated: created });
}
