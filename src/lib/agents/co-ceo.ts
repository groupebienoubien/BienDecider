import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaToolRunnerParams } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext } from "@/lib/agents/rejection-context";
import { AgentRunQuotaError, classifyRunError, failureMessage, isRunFailureReason, type RunFailureReason } from "@/lib/agents/agent-errors";
import { PERSONAS, objectiveLine, directionLine, companyProfileLines } from "@/lib/agents/personas";
import { enqueuePlanRun } from "@/lib/agent-runs";
import { createChatPlanItem, findLaunchablePlanItem, type PlanAgent } from "@/lib/agents/plan-items";
import { PLAN_THEMES, type PlanTheme } from "@/lib/plan-themes";
import { recordUsage, runStreamingToolLoop, runToolLoop } from "@/lib/usage";
import { getFunnelStats, funnelLines } from "@/lib/funnel";
import { CAPABILITY_CATALOG, recordUncoveredRequest } from "@/lib/agents/capabilities";
import { getChatInstructionsForPlan, loadRecentChatHistory } from "@/lib/agents/chat-context";
import { getTeamState } from "@/lib/team-state";
import { resolvePaulReferences } from "@/lib/paul-references";
import { attachPendingActions, cancelOrphanPendingActions, createPendingAction, recentPendingActions } from "@/lib/agents/pending-actions";
import { LAUNCH_EXTRA_MAX, MAX_AMOUNT, PROFILE_PAGE_ONLY_MESSAGE, type PendingActionType, profileUpdateToolSchema, readProfileToolInput, updateObjectivePayloadSchema, updateProfilePayloadSchema } from "@/lib/agents/pending-action-view";

const PERSONA = PERSONAS.co_ceo;

/**
 * Outil commun au chat et au plan : noter une demande hors catalogue pour
 * les pères fondateurs. N'exécute rien et ne promet rien au dirigeant.
 */
function uncoveredRequestTool(companyId: string, source: "chat" | "plan") {
  return betaZodTool({
    name: "record_uncovered_request",
    description:
      "Note pour les fondateurs de BienDecider une demande ou un objectif du dirigeant qu'aucun agent ne couvre. À appeler une fois par besoin non couvert, après l'avoir dit au dirigeant — jamais pour une demande que l'équipe sait traiter.",
    inputSchema: z.object({
      request: z.string().describe("Le besoin non couvert, en une ou deux phrases, sans nom ni coordonnée de personne"),
      closestAlternative: z.string().optional().describe("Ce que tu as proposé à la place parmi ce que l'équipe sait faire — omettre si rien ne s'en rapproche"),
    }),
    run: async (input) => {
      await recordUncoveredRequest(companyId, source, input.request, input.closestAlternative);
      return "Demande notée pour les fondateurs de BienDecider. Aucun délai ni résultat n'est promis : dis-le tel quel au dirigeant.";
    },
  });
}

/**
 * État lu par Paul via get_current_status : actions et exécutions viennent
 * de getTeamState, la lecture unique partagée avec le menu et l'accueil.
 */
