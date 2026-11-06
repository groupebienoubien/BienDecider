import { agentRunnerOptions, bindAgentTools, createAgentExecution, currentAgentExecution, withAgentExecution, withAgentRunWrite } from "@/lib/agent-run-execution";
import { AGENT_RUN_MAX_TURNS } from "@/lib/agent-run-limits";
import { z } from "zod";
import { DELEGATION_DETAILS, DELEGATION_LABELS, asDelegationLevel } from "@/lib/delegation-level";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaToolRunnerParams } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";
import type { Mission } from "@prisma/client";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext } from "@/lib/agents/rejection-context";
import { ensureAgentProduced } from "@/lib/agents/agent-errors";
import { PERSONAS, objectiveLine, directionLine, companyProfileLines, runtimeContextLines, formatParisTime, formatParisDate } from "@/lib/agents/personas";
import { WEEKLY_REVIEW_MARKER } from "@/lib/weekly-review";
import { PLAN_THEMES } from "@/lib/plan-themes";
import { runStreamingToolLoop, runToolLoop } from "@/lib/usage";
import { getFunnelStats, funnelLines } from "@/lib/funnel";
import { CAPABILITY_CATALOG, recordUncoveredRequest } from "@/lib/agents/capabilities";
import { getChatInstructionsForPlan, loadRecentChatHistory } from "@/lib/agents/chat-context";
import { getLatestAuditFindings } from "@/lib/audit-findings";
import { latestAuditLines } from "@/lib/agents/audit-plan-context";
import { isPlanTitleAlreadyTaken } from "@/lib/agents/plan-item-shared";
import { resolvePaulReferences } from "@/lib/paul-references";
import { attachPendingActions, cancelOrphanPendingActions, createPendingAction, recentPendingActions } from "@/lib/agents/pending-actions";
import { PROFILE_PAGE_ONLY_MESSAGE, type PayloadFor, type PendingActionType, profileUpdateToolSchema, readProfileToolInput, updateProfilePayloadSchema } from "@/lib/agents/pending-action-view";
import { DEFAULT_CONTEXT_KEY } from "@/lib/paul-contexts";
import { renderMissionMessage } from "@/lib/missions/messages";
import { LAUNCH_COST_CREDITS, checkTransition, validateNewMission, type MissionAction, type MissionStatus } from "@/lib/missions/rules";
import { missionSnapshot } from "@/lib/missions/service";
import { loadMissionViews, priorityOf } from "@/lib/missions/view";
import { STAGE_LABELS, nextStep } from "@/lib/missions/stage";
import { MISSION_CHANNELS, channelLabel } from "@/lib/missions/channels";
import { TEMPLATE_KEYS, availableTemplates, enabledChannels } from "@/lib/missions/templates";
import { scopeSummary } from "@/lib/missions/scope";
import { PAUL_VERSION_CREDITS } from "@/lib/credits";
import { IDEA_MAX, countOpenIdeas, findOpenIdea, listOpenIdeas, validateIdeaText } from "@/lib/ideas";

const PERSONA = PERSONAS.co_ceo;

/**
 * Outil commun au chat et au plan : noter une demande hors catalogue pour
 * les pères fondateurs. N'exécute rien et ne promet rien au dirigeant.
 */
function uncoveredRequestTool(companyId: string, source: "chat" | "plan") {
  return betaZodTool({
    name: "record_uncovered_request",
    description: source === "chat"
      ? "Note pour les fondateurs de BienDecider une demande du dirigeant qu'aucun modèle de mission du catalogue ne couvre. À appeler une fois par besoin non couvert, après l'avoir dit au dirigeant ; tu peux proposer en même temps une mission « Sur mesure » avec propose_mission."
      : "Note pour les fondateurs de BienDecider une demande ou un objectif du dirigeant qu'aucun agent ne couvre. À appeler une fois par besoin non couvert, après l'avoir dit au dirigeant — jamais pour une demande que l'équipe sait traiter.",
    inputSchema: z.object({
      request: z.string().describe("Le besoin non couvert, en une ou deux phrases, sans nom ni coordonnée de personne"),
      closestAlternative: z.string().optional().describe("Ce que tu as proposé à la place parmi ce que BienDecider sait faire — omettre si rien ne s'en rapproche"),
    }),
    run: async (input) => {
      await recordUncoveredRequest(companyId, source, input.request, input.closestAlternative);
      return "Demande notée pour les fondateurs de BienDecider. Aucun délai ni résultat n'est promis : dis-le tel quel au dirigeant.";
    },
  });
}

