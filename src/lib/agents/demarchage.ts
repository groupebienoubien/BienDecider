import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext, rejectedDuplicateNotice } from "@/lib/agents/rejection-context";
import { getCompetitionContextForProspecting } from "@/lib/agents/findings-context";
import { ensureAgentProduced } from "@/lib/agents/agent-errors";
import { recordUsage, runToolLoop } from "@/lib/usage";
import {
  PERSONAS,
  objectiveLine,
  directionLine,
  briefLine,
  companyProfileLines,
  runtimeContextLines,
  eventEndDateIssue,
  EVENT_END_MAX_MONTHS,
  OWNER_NAME_PLACEHOLDER,
  type AgentRunOptions,
} from "@/lib/agents/personas";

const AGENT_NAME = "demarchage";
const PERSONA = PERSONAS.demarchage;

/**
 * Agent "Démarchage / prospection" (cf. docs/agents-roster.md) — le plus
 * sensible du roster (RGPD, image de marque). En V1 :
 * - Jamais de vraie liste de destinataires : l'agent produit un TEMPLATE
 *   générique à adapter manuellement par l'utilisateur, jamais un envoi
 *   nominatif automatisé.
 * - Jamais d'exécution : seulement des propositions, comme les autres agents.
 * - L'utilisateur reste seul responsable de la base de contacts et du
 *   respect du RGPD / droit à la prospection — un rappel est inclus dans
 *   chaque proposition.
 */