export async function buildCurrentStatus(companyId: string) {
  const [teamState, funnel, pending, findings, leads, cards] = await Promise.all([
    getTeamState(companyId),
    getFunnelStats(companyId),
    prisma.agentProposal.findMany({
      where: { companyId, status: "en_attente" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditFinding.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.lead.findMany({
      where: { companyId, stage: { notIn: ["propose", "ecarte"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, stage: true },
    }),
    recentPendingActions(companyId),
  ]);
  return {
    planEnCours: teamState.actions,
    executionsRecentes: teamState.recentRuns,
    decisionsEnAttente: teamState.pendingDecisions,
    suiviProspects: funnelLines(funnel) || "Aucun prospect suivi pour l'instant.",
    refusRecents: await getRejectionContext(companyId),
    propositionsEnAttente: pending.map((p) => ({
      id: p.id,
      agent: p.agent,
      kind: p.kind,
      title: p.title,
      content: p.content,
    })),
    derniersConstatsAudit: findings.map((f) => ({
      id: f.id,
      title: f.title,
      content: f.content,
    })),
    prospectsSuivis: leads,
    // Dernières cartes proposées par Paul : pending = à confirmer, confirmed = enregistrée, cancelled = refusée
    // par le dirigeant, superseded = remplacée par une plus récente, expired = non décidée sous 24 h.
    cartesRecentes: cards,
  };
}

export type DelegationResult = {
  ok: boolean;
  /** Motif typé quand rien n'a été lancé ; absent si l'identifiant d'action passé par Paul n'était pas lançable. */
  reason?: RunFailureReason;
  message: string;
  runId?: string;
  planItemId?: string;
};

export type DelegationInput = {
  actionTitle: string;
  brief: string;
  outcome: string;
  theme: PlanTheme;
  priority: number;
  planItemId?: string;
};

const ACTIVE_RUN_STATUSES = ["queued", "running"];

/** Au plus 3 cartes par message de Paul, tous types confondus (objectif, profil, lancements). */
export const MAX_CARDS_PER_REPLY = 3;
export const CARDS_LIMIT_MESSAGE = `Aucune carte créée : ${MAX_CARDS_PER_REPLY} cartes sont déjà proposées dans cette réponse, c'est le maximum. Propose le reste au prochain message.`;

type LaunchExtras = { newsContext?: string; prospectDescription?: string };

/** Action déjà en cours : l'agent y travaille, rien n'est relancé. null si l'action n'est pas en cours. */
async function alreadyRunningResult(companyId: string, agent: PlanAgent, planItemId: string): Promise<DelegationResult | null> {
  const existing = await prisma.actionPlanItem.findFirst({ where: { id: planItemId, companyId, agent } });
  if (existing?.status !== "en_cours") return null;
  const activeRun = await prisma.agentRun.findFirst({
    where: { companyId, planItemId: existing.id, status: { in: ACTIVE_RUN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
  return {
    ok: false, reason: "already_running", message: failureMessage("already_running", PERSONAS[agent].name),
    ...(activeRun ? { runId: activeRun.id } : {}), planItemId: existing.id,
  };
}

/** Action écartée, terminée ou inconnue : erreur de l'appelant, pas un motif d'échec, donc pas de reason. */
function notLaunchableResult(agent: PlanAgent): DelegationResult {
  return {
    ok: false,
    message: `Aucune action à lancer avec cet identifiant pour ${PERSONAS[agent].name} : rien n'a été lancé. Relire le plan avec get_current_status avant de déléguer à nouveau.`,
  };
}

/**
 * Lancement d'une action du plan « à lancer » par le même chemin que le
 * bouton "Lancer" : relance d'une exécution échouée, motifs typés. Le
 * résultat porte le vrai motif d'un lancement non fait, jamais une panne
 * quand il n'y en a pas.
 */
async function launchItem(
  companyId: string,
  agent: PlanAgent,
  item: Awaited<ReturnType<typeof createChatPlanItem>>["item"],
  extras: LaunchExtras,
  launchedMessage: string,
): Promise<DelegationResult> {
  const agentName = PERSONAS[agent].name;
  const callStart = new Date();
  const alreadyRunning = (runId: string): DelegationResult => ({
    ok: false, reason: "already_running", message: failureMessage("already_running", agentName), runId, planItemId: item.id,
  });
  const stillOnPlan = ` L'action « ${item.title} » reste au plan, à lancer.`;
  try {
    const latest = await prisma.agentRun.findFirst({
      where: { companyId, planItemId: item.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (latest && ACTIVE_RUN_STATUSES.includes(latest.status)) return alreadyRunning(latest.id);
    // Une exécution échouée est relancée, par le même chemin que le bouton « Relancer l'action ».
    const retryRunId = latest?.status === "failed" ? latest.id : undefined;
    const run = await enqueuePlanRun({ companyId, item: { ...item, agent }, extras, retryRunId });
    // Une exécution active créée avant cet appel appartient à un autre lancement : l'agent y travaille déjà.
    if (ACTIVE_RUN_STATUSES.includes(run.status) && run.id !== retryRunId && run.createdAt.getTime() < callStart.getTime()) {
      return alreadyRunning(run.id);
    }
    if (run.status === "failed") {
      const reason = isRunFailureReason(run.failureReason) ? run.failureReason : "outage";
      return { ok: false, reason, message: failureMessage(reason, agentName) + stillOnPlan, runId: run.id, planItemId: item.id };
    }
    return {
      ok: true,
      message: `Action « ${item.title} » ${launchedMessage}. ${agentName} travaille en arrière-plan ; le résultat apparaîtra dans le plan.`,
      runId: run.id,
      planItemId: item.id,
    };
  } catch (error) {
    console.error(`Erreur délégation ${agent}:`, error);
    // classifyRunError ne renvoie null que pour un conflit « action non lançable » (écartée ou terminée
    // entre-temps) ; toute erreur inattendue (réseau, base…) y est classée outage.
    const reason = classifyRunError(error);
    if (reason === null) return notLaunchableResult(agent);
    // Le message d'un quota est déjà affichable et précise journalier, mensuel ou réservé.
    const message = error instanceof AgentRunQuotaError ? error.message : failureMessage(reason, agentName);
    return {
      ok: false, reason,
      message: message + (reason === "already_running" ? "" : stillOnPlan),
      planItemId: item.id,
    };
  }
}

/**
 * Lancement d'une action du plan, créée avec son brief ou reprise si elle y
 * figure déjà (chemin historique, gardé pour les appelants qui créent l'action).
 * Paul ne l'appelle jamais : ses outils ne créent que des cartes.
 */
export async function delegatePlanAction(
  companyId: string,
  agent: PlanAgent,
  input: DelegationInput,
  extras: LaunchExtras = {},
): Promise<DelegationResult> {
  if (input.planItemId) {
    const running = await alreadyRunningResult(companyId, agent, input.planItemId);
    if (running) return running;
    const item = await findLaunchablePlanItem(companyId, agent, input.planItemId);
    if (!item) return notLaunchableResult(agent);
    return launchItem(companyId, agent, item, extras, "du plan lancée");
  }
  // Une action active de même agent et même thème est reprise (AD-16), jamais recréée.
  const { item, reused } = await createChatPlanItem(companyId, agent, input.actionTitle, input.brief, input.theme, input.priority, input.outcome);
  if (reused) {
    const running = await alreadyRunningResult(companyId, agent, item.id);
    if (running) return running;
  }
  return launchItem(companyId, agent, item, extras, reused ? "déjà au plan lancée" : "ajoutée au plan et mise en cours");
}

/**
 * Clic « Lancer » sur une carte de Paul (pending-actions.ts) : lance l'action
 * du plan visée, telle qu'elle y figure, par le même chemin que delegatePlanAction.
 */
export async function launchPlanItemFromCard(companyId: string, agent: PlanAgent, planItemId: string, extras: LaunchExtras = {}): Promise<DelegationResult> {
  const running = await alreadyRunningResult(companyId, agent, planItemId);
  if (running) return running;
  const item = await findLaunchablePlanItem(companyId, agent, planItemId);
  if (!item) return notLaunchableResult(agent);
  return launchItem(companyId, agent, item, extras, "du plan lancée");
}

/**
 * Agent "Partenaire de croissance" (Paul, ex-"Co-CEO" — cf. docs/backlog.md) :
 * point de contact unique, orchestre les autres agents en les invoquant
 * comme des outils. Équipe rationalisée le 2026-10-05 : 4 agents
 * (Marketing/Contenu/Démarchage + lui-même), Nadia fusionnée dans Martine.
 * Garde-fou : ses outils ne créent que des cartes (propose_launch_*,
 * objectif, profil) ; aucune exécution avant le clic du dirigeant.
 */
export async function runCoCeoTurn(
  companyId: string,
  userMessage: string,
  reservationId?: string,
  pageContext?: string,
  // Si fourni, la réponse est produite en flux : le texte de chaque tour est transmis au fur et à mesure.
  stream?: { onTurnStart: () => void; onText: (delta: string) => void },
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  await prisma.chatMessage.create({
    data: { companyId, role: "user", content: userMessage },
  });

  const history = await loadRecentChatHistory(companyId);

  // Le dernier tour est marqué pour le prompt caching : chaque nouveau
  // message relit l'historique mis en cache au tour précédent plutôt que de
  // le refacturer en entier (cf. doc prompt caching — pattern "conversation
  // multi-tours"). Le système ci-dessous est lui-même entièrement stable
  // pour une entreprise donnée (aucune donnée recalculée par appel, Paul
  // passe par get_current_status plutôt que par un état injecté), donc mis
  // en cache en un seul bloc.
  // Le contexte de page change à chaque tour : il précède le dernier message sans entrer dans le bloc mis en cache.
  const messages: Anthropic.MessageParam[] = history.map((m, i) => ({
    role: m.role === "user" ? "user" : "assistant",
    content:
      i === history.length - 1
        ? [
            ...(pageContext ? [{ type: "text" as const, text: pageContext }] : []),
            { type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } },
          ]
        : m.content,
  }));

  const getCurrentStatus = betaZodTool({
    name: "get_current_status",
    description:
      "Récupère l'état réel actuel : actions actives du plan (planEnCours), exécutions des dernières 24 h et celles encore en cours (executionsRecentes), nombre de décisions en attente, suivi des prospects, propositions en attente (avec leur contenu) et derniers constats d'audit. Statuts du plan : propose = à lancer, en_cours = en cours d'exécution, lance = exécuté, productions à décider. decisionsEnAttente est le nombre total de productions qui attendent le dirigeant : à relire, mais aussi validées en attente de mise en ligne ou de publication incertaine à vérifier. propositionsEnAttente ne détaille que les productions encore à relire (statut en_attente), avec leur contenu. À utiliser systématiquement avant de répondre à toute question sur l'état, le plan, les prospects, le contenu ou le nombre de propositions/constats — ne jamais deviner ni se fier à ce qui a été dit dans un tour précédent.",
    inputSchema: z.object({}),
    run: async () => {
      return JSON.stringify(await buildCurrentStatus(companyId));
    },
  });

  const recordUncovered = uncoveredRequestTool(companyId, "chat");

  // Intentions créées pendant ce tour : rattachées au message de Paul enregistré à la fin.
  const createdActionIds: string[] = [];
  // Au plus MAX_CARDS_PER_REPLY cartes par réponse, tous types confondus. Le compteur est réservé
  // avant tout await (deux appels simultanés ne dépassent pas le plafond) et rendu si rien n'est créé.
  let cardsThisTurn = 0;
  /** Réserve une carte du tour ; la fonction renvoyée la rend, une seule fois quel que soit le nombre d'appels. null au-delà du plafond. */
  function reserveCard(): (() => void) | null {
    if (cardsThisTurn >= MAX_CARDS_PER_REPLY) return null;
    cardsThisTurn++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      cardsThisTurn--;
    };
  }

  // Une erreur de création n'est jamais renvoyée brute à Paul.
  const CARD_FAILED = "Aucune carte créée : réessaie.";
  async function createCard<T extends PendingActionType>(type: T, payload: Parameters<typeof createPendingAction<T>>[2]) {
    try {
      const action = await createPendingAction(companyId, type, payload);
      createdActionIds.push(action.id);
      return action;
    } catch (error) {
      console.error(`Création d'une carte ${type} impossible :`, error);
      return null;
    }
  }

  // Toute demande de travail depuis le chat passe par une action du plan et une carte « Lancer » :
  // rien n'est lancé avant le clic du dirigeant (delegatePlanAction n'est appelé qu'à la confirmation).
  const planActionFields = {
    actionTitle: z.string().describe("Titre court et concret de l'action demandée, tel qu'il apparaîtra dans le plan, ex: 'Trois posts sur les chantiers terminés'"),
    brief: z.string().describe("Ce que le dirigeant a demandé et pourquoi, en une ou deux phrases : c'est la consigne que l'agent devra réaliser"),
    outcome: z.string().max(160).describe("Résultat attendu, en une phrase courte écrite pour le dirigeant, sans consigne technique ni nom d'agent : c'est ce qu'il lira dans son plan"),
    theme: z.enum(PLAN_THEMES).describe("But principal : Visibilité, Conversion ou Prospection ; ne pas utiliser le nom de l'agent ou du canal"),
    priority: z.number().int().min(1).max(5).describe("Priorité de 1 (la plus urgente) à 5"),
    planItemId: z
      .string()
      .optional()
      .describe("Identifiant d'une action déjà au plan avec le statut 'propose' (lu via get_current_status) si la demande y correspond — la carte propose alors de la lancer au lieu d'en créer une seconde"),
  };

  /**
   * Proposition de lancement : crée l'action au plan (ou reprend celle « à
   * lancer » indiquée), puis la carte « Lancer {agent} : {titre} ». Aucune
   * exécution n'est créée ici.
   */
  async function proposeLaunch(agent: PlanAgent, input: DelegationInput, extras: LaunchExtras): Promise<string> {
    const agentName = PERSONAS[agent].name;
    const tooLong = (Object.keys(extras) as (keyof LaunchExtras)[]).filter((key) => (extras[key]?.trim().length ?? 0) > LAUNCH_EXTRA_MAX);
    if (tooLong.length > 0) {
      const label = tooLong.includes("newsContext") ? "l'actualité" : "la description des prospects";
      return `Aucune carte créée : ${label} dépasse ${LAUNCH_EXTRA_MAX} caractères. Résume-la en moins de ${LAUNCH_EXTRA_MAX} caractères, sans rien inventer.`;
    }
    const releaseCard = reserveCard();
    if (!releaseCard) return CARDS_LIMIT_MESSAGE;
    try {
      let item: { id: string; title: string; rationale: string; outcome: string | null; status: string } | null;
      let reused = false;
      if (input.planItemId) {
        item = await findLaunchablePlanItem(companyId, agent, input.planItemId);
        if (!item) {
          releaseCard();
          const existing = await prisma.actionPlanItem.findFirst({ where: { id: input.planItemId, companyId, agent }, select: { status: true } });
          return existing?.status === "en_cours"
            ? `Aucune carte créée : ${agentName} travaille déjà sur cette action. Dis-le au dirigeant, sans rien relancer.`
            : `Aucune carte créée : aucune action à lancer avec cet identifiant pour ${agentName}. Relis le plan avec get_current_status.`;
        }
      } else {
        // Une action active (à lancer ou en cours) de même agent et même thème est reprise telle quelle (AD-16).
        ({ item, reused } = await createChatPlanItem(companyId, agent, input.actionTitle, input.brief, input.theme, input.priority, input.outcome));
      }
      const cleanExtras = Object.fromEntries(Object.entries(extras).flatMap(([key, value]) => (typeof value === "string" && value.trim() ? [[key, value.trim()]] : []))) as LaunchExtras;
      const action = await createCard("launch_plan_item", {
        planItemId: item.id, agent, title: item.title,
        ...(item.outcome ? { outcome: item.outcome } : {}),
        ...(Object.keys(cleanExtras).length > 0 ? { extras: cleanExtras } : {}),
        ...(reused ? { reused: true as const } : {}),
      });
      const inProgress = reused && item.status === "en_cours";
      if (!action) {
        releaseCard();
        return `${CARD_FAILED} L'action « ${item.title} » est au plan, ${inProgress ? "marquée en cours" : "à lancer"}.`;
      }
      // Action reprise : Paul sait ce qui était déjà au plan et ce qui vient d'être demandé, pour dire au dirigeant ce qui diffère.
      const reusedNote = reused
        ? `Aucune nouvelle action créée : une action active de ${agentName} sur ce thème était déjà au plan et la carte la reprend telle quelle. Action reprise : « ${item.title} », consigne : « ${item.rationale} ». Demande de ce tour, non enregistrée : « ${input.actionTitle.trim()} ». Si elles diffèrent, dis au dirigeant en une phrase ce qui est repris et ce qui change, sans lui demander de trier des doublons. `
        : "";
      if (inProgress) {
        const running = await alreadyRunningResult(companyId, agent, item.id);
        return running?.runId
          ? `${reusedNote}${agentName} y travaille déjà (exécution ${running.runId}) : un clic sur « Lancer » ne relancera rien. Dis au dirigeant que le résultat apparaîtra dans le plan.`
          : `${reusedNote}L'action est marquée en cours, mais aucune exécution de ${agentName} n'est visible : vérifie executionsRecentes avec get_current_status avant de dire au dirigeant où elle en est ; ne dis pas que ${agentName} y travaille.`;
      }
      return `${reusedNote}Carte « Lancer ${agentName} : ${item.title} » affichée sous ta réponse (action du plan ${item.id}, à lancer). RIEN N'EST LANCÉ tant que le dirigeant n'a pas cliqué sur « Lancer » : ne dis pas que c'est lancé ni que ${agentName} y travaille ; dis-lui qu'il peut la lancer d'un clic ou choisir « Plus tard ».`;
    } catch (error) {
      releaseCard();
      console.error(`Proposition de lancement ${agent} impossible :`, error);
      return CARD_FAILED;
    }
  }

  const proposeLaunchMarketing = betaZodTool({
    name: "propose_launch_marketing",
    description:
      `Propose au dirigeant de faire travailler ${PERSONAS.marketing.name} (${PERSONAS.marketing.role}) : audit de présence en ligne, positionnement concurrentiel, et pilotage de la fiche Google (infos, avis). Ne produit pas de contenu créatif. Crée l'action dans le plan (statut à lancer) et une carte « Lancer » sous ta réponse : rien n'est lancé avant son clic.`,
    inputSchema: z.object(planActionFields),
    run: async (input) => proposeLaunch("marketing", input, {}),
  });

  const proposeLaunchContenu = betaZodTool({
    name: "propose_launch_contenu",
    description:
      `Propose au dirigeant de faire travailler ${PERSONAS.contenu.name} (${PERSONAS.contenu.role}) sur des posts réseaux sociaux et/ou du contenu de site web. Si une actualité réelle a été mentionnée par l'utilisateur, passe-la — sinon laisse vide, elle proposera ses propres idées génériques. Ne jamais inventer une actualité. Crée l'action dans le plan (statut à lancer) et une carte « Lancer » sous ta réponse : rien n'est lancé avant son clic.`,
    inputSchema: z.object({
      ...planActionFields,
      newsContext: z
        .string()
        .optional()
        .describe("Actualité à communiquer, telle que mentionnée par l'utilisateur — omettre si aucune n'a été donnée"),
    }),
    run: async (input) => proposeLaunch("contenu", input, { newsContext: input.newsContext }),
  });

  const proposeLaunchDemarchage = betaZodTool({
    name: "propose_launch_demarchage",
    description:
      `Propose au dirigeant de faire travailler ${PERSONAS.demarchage.name} (${PERSONAS.demarchage.role}) : recherche des pistes de croissance réelles (actualités, événements locaux) et, si un type de prospects a été décrit par l'utilisateur, prépare des templates de prospection générique. Crée l'action dans le plan (statut à lancer) et une carte « Lancer » sous ta réponse : rien n'est lancé avant son clic.`,
    inputSchema: z.object({
      ...planActionFields,
      prospectDescription: z
        .string()
        .optional()
        .describe("Type de prospects visés, tel que mentionné par l'utilisateur — omettre si non précisé"),
    }),
    run: async (input) => proposeLaunch("demarchage", input, { prospectDescription: input.prospectDescription }),
  });

  let objectiveCardProposed = false;

  // Le schéma de l'outil reste permissif : les bornes sont celles de la carte (safeParse ci-dessous),
  // pour qu'un montant hors bornes donne un message lisible à Paul au lieu de faire échouer le tour.
  const proposeObjectiveUpdate = betaZodTool({
    name: "propose_objective_update",
    description:
      "Propose au dirigeant d'enregistrer son objectif de chiffre d'affaires : crée une carte de confirmation sous ta réponse, rien n'est enregistré avant son clic sur « Confirmer ». Passe chaque montant exactement tel qu'il l'a dit, avec la période dans laquelle il l'a dit (month ou year) : le code fait la conversion au mois. Une seule carte par réponse. N'appelle pas cet outil si la période de l'objectif n'est pas connue : demande d'abord « par mois ou par an ? ».",
    inputSchema: z.object({
      revenueTarget: z.number().describe(`Chiffre d'affaires visé, en euros, tel que dit par le dirigeant (entre 1 et ${MAX_AMOUNT.toLocaleString("fr-FR")})`),
      targetPeriod: z.enum(["month", "year"]).describe("Période de l'objectif : month (par mois) ou year (par an)"),
      currentRevenue: z.number().optional().describe("Chiffre d'affaires actuel, en euros, tel que dit — omettre s'il ne l'a pas dit"),
      currentPeriod: z.enum(["month", "year"]).optional().describe("Période du chiffre d'affaires actuel — obligatoire avec currentRevenue"),
      averageClientValue: z.number().optional().describe("Ce que rapporte un client en tout, en euros (sans période) — omettre s'il ne l'a pas dit"),
      newClients: z.number().optional().describe("Nombre de nouveaux clients actuels, tel que dit — omettre s'il ne l'a pas dit"),
      newClientsPeriod: z.enum(["month", "year"]).optional().describe("Période du nombre de nouveaux clients — obligatoire avec newClients"),
      targetDate: z.string().optional().describe("Échéance de l'objectif au format AAAA-MM, si le dirigeant l'a donnée — omettre sinon"),
    }),
    run: async (input) => {
      // Drapeau posé avant tout await : deux appels dans le même message ne créent qu'une carte.
      if (objectiveCardProposed) return "Une carte d'objectif est déjà proposée dans cette réponse : rien de plus n'a été proposé.";
      const releaseCard = reserveCard();
      if (!releaseCard) return CARDS_LIMIT_MESSAGE;
      objectiveCardProposed = true;
      const parsed = updateObjectivePayloadSchema.safeParse(input);
      if (!parsed.success) {
        objectiveCardProposed = false;
        releaseCard();
        return `Aucune carte créée : ${parsed.error.issues.map((issue) => issue.message).join(" ; ")}. Vérifie les montants et leurs périodes avec le dirigeant.`;
      }
      const action = await createCard("update_objective", parsed.data);
      if (!action) {
        objectiveCardProposed = false;
        releaseCard();
        return CARD_FAILED;
      }
      return "Carte de confirmation affichée sous ta réponse. Rien n'est enregistré tant que le dirigeant n'a pas cliqué sur « Confirmer » : dis-le-lui, sans citer de montant converti.";
    },
  });

  let profileCardProposed = false;
  // Le schéma de l'outil n'annonce que les champs modifiables par Paul ; les autres clés et les limites
  // de longueur sont traitées dans run, pour que Paul reçoive un message lisible plutôt qu'une erreur brute.
  const proposeProfileUpdate = betaZodTool({
    name: "propose_profile_update",
    description:
      "Propose au dirigeant d'enregistrer dans son profil son site web, son compte Instagram ou Facebook, son téléphone, ses horaires ou sa description : crée une carte de confirmation sous ta réponse, rien n'est enregistré avant son clic sur « Confirmer ». Mets tous les champs donnés dans un seul appel (une seule carte par réponse) ; reprends chaque valeur telle qu'il l'a dite, une chaîne vide efface le champ. Le nom commercial, le métier et la zone de chalandise ne se modifient pas ici : ils se changent sur la page Entreprise.",
    inputSchema: profileUpdateToolSchema,
    run: async (input) => {
      // Drapeau posé avant tout await : deux appels dans le même message ne créent qu'une carte.
      if (profileCardProposed) return "Une carte de profil est déjà proposée dans cette réponse : rien de plus n'a été proposé.";
      const releaseCard = reserveCard();
      if (!releaseCard) return CARDS_LIMIT_MESSAGE;
      profileCardProposed = true;
      const { payload, pageOnly } = readProfileToolInput(input);
      if (pageOnly && Object.keys(payload).length === 0) {
        profileCardProposed = false;
        releaseCard();
        return PROFILE_PAGE_ONLY_MESSAGE;
      }
      const parsed = updateProfilePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        profileCardProposed = false;
        releaseCard();
        return `Aucune carte créée : ${parsed.error.issues.map((issue) => issue.message).join(" ; ")}. Demande au dirigeant une version plus courte.`;
      }
      const action = await createCard("update_profile", parsed.data);
      if (!action) {
        profileCardProposed = false;
        releaseCard();
        return CARD_FAILED;
      }
      const created = "Carte de confirmation affichée sous ta réponse. Rien n'est enregistré tant que le dirigeant n'a pas cliqué sur « Confirmer » : dis-le-lui.";
      return pageOnly ? `${created} ${PROFILE_PAGE_ONLY_MESSAGE}` : created;
    },
  });

  const runnerParams: BetaToolRunnerParams = {
    model: AGENT_MODEL,
    max_tokens: 2000,
    tools: [getCurrentStatus, proposeObjectiveUpdate, proposeProfileUpdate, proposeLaunchMarketing, proposeLaunchContenu, proposeLaunchDemarchage, recordUncovered],
    system: [
      {
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `Tu es ${PERSONA.name}, ${PERSONA.role} de BienDecider pour indépendants et TPE. ${PERSONA.blurb}
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
Site : ${company.website ?? "non renseigné"}
Réseaux sociaux : ${company.socialHandles ?? "non renseignés"}
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Tu es un partenaire business, pas un simple assistant qui répond aux questions : tu comprends le métier et le marché du dirigeant, tu l'aides à fixer un objectif chiffré, tu décides avec lui des priorités, tu lui proposes de faire travailler les agents spécialisés, tu t'appuies sur les résultats mesurés (écart vers l'objectif, funnel de prospection) pour ajuster ce qui vient ensuite — pas sur des recommandations génériques déconnectées de ce qui se passe réellement.
Ton rôle concret : échanger avec le dirigeant, l'aider à prioriser, et lui proposer de faire travailler les agents spécialisés (${PERSONAS.marketing.name} pour l'audit/positionnement/fiche Google, ${PERSONAS.contenu.name} pour les posts et le site web, ${PERSONAS.demarchage.name} pour le démarchage et les pistes de croissance) via les outils propose_launch_* quand c'est pertinent. C'est toujours le dirigeant qui lance.
Règles strictes, non négociables :
- RÈGLE ABSOLUE : ne dis JAMAIS qu'une action a été faite (proposition créée, audit relancé, fiche vue, contenu consulté) sans avoir réellement appelé l'outil correspondant DANS CE TOUR. Tu n'as aucune mémoire fiable de ce qui a été fait avant ce message — si on te demande l'état actuel, le plan d'action, le suivi des prospects, le nombre ou le contenu de propositions/constats, appelle TOUJOURS get_current_status avant de répondre. Ne devine jamais.
- Avant de proposer une priorité ou un lancement, appelle get_current_status pour partir du plan en cours et du suivi des prospects : ne propose pas ce qui est déjà au plan, et appuie-toi sur ce que le dirigeant t'a déjà dit dans cette conversation plutôt que de le lui redemander.
- Une action au statut "en_cours" est déjà en train d'être réalisée (voir son exécution dans executionsRecentes) : ne la relance pas et ne crée pas d'action équivalente ; dis au dirigeant qu'elle est en cours.
- Tu ne lances JAMAIS un agent toi-même. Les outils propose_launch_* créent l'action dans le plan (statut à lancer) et une carte « Lancer {agent} : {titre} » sous ta réponse ; rien n'est lancé tant que le dirigeant n'a pas cliqué sur « Lancer ». Même quand il te demande explicitement de lancer un agent (« lance ${PERSONAS.demarchage.name} »), tu passes par la carte. Ne dis JAMAIS « c'est lancé », « c'est parti » ni que l'agent y travaille après une proposition : dis qu'il peut lancer d'un clic sur la carte, ou choisir « Plus tard » (l'action reste alors dans son plan, à lancer).
- Chaque proposition de lancement crée une action dans le plan, avec le brief que tu rédiges, et les productions y seront rattachées. Si sa demande correspond à une action déjà au plan avec le statut "propose", passe son identifiant (planItemId) au lieu d'en créer une seconde.
- Avant de proposer un lancement, regarde cartesRecentes (get_current_status) : si une carte de lancement pour cette demande est encore en attente (status pending), ne la propose pas une seconde fois — même s'il répond « oui, lance-le » — : dis-lui de cliquer sur « Lancer » dans la carte déjà affichée.
- Au plus ${MAX_CARDS_PER_REPLY} cartes par réponse, tous types confondus (objectif, profil, lancements) : si un outil refuse une carte de plus, propose le reste au message suivant.
- Ce qu'a donné une carte de lancement se lit au tour suivant dans cartesRecentes (get_current_status) : status cancelled = « Plus tard », l'action reste à lancer ; status confirmed avec lancement.ok true = lancé ; avec lancement.ok null, l'issue n'est pas encore connue : dis-le sans affirmer que c'est lancé et vérifie executionsRecentes ; avec lancement.ok false, rien n'a été lancé : reprends le sens de lancement.message sans présenter cela comme une panne quand ce n'en est pas une. Selon lancement.reason : already_running = l'agent y travaillait déjà (ce n'est pas un échec) ; quota_runs ou quota_budget = limite de lancements ou budget du jour atteint, à réessayer demain ; no_result = l'agent n'a rien produit, le dirigeant peut relancer ; outage = indisponibilité passagère, à réessayer plus tard. N'écris jamais le mot « ÉCHEC ».
- Les productions des agents restent soumises à la validation du dirigeant dans le dashboard : rien n'est publié sans lui.
- Tu ne construis pas de site web toi-même (${PERSONAS.contenu.name} ne fournit qu'un brief de contenu, pas le site), ni ne publies ou modifies quoi que ce soit toi-même sur les plateformes externes — sois honnête sur ce que tu ne sais pas faire plutôt que de promettre.
- ${CAPABILITY_CATALOG}
- Quand l'objectif ou une demande du dirigeant sort de ce catalogue : dis-le clairement et tout de suite, sans promettre un résultat ; propose ce qui s'en rapproche le plus parmi ce que l'équipe sait faire ; puis appelle record_uncovered_request pour que la demande remonte aux fondateurs de BienDecider, et dis au dirigeant qu'elle a été notée. Ne propose pas à un agent une demande qu'il ne couvre pas.
- Si on te demande de connecter un compte (Google, Instagram, Facebook) : explique que ça se fait via OAuth sur la page /connexions, et que tu ne dois JAMAIS demander ou recevoir un mot de passe dans cette conversation.
- Pour proposer de lancer Contenu (sans actualité) ou Démarchage (sans cible), tu peux le faire sans information — les agents proposeront leurs propres idées génériques. Avec une info concrète donnée par le dirigeant, transmets-la pour des propositions plus ciblées.
- Pour les pistes de prospection, seules des informations publiques et professionnelles sont acceptables — refuse poliment toute demande de cibler des particuliers avec leurs données personnelles.
- Quand tu cites explicitement une production, un constat ou un prospect présent dans get_current_status ou dans le contexte de page, ajoute immédiatement après son nom le marqueur fourni [[bd:proposal:ID]], [[bd:finding:ID]] ou [[bd:lead:ID]]. Reprends uniquement un identifiant exact de ces données; ne crée jamais d'identifiant, de lien ou d'URL. N'ajoute pas de marqueur pour un objet absent de ces données.
- Quand le dirigeant te donne son objectif de chiffre d'affaires (et éventuellement son chiffre actuel, la valeur d'un client, ses nouveaux clients, une échéance), appelle propose_objective_update : c'est lui qui confirme d'un clic sur la carte, tu n'enregistres rien toi-même et tu ne dis pas que c'est enregistré. Chaque montant garde la période dans laquelle il l'a dit (« 12 000 € par mois aujourd'hui, 200 000 € par an visés » : currentPeriod month, targetPeriod year) ; ne convertis rien toi-même. S'il ne précise pas la période de l'objectif, demande-lui « par mois ou par an ? » avant d'appeler l'outil. S'il ne donne pas son chiffre d'affaires actuel, demande-le aussi : sans lui, l'écart ne peut pas être calculé. S'il veut corriger, propose une nouvelle carte : elle remplace la précédente. cartesRecentes (get_current_status) te dit ce que sont devenues tes cartes.
- Quand le dirigeant te donne son site web, son compte Instagram ou Facebook, son téléphone, ses horaires d'ouverture ou une description de son entreprise, appelle propose_profile_update avec tous ces champs en un seul appel : c'est lui qui confirme d'un clic sur la carte, tu ne dis pas que c'est enregistré. Si l'outil refuse un texte trop long, demande-lui une version plus courte. Le nom commercial, le métier et la zone de chalandise, tu ne les modifies jamais : dis-lui de les changer lui-même sur la page Entreprise.
- Ne calcule jamais toi-même un chiffre que tu affiches (conversion au mois, écart, nombre de clients nécessaires) : cite uniquement les chiffres calculés donnés plus haut dans ce message système. S'ils sont absents, dis que l'objectif chiffré n'est pas encore enregistré.
- Réponds de façon brève et directe, comme un vrai point rapide entre dirigeants, pas un rapport formel.`,
      },
    ],
    messages,
  };
  try {
    const { finalMessage, usage } = stream
      ? await runStreamingToolLoop(anthropic.beta.messages.toolRunner({ ...runnerParams, stream: true as const }), stream)
      : await runToolLoop(anthropic.beta.messages.toolRunner({ ...runnerParams, stream: false as const }));

    const assistantText = finalMessage.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const savedReply = assistantText || "(pas de réponse textuelle — vérifiez le dashboard pour les nouvelles propositions)";
    const [resolvedReply] = await resolvePaulReferences(companyId, [savedReply]);

    await recordUsage({
      companyId: company.id,
      reservationId,
      agent: "co_ceo",
      model: AGENT_MODEL,
      usage,
    });

    const savedMessage = await prisma.chatMessage.create({
      data: { companyId, role: "assistant", content: resolvedReply.content },
    });
    const actions = await attachPendingActions(companyId, createdActionIds, savedMessage.id);

    return { ...resolvedReply, actions };
  } catch (error) {
    // Un tour qui échoue après avoir créé une carte ne la laisse pas en attente sans message.
    await cancelOrphanPendingActions(companyId, createdActionIds).catch((cleanupError) => console.error("Annulation des cartes du tour échoué :", cleanupError));
    throw error;
  }
}

/**
 * Paul "meneur" : produit un plan d'action structuré (quoi, qui, quand,
 * pourquoi) plutôt que de la prose — demande CEO explicite ("force de
 * proposition", "donne la direction"). Séparé de runCoCeoTurn : ne touche
 * pas à l'historique de chat, ne délègue jamais lui-même (chaque item du
 * plan n'est lancé que si l'utilisateur clique "Lancer" dans le dashboard).
 */
export async function runCoCeoPlanning(companyId: string, agentRunId?: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const [pendingProposals, recentFindings, existingPlan, discarded, funnel] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { companyId, status: "en_attente" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditFinding.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.actionPlanItem.findMany({
      where: { companyId, status: { in: ["propose", "en_cours", "lance"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.actionPlanItem.findMany({
      where: { companyId, status: "ecarte" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getFunnelStats(companyId),
  ]);

  const createdItemIds: string[] = [];

  const proposePlanItem = betaZodTool({
    name: "propose_plan_item",
    description: "Ajoute une action au plan priorisé. Appelle cet outil une fois par action recommandée (3 à 5 fois en général).",
    inputSchema: z.object({
      agent: z
        .enum(["marketing", "contenu", "demarchage"])
        .describe("Agent responsable de cette action"),
      title: z.string().describe("Action concrète et courte, ex: 'Mettre à jour la fiche Google'"),
      rationale: z
        .string()
        .describe("Pourquoi cette action, en lien avec l'objectif business du dirigeant"),
      outcome: z
        .string()
        .max(160)
        .describe("Résultat attendu, en une phrase courte écrite pour le dirigeant, sans consigne technique ni nom d'agent, ex: 'Les clients du quartier voient vos chantiers récents chaque semaine'"),
      timing: z.string().describe("Quand, en langage naturel : 'aujourd'hui', 'cette semaine', 'dès que le site est en ligne'"),
      theme: z.enum(PLAN_THEMES).describe("But principal : Visibilité, Conversion ou Prospection ; agent et canal ne sont pas des thèmes"),
      priority: z.number().int().min(1).max(5).describe("Priorité de 1 (la plus urgente) à 5"),
    }),
    run: async (input) => {
      const item = await prisma.actionPlanItem.create({
        data: {
          companyId,
          agent: input.agent,
          title: input.title,
          rationale: input.rationale,
          outcome: input.outcome.trim(),
          timing: input.timing,
          theme: input.theme,
          priority: input.priority,
        },
      });
      createdItemIds.push(item.id);
      return `Action ajoutée au plan (id: ${item.id}).`;
    },
  });

  // Bloc stable (persona, identité entreprise, consignes de génération du
  // plan) mis en cache ; l'état réel (propositions en attente, constats,
  // plan existant, actions écartées) est recalculé à chaque appel et reste
  // donc hors cache, en toute fin de system (cf. doc prompt caching).
  const stableSystem = `Tu es ${PERSONA.name} de BienDecider. Tu dois être force de proposition et donner une direction claire — pas attendre des questions.
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}. Site web : ${company.website ?? (company.siteSlug ? `publié par BienDecider (/site/${company.siteSlug})` : "aucun")}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Ta tâche : propose un plan priorisé de 3 à 5 actions concrètes via propose_plan_item, chacune rattachée à un agent (${PERSONAS.marketing.name}/marketing pour audit-positionnement-fiche Google, ${PERSONAS.contenu.name}/contenu pour posts et site web, ${PERSONAS.demarchage.name}/demarchage pour la prospection), avec une justification liée à l'objectif et un délai réaliste.
Règles :
- Chaque action doit faire avancer l'objectif de façon mesurable — dis dans la justification QUEL effet attendu (appels, devis, avis, visibilité).
- Classe chaque action par but principal parmi Visibilité, Conversion et Prospection (jamais par agent ou canal) et donne une priorité de 1 (la plus urgente) à 5, cohérente avec l'objectif et le diagnostic.
- Une action = un brief exécutable par l'agent tel quel : précis sur le quoi (ex: "3 posts sur les chantiers terminés avec photos avant/après"), pas vague ("améliorer la com").
- Si l'entreprise n'a pas de site, l'action "préparer le contenu du site" (contenu) est prioritaire : BienDecider le publie après validation.
- Base-toi sur l'état réel ci-dessous — ne répète pas une action déjà proposée, au plan ou écartée.
- Tiens compte de ce que le dirigeant a dit dans le chat (préférences, refus, priorités) : une action contraire à une consigne récente ne doit pas figurer au plan.
- Priorise ce qui a le plus d'impact pour l'objectif, pas une liste exhaustive.
- ${CAPABILITY_CATALOG}
- Si l'objectif du dirigeant, ou une partie de cet objectif, sort de ce catalogue : ne propose aucune action qui ferait croire le contraire. Appelle record_uncovered_request une fois pour cette partie non couverte, puis propose seulement les actions du catalogue qui s'en rapprochent, en disant dans leur justification ce qu'elles ne couvrent pas.`;

  const dynamicSystem = `${await getRejectionContext(companyId)}
${await getChatInstructionsForPlan(companyId)}
Propositions déjà en attente de validation : ${pendingProposals.map((p) => `${p.agent}: ${p.title}`).join("; ") || "aucune"}.
Derniers constats (audit, concurrence) : ${recentFindings.map((f) => f.title).join("; ") || "aucun"}.
Actions déjà au plan (ne les répète pas) : ${existingPlan.map((i) => i.title).join("; ") || "aucune"}.
Actions ÉCARTÉES par le dirigeant, avec sa raison — ne les repropose pas et tiens compte de la raison : ${discarded.map((i) => `"${i.title}" (${i.feedback || "sans raison"})`).join("; ") || "aucune"}.
${funnelLines(funnel)}`;

  const { usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 2000,
    tools: [proposePlanItem, uncoveredRequestTool(companyId, "plan")],
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicSystem },
    ],
    messages: [
      {
        role: "user",
        content: "Donne-moi ton plan d'action priorisé.",
      },
    ],
  }));

  await recordUsage({
    companyId: company.id,
    agentRunId,
    agent: "co_ceo",
    model: AGENT_MODEL,
    usage,
  });

  return prisma.actionPlanItem.findMany({
    where: { id: { in: createdItemIds } },
  });
}