const STATUS_WORDS: Record<MissionStatus, string> = { proposed: "À décider", active: "En cours", paused: "En pause", stopped: "Arrêtée", dismissed: "Écartée" };

/** Modèles de mission proposés aujourd'hui, avec leurs canaux actifs (catalogue ouvert, D9). */
function catalogueLines(): string {
  return availableTemplates().map((template) => {
    const channels = enabledChannels(template).map(channelLabel);
    return `${template.label} (template ${template.key}) : ${template.contentFormat} ; canaux : ${template.key === "custom" ? `${channels.join(", ")} ou hors canal` : channels.join(", ")}`;
  }).join(" ; ");
}

/**
 * État lu par Paul via get_current_status (addendum §8) : missions avec leur étape, prochain pas,
 * priorité, crédits, délégation et programmations, et ce que sont devenues ses dernières propositions.
 * Chaque état porte son heure (Europe/Paris), avec l'heure courante et celle de son message précédent.
 */
export async function buildCurrentStatus(companyId: string, now = new Date(), contextKey: string = DEFAULT_CONTEXT_KEY) {
  const [missions, company, cards, previousReply, rawMissions, ideas] = await Promise.all([
    loadMissionViews(companyId),
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { creditBalance: true, priorityMissionId: true, delegationLevel: true } }),
    recentPendingActions(companyId),
    // Message de Paul précédant le tour en cours dans cette conversation ; le point hebdomadaire du cron ne compte pas.
    prisma.chatMessage.findFirst({
      where: { companyId, contextKey, role: "assistant", createdAt: { lte: now }, NOT: { content: { startsWith: WEEKLY_REVIEW_MARKER } } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.mission.findMany({ where: { companyId }, select: { id: true, updatedAt: true, firstLaunchedAt: true } }),
    listOpenIdeas(companyId),
  ]);
  const updated = new Map(rawMissions.map((mission) => [mission.id, mission]));
  const priority = priorityOf(missions);
  const delegationLevel = asDelegationLevel(company.delegationLevel);
  const step = nextStep(missions, delegationLevel, priority);
  const priorityMission = missions.find((mission) => mission.id === priority) ?? null;
  return {
    maintenant: `${formatParisDate(now)}, ${formatParisTime(now, now)}`,
    monMessagePrecedent: formatParisTime(previousReply?.createdAt, now),
    prochainPas: { titre: step.title, detail: step.detail, missionId: step.missionId, bouton: step.target.label, ...(step.target.kind === "link" ? { adresse: step.target.href } : {}) },
    priorite: priorityMission
      ? { missionId: priorityMission.id, titre: priorityMission.title, choisieAvecPaul: company.priorityMissionId === priorityMission.id }
      : null,
    missions: missions.map((mission) => ({
      id: mission.id,
      titre: mission.title,
      modele: mission.templateLabel,
      canal: mission.channelLabel,
      statut: STATUS_WORDS[mission.status],
      etape: STAGE_LABELS[mission.stage],
      resultatRecherche: mission.outcome,
      constat: mission.finding,
      perimetre: mission.scopeSummary,
      regleDArretJours: mission.stopRuleDays,
      priorite: mission.priority,
      dejaLancee: Boolean(updated.get(mission.id)?.firstLaunchedAt),
      misAJour: formatParisTime(updated.get(mission.id)?.updatedAt, now),
      // Story 4.2 : la mission a-t-elle changé depuis ton message précédent dans cette conversation ?
      aChangeDepuisMonMessagePrecedent: Boolean(previousReply && (updated.get(mission.id)?.updatedAt.getTime() ?? 0) > previousReply.createdAt.getTime()),
    })),
    // Idées notées avec toi, pas encore des missions (US #312) : à cadrer avec propose_mission et leur ideaId.
    idees: { maximum: IDEA_MAX, ouvertes: ideas.map((idea) => ({ id: idea.id, texte: idea.text, noteeLe: formatParisDate(idea.createdAt) })) },
    credits: { solde: company.creditBalance, coutPremierLancement: LAUNCH_COST_CREDITS, coutVersionPrepareeAvecPaul: PAUL_VERSION_CREDITS, repriseApresPause: 0 },
    // Règle de collaboration choisie par le dirigeant (spécification §9, #36).
    delegation: `${DELEGATION_LABELS[delegationLevel]} : ${DELEGATION_DETAILS[delegationLevel]}`,
    // La diffusion et sa programmation arrivent avec l'atelier : aucune programmation n'existe encore.
    programmations: [],
    // Dernières propositions : pending = à confirmer, confirmed = acceptée, cancelled = « Garder le cap actuel »,
    // superseded = remplacée par une plus récente, expired = non décidée sous 24 h.
    cartesRecentes: cards,
  };
}

/** Au plus 3 cartes par message de Paul, tous types confondus. */
export const MAX_CARDS_PER_REPLY = 3;
export const CARDS_LIMIT_MESSAGE = `Aucune carte créée : ${MAX_CARDS_PER_REPLY} cartes sont déjà proposées dans cette réponse, c'est le maximum. Propose le reste au prochain message.`;

const missionIdField = z.string().describe("Identifiant exact de la mission, lu dans get_current_status (missions[].id) ou dans le contexte de la conversation");

/**
 * Agent "Partenaire de croissance" (Paul) : seul interlocuteur du dirigeant (D3). Ses outils ne créent
 * que des propositions à confirmer (cartes) ; aucune mission n'est créée, lancée, suspendue, écartée
 * ou modifiée avant le clic du dirigeant, qui passe par le service des missions.
 */
async function runCoCeoTurnImpl(
  companyId: string,
  userMessage: string,
  reservationId?: string,
  pageContext?: string,
  // Si fourni, la réponse est produite en flux : le texte de chaque tour est transmis au fur et à mesure.
  stream?: { onTurnStart: () => void; onText: (delta: string) => void },
  // Conversation du contexte (spécification §16.1) : le message y est enregistré et seul son fil part au modèle.
  contextKey: string = DEFAULT_CONTEXT_KEY,
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  await withAgentRunWrite(companyId, undefined, (tx) => tx.chatMessage.create({
    data: { companyId, role: "user", content: userMessage, contextKey },
  }));

  const history = await loadRecentChatHistory(companyId, contextKey);

  // Le dernier tour est marqué pour le prompt caching ; le système ci-dessous est stable pour une entreprise
  // donnée. Le contexte de page, la date du jour et le nom du dirigeant changent d'un tour ou d'un jour à
  // l'autre : ils précèdent le dernier message, hors du système mis en cache.
  const messages: Anthropic.MessageParam[] = history.map((m, i) => ({
    role: m.role === "user" ? "user" : "assistant",
    content:
      i === history.length - 1
        ? [
            ...(pageContext ? [{ type: "text" as const, text: pageContext }] : []),
            { type: "text" as const, text: runtimeContextLines(company, new Date()) },
            { type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } },
          ]
        : m.content,
  }));

  const getCurrentStatus = betaZodTool({
    name: "get_current_status",
    description:
      "Récupère l'état réel actuel : missions (statut, étape, résultat recherché, périmètre, priorité), idées notées à cadrer, prochain pas, priorité (choisie avec toi ou calculée), solde et coûts en crédits, délégation, programmations et ce que sont devenues tes dernières propositions (cartesRecentes). À utiliser systématiquement avant de répondre sur l'état, les missions, la priorité, le prochain pas ou les crédits, et avant toute proposition — ne jamais deviner ni se fier à un tour précédent.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify(await buildCurrentStatus(companyId, new Date(), contextKey)),
  });

  const recordUncovered = uncoveredRequestTool(companyId, "chat");

  // Intentions créées pendant ce tour : rattachées au message de Paul enregistré à la fin.
  const createdActionIds: string[] = [];
  // Au plus MAX_CARDS_PER_REPLY cartes par réponse. Le compteur est réservé avant tout await
  // (deux appels simultanés ne dépassent pas le plafond) et rendu si rien n'est créé.
  let cardsThisTurn = 0;
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
  async function createCard<T extends PendingActionType>(type: T, payload: PayloadFor[T]) {
    try {
      const action = await createPendingAction(companyId, type, payload);
      createdActionIds.push(action.id);
      return action;
    } catch (error) {
      console.error(`Création d'une carte ${type} impossible :`, error);
      return null;
    }
  }

  /** Crée une carte réservée ; rend la place si rien n'est créé. */
  async function withCard<T extends PendingActionType>(type: T, payload: PayloadFor[T], created: string): Promise<string> {
    const releaseCard = reserveCard();
    if (!releaseCard) return CARDS_LIMIT_MESSAGE;
    try {
      const action = await createCard(type, payload);
      if (!action) {
        releaseCard();
        return CARD_FAILED;
      }
      return `${created} RIEN NE CHANGE tant que le dirigeant n'a pas cliqué sur le bouton d'acceptation ; « Garder le cap actuel » la retire. Ne dis pas que c'est fait.`;
    } catch (error) {
      releaseCard();
      console.error(`Proposition ${type} impossible :`, error);
      return CARD_FAILED;
    }
  }

  async function findMission(missionId: string): Promise<Mission | null> {
    return prisma.mission.findFirst({ where: { id: missionId, companyId } });
  }

  const NO_MISSION = "Aucune carte créée : aucune mission avec cet identifiant. Relis missions avec get_current_status.";

  /** Proposition d'une transition : vérifiée avec les règles du service avant la carte, puis de nouveau à l'acceptation. */
  async function proposeTransition(type: "mission_priority" | "mission_pause" | "mission_dismiss" | "mission_restore", request: MissionAction, missionId: string, label: (title: string) => string): Promise<string> {
    const mission = await findMission(missionId);
    if (!mission) return NO_MISSION;
    const check = checkTransition(missionSnapshot(mission), request);
    if (!check.ok) return `Aucune carte créée : ${renderMissionMessage(check.code, check.params)} Dis-le au dirigeant simplement.`;
    if (request.action !== "set_priority" && check.noop) return `Aucune carte créée : « ${mission.title} » est déjà dans cet état. Dis-le au dirigeant.`;
    if (request.action === "set_priority") {
      const current = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { priorityMissionId: true } });
      if (current.priorityMissionId === mission.id) return `Aucune carte créée : « ${mission.title} » est déjà la priorité retenue avec le dirigeant. Dis-le-lui.`;
    }
    return withCard(type, { missionId: mission.id, title: mission.title }, `Carte « ${label(mission.title)} » affichée sous ta réponse.`);
  }

  const proposePriority = betaZodTool({
    name: "propose_priority",
    description: "Propose au dirigeant de faire d'une mission sa priorité : carte « Retenir cette priorité ». Change seulement l'ordre des missions et le prochain pas ; ne lance ni ne suspend aucune mission. Une mission écartée doit d'abord être remise au plan ; une mission arrêtée ne peut pas devenir la priorité. Si la mission est déjà la priorité retenue, aucune carte n'est créée.",
    inputSchema: z.object({ missionId: missionIdField }),
    run: async (input) => proposeTransition("mission_priority", { action: "set_priority" }, input.missionId, (title) => `Faire de « ${title} » la priorité`),
  });

  const proposePause = betaZodTool({
    name: "propose_pause",
    description: "Propose de mettre en pause une mission En cours : carte « Mettre en pause ». La préparation s'arrête et ses programmations seront annulées ; la reprise est gratuite.",
    inputSchema: z.object({ missionId: missionIdField }),
    run: async (input) => proposeTransition("mission_pause", { action: "pause" }, input.missionId, (title) => `Mettre en pause « ${title} »`),
  });

  const proposeDismiss = betaZodTool({
    name: "propose_dismiss",
    description: "Propose d'écarter une mission du plan (À décider ou En pause) : carte « Écarter ». Rien n'est effacé, elle reste récupérable. Une mission En cours doit d'abord être mise en pause : propose alors la pause.",
    inputSchema: z.object({ missionId: missionIdField }),
    run: async (input) => proposeTransition("mission_dismiss", { action: "dismiss" }, input.missionId, (title) => `Écarter « ${title} » du plan`),
  });

  const proposeRestore = betaZodTool({
    name: "propose_restore",
    description: "Propose de remettre au plan une mission écartée : carte « Remettre au plan ». Elle redevient à décider, ou en pause si elle l'était ; rien n'est lancé.",
    inputSchema: z.object({ missionId: missionIdField }),
    run: async (input) => proposeTransition("mission_restore", { action: "restore" }, input.missionId, (title) => `Remettre « ${title} » au plan`),
  });

  const proposeScope = betaZodTool({
    name: "propose_scope",
    description: "Propose de modifier le périmètre d'une mission : carte « Modifier le périmètre ». Forme du périmètre selon le modèle : Publication {\"topic\": sujet de 5 à 120 caractères} ; Réalisation {\"proofId\": identifiant de la réalisation, 1 à 80 caractères} ; Sur mesure {\"description\": 10 à 300 caractères} ; Page du site vitrine {\"page\": nom de la page} ; Réponse aux avis {\"reviewIds\": 1 à 5 identifiants} ; Partenariats {\"agencyIds\": 1 ou 2} ; Réactivation {\"contactIds\": 1 à 8}. Fiche Google à jour : {}.",
    inputSchema: z.object({
      missionId: missionIdField,
      scope: z.record(z.string(), z.unknown()).describe("Nouveau périmètre complet, dans la forme du modèle de la mission"),
    }),
    run: async (input) => {
      const mission = await findMission(input.missionId);
      if (!mission) return NO_MISSION;
      const check = checkTransition(missionSnapshot(mission), { action: "set_scope", scope: input.scope });
      if (!check.ok) return `Aucune carte créée : ${renderMissionMessage(check.code, check.params)} Reformule avec le dirigeant.`;
      const scope = check.patch.scope ?? {};
      const summary = scopeSummary(missionSnapshot(mission).template, scope);
      return withCard("mission_scope", { missionId: mission.id, title: mission.title, scope, summary: summary.slice(0, 300) },
        `Carte « Modifier le périmètre de « ${mission.title} » » affichée sous ta réponse (nouveau périmètre : ${summary}).`);
    },
  });

  const proposeMission = betaZodTool({
    name: "propose_mission",
    description: `Propose de créer une mission, pour tout modèle du catalogue, y compris « Sur mesure » : carte « Créer la mission ». Elle sera À décider, jamais lancée. Modèles et canaux proposés aujourd'hui : ${catalogueLines()}.`,
    inputSchema: z.object({
      template: z.enum(TEMPLATE_KEYS).describe("Modèle d'action (template) du catalogue"),
      channel: z.enum(MISSION_CHANNELS).nullable().optional().describe("Canal de la mission ; null ou omis pour « Sur mesure » hors canal, ou quand le modèle n'a qu'un canal actif"),
      title: z.string().describe("Titre court et concret, 5 à 80 caractères, sans balise"),
      outcome: z.string().describe("Résultat recherché, 5 à 120 caractères, écrit pour le dirigeant"),
      finding: z.string().describe("Constat de départ qui justifie le test, 10 à 300 caractères ; ce que le dirigeant a dit ou ce que tu as relevé, jamais inventé"),
      scope: z.record(z.string(), z.unknown()).optional().describe("Périmètre dans la forme du modèle (voir propose_scope) ; obligatoire pour « Sur mesure » : {\"description\": …}"),
      stopRuleDays: z.number().int().optional().describe("Règle d'arrêt en jours (7 à 90), seulement pour « Sur mesure »"),
      ideaId: z.string().optional().describe("Identifiant de l'idée notée que cette mission cadre (get_current_status, idees.ouvertes[].id) ; l'idée sera retirée à l'acceptation ; le constat (finding) reprend alors le texte de l'idée, complété seulement s'il fait moins de 10 caractères. Omettre sinon."),
    }),
    run: async (input) => {
      const { ideaId, ...mission } = input;
      if (ideaId !== undefined && !(await findOpenIdea(companyId, ideaId))) {
        return "Aucune carte créée : cette idée n'est plus à cadrer (absente, retirée ou déjà cadrée). Relis idees avec get_current_status.";
      }
      const open = await prisma.mission.count({ where: { companyId, createdBy: { in: ["owner", "paul"] }, status: { not: "stopped" } } });
      const checked = validateNewMission({ ...mission, scope: mission.scope ?? {} }, open);
      if (!checked.ok) return `Aucune carte créée : ${renderMissionMessage(checked.code, checked.params)} Reformule avec le dirigeant.`;
      const { value } = checked;
      return withCard("mission_create", {
        template: value.template, channel: value.channel, title: value.title, outcome: value.outcome, finding: value.finding, scope: value.scope,
        ...(value.template === "custom" ? { stopRuleDays: value.stopRuleDays } : {}),
        ...(ideaId !== undefined ? { ideaId } : {}),
      }, `Carte « Créer la mission « ${value.title} » » affichée sous ta réponse. Acceptée, la mission sera À décider : rien n'est lancé.${ideaId !== undefined ? " L'idée qu'elle cadre sera retirée de la liste." : ""}`);
    },
  });

  const proposeIdea = betaZodTool({
    name: "propose_idea",
    description: `Propose de noter une envie du dirigeant qui n'est pas encore une mission : carte « Noter l'idée ». Acceptée, l'idée est listée dans Stratégie et le formulaire « Cadrons votre nouvelle mission » s'ouvre, prérempli. Une phrase de 1 à 200 caractères, sans balise ; ${IDEA_MAX} idées ouvertes au plus.`,
    inputSchema: z.object({
      text: z.string().describe("L'idée en une phrase, avec les mots du dirigeant, 1 à 200 caractères, sans balise"),
    }),
    run: async (input) => {
      const checked = validateIdeaText(input.text);
      if (!checked.ok) return `Aucune carte créée : ${renderMissionMessage(checked.code)} Reformule avec le dirigeant.`;
      if (await countOpenIdeas(prisma, companyId) >= IDEA_MAX) {
        return `Aucune carte créée : ${renderMissionMessage("M-63")} Invite le dirigeant à retirer une idée dans Stratégie (« Retirer l'idée »).`;
      }
      return withCard("idea_note", { text: checked.text }, `Carte « Noter l'idée » affichée sous ta réponse. Acceptée, l'idée sera listée dans Stratégie, à cadrer : rien n'est lancé.`);
    },
  });

  const proposeMissionLaunch = betaZodTool({
    name: "propose_mission_launch",
    description: `Propose de lancer (ou reprendre) une mission : carte « Lancer ». L'acceptation n'exécute rien : elle ouvre le dialogue « Confirmer le cadre de la mission », où le dirigeant voit le coût (${LAUNCH_COST_CREDITS} crédits au premier lancement, reprise gratuite) et confirme lui-même. Jamais de lancement direct.`,
    inputSchema: z.object({ missionId: missionIdField }),
    run: async (input) => {
      const mission = await findMission(input.missionId);
      if (!mission) return NO_MISSION;
      if (mission.status === "active") return `Aucune carte créée : « ${mission.title} » est déjà en cours. Dis-le au dirigeant.`;
      if (mission.status === "stopped") return `Aucune carte créée : ${renderMissionMessage("M-40")}`;
      if (mission.status === "dismissed") return `Aucune carte créée : ${renderMissionMessage("M-21")}`;
      return withCard("mission_launch", { missionId: mission.id, title: mission.title },
        `Carte « Lancer « ${mission.title} » » affichée sous ta réponse : elle ouvre le cadre de la mission, que le dirigeant confirmera lui-même.`);
    },
  });

  let profileCardProposed = false;
  // Le schéma de l'outil n'annonce que les champs modifiables par Paul ; les autres clés et les limites
  // de longueur sont traitées dans run, pour que Paul reçoive un message lisible plutôt qu'une erreur brute.
  const proposeProfileUpdate = betaZodTool({
    name: "propose_profile_update",
    description:
      "Propose au dirigeant d'enregistrer dans son profil son prénom et nom, son site web, son compte Instagram ou Facebook, son téléphone, ses horaires ou sa description : crée une carte sous ta réponse, rien n'est enregistré avant son clic. Mets tous les champs donnés dans un seul appel (une seule carte par réponse) ; reprends chaque valeur telle qu'il l'a dite, une chaîne vide efface le champ. Le nom commercial, le métier et la zone de chalandise ne se modifient pas ici : ils se changent sur la page Entreprise.",
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
      const created = "Carte de confirmation affichée sous ta réponse. Rien n'est enregistré tant que le dirigeant n'a pas cliqué sur « Enregistrer dans mon profil » : dis-le-lui.";
      return pageOnly ? `${created} ${PROFILE_PAGE_ONLY_MESSAGE}` : created;
    },
  });

  const runnerParams: BetaToolRunnerParams = {
    model: AGENT_MODEL,
    max_tokens: 2000,
    max_iterations: AGENT_RUN_MAX_TURNS,
    tools: bindAgentTools([getCurrentStatus, proposePriority, proposeScope, proposePause, proposeDismiss, proposeRestore, proposeMission, proposeMissionLaunch, proposeIdea, proposeProfileUpdate, recordUncovered]),
    system: [
      {
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `Tu es ${PERSONA.name}, ${PERSONA.role} de BienDecider pour indépendants et TPE. Tu es le seul interlocuteur du dirigeant : tu analyses, proposes, prépares et coordonnes. Direct et synthétique, tu ne promets rien que tu ne peux tenir.
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
Site : ${company.website ?? "non renseigné"}
Réseaux sociaux : ${company.socialHandles ?? "non renseignés"}
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Comment BienDecider fonctionne : la Stratégie relie l'ambition, les constats et les missions, et met en avant le prochain pas. Une mission est un test limité issu d'un constat : modèle d'action, canal, résultat recherché, périmètre, règle d'arrêt. Statuts : À décider, En cours, En pause, Arrêtée, Écartée. Le dirigeant garde le dernier mot.
Modèles de mission proposés aujourd'hui : ${catalogueLines()}. Une demande hors de ces modèles peut devenir une mission « Sur mesure ».
Règles strictes, non négociables :
- Ne dis JAMAIS qu'une chose a été faite sans avoir appelé l'outil correspondant DANS CE TOUR. Avant de répondre sur les missions, la priorité, le prochain pas ou les crédits, et avant toute proposition, appelle get_current_status. Ne devine jamais.
- Chaque état de get_current_status porte son heure, avec l'heure de ton message précédent (monMessagePrecedent). Une mission dont aChangeDepuisMonMessagePrecedent vaut true a changé APRÈS ton message : annonce-le comme une nouvelle (« depuis mon dernier message, … »), ce n'est pas une erreur de ta part. Ne dis « je me suis trompé » que si l'état au moment de ton message contredisait ce que tu as écrit.
- Chaque conversation porte sur un contexte (stratégie, une mission, les résultats, l'ambition, le positionnement, la concurrence, les sources ou une idée), indiqué avec le dernier message : réponds dans ce contexte. Dans la conversation d'une mission, « cette mission » est celle-là.
- Tu ne changes rien toi-même. Tes outils propose_* créent une proposition à confirmer sous ta réponse ; rien ne change avant que le dirigeant clique sur le bouton d'acceptation, et « Garder le cap actuel » la retire. Ne dis jamais « c'est fait », « c'est lancé », « c'est en pause » ou « c'est écarté » après une proposition : dis qu'il peut l'accepter d'un clic.
- Choisir l'outil : priorité → propose_priority (ne lance ni ne suspend rien) ; périmètre → propose_scope ; pause d'une mission En cours → propose_pause ; écarter une mission À décider ou En pause → propose_dismiss (une mission En cours se met d'abord en pause) ; remettre au plan une mission écartée → propose_restore ; nouvelle mission → propose_mission (elle sera À décider, jamais lancée) ; lancer ou reprendre → propose_mission_launch : sa carte ouvre le dialogue « Confirmer le cadre de la mission », où le dirigeant confirme lui-même. Tu ne lances jamais une mission. Une envie encore floue (pas de constat, de modèle ni de résultat clairs) → propose_idea, qui la note pour la cadrer plus tard ; pour cadrer une idée notée (idees dans get_current_status) → propose_mission avec son ideaId, et pour constat le texte de l'idée, complété seulement s'il fait moins de 10 caractères. Si les ${IDEA_MAX} idées sont atteintes, n'insiste pas : invite le dirigeant à en retirer une dans Stratégie.
- Coûts : le premier lancement d'une mission coûte ${LAUNCH_COST_CREDITS} crédits, débités quand le dirigeant confirme le cadre ; une reprise après pause est gratuite ; une version préparée avec toi coûtera ${PAUL_VERSION_CREDITS} crédit, créée et débitée seulement à l'acceptation. Dis-le une seule fois, au moment où c'est utile, pas à chaque message.
- Si un outil refuse une proposition avec un message de règle, redis ce message simplement au dirigeant, sans le contourner par une autre proposition.
- Avant de proposer, regarde cartesRecentes : si une proposition identique attend encore (status pending), ne la refais pas ; dis-lui de l'accepter dans la carte déjà affichée. Une carte cancelled a été refusée : ne la repropose pas sans nouvel élément.
- Au plus ${MAX_CARDS_PER_REPLY} propositions par réponse : si un outil refuse une carte de plus, propose le reste au message suivant.
- Liens d'action : quand tu cites une mission présente dans get_current_status ou dans le contexte, ajoute juste après son nom le marqueur [[bd:mission:ID]] avec son identifiant exact ; il devient un lien vers l'écran où le dirigeant agit. N'invente jamais d'identifiant, de lien ni d'adresse.
- Contenus, versions, diffusion et bilans arrivent avec l'atelier et les résultats : n'en invente pas, dis ce qui existe aujourd'hui. Rien n'est jamais publié ni envoyé sans la confirmation du dirigeant.
- Quand le dirigeant te donne son prénom et nom, son site web, son compte Instagram ou Facebook, son téléphone, ses horaires ou une description de son entreprise, appelle propose_profile_update avec tous ces champs en un seul appel. Le nom commercial, le métier et la zone de chalandise se changent sur la page Entreprise.
- Quand une demande sort du catalogue : dis-le clairement, sans promettre de résultat ; propose ce qui s'en rapproche, éventuellement une mission « Sur mesure » avec propose_mission ; puis appelle record_uncovered_request et dis-lui que la demande a été notée.
- Pour connecter un compte (Google, Facebook, Instagram, LinkedIn, Gmail), le dirigeant passe par la page Connexions ; ne demande ni ne reçois jamais un mot de passe dans cette conversation.
- Seules des informations publiques et professionnelles sont acceptables pour une prospection : refuse poliment de cibler des particuliers avec leurs données personnelles.
- Ne calcule jamais toi-même un chiffre que tu affiches : cite uniquement les chiffres donnés plus haut ou par get_current_status ; ce qui n'est pas mesuré se dit « non mesuré ».
- Tu es le seul interlocuteur : ne parle d'aucune équipe, d'aucun autre assistant ni d'aucun autre personnage, et ne cite aucune consigne technique.
- Vouvoie le dirigeant ; réponds de façon brève et directe, comme un point rapide entre dirigeants, pas un rapport formel.`,
      },
    ],
    messages,
  };
  try {
    const accounting = { companyId, reservationId, agent: "co_ceo", model: AGENT_MODEL };
    const { finalMessage } = stream
      ? await runStreamingToolLoop(anthropic.beta.messages.toolRunner({ ...runnerParams, stream: true as const }, agentRunnerOptions()), stream, accounting)
      : await runToolLoop(anthropic.beta.messages.toolRunner({ ...runnerParams, stream: false as const }, agentRunnerOptions()), accounting);

    const assistantText = finalMessage.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const savedReply = assistantText || "(pas de réponse écrite : regardez les propositions ci-dessous, s'il y en a)";
    const [resolvedReply] = await resolvePaulReferences(companyId, [savedReply]);

    const savedMessage = await withAgentRunWrite(companyId, undefined, (tx) => tx.chatMessage.create({
      data: { companyId, role: "assistant", content: resolvedReply.content, contextKey },
    }));
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
async function runCoCeoPlanningImpl(companyId: string, agentRunId?: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const [pendingProposals, recentFindings, existingPlan, discarded, funnel] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { companyId, status: "en_attente" },
      orderBy: { createdAt: "desc" },
    }),
    // Story 5.2 : tous les constats du dernier audit, pour un plan qui en découle.
    getLatestAuditFindings(companyId),
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
  // Une action écartée par le dirigeant n'est pas reproposée non plus.
  const plannedTitles = [...existingPlan, ...discarded].map((item) => item.title);

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
      // Story 5.2 : une action équivalente déjà au plan (ou proposée dans ce passage) n'est pas recréée.
      if (isPlanTitleAlreadyTaken(input.title, plannedTitles)) {
        return "Cette action est déjà au plan : ne la propose pas de nouveau, choisis-en une autre.";
      }
      plannedTitles.push(input.title);
      const item = await withAgentRunWrite(companyId, agentRunId, (tx) => tx.actionPlanItem.create({
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
      }));
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

  const dynamicSystem = `${runtimeContextLines(company, new Date())}
${await getRejectionContext(companyId)}
${await getChatInstructionsForPlan(companyId)}
Propositions déjà en attente de validation : ${pendingProposals.map((p) => `${p.agent}: ${p.title}`).join("; ") || "aucune"}.
${latestAuditLines(recentFindings)}
Actions déjà au plan (ne les répète pas) : ${existingPlan.map((i) => i.title).join("; ") || "aucune"}.
Actions ÉCARTÉES par le dirigeant, avec sa raison — ne les repropose pas et tiens compte de la raison : ${discarded.map((i) => `"${i.title}" (${i.feedback || "sans raison"})`).join("; ") || "aucune"}.
${funnelLines(funnel)}`;

  const { usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 2000,
    max_iterations: AGENT_RUN_MAX_TURNS,
    tools: bindAgentTools([proposePlanItem, uncoveredRequestTool(companyId, "plan")]),
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
  }, agentRunnerOptions()), { companyId, agentRunId, agent: "co_ceo", model: AGENT_MODEL });

  const items = await prisma.actionPlanItem.findMany({ where: { companyId, id: { in: createdItemIds } } });
  ensureAgentProduced("Paul", items.length, { stopReason: "plan", usage });
  return items;
}


export async function runCoCeoTurn(...args: Parameters<typeof runCoCeoTurnImpl>) {
  if (currentAgentExecution()) return runCoCeoTurnImpl(...args);
  return withAgentExecution(createAgentExecution({ companyId: args[0] }), () => runCoCeoTurnImpl(...args));
}

export async function runCoCeoPlanning(...args: Parameters<typeof runCoCeoPlanningImpl>) {
  if (currentAgentExecution()) return runCoCeoPlanningImpl(...args);
  return withAgentExecution(createAgentExecution({ companyId: args[0], agentRunId: args[1] }), () => runCoCeoPlanningImpl(...args));
}
