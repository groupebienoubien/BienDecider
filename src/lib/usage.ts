import { prisma } from "@/lib/prisma";
import { assertAgentExecutionActive, awaitAgentOperation, createAgentExecution, currentAgentExecution, withAgentExecution } from "@/lib/agent-run-execution";
import { AGENT_RUN_COST_RESERVATION_USD, AGENT_RUN_MAX_TURNS, AgentRunLimitError } from "@/lib/agent-run-limits";

/**
 * Tarifs par modèle (USD / million de tokens). Source : tarification
 * officielle Anthropic au 2026-10. À mettre à jour si le modèle change
 * (cf. AGENT_MODEL dans src/lib/anthropic.ts) ou si les prix évoluent —
 * sinon les coûts affichés dans la vue admin dérivent silencieusement.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Un cache WRITE coûte ~1.25x le prix d'entrée standard (TTL 5 min, celui
 * utilisé partout ici), un cache READ ~0.1x — tarifs génériques Anthropic,
 * pas d'exception connue pour claude-sonnet-5-5 (cf. doc prompt caching).
 * Si ce n'était pas pris en compte, le prompt caching ajouté le 2026-10-05
 * (cf. agents/*.ts) referait dériver silencieusement le coût affiché en
 * admin — exactement le bug déjà corrigé une fois sur ce fichier.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(
  model: string,
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number },
): number {
  const price = PRICING[model];
  if (!price) return 0; // modèle inconnu du barème : on trace les tokens, coût à 0 plutôt qu'un chiffre inventé
  return (
    (tokens.input * price.input +
      tokens.cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
      tokens.cacheRead * price.input * CACHE_READ_MULTIPLIER +
      tokens.output * price.output) /
    1_000_000
  );
}

export type UsageLike =
  | {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    }
  | undefined;

export type UsageTotal = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
export type ToolLoopOptions = {
  companyId?: string; agentRunId?: string; reservationId?: string; agent?: string; model?: string;
  persistUsage?: (usage: UsageTotal) => Promise<void>;
  maxTurns?: number; maxCostUsd?: number;
};
type MeasuredMessage = { usage: Exclude<UsageLike, undefined>; stop_reason?: string | null };
type ToolRunner<T> = AsyncIterable<T> & { generateToolResponse?: () => Promise<unknown> };
const emptyUsage = (): UsageTotal => ({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
function addUsage(total: UsageTotal, usage: UsageLike) {
  total.input_tokens += usage?.input_tokens ?? 0;
  total.output_tokens += usage?.output_tokens ?? 0;
  total.cache_creation_input_tokens += usage?.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += usage?.cache_read_input_tokens ?? 0;
}

async function measuredLoop<T extends MeasuredMessage, R>(runner: ToolRunner<R>, read: (item: R, partial: (usage: UsageLike) => void) => Promise<T>, options: ToolLoopOptions, partialOf?: (item: R) => UsageLike): Promise<{ finalMessage: T; usage: UsageTotal }> {
  const context = currentAgentExecution();
  if (!context) return withAgentExecution(createAgentExecution({ companyId: options.companyId ?? "" }), () => measuredLoop(runner, read, options, partialOf));
  const usage = emptyUsage();
  const iterator = runner[Symbol.asyncIterator]();
  let finalMessage: T | undefined;
  let primaryError: unknown;
  let finished = false;
  let turns = 0;
  try {
    while (true) {
      assertAgentExecutionActive(context);
      const item = await awaitAgentOperation(iterator.next(), context);
      if (item.done) { finished = true; break; }
      let partialUsage: UsageLike;
      let message: T;
      try { message = await awaitAgentOperation(read(item.value, (partial) => { partialUsage = partial; }), context); }
      catch (error) { addUsage(usage, partialOf?.(item.value) ?? partialUsage); throw error; }
      addUsage(usage, message.usage);
      finalMessage = message;
      turns++;
      assertAgentExecutionActive(context);
      const cost = estimateCostUsd(options.model ?? "claude-sonnet-5-5", { input: usage.input_tokens, output: usage.output_tokens, cacheWrite: usage.cache_creation_input_tokens, cacheRead: usage.cache_read_input_tokens });
      const limit = turns >= Math.min(options.maxTurns ?? AGENT_RUN_MAX_TURNS, AGENT_RUN_MAX_TURNS) ? "turns"
        : cost >= Math.min(options.maxCostUsd ?? AGENT_RUN_COST_RESERVATION_USD, AGENT_RUN_COST_RESERVATION_USD) ? "cost" : undefined;
      if (limit) {
        // The installed SDK yields the assistant before executing its tools.
        // Complete this paid turn without resuming next() into a new request.
        const continues = message.stop_reason === "tool_use" || message.stop_reason === "pause_turn" || message.stop_reason === "compaction" || message.stop_reason === undefined;
        if (continues) {
          if (runner.generateToolResponse) await awaitAgentOperation(runner.generateToolResponse(), context);
          assertAgentExecutionActive(context);
          throw new AgentRunLimitError(limit);
        }
        finished = true;
        break;
      }
    }
    if (!finalMessage) throw new Error("Le modele n'a renvoye aucun message.");
    return { finalMessage, usage };
  } catch (error) {
    primaryError = error;
    // Revoke writes immediately while still awaiting accounting on ordinary
    // failures. The invocation aborts its provider signal after finalization;
    // its deadline can still interrupt a stalled finalizer in the meantime.
    context.active = false;
    throw error;
  } finally {
    // A suspended tool cannot hold the worker; the guard rejects late writes.
    if (!finished) void Promise.resolve(iterator.return?.()).catch(() => undefined);
    const finalize = async () => {
      if (options.persistUsage) await options.persistUsage(usage);
      else if (options.companyId && options.agent && options.model) await recordUsage({ companyId: options.companyId, agentRunId: options.agentRunId, reservationId: options.reservationId, agent: options.agent, model: options.model, usage, required: true });
      else return;
      context.usageFinalized = true;
    };
    const finalization = finalize();
    finalization.catch(() => undefined);
    try {
      const remaining = context.deadlineAt - Date.now();
      if (remaining <= 0) throw new AgentRunLimitError("deadline");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([finalization, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AgentRunLimitError("deadline")), remaining); })]); }
      finally { clearTimeout(timer); }
    } catch (error) {
      if (!primaryError) throw error;
      console.error("Finalisation de la consommation du tour echoue :", error);
    }
  }
}

/** Aggregate every received turn and finalize once on success or failure. */
export async function runToolLoop<T extends MeasuredMessage>(runner: ToolRunner<T>, options: ToolLoopOptions = {}): Promise<{ finalMessage: T; usage: UsageTotal }> {
  return measuredLoop(runner, async (message) => message, options);
}

