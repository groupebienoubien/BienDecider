import { prisma } from "@/lib/prisma";

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

function estimateCostUsd(
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

type UsageLike =
  | {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    }
  | undefined;

/**
 * `await anthropic.beta.messages.toolRunner({...})` ne résout qu'au DERNIER
 * tour de la boucle d'outils — si l'agent fait plusieurs aller-retours
 * (web_search, plusieurs propositions...), son `.usage` ne reflète que ce
 * dernier appel, pas la somme réelle facturée par Anthropic. Bug réel
 * signalé le 2026-10-05 : le crédit API se consommait bien plus vite que
 * les coûts affichés dans /admin. Corrigé en itérant la boucle
 * (`for await`, cf. doc Tool Runner) et en sommant l'usage de CHAQUE tour,
 * cache compris.
 */
export async function runToolLoop<
  T extends {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
  },
>(runner: AsyncIterable<T>): Promise<{ finalMessage: T; usage: Required<UsageLike> }> {
  let input_tokens = 0;
  let output_tokens = 0;
  let cache_creation_input_tokens = 0;
  let cache_read_input_tokens = 0;
  let finalMessage: T | undefined;
  for await (const message of runner) {
    input_tokens += message.usage.input_tokens;
    output_tokens += message.usage.output_tokens;
    cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;
    finalMessage = message;
  }
  if (!finalMessage) {
    throw new Error("Le modèle n'a renvoyé aucun message.");
  }
  return {
    finalMessage,
    usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens },
  };
}

/**
 * Même boucle que runToolLoop, en flux : chaque tour du runner est un flux dont
 * le texte est transmis au fur et à mesure, et dont l'usage est sommé à la fin.
 */
export async function runStreamingToolLoop<
  T extends {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
  },
>(
  runner: AsyncIterable<{ on(event: "text", listener: (delta: string) => void): unknown; finalMessage(): Promise<T> }>,
  handlers: { onTurnStart: () => void; onText: (delta: string) => void },
): Promise<{ finalMessage: T; usage: Required<UsageLike> }> {
  let input_tokens = 0;
  let output_tokens = 0;
  let cache_creation_input_tokens = 0;
  let cache_read_input_tokens = 0;
  let finalMessage: T | undefined;
  for await (const stream of runner) {
    handlers.onTurnStart();
    stream.on("text", (delta) => handlers.onText(delta));
    const message = await stream.finalMessage();
    input_tokens += message.usage.input_tokens;
    output_tokens += message.usage.output_tokens;
    cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;
    finalMessage = message;
  }
  if (!finalMessage) {
    throw new Error("Le modèle n'a renvoyé aucun message.");
  }
  return {
    finalMessage,
    usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens },
  };
}

/** Enregistre le coût mesuré ; les appels soumis à un budget ne peuvent ignorer un échec d'écriture. */
export async function recordUsage(params: {
  companyId: string;
  agentRunId?: string;
  reservationId?: string;
  agent: string;
  model: string;
  usage: UsageLike;
}) {
  const inputTokens = params.usage?.input_tokens ?? 0;
  const outputTokens = params.usage?.output_tokens ?? 0;
  const cacheWriteTokens = params.usage?.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = params.usage?.cache_read_input_tokens ?? 0;
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
      if (params.reservationId) {
        await tx.usageReservation.updateMany({
          where: { id: params.reservationId, companyId: params.companyId, releasedAt: null },
          data: { releasedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (params.agentRunId || params.reservationId) throw error;
    console.error("Erreur enregistrement usage (non bloquant):", error);
  }
}
