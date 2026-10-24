import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AGENT_RUN_DEADLINE_MS, AgentRunLimitError } from "@/lib/agent-run-limits";

export type AgentExecutionContext = {
  companyId: string;
  agentRunId?: string;
  attempt?: number;
  startedAt: Date;
  deadlineAt: number;
  controller: AbortController;
  signal: AbortSignal;
  active: boolean;
  usageFinalized: boolean;
};

const executions = new AsyncLocalStorage<AgentExecutionContext>();
export function currentAgentExecution() { return executions.getStore(); }

export function createAgentExecution(params: {
  companyId: string; agentRunId?: string; attempt?: number; startedAt?: Date; deadlineAt?: number;
}): AgentExecutionContext {
  const startedAt = params.startedAt ?? new Date();
  const controller = new AbortController();
  return { ...params, startedAt, deadlineAt: params.deadlineAt ?? startedAt.getTime() + AGENT_RUN_DEADLINE_MS,
    controller, signal: controller.signal, active: true, usageFinalized: false };
}

export function assertAgentExecutionActive(context = currentAgentExecution()) {
  if (!context) return;
  if (Date.now() >= context.deadlineAt) throw new AgentRunLimitError("deadline");
  if (!context.active || context.signal.aborted) throw context.signal.reason instanceof Error ? context.signal.reason : new AgentRunLimitError("cancelled");
}

/** Bound every awaited operation, including preparation and usage finalization. The
 * underlying promise may settle later, but its captured context stays cancelled. */
export async function awaitAgentOperation<T>(operation: PromiseLike<T>, context = currentAgentExecution()): Promise<T> {
  if (!context) return operation;
  const pending = Promise.resolve(operation);
  pending.catch(() => undefined);
  assertAgentExecutionActive(context);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(context.signal.reason instanceof Error ? context.signal.reason : new AgentRunLimitError("cancelled"));
    context.signal.addEventListener("abort", cancel, { once: true });
    pending.then(resolve, reject).finally(() => context.signal.removeEventListener("abort", cancel));
  });
}

export async function withAgentExecution<T>(context: AgentExecutionContext, operation: () => Promise<T>): Promise<T> {
  return executions.run(context, async () => {
    const timer = setTimeout(() => context.controller.abort(new AgentRunLimitError("deadline")), Math.max(0, context.deadlineAt - Date.now()));
    try {
      assertAgentExecutionActive(context);
      return await awaitAgentOperation(Promise.resolve().then(operation), context);
    } finally {
      context.active = false;
      context.controller.abort(new AgentRunLimitError("cancelled"));
      clearTimeout(timer);
    }
  });
}

export function agentRunnerOptions() { return { signal: currentAgentExecution()?.signal }; }

/** Tool callbacks keep their originating turn even when invoked by a runner
 * (or a captured active tool) outside the initiating async chain. */
export function bindAgentTools<T extends readonly object[]>(tools: T): T {
  const context = currentAgentExecution();
  if (!context) return tools;
  return tools.map((tool) => new Proxy(tool, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (key !== "run" || typeof value !== "function") return value;
      return (...args: unknown[]) => executions.run(context, async () => {
        assertAgentExecutionActive(context);
        const result = await Reflect.apply(value, target, args);
        assertAgentExecutionActive(context);
        return result;
      });
    },
  })) as unknown as T;
}

function guardedTransaction(tx: Prisma.TransactionClient, context: AgentExecutionContext | undefined): Prisma.TransactionClient {
  const delegates = new Map<PropertyKey, unknown>();
  const wrap = (target: object) => new Proxy(target, {
    get(delegate, key) {
      const value = Reflect.get(delegate, key);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        assertAgentExecutionActive(context);
        const result = await Reflect.apply(value, delegate, args);
        assertAgentExecutionActive(context);
        return result;
      };
    },
  });
  return new Proxy(tx, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value === "function") return async (...args: unknown[]) => {
        assertAgentExecutionActive(context);
        const result = await Reflect.apply(value, target, args);
        assertAgentExecutionActive(context);
        return result;
      };
      if (!value || typeof value !== "object") return value;
      if (!delegates.has(key)) delegates.set(key, wrap(value));
      return delegates.get(key);
    },
  });
}

/** The run row lock is also taken by retry/expiry/finalization. Check both
 * sides of the callback so cancellation during an awaited write rolls it back. */
export async function withAgentRunWrite<T>(companyId: string, agentRunId: string | undefined, write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const context = currentAgentExecution();
  agentRunId ??= context?.agentRunId;
  assertAgentExecutionActive(context);
  if (context && (context.companyId !== companyId || (agentRunId && context.agentRunId !== agentRunId))) throw new AgentRunLimitError("cancelled");
  return prisma.$transaction(async (tx) => {
    assertAgentExecutionActive(context);
    if (agentRunId) {
      // A caller outside a captured attempt cannot prove ownership of this run.
      if (!context || context.attempt === undefined) throw new AgentRunLimitError("cancelled");
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AgentRun" WHERE "id" = ${agentRunId} AND "companyId" = ${companyId} AND "status" = 'running' AND "attempts" = ${context.attempt} FOR UPDATE`;
      assertAgentExecutionActive(context);
      if (rows.length !== 1) throw new AgentRunLimitError("cancelled");
    }
    const result = await write(guardedTransaction(tx, context));
    assertAgentExecutionActive(context);
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
