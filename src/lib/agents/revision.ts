import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentProposal } from "@prisma/client";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { enqueueRevisionRun, type RevisionRunPayload } from "@/lib/agent-runs";
import { AgentRunConflictError, AgentRunQuotaError, RevisionConflictError, classifyRunError, ensureAgentProduced, failureMessage, isRunFailureReason, type RevisionConflictKind } from "@/lib/agents/agent-errors";
import { isPlanAgent, type PlanAgent } from "@/lib/agents/plan-items";
import { PERSONAS, companyProfileLines, directionLine, runtimeContextLines } from "@/lib/agents/personas";
import { activeRevisionRun } from "@/lib/agents/revision-state";
import type { LaunchResult } from "@/lib/agents/pending-action-view";
import { runToolLoop } from "@/lib/usage";
import { agentRunnerOptions, assertAgentExecutionActive, bindAgentTools, withAgentRunWrite } from "@/lib/agent-run-execution";
import { AGENT_RUN_MAX_TURNS } from "@/lib/agent-run-limits";

export { activeRevisionRun } from "@/lib/agents/revision-state";

/** Longueur maximale de la note de l'agent sur ce qu'il a changé. */
const REVISION_NOTE_MAX = 400;

/**
 * Révision d'une production par son agent auteur (story 3.3) : au second test
 * en production, « retire l'avertissement et signe avec mon nom » conduisait à
 * une nouvelle exécution complète, avec de nouvelles productions à côté des
 * anciennes. Ici, la même production passe de la version N à N + 1 ; la
 * version N et la consigne sont conservées (ProposalRevision).
 */

const ACTIVE_RUN_STATUSES = ["queued", "running"];

/** Plafond de sortie d'une révision : la nouvelle version doit tenir dans une réponse du modèle. */
const REVISION_MAX_OUTPUT_TOKENS = 16_000;
/** Estimation prudente : un token pour 3 caractères de français. */
const CHARS_PER_TOKEN = 3;
/** Au-delà, la production est trop longue pour être réécrite en une réponse : aucune carte de révision. */
export const REVISION_MAX_CONTENT_CHARS = (REVISION_MAX_OUTPUT_TOKENS / 2) * CHARS_PER_TOKEN;

/** Sortie allouée au modèle : deux fois l'estimation du contenu, au moins 2 000, au plus 16 000 tokens. */
export function revisionMaxTokens(content: string) {
  return Math.min(REVISION_MAX_OUTPUT_TOKENS, Math.max(2000, 2 * Math.ceil(content.length / CHARS_PER_TOKEN)));
}

/** Pourquoi une production ne peut pas être révisée ; null si elle peut l'être. */
export function revisionRefusal(proposal: Pick<AgentProposal, "kind" | "status" | "agent" | "content">): "prospect" | "decided" | "agent" | "too_long" | null {
  if (proposal.kind === "prospect") return "prospect";
  if (proposal.status !== "en_attente") return "decided";
  if (!isPlanAgent(proposal.agent)) return "agent";
  if (proposal.content.length > REVISION_MAX_CONTENT_CHARS) return "too_long";
  return null;
}

/** Ce qui a empêché l'écriture, relu en base : disparue, décidée, ou modifiée (version changée). */
async function conflictKind(companyId: string, proposalId: string): Promise<RevisionConflictKind> {
  const current = await prisma.agentProposal.findFirst({ where: { id: proposalId, companyId }, select: { status: true } });
  if (!current) return "missing";
  return current.status === "en_attente" ? "modified" : "decided";
}

/** Un email Gmail est un JSON { to, text }. */
function readGmail(value: string): { to: string; text: string } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && "to" in parsed && "text" in parsed && typeof parsed.to === "string" && typeof parsed.text === "string"
      ? { to: parsed.to, text: parsed.text }
      : null;
  } catch {
    return null;
  }
}

/** La révision d'un email Gmail garde la forme { to, text } et le destinataire de la version actuelle. */
function gmailContentIssue(previous: string, next: string): string | null {
  const before = readGmail(previous);
  if (!before) return "La version actuelle n'est pas un email lisible ({ \"to\", \"text\" }) : rien n'a été enregistré.";
  const after = readGmail(next);
  if (!after) return "Le contenu doit rester un JSON { \"to\": ..., \"text\": ... } comme la version actuelle : rien n'a été enregistré.";
  if (before.to !== after.to) return "Le destinataire (to) ne change pas lors d'une révision : rien n'a été enregistré.";
  return null;
}

/**
 * Exécution de révision : un appel au modèle avec la persona de l'agent
 * auteur, le contenu actuel, la consigne, le profil et le contexte du jour.
 * Seul outil : revise_proposal, qui écrit la version N + 1 si la production
 * est toujours en version N et à relire. Renvoie le nombre d'éléments
 * produits (1).
 */
