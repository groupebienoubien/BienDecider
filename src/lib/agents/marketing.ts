import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext, rejectedDuplicateNotice } from "@/lib/agents/rejection-context";
import { ensureAgentProduced } from "@/lib/agents/agent-errors";
import { facebookAuditSource } from "@/lib/facebook-audit-source";
import { recordUsage, runToolLoop } from "@/lib/usage";
import {
  PERSONAS,
  objectiveLine,
  directionLine,
  briefLine,
  companyProfileLines,
  type AgentRunOptions,
} from "@/lib/agents/personas";

const AGENT_NAME = "marketing";
const PERSONA = PERSONAS.marketing;

/**
 * Agent "Marketing Officer" (Martine) — fusion de l'ancienne Nadia (audit,
 * positionnement concurrentiel) et du pilotage de la fiche Google (ancienne
 * Camille), décidée le 2026-10-05 pour rationaliser l'équipe. Diagnostique
 * et pilote la présence Google ; ne produit pas de contenu créatif
 * (posts, site) — ça reste le rôle de Camille, qui s'appuie sur les
 * constats produits ici. Comme les autres agents : propose uniquement,
 * jamais d'exécution directe.
 */
export async function runMarketingAgent(
  companyId: string,
  options: AgentRunOptions = {},
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const createdFindingIds: string[] = [];
  const createdProposalIds: string[] = [];

  const recordFinding = betaZodTool({
    name: "record_audit_finding",
    description:
      "Enregistre un constat d'audit ou de positionnement concurrentiel, structuré en 4 parties lisibles (pas une action à valider, juste un état des lieux).",
    inputSchema: z.object({
      category: z
        .enum(["site_web", "reseaux_sociaux", "concurrence"])
        .describe("Catégorie du constat — concurrence = positionnement face à un concurrent identifié"),
      title: z.string().describe("Titre court et concret du constat"),
      summary: z
        .string()
        .describe(
          "Résumé en 1-2 phrases MAXIMUM, affiché sur une carte compacte sans le détail — doit donner l'essentiel à lui seul.",
        ),
      whatWorks: z
        .string()
        .describe(
          "Ce qui fonctionne bien, en 1-3 phrases factuelles. Si rien de notable, écris-le explicitement (ex: \"Rien de particulier ne se distingue\") plutôt que d'inventer un point positif.",
        ),
      toImprove: z
        .string()
        .describe("Ce qu'il faut améliorer, en 2-4 phrases factuelles et concrètes — pas de jargon marketing creux."),
      sourceUrl: z.string().url().optional().describe("URL effectivement consultée pour étayer ce constat"),
      sourceStatus: z.enum(["consultée", "accès limité", "indisponible"]).optional().describe("Résultat réel de consultation de la source"),
      actionItems: z
        .array(
          z.object({
            agent: z
              .enum(["marketing", "contenu", "demarchage"])
              .describe("Agent qui réaliserait cette action : marketing (fiche Google), contenu (posts/site), demarchage (prospection)"),
            title: z.string().describe("Action concrète et courte, ex: \"Mettre la carte en texte HTML\""),
            rationale: z.string().describe("Pourquoi cette action, en lien direct avec ce constat"),
                      theme: z.enum(["Visibilité", "Conversion", "Prospection"]).describe("But principal de l'action, pas le canal ou l'agent"),
                      priority: z.number().int().min(1).max(5).describe("Priorité de 1 (la plus urgente) à 5"),
          }),
        )
        .max(3)
        .describe("0 à 3 actions concrètes pour corriger ce qui a été constaté — le dirigeant pourra les ajouter au plan en un clic."),
    }),
    run: async (input) => {
      const finding = await prisma.auditFinding.create({
        data: {
          companyId: company.id,
          agentRunId: options.agentRunId,
          category: input.category,
          title: input.title,
          content: input.summary,
          whatWorks: input.whatWorks,
          toImprove: input.toImprove,
          actionItems: input.actionItems,
          sourceUrl: input.sourceUrl,
          sourceStatus: input.sourceStatus,
        },
      });
      createdFindingIds.push(finding.id);
      return `Constat enregistré (id: ${finding.id}).`;
    },
  });

  const proposeAction = betaZodTool({
    name: "propose_action",
    description:
      "Enregistre une proposition de mise à jour de la fiche Google, en attente de validation humaine. N'exécute rien directement.",
    inputSchema: z.object({
      kind: z
        .enum(["gbp_update", "review_reply"])
        .describe(
          "gbp_update = mise à jour d'une information structurée de la fiche Google Business Profile (horaires, catégorie, services...). review_reply = réponse suggérée à un avis client.",
        ),
      title: z.string().describe("Titre court de la proposition, affiché dans le cockpit"),
      content: z
        .string()
        .describe("Contenu complet de la proposition, prêt à être relu et validé par l'utilisateur"),
    }),
    run: async (input) => {
      const alreadyRejected = await rejectedDuplicateNotice(company.id, { kind: input.kind, title: input.title, content: input.content });
      if (alreadyRejected) return alreadyRejected;
      const proposal = await prisma.agentProposal.create({
        data: {
          companyId: company.id,
          agentRunId: options.agentRunId,
          agent: AGENT_NAME,
          kind: input.kind,
          title: input.title,
          content: input.content,
          planItemId: options.planItemId,
        },
      });
      createdProposalIds.push(proposal.id);
      return `Proposition enregistrée (id: ${proposal.id}), en attente de validation.`;
    },
  });

  // L'URL ne doit JAMAIS être donnée uniquement dans le system prompt : l'outil
  // web_fetch refuse de récupérer une URL qui n'est pas déjà apparue dans le
  // contexte (message utilisateur ou résultat d'un outil précédent) — erreur
  // "url_not_in_prior_context", observée en prod (La Tonnelle, 2026-10-07) :
  // Martine n'avait lu qu'un extrait partiel via web_search au lieu du site
  // réel. Corrigé en mettant l'URL dans le message utilisateur ci-dessous,
  // où web_fetch peut la voir, et en imposant un repli par web_search avant
  // tout constat "site inaccessible" — jamais une lecture partielle acceptée
  // comme suffisante.
  const websiteInstruction = company.website
    ? `Un site web est déclaré pour cette entreprise (son URL est donnée dans le message ci-dessous, pas ici) : utilise l'outil web_fetch pour le consulter EN ENTIER (page d'accueil, horaires, menu/services, contact) avant de conclure quoi que ce soit — une lecture partielle (ex: un seul extrait trouvé via web_search) n'est jamais suffisante. Si web_fetch échoue (erreur technique, page inaccessible), n'abandonne pas : fais une recherche web_search sur le nom de l'entreprise pour retrouver son contenu autrement. Ne signale "site inaccessible" qu'après avoir réellement essayé les deux.`
    : `Aucun site web n'a été déclaré. Enregistre un constat "site_web" signalant l'absence de site comme premier axe d'amélioration, sans inventer de contenu.`;
  const facebookUrl = facebookAuditSource(company.name, company.socialHandles);
  const facebookInstruction = facebookUrl
    ? `Page Facebook à auditer réellement : ${facebookUrl}. Essaie web_fetch avec cette URL exacte. Si Facebook ne révèle qu'une page de connexion ou masque les publications, crée quand même un constat reseaux_sociaux avec sourceUrl=${facebookUrl}, sourceStatus="accès limité", en disant explicitement que l'activité et la qualité des publications ne peuvent pas être confirmées depuis l'accès public. Ne remplace pas cela par un avertissement générique et n'invente aucun post, date, avis ou statistique.`
    : "Aucune URL Facebook propre à l'entreprise n'est identifiée ; ne lui attribue pas une page trouvée par simple similarité de nom.";

  // Système scindé en deux blocs pour le prompt caching (cf. doc Tool Runner /
  // prompt caching) : le bloc stable (persona, profil entreprise, règles) ne
  // change pas d'un run à l'autre pour une même entreprise — seul le bloc
  // final (brief ponctuel transmis par Paul) varie par appel. Le cache_control
  // sur le dernier bloc met aussi en cache les définitions d'outils
  // (tools -> system -> messages, dans cet ordre de rendu).
  const stableSystem = `Tu es ${PERSONA.name}, ${PERSONA.role} de BienDecider, un copilote IA pour indépendants et TPE. ${PERSONA.trait}
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
Réseaux sociaux déclarés : ${company.socialHandles ?? "aucun"}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Ton rôle a deux volets, à faire tous les deux sauf si un brief ci-dessous te demande de te concentrer sur un seul :
1. Diagnostic : état des lieux honnête de la présence en ligne (site, réseaux) ET du positionnement face à 2-3 concurrents réels locaux — outil record_audit_finding.
2. Pilotage de la fiche Google : propositions concrètes de mise à jour (infos structurées, pas de texte créatif long) et réponses aux avis — outil propose_action.
Règles strictes :
- Tu ne produis PAS de contenu créatif (posts réseaux sociaux, contenu de site) — c'est le rôle de ${PERSONAS.contenu.name}, qui s'appuiera sur tes constats.
- ${websiteInstruction}
- ${facebookInstruction}
- Si le site est inaccessible, signale-le comme un constat factuel, ne devine jamais son contenu.
- Utilise web_search pour identifier des concurrents réels (ex: "${company.trade} ${company.servingArea}") — cite tes sources, n'invente jamais de concurrent.
- Tu ne fais QUE proposer/constater, jamais exécuter directement.
- Pas de jargon marketing creux : chaque constat ou proposition doit être concret et actionnable.
- Un seul constat large et structuré par sujet (site, réseaux, concurrence) vaut mieux que plusieurs constats fragmentés — le dirigeant doit pouvoir tout comprendre en ouvrant une seule carte.`;

  const { finalMessage, usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    // Plus elevé que les autres agents : Martine fait a la fois diagnostic
    // (web_fetch/web_search) ET propositions GBP en un seul passage, ce qui
    // consomme plus de tours d'outils — un run vide a ete observe a 4000.
    max_tokens: 8000,
    tools: [
      recordFinding,
      proposeAction,
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    ],
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: await getRejectionContext(companyId) },
      ...(options.brief ? [{ type: "text" as const, text: briefLine(options.brief) }] : []),
    ],
    messages: [
      {
        role: "user",
        content: [
          "Fais le point sur la présence en ligne de cette entreprise et pilote sa fiche Google.",
          company.website ? `Site web à consulter avec web_fetch : ${company.website}` : null,
          facebookUrl ? `Page Facebook à consulter avec web_fetch : ${facebookUrl}` : null,
        ].filter(Boolean).join("\n\n"),
      },
    ],
  }));

  await recordUsage({ companyId: company.id, agentRunId: options.agentRunId, agent: AGENT_NAME, model: AGENT_MODEL, usage });

  // Plus de constat "Analyse incomplète" créé à la place d'une erreur : il
  // faisait passer un échec pour un diagnostic, et l'action du plan pour traitée.
  ensureAgentProduced(PERSONA.name, createdFindingIds.length + createdProposalIds.length, { stopReason: finalMessage.stop_reason, usage });

  const [findings, proposals] = await Promise.all([
    prisma.auditFinding.findMany({ where: { id: { in: createdFindingIds } } }),
    prisma.agentProposal.findMany({ where: { id: { in: createdProposalIds } } }),
  ]);
  return { findings, proposals };
}
