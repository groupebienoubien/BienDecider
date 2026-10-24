import type Anthropic from "@anthropic-ai/sdk";
import type { Company } from "@prisma/client";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { companyProfileLines } from "@/lib/agents/personas";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { PublishRefusedError } from "@/lib/execution-error";
import { keepOnlyCompanyPhotos, sitePhotoPromptLines } from "@/lib/site/photos";
import { canExecuteAction } from "@/lib/delegation-risk";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { reserveUsageBudget } from "@/lib/agent-runs";
import { decideProposalReview, reviewPublishedSiteHtml } from "@/lib/proposal-review";

/**
 * Première exécution réelle de bout en bout du produit : un brief de site
 * (proposition `site_web_content` de Camille) VALIDÉ par le dirigeant devient
 * une page publiée sur /site/[slug], hébergée par Pepito. Aucune dépendance
 * externe (pas de WordPress, pas d'hébergeur) — cf. docs/backlog.md.
 * Garde-fou inchangé : n'est jamais appelé sur une proposition non validée.
 */

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
}

/**
 * Défense en profondeur : le HTML est généré par un modèle — on retire tout script/handler, toute image
 * qui n'est pas une photo de l'entreprise (story 5.5), et la page est servie dans une iframe sandbox sans scripts.
 */
export function sanitizeHtml(html: string, photos: readonly { url: string; alt: string }[] = []): string {
  return keepOnlyCompanyPhotos(
    html
      .replace(/```html\s*/gi, "")
      .replace(/```\s*$/g, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
      .replace(/javascript:/gi, ""),
    photos,
  ).trim();
}

/** Refus de revue d'une republication : la liste des points à confirmer est renvoyée à l'interface. */
export class SiteReviewRequiredError extends PublishRefusedError {
  constructor(message: string, readonly points: { id: string; title: string; detail: string }[]) {
    super(message, 409);
  }
}

const SITE_SYSTEM_PROMPT = `Tu produis une page web complète (un seul fichier HTML, CSS inline dans une balise <style>), sobre, professionnelle et lisible sur mobile, pour une TPE. Interdits : JavaScript, iframes, formulaires, ressources externes (polices, images distantes, url() en CSS). Seule exception : les photos fournies par le dirigeant dans le message, à afficher chacune dans une balise <img> avec exactement l'adresse (src) et le texte alternatif (alt) donnés, sans srcset ni autre image ; s'il n'y en a aucune, aucune balise <img>. Pas de texte inventé : utilise uniquement les informations du brief et de l'entreprise. Si une information manque (ex: numéro de téléphone), laisse un emplacement visible "[Votre téléphone]" plutôt que d'inventer. Réponds UNIQUEMENT avec le HTML, sans commentaire ni balises markdown.`;

/**
 * Génère, nettoie et relit la page d'un brief approuvé, avec les photos actuelles de l'entreprise.
 * Compte comme un lancement (réservation `site_publish`, story 4.1), publication comme republication.
 */
async function generateSiteHtml(company: Company, brief: string, acknowledgedReviewIds: string[], mode: "publish" | "republish" = "publish") {
  const reservation = await reserveUsageBudget(company.id, "site_publish");
  const photos = await prisma.sitePhoto.findMany({
    where: { companyId: company.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { url: true, alt: true, width: true, height: true },
  });

  // Prompt strictement identique pour toutes les entreprises et tous les
  // appels (aucune donnée entreprise dans le system — elle est dans le
  // message utilisateur ci-dessous) : candidat idéal au prompt caching,
  // partagé par toute publication de site, quelle que soit l'entreprise.
  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: 8000,
    system: [{ type: "text", cache_control: { type: "ephemeral" }, text: SITE_SYSTEM_PROMPT }],
    messages: [
      {
        role: "user",
        content: `Entreprise : ${company.name} (${company.trade}), zone : ${company.servingArea}.
${companyProfileLines(company)}
${sitePhotoPromptLines(photos)}
Brief validé par le dirigeant :
${brief}`,
      },
    ],
  });

  const rawHtml = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  await recordUsage({
    companyId: company.id,
    reservationId: reservation.id,
    agent: "site_publish",
    model: AGENT_MODEL,
    usage: response.usage,
  });

  const html = sanitizeHtml(rawHtml, photos);
  if (!html.toLowerCase().includes("<html")) {
    throw new Error("Le modèle n'a pas renvoyé une page HTML exploitable.");
  }
  const finalReview = decideProposalReview(reviewPublishedSiteHtml(html, company.phone, company.certifications), acknowledgedReviewIds);
  if (mode === "republish") {
    // Le brief publié est figé : on ne demande pas de le modifier, on fait confirmer les points ou on en reste à la page actuelle.
    if (finalReview.blockers.length > 0) {
      throw new PublishRefusedError(`La page régénérée contient une affirmation non étayée : ${finalReview.blockers.map((point) => point.title).join(" ; ")}. Votre site actuel reste en ligne ; demandez à Camille un nouveau contenu de site pour la corriger.`, 409);
    }
    if (finalReview.missingAcknowledgements.length > 0) {
      throw new SiteReviewRequiredError(
        "Avant de republier, confirmez ce point de la page régénérée. Votre site actuel reste en ligne en attendant.",
        finalReview.missingAcknowledgements.map((point) => ({ id: point.id, title: point.title, detail: [point.evidence, point.expectedAction].filter(Boolean).join(" — ") })),
      );
    }
    return html;
  }
  if (finalReview.blockers.length > 0) {
    throw new PublishRefusedError(`Le site généré contient une affirmation non étayée : ${finalReview.blockers.map((point) => point.title).join(" ; ")}. Modifiez le brief avant de réessayer.`, 409);
  }
  if (finalReview.missingAcknowledgements.length > 0) {
    throw new PublishRefusedError(`Le site généré ajoute un point factuel à vérifier : ${finalReview.missingAcknowledgements.map((point) => point.title).join(" ; ")}. Modifiez le brief pour le préciser ou le retirer avant de réessayer.`, 409);
  }
  return html;
}

