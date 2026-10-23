import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext, rejectedDuplicateNotice } from "@/lib/agents/rejection-context";
import { getFindingsContextForContent } from "@/lib/agents/findings-context";
import { ensureAgentProduced } from "@/lib/agents/agent-errors";
import { recordUsage, runToolLoop } from "@/lib/usage";
import {
  PERSONAS,
  objectiveLine,
  directionLine,
  briefLine,
  companyProfileLines,
  runtimeContextLines,
  type AgentRunOptions,
} from "@/lib/agents/personas";

const AGENT_NAME = "contenu";
const PERSONA = PERSONAS.contenu;

/**
 * Agent "Contenu & Site" (Camille) — recentrée le 2026-10-05 (rationalisation
 * de l'équipe) sur la production créative : posts réseaux sociaux (ex
 * Martine) et contenu/site web (ex Camille "visibilité locale"). S'appuie
 * sur les derniers constats de Martine (AuditFinding) plutôt que de partir
 * de zéro. newsContext optionnel : si absent, génère ses propres idées
 * sans inventer d'événement. Propose uniquement, jamais d'exécution directe.
 */
export async function runContenuAgent(
  companyId: string,
  newsContext?: string,
  options: AgentRunOptions = {},
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const createdProposalIds: string[] = [];

  const proposeContent = betaZodTool({
    name: "propose_content",
    description:
      "Enregistre une proposition de contenu (post réseau social ou brief de site web), en attente de validation humaine. N'exécute rien directement.",
    inputSchema: z.object({
      kind: z
        .enum(["social_post", "site_web_content"])
        .describe(
          "social_post = post Instagram/Facebook complet. site_web_content = brief de contenu pour un site d'une page (titres, textes, structure) — pas de code, BienDecider le met en page après validation.",
        ),
      title: z.string().describe("Titre court de la proposition, affiché dans le cockpit"),
      content: z
        .string()
        .describe("Contenu complet, prêt à être relu et validé (pour un post : légende + visuel suggéré + date)"),
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

  // Même découpage statique/dynamique que les autres agents (cf.
  // marketing.ts) pour le prompt caching : le site déclaré et le profil ne
  // changent qu'en cas de modification des réglages de l'entreprise, donc
  // restent dans le bloc mis en cache ; seuls le brief et les constats de
  // Martine (requêtés à chaque appel) changent run après run.
  const stableSystem = `Tu es ${PERSONA.name}, ${PERSONA.role} de BienDecider, un copilote IA pour indépendants et TPE. ${PERSONA.trait}
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}
Site web déclaré : ${company.website ?? "aucun"}. ${
    company.website
      ? ""
      : "Aucun site déclaré : inclus une proposition site_web_content — un brief complet (titre accrocheur, présentation, 3 à 5 services, zone d'intervention, preuve/certifications, appel à l'action avec téléphone)."
  }

Ton rôle : produire 2 à 3 propositions de contenu concrètes (posts et/ou contenu de site) via propose_content.
Règles strictes :
- Tu ne fais QUE proposer, JAMAIS publier ou exécuter toi-même, même automatiquement.
- Pour le site, tu fournis uniquement le contenu (texte, structure) — pas de code, BienDecider le publie après validation.
- Si une actualité réelle t'est fournie, appuie-toi exclusivement sur elle — n'invente jamais un événement, une offre ou un chiffre.
- Si aucune actualité n'est fournie, génère tes propres idées honnêtes (conseil pratique, présentation d'un service, FAQ) — jamais un faux événement présenté comme réel.
- Une proposition = un contenu complet et directement utilisable, pas de placeholder "[à compléter]".`;

  // Date du jour et nom du dirigeant : hors du bloc mis en cache.
  const dynamicSystem = `${runtimeContextLines(company, new Date())}
${await getRejectionContext(companyId)}
${briefLine(options.brief)}
${await getFindingsContextForContent(companyId)}`;

  const { finalMessage, usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 6000,
    tools: [proposeContent],
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicSystem },
    ],
    messages: [
      {
        role: "user",
        content: newsContext
          ? `Actualité à communiquer : ${newsContext}\n\nPropose le contenu correspondant.`
          : "Aucune actualité particulière. Propose tes propres idées de contenu.",
      },
    ],
  }));

  await recordUsage({ companyId: company.id, agentRunId: options.agentRunId, agent: AGENT_NAME, model: AGENT_MODEL, usage });

  ensureAgentProduced(PERSONA.name, createdProposalIds.length, { stopReason: finalMessage.stop_reason, usage });

  return prisma.agentProposal.findMany({
    where: { id: { in: createdProposalIds } },
  });
}