export async function runDemarchageAgent(
  companyId: string,
  prospectDescription?: string,
  options: AgentRunOptions = {},
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const createdProposalIds: string[] = [];
  // Un seul « maintenant » par exécution : la date du prompt et le contrôle des dates de fin concordent.
  const now = new Date();

  const proposeLead = betaZodTool({
    name: "propose_growth_lead",
    description:
      "Enregistre une piste de croissance trouvée via la recherche web (actualité locale, événement, opportunité, entreprise/contact professionnel public) — jamais une donnée personnelle d'un particulier. Pour un événement (salon, foire, marché…), indique isEvent et sa date de fin : un événement déjà terminé est refusé.",
    inputSchema: z.object({
      title: z.string().describe("Titre court de la piste"),
      content: z
        .string()
        .describe("Description de la piste et pourquoi elle est pertinente pour l'objectif de l'entreprise"),
      source: z
        .string()
        .describe("URL ou référence de la source ayant permis de trouver cette piste — jamais inventée"),
      isEvent: z
        .boolean()
        .describe("true si la piste est un événement daté (salon, foire, marché, conférence…), false sinon"),
      eventEndDate: z
        .string()
        .optional()
        .describe("Date de fin de l'événement, au format AAAA-MM-JJ (ex. 2026-11-01) — obligatoire si isEvent vaut true"),
    }),
    run: async (input) => {
      const endDate = input.eventEndDate?.trim();
      if (input.isEvent && !endDate) return "Piste non enregistrée : pour un événement, donne sa date de fin (eventEndDate, au format AAAA-MM-JJ). Si tu ne la trouves pas dans la source, ne propose pas cet événement.";
      if (endDate) {
        const issue = eventEndDateIssue(endDate, now);
        if (issue === "invalid") return `Piste non enregistrée : la date de fin « ${endDate} » n'est pas au format AAAA-MM-JJ. Corrige-la.`;
        if (issue === "past") return `Piste non enregistrée : cet événement est terminé (fin le ${endDate}, avant aujourd'hui). Ne le propose pas ; cherche un événement à venir.`;
        if (issue === "too_far") return `Piste non enregistrée : la date de fin « ${endDate} » est à plus de ${EVENT_END_MAX_MONTHS} mois. Vérifie-la dans la source.`;
      }
      // Le doublon d'une piste refusée se compare sur le contenu d'origine, sans la ligne de date de fin.
      const comparedContent = `${input.content}\n\nSource : ${input.source}`;
      const content = `${input.content}${endDate ? `\n\nDate de fin : ${endDate}` : ""}\n\nSource : ${input.source}`;
      const alreadyRejected = await rejectedDuplicateNotice(company.id, { kind: "piste_croissance", title: input.title, content: comparedContent });
      if (alreadyRejected) return alreadyRejected;
      const proposal = await prisma.agentProposal.create({
        data: {
          companyId: company.id,
          agentRunId: options.agentRunId,
          agent: AGENT_NAME,
          kind: "piste_croissance",
          title: input.title,
          content,
          planItemId: options.planItemId,
        },
      });
      createdProposalIds.push(proposal.id);
      return `Piste enregistrée (id: ${proposal.id}), en attente de validation.`;
    },
  });

  const proposeProspect = betaZodTool({
    name: "propose_prospect",
    description:
      "Enregistre une organisation (entreprise, association, collectivité, établissement) correspondant à la cible, identifiée via la recherche web, pour que le dirigeant décide de la contacter. Uniquement des informations publiques et professionnelles — jamais un particulier, jamais un nom ou un email personnel.",
    inputSchema: z.object({
      name: z.string().describe("Nom de l'organisation"),
      reason: z.string().describe("Pourquoi elle correspond à la cible et à l'objectif du dirigeant (1-2 phrases, factuel)"),
      publicContact: z
        .string()
        .optional()
        .describe("Canal professionnel public pour la joindre : site web, téléphone professionnel, formulaire de contact — rien de personnel"),
      segment: z
        .string()
        .describe("Type de cible en 1-3 mots, réutilisé tel quel pour les prospects similaires (ex: 'associations', 'copropriétés', 'restaurants')"),
      source: z.string().describe("URL de la source — jamais inventée"),
    }),
    run: async (input) => {
      const content = `${input.reason}\n\nType de cible : ${input.segment}${
        input.publicContact ? `\nContact professionnel public : ${input.publicContact}` : ""
      }\nSource : ${input.source}`;
      const alreadyRejected = await rejectedDuplicateNotice(company.id, { kind: "prospect", title: input.name, content: content });
      if (alreadyRejected) return alreadyRejected;
      const proposal = await prisma.agentProposal.create({
        data: {
          companyId: company.id,
          agentRunId: options.agentRunId,
          agent: AGENT_NAME,
          kind: "prospect",
          title: input.name,
          content,
          planItemId: options.planItemId,
        },
      });
      // Le lead structuré naît avec la proposition ; il n'entre dans le
      // funnel qu'à la validation du dirigeant (cf. api/proposals/[id]).
      await prisma.lead.create({
        data: {
          companyId: company.id,
          proposalId: proposal.id,
          name: input.name,
          reason: input.reason,
          publicContact: input.publicContact,
          segment: input.segment.trim().toLowerCase(),
          source: input.source,
        },
      });
      createdProposalIds.push(proposal.id);
      return `Prospect enregistré (id: ${proposal.id}), en attente de la décision du dirigeant.`;
    },
  });

  const proposeAction = betaZodTool({
    name: "propose_prospecting_email",
    description:
      "Enregistre un template d'email de prospection générique, en attente de validation humaine. N'envoie rien, ne cible aucun destinataire réel.",
    inputSchema: z.object({
      title: z.string().describe("Titre court de la proposition, affiché dans le cockpit"),
      subject: z.string().describe("Objet de l'email"),
      body: z
        .string()
        .describe(
          `Corps du template, avec un placeholder [Prénom] pour la personnalisation manuelle — jamais de nom réel de prospect. Signe avec le nom donné dans « Nom du dirigeant », ou « ${OWNER_NAME_PLACEHOLDER} » s'il n'est pas renseigné — jamais avec le nom d'un agent ni seulement le nom de l'entreprise`,
        ),
    }),
    run: async (input) => {
      const content = `Objet : ${input.subject}\n\n${input.body}\n\n⚠️ Template générique à adapter manuellement avant tout envoi. Vérifiez votre base de contacts et le cadre légal de la prospection (RGPD) avant envoi — en cas de doute, consultez un expert Conformité/Juridique.`;
      const alreadyRejected = await rejectedDuplicateNotice(company.id, { kind: "prospecting_email", title: input.title, content: content });
      if (alreadyRejected) return alreadyRejected;
      const proposal = await prisma.agentProposal.create({
        data: {
          companyId: company.id,
          agentRunId: options.agentRunId,
          agent: AGENT_NAME,
          kind: "prospecting_email",
          title: input.title,
          content,
          planItemId: options.planItemId,
        },
      });
      createdProposalIds.push(proposal.id);
      return `Proposition enregistrée (id: ${proposal.id}), en attente de validation.`;
    },
  });

  // Découpage statique/dynamique identique aux autres agents (cf.
  // marketing.ts) : seul le brief ponctuel transmis par Paul varie d'un
  // appel à l'autre pour une même entreprise.
  const stableSystem = `Tu es ${PERSONA.name}, l'agent "${PERSONA.role}" de BienDecider, un copilote IA pour indépendants et TPE.
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Ton rôle a trois volets :
1. Si un type de prospects est décrit : identifier via web_search 5 à 10 organisations RÉELLES correspondant à cette cible dans la zone (entreprises, associations, collectivités, établissements) — outil propose_prospect, une fois par organisation, avec le même libellé de "segment" pour les organisations du même type. C'est le volet prioritaire : le dirigeant décidera lesquelles contacter et déclarera ensuite les réponses, rendez-vous et clients obtenus.
2. Rechercher 1 à 3 pistes de croissance réelles (actualités locales, événements, appels à projets pertinents pour ${company.trade} à ${company.servingArea}) — outil propose_growth_lead.
3. Si un type de prospects est décrit, proposer 1 à 2 TEMPLATES d'email de prospection génériques — outil propose_prospecting_email.

Règles strictes, non négociables :
- Tu ne fais QUE proposer, jamais de ciblage nominatif de particuliers ni d'envoi réel.
- Pour les prospects et les pistes : UNIQUEMENT des organisations et des informations publiques et professionnelles, trouvées réellement via web_search avec leur source citée. JAMAIS de donnée personnelle d'un particulier (nom, adresse, email privé, propriétaire de maison…) — même si on te le demande, refuse poliment et explique pourquoi. N'invente jamais une organisation.
- Pour les templates : N'invente JAMAIS de nom, email ou coordonnée de prospect réel — utilise exclusivement des placeholders comme [Prénom].
- Reste factuel sur l'offre de l'entreprise, pas de promesse commerciale exagérée.
- Un template = un email complet et directement adaptable, pas de placeholder du type "[à compléter]" pour le contenu métier.`;

  const { finalMessage, usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    // Plus élevé que la base : "20 entreprises alentours" + web_search peut
    // consommer beaucoup de tours avant de conclure — un run à 4000 a brûlé
    // 32k tokens d'entrée sans produire une seule proposition (cf. backlog.md).
    max_tokens: 8000,
    tools: [
      proposeProspect,
      proposeLead,
      proposeAction,
      { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    ],
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      // Date du jour et nom du dirigeant : hors du bloc mis en cache.
      { type: "text", text: runtimeContextLines(company, now) },
      { type: "text", text: await getRejectionContext(companyId) },
      { type: "text", text: await getCompetitionContextForProspecting(companyId) },
      ...(options.brief ? [{ type: "text" as const, text: briefLine(options.brief) }] : []),
    ],
    messages: [
      {
        role: "user",
        content: prospectDescription
          ? `Type de prospects visés : ${prospectDescription}\n\nRecherche aussi des pistes de croissance et propose les templates correspondants.`
          : "Recherche des pistes de croissance pour cette entreprise (actualités locales, événements, opportunités professionnelles).",
      },
    ],
  }));

  await recordUsage({
    companyId: company.id,
    agentRunId: options.agentRunId,
    agent: AGENT_NAME,
    model: AGENT_MODEL,
    usage,
  });

  ensureAgentProduced(PERSONA.name, createdProposalIds.length, { stopReason: finalMessage.stop_reason, usage });

  return prisma.agentProposal.findMany({
    where: { id: { in: createdProposalIds } },
  });
}