export async function publishSiteFromProposal(proposalId: string, expectedVersion: number, acknowledgedReviewIds: string[] = []) {
  const proposal = await prisma.agentProposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { company: true },
  });

  if (proposal.kind !== "site_web_content") {
    throw new Error("Seule une proposition de contenu de site peut être publiée.");
  }
  // L'autorisation porte sur une version précise, pas sur le seul libellé du statut (US #171).
  const humanApproved = ["validee", "modifiee"].includes(proposal.status) && proposal.approvedVersion === proposal.version;
  if (humanApproved && expectedVersion !== proposal.version) {
    throw new PublishRefusedError("La version affichée n'est plus la version approuvée. Rechargez la page avant de publier.", 409);
  }
  const riskSettings = await getConfiguredRiskLevels();
  if (!canExecuteAction(proposal.kind, "accompagner", humanApproved, { publicExposure: true }, riskSettings[proposal.kind])) {
    throw new PublishRefusedError("Approuvez cette version du site avant de la publier.", 400);
  }

  const company = proposal.company;
  const html = await generateSiteHtml(company, proposal.content, acknowledgedReviewIds);

  let slug = company.siteSlug ?? slugify(company.name);
  if (!company.siteSlug) {
    const taken = await prisma.company.findUnique({ where: { siteSlug: slug } });
    if (taken && taken.id !== company.id) slug = `${slug}-${company.id.slice(-6)}`;
  }

  const detail = `Site publié depuis la version ${proposal.version} : /site/${slug}`;
  await prisma.$transaction(async (tx) => {
    // Le brief a pu changer pendant la génération : on ne publie que si la version approuvée est toujours la courante.
    const { count } = await tx.agentProposal.updateMany({
      where: { id: proposal.id, version: proposal.version, approvedVersion: proposal.version, status: { in: ["validee", "modifiee"] } },
      data: { status: "executee" },
    });
    if (count === 0) {
      throw new PublishRefusedError("Le site a été modifié pendant la préparation. Relisez et approuvez la nouvelle version avant de publier.", 409);
    }
    await tx.company.update({
      where: { id: company.id },
      data: { siteSlug: slug, siteHtml: html, sitePublishedAt: new Date() },
    });
    await tx.executionLog.upsert({
      where: { proposalId: proposal.id },
      create: { proposalId: proposal.id, result: "succes", detail },
      update: { result: "succes", detail, executedAt: new Date() },
    });
  });

  return { slug };
}

/**
 * « Republier avec les photos » (story 5.5) : régénère la page depuis le dernier brief publié
 * (version approuvée, figée une fois exécutée), avec les photos actuelles. Même revue des
 * affirmations, même réservation qu'une mise en ligne. Le brief n'est pas réécrit.
 */
export async function republishSite(companyId: string, acknowledgedReviewIds: string[] = []) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (!company.siteSlug || !company.siteHtml) {
    throw new PublishRefusedError("Aucun site n'est encore en ligne. Approuvez puis mettez en ligne un contenu de site d'abord.", 409);
  }
  const lastPublication = await prisma.executionLog.findFirst({
    where: { result: "succes", proposal: { companyId, kind: "site_web_content", status: "executee" } },
    orderBy: { executedAt: "desc" },
    include: { proposal: true },
  });
  const proposal = lastPublication?.proposal;
  if (!proposal || proposal.approvedVersion !== proposal.version) {
    throw new PublishRefusedError("Le contenu approuvé du site est introuvable. Approuvez un nouveau contenu de site avant de republier.", 409);
  }
  // Même contrôle de risque que la mise en ligne : la version publiée a été approuvée par le dirigeant.
  const riskSettings = await getConfiguredRiskLevels();
  if (!canExecuteAction(proposal.kind, "accompagner", true, { publicExposure: true }, riskSettings[proposal.kind])) {
    throw new PublishRefusedError("La republication n'est pas autorisée pour ce type de contenu.", 400);
  }

  const html = await generateSiteHtml(company, proposal.content, acknowledgedReviewIds, "republish");
  const now = new Date();
  const photoCount = await prisma.sitePhoto.count({ where: { companyId } });
  await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { siteHtml: html, sitePublishedAt: now } }),
    prisma.executionLog.update({
      where: { proposalId: proposal.id },
      data: { executedAt: now, detail: `Site republié depuis la version ${proposal.version} avec ${photoCount} photo${photoCount > 1 ? "s" : ""} : /site/${company.siteSlug}` },
    }),
  ]);
  return { slug: company.siteSlug };
}