type MeasuredStream<T> = {
  on(event: "text", listener: (delta: string) => void): unknown;
  finalMessage(): Promise<T>;
  readonly currentMessage?: { usage: UsageLike };
};
export async function runStreamingToolLoop<T extends MeasuredMessage>(runner: ToolRunner<MeasuredStream<T>>, handlers: { onTurnStart: () => void; onText: (delta: string) => void }, options: ToolLoopOptions = {}): Promise<{ finalMessage: T; usage: UsageTotal }> {
  return measuredLoop(runner, async (stream, partial) => {
    handlers.onTurnStart();
    stream.on("text", (delta) => { if (!currentAgentExecution()?.signal.aborted) handlers.onText(delta); });
    try { return await stream.finalMessage(); }
    finally { partial(stream.currentMessage?.usage); }
  }, options, (stream) => stream.currentMessage?.usage);
}

/** Enregistre le coût mesuré ; les appels soumis à un budget ne peuvent ignorer un échec d'écriture. */
export async function recordUsage(params: {
  companyId: string;
  agentRunId?: string;
  reservationId?: string;
  agent: string;
  model: string;
  usage: UsageLike;
  required?: boolean;
}) {
  const inputTokens = params.usage?.input_tokens ?? 0;
  const outputTokens = params.usage?.output_tokens ?? 0;
  const cacheWriteTokens = params.usage?.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = params.usage?.cache_read_input_tokens ?? 0;
  const context = currentAgentExecution();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({
        data: {
          companyId: params.companyId,
          agentRunId: params.agentRunId,
          reservationId: params.reservationId,
          agent: params.agent,
          model: params.model,
          // Tokens "entrée" au sens large (frais + écrits en cache + lus du
          // cache) : pas de colonne dédiée au détail cache pour l'instant,
          // seul costUsd a besoin de la tarification différenciée.
          inputTokens: inputTokens + cacheWriteTokens + cacheReadTokens,
          outputTokens,
          costUsd: estimateCostUsd(params.model, {
            input: inputTokens,
            output: outputTokens,
            cacheWrite: cacheWriteTokens,
            cacheRead: cacheReadTokens,
          }),
        },
      });
      if (params.agentRunId && context?.attempt !== undefined) {
        await tx.agentRun.updateMany({ where: { id: params.agentRunId, companyId: params.companyId, attempts: context.attempt }, data: { reservedCostUsd: 0 } });
      }
      if (params.reservationId) {
        await tx.usageReservation.updateMany({
          where: { id: params.reservationId, companyId: params.companyId, releasedAt: null },
          data: { releasedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (params.required || params.agentRunId || params.reservationId) throw error;
    console.error("Erreur enregistrement usage (non bloquant):", error);
  }
}