export async function runRevision(companyId: string, payload: RevisionRunPayload, run: { agentRunId?: string; agent?: string } = {}) {
  const { agentRunId } = run;
  // Reprise d'une tentative qui avait déjà écrit la version suivante : l'exécution a réussi.
  if (agentRunId) {
    const alreadyWritten = await prisma.proposalRevision.findFirst({
      where: { proposalId: payload.proposalId, fromVersion: payload.fromVersion, agentRunId, proposal: { companyId } },
      select: { id: true },
    });
    if (alreadyWritten) return 1;
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const proposal = await prisma.agentProposal.findFirst({ where: { id: payload.proposalId, companyId } });
  const agent = proposal && isPlanAgent(proposal.agent) ? proposal.agent : null;
  const persona = PERSONAS[agent ?? "co_ceo"];
  if (!proposal || !agent) throw new RevisionConflictError(persona.name, "missing");
  if (run.agent !== undefined && run.agent !== agent) throw new AgentRunConflictError("Révision invalide : l'exécution ne correspond pas à l'auteur de la production.", "outage");
  // Déjà modifiée ou décidée avant l'appel au modèle : rien à réviser, aucun coût engagé.
  if (proposal.status !== "en_attente") throw new RevisionConflictError(persona.name, "decided", proposal.title);
  if (proposal.version !== payload.fromVersion) throw new RevisionConflictError(persona.name, "modified", proposal.title);
  if (revisionRefusal(proposal)) throw new RevisionConflictError(persona.name, "decided", proposal.title);

  let written = false;
  let conflict: RevisionConflictKind | null = null;

  const reviseProposal = betaZodTool({
    name: "revise_proposal",
    description:
      "Enregistre la nouvelle version complète de la production, qui remplace la version actuelle (conservée pour le dirigeant). Un seul appel : il n'y a qu'une production à réviser, aucune autre n'est créée.",
    inputSchema: z.object({
      content: z.string().describe("Contenu complet de la nouvelle version, sous la même forme que la version actuelle, avec la consigne appliquée"),
      summary: z.string().max(REVISION_NOTE_MAX).optional().describe(`Une ou deux phrases, à la première personne, pour dire au dirigeant ce que tu as changé et pourquoi (${REVISION_NOTE_MAX} caractères au plus)`),
    }),
    run: async (input) => {
      if (written) return "La nouvelle version est déjà enregistrée : n'en propose pas d'autre.";
      // Le contenu est enregistré tel quel ; l'espace seul ne compte pas comme un contenu.
      const content = input.content;
      if (!content.trim()) return "Le contenu est vide : rien n'a été enregistré. Renvoie la version complète.";
      if (content.length > 100_000) return "Le contenu dépasse 100 000 caractères : rien n'a été enregistré.";
      if (proposal.kind === "gmail_email") {
        const issue = gmailContentIssue(proposal.content, content);
        if (issue) return issue;
      }
      const saved = await withAgentRunWrite(companyId, agentRunId, async (tx) => {
        // Le contenu conservé est relu dans la transaction, à la version révisée.
        const current = await tx.agentProposal.findFirst({
          where: { id: proposal.id, companyId, version: payload.fromVersion, status: "en_attente" },
          select: { content: true },
        });
        assertAgentExecutionActive();
        if (!current) return false;
        const updated = await tx.agentProposal.updateMany({
          where: { id: proposal.id, companyId, version: payload.fromVersion, status: "en_attente" },
          // Version écrite par l'agent : un ancien brouillon du dirigeant ne la décrit plus.
          data: { content, version: payload.fromVersion + 1, draftSavedAt: null },
        });
        assertAgentExecutionActive();
        if (updated.count !== 1) return false;
        await tx.proposalRevision.create({
          data: { proposalId: proposal.id, fromVersion: payload.fromVersion, previousContent: current.content, source: "agent", instruction: payload.instruction, note: input.summary?.trim().slice(0, REVISION_NOTE_MAX) || null, agentRunId },
        });
        return true;
      });
      if (!saved) {
        conflict = await conflictKind(companyId, proposal.id);
        return "La production a changé entre-temps (modifiée ou décidée par le dirigeant) : rien n'a été enregistré. N'essaie pas à nouveau.";
      }
      written = true;
      return `Version ${payload.fromVersion + 1} enregistrée ; la version ${payload.fromVersion} est conservée.`;
    },
  });

  // Persona, entreprise et règles : stables, mis en cache. Date du jour et nom du dirigeant : hors du bloc mis en cache.
  const stableSystem = `Tu es ${persona.name}, ${persona.role} de BienDecider, un copilote IA pour indépendants et TPE. ${persona.trait}
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
${companyProfileLines(company)}
${directionLine(company.direction)}

Ton rôle ici : réviser une de tes productions selon la consigne du dirigeant, puis enregistrer la nouvelle version via revise_proposal (un seul appel).
Règles strictes :
- Applique la consigne, et seulement elle : garde tout le reste (structure, ton, informations, forme du contenu) tel quel.
- Renvoie le contenu complet de la nouvelle version, jamais un extrait : ce que tu as changé va dans summary, pas dans le contenu.
- Tu ne crées aucune autre production, tu ne publies ni n'envoies rien : le dirigeant relira la nouvelle version.
- N'invente aucun fait, chiffre ou événement absent de la version actuelle ou de la consigne.`;

  const dynamicSystem = runtimeContextLines(company, new Date());

  const { finalMessage, usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_iterations: AGENT_RUN_MAX_TURNS,
    max_tokens: revisionMaxTokens(proposal.content),
    tools: bindAgentTools([reviseProposal]),
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicSystem },
    ],
    messages: [
      {
        role: "user",
        content: `Production à réviser (version ${payload.fromVersion}) — titre : « ${proposal.title} »\n\nContenu actuel :\n${proposal.content}\n\nConsigne du dirigeant : ${payload.instruction}\n\nEnregistre la version ${payload.fromVersion + 1} avec revise_proposal.`,
      },
    ],
  }, agentRunnerOptions()), { companyId, agentRunId, agent, model: AGENT_MODEL });

  if (conflict && !written) throw new RevisionConflictError(persona.name, conflict, proposal.title);
  const persisted = written && await prisma.proposalRevision.findFirst({
    where: { proposalId: proposal.id, fromVersion: payload.fromVersion, agentRunId, proposal: { companyId } },
    select: { id: true },
  });
  ensureAgentProduced(persona.name, persisted ? 1 : 0, { stopReason: finalMessage.stop_reason, usage });
  return 1;
}

/**
 * Clic « Confirmer » sur une carte de révision : vérifie que la production
 * est toujours à relire et en version N, puis crée l'exécution de révision
 * (quota, budget, motifs typés). Rien n'est lancé si une révision de la même
 * production est déjà en cours : already_running avec son runId.
 */
export async function startRevisionFromCard(
  companyId: string,
  input: { proposalId: string; agent: PlanAgent; title: string; fromVersion: number; instruction: string },
): Promise<LaunchResult> {
  const agentName = PERSONAS[input.agent].name;
  const nothing = "rien n'a été demandé";
  const proposal = await prisma.agentProposal.findFirst({ where: { id: input.proposalId, companyId } });
  if (!proposal || proposal.agent !== input.agent) return { ok: false, message: `« ${input.title} » n'existe plus : ${nothing}.` };
  const refusal = revisionRefusal(proposal);
  if (refusal === "prospect") return { ok: false, message: `Un prospect se corrige dans sa fiche, dans Prospection : ${nothing}.` };
  if (refusal === "too_long") return { ok: false, message: `« ${input.title} » est trop longue pour être réécrite d'un coup : ${nothing}. Modifiez-la vous-même avec « Modifier ».` };
  if (refusal) return { ok: false, message: `« ${input.title} » n'est plus à relire (déjà décidée) : ${nothing}.` };
  const alreadyRunning = (runId: string): LaunchResult => ({ ok: false, reason: "already_running", message: failureMessage("already_running", agentName), runId });
  const active = await activeRevisionRun(companyId, proposal.id);
  if (active) return alreadyRunning(active.id);
  if (proposal.version !== input.fromVersion) {
    return { ok: false, message: `« ${input.title} » a changé depuis la proposition de Paul (version ${proposal.version} désormais) : ${nothing}. Redemandez la correction à Paul si elle est toujours utile.` };
  }
  const callStart = new Date();
  try {
    const run = await enqueueRevisionRun({ companyId, agent: input.agent, proposalId: proposal.id, fromVersion: input.fromVersion, instruction: input.instruction, title: proposal.title });
    // Une exécution active créée avant cet appel appartient à une autre confirmation : l'agent y travaille déjà.
    if (ACTIVE_RUN_STATUSES.includes(run.status) && run.createdAt.getTime() < callStart.getTime()) return alreadyRunning(run.id);
    if (run.status === "failed") {
      const reason = isRunFailureReason(run.failureReason) ? run.failureReason : "outage";
      return { ok: false, reason, message: failureMessage(reason, agentName), runId: run.id };
    }
    return {
      ok: true,
      message: `${agentName} prépare la version ${input.fromVersion + 1} de « ${input.title} ». Elle remplacera la version ${input.fromVersion} dans vos décisions, qui restera consultable.`,
      runId: run.id,
    };
  } catch (error) {
    console.error(`Révision ${input.agent} impossible :`, error);
    const reason = classifyRunError(error) ?? "outage";
    // Le message d'un quota est déjà affichable et précise journalier, mensuel ou réservé.
    return { ok: false, reason, message: error instanceof AgentRunQuotaError ? error.message : failureMessage(reason, agentName) };
  }
}
