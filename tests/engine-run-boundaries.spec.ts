import { test as base, expect } from "@playwright/test";
import type { Company, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { requireLocalDatabase } from "./support/local-database";

(globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;
requireLocalDatabase("Agent execution boundary tests");

const test = base.extend<{ company: Company }>({
  company: async ({}, runFixture) => {
    const { prisma } = await import("../src/lib/prisma");
    const company = await prisma.company.create({ data: {
      ownerEmail: `execution-boundary-${randomUUID()}@example.invalid`, name: "Atelier Test", trade: "Artisan", servingArea: "Paris",
    } });
    try { await runFixture(company); }
    finally { await prisma.company.delete({ where: { id: company.id } }); }
  },
});

type CapturedTool = { name: string; run: (input: Record<string, unknown>) => Promise<string> };
type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;
type TransactionDb = { $transaction: (operation: TransactionCallback, options?: unknown) => Promise<unknown> };

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function withRunner<T>(scenario: (tools: CapturedTool[]) => AsyncIterable<unknown>, operation: () => Promise<T>) {
  const { anthropic } = await import("../src/lib/anthropic");
  const messages = anthropic.beta.messages as unknown as { toolRunner: (params: { tools: CapturedTool[] }) => unknown };
  const original = messages.toolRunner;
  messages.toolRunner = (params) => scenario(params.tools);
  try { return await operation(); }
  finally { messages.toolRunner = original; }
}

const finalMessage = () => ({ usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: "end_turn", content: [{ type: "text", text: "Terminé." }] });

for (const agent of ["marketing", "contenu", "demarchage"] as const) {
  test(`audit B3: ${agent} reports no_result when its production transaction cannot commit`, async ({ company }) => {
    const { prisma } = await import("../src/lib/prisma");
    const { AgentNoResultError } = await import("../src/lib/agents/agent-errors");
    const { runMarketingAgent } = await import("../src/lib/agents/marketing");
    const { runContenuAgent } = await import("../src/lib/agents/contenu");
    const { runDemarchageAgent } = await import("../src/lib/agents/demarchage");
    const db = prisma as unknown as TransactionDb;
    const original = db.$transaction;
    let rejectedCommit = false;
    db.$transaction = (operation, options) => original.call(prisma, async (tx) => {
      const result = await operation(tx);
      if (result && typeof result === "object" && "message" in result && "id" in result) {
        rejectedCommit = true;
        throw new Error("Commit refusé après les écritures");
      }
      return result;
    }, options);
    try {
      const launch = () => agent === "marketing" ? runMarketingAgent(company.id)
        : agent === "contenu" ? runContenuAgent(company.id) : runDemarchageAgent(company.id);
      await withRunner((tools) => (async function* () {
        const name = agent === "marketing" ? "record_audit_finding" : agent === "contenu" ? "propose_content" : "propose_prospect";
        const input = agent === "marketing"
          ? { category: "site_web", title: "Constat", summary: "Résumé", whatWorks: "Clair", toImprove: "Contact", actionItems: [] }
          : agent === "contenu" ? { kind: "social_post", title: "Post", content: "Contenu" }
            : { name: "Syndic Test", reason: "Cible locale", segment: "syndics", source: "https://example.invalid" };
        // Le vrai SDK rend aussi une erreur d'outil au modèle, qui peut conclure normalement.
        await expect(tools.find((tool) => tool.name === name)!.run(input)).rejects.toThrow("Commit refusé");
        yield finalMessage();
      })(), async () => { await expect(launch()).rejects.toBeInstanceOf(AgentNoResultError); });
      expect(rejectedCommit).toBe(true);
      expect(await prisma.agentProposal.count({ where: { companyId: company.id } })).toBe(0);
      expect(await prisma.auditFinding.count({ where: { companyId: company.id } })).toBe(0);
      expect(await prisma.lead.count({ where: { companyId: company.id } })).toBe(0);
      expect(await prisma.usageEvent.count({ where: { companyId: company.id } })).toBe(1);
    } finally { db.$transaction = original; }
  });
}

async function captureProspectTool(companyId: string, agentRunId: string) {
  const { anthropic } = await import("../src/lib/anthropic");
  const { runDemarchageAgent } = await import("../src/lib/agents/demarchage");
  const messages = anthropic.beta.messages as unknown as { toolRunner: (params: { tools: CapturedTool[] }) => unknown };
  const original = messages.toolRunner;
  let tools: CapturedTool[] = [];
  messages.toolRunner = (params) => { tools = params.tools; throw new Error("captured"); };
  try { await expect(runDemarchageAgent(companyId, "Syndics", { agentRunId })).rejects.toThrow("captured"); }
  finally { messages.toolRunner = original; }
  return tools.find((tool) => tool.name === "propose_prospect")!;
}

const prospectInput = { name: "Syndic Test", reason: "Cible locale", segment: "syndics", source: "https://example.invalid" };

for (const boundary of ["deadline", "cancelled", "during_transaction"] as const) {
  test(`audit V3: a prospect tool under ${boundary} commits neither proposal nor lead`, async ({ company }) => {
    const { prisma } = await import("../src/lib/prisma");
    const { createAgentExecution, withAgentExecution } = await import("../src/lib/agent-run-execution");
    const { AgentRunLimitError } = await import("../src/lib/agent-run-limits");
    const run = await prisma.agentRun.create({ data: {
      companyId: company.id, agent: "demarchage", requestKey: randomUUID(), payload: {}, status: "running", attempts: 1, startedAt: new Date(),
    } });
    const tool = await captureProspectTool(company.id, run.id);
    const context = createAgentExecution({ companyId: company.id, agentRunId: run.id, attempt: 1, startedAt: run.startedAt! });
    const db = prisma as unknown as TransactionDb;
    const original = db.$transaction;
    let reachedWrite = false;
    if (boundary === "during_transaction") {
      db.$transaction = (operation, options) => original.call(prisma, (tx) => operation(new Proxy(tx, {
        get(target, key) {
          if (key !== "agentProposal") return Reflect.get(target, key);
          return new Proxy(target.agentProposal, { get(model, method) {
            if (method !== "create") return Reflect.get(model, method);
            return async (...args: Parameters<typeof model.create>) => {
              const result = await model.create(...args);
              reachedWrite = true;
              context.deadlineAt = Date.now() - 1;
              return result;
            };
          } });
        },
      })), options);
    }
    let toolCompletion = Promise.resolve();
    try {
      const execution = withAgentExecution(context, async () => {
        if (boundary === "deadline") context.deadlineAt = Date.now() - 1;
        if (boundary === "cancelled") context.controller.abort(new AgentRunLimitError("cancelled"));
        toolCompletion = expect(tool.run(prospectInput)).rejects.toBeInstanceOf(AgentRunLimitError);
        await toolCompletion;
      });
      if (boundary === "cancelled") await expect(execution).rejects.toBeInstanceOf(AgentRunLimitError);
      else await execution;
      await toolCompletion;
      expect(reachedWrite).toBe(boundary === "during_transaction");
      expect(await prisma.agentProposal.count({ where: { companyId: company.id } })).toBe(0);
      expect(await prisma.lead.count({ where: { companyId: company.id } })).toBe(0);
    } finally { db.$transaction = original; }
  });
}

test("audit B1: a blocked preparation read cannot keep the execution alive past its deadline", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { runContenuAgent } = await import("../src/lib/agents/contenu");
  const { createAgentExecution, withAgentExecution } = await import("../src/lib/agent-run-execution");
  const { AgentRunLimitError } = await import("../src/lib/agent-run-limits");
  const release = deferred();
  const entered = deferred();
  const original = prisma.company.findUniqueOrThrow;
  let modelRequests = 0;
  let preparationFinished = false;
  prisma.company.findUniqueOrThrow = (async (...args: Parameters<typeof original>) => {
    entered.resolve();
    await release.promise;
    return original.apply(prisma.company, args);
  }) as unknown as typeof original;
  let worker: Promise<unknown> | undefined;
  try {
    await withRunner(() => (async function* () { modelRequests++; yield finalMessage(); })(), async () => {
      const context = createAgentExecution({ companyId: company.id, deadlineAt: Date.now() + 200 });
      const execution = withAgentExecution(context, async () => {
        worker = runContenuAgent(company.id).finally(() => { preparationFinished = true; });
        return worker;
      });
      await entered.promise;
      await expect(execution).rejects.toBeInstanceOf(AgentRunLimitError);
      expect(preparationFinished).toBe(false);
      expect(modelRequests).toBe(0);
      release.resolve();
      await expect(worker).rejects.toBeInstanceOf(AgentRunLimitError);
      expect(modelRequests).toBe(0);
      expect(await prisma.agentProposal.count({ where: { companyId: company.id } })).toBe(0);
    });
  } finally {
    release.resolve();
    await worker?.catch(() => undefined);
    prisma.company.findUniqueOrThrow = original;
  }
});

test("audit B1: the real worker returns while preparation is blocked and keeps its unfinalized budget", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { processAgentRun } = await import("../src/lib/agent-runs");
  const { currentAgentExecution } = await import("../src/lib/agent-run-execution");
  const run = await prisma.agentRun.create({ data: {
    companyId: company.id, agent: "contenu", requestKey: randomUUID(), payload: { kind: "direct", agent: "contenu" }, reservedCostUsd: 1,
  } });
  const release = deferred();
  const entered = deferred();
  const originalRead = prisma.company.findUniqueOrThrow;
  const originalTimer = globalThis.setTimeout;
  let readReleased = false;
  let requests = 0;
  prisma.company.findUniqueOrThrow = (async (...args: Parameters<typeof originalRead>) => {
    entered.resolve();
    await release.promise;
    readReleased = true;
    return originalRead.apply(prisma.company, args);
  }) as unknown as typeof originalRead;
  // Seule l'échéance de ce worker est raccourcie ; les attentes Prisma et les
  // autres timers gardent leur durée réelle. La logique de production est exécutée.
  globalThis.setTimeout = ((...args: Parameters<typeof originalTimer>) => {
    const context = currentAgentExecution();
    if (context?.agentRunId === run.id && typeof args[1] === "number" && args[1] > 260_000) {
      context.deadlineAt = Date.now() + 100;
      args[1] = 100;
    }
    return Reflect.apply(originalTimer, globalThis, args);
  }) as typeof originalTimer;
  try {
    await withRunner(() => (async function* () { requests++; yield finalMessage(); })(), async () => {
      const processing = processAgentRun(run.id);
      await entered.promise;
      await processing;
      expect(readReleased).toBe(false);
      await expect.poll(async () => (await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("failed");
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).reservedCostUsd).toBe(1);
      expect(await prisma.usageEvent.count({ where: { agentRunId: run.id } })).toBe(0);
      release.resolve();
      await expect.poll(async () => (await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).reservedCostUsd).toBe(0);
      expect(requests).toBe(0);
      expect(await prisma.agentProposal.count({ where: { companyId: company.id } })).toBe(0);
    });
  } finally {
    release.resolve();
    globalThis.setTimeout = originalTimer;
    prisma.company.findUniqueOrThrow = originalRead;
  }
});

for (const target of ["card", "plan_action", "uncovered_request"] as const) {
  test(`audit B2: a chat ${target} released after cancellation leaves no orphan write`, async ({ company }) => {
    const { prisma } = await import("../src/lib/prisma");
    const { runCoCeoTurn } = await import("../src/lib/agents/co-ceo");
    const { createAgentExecution, withAgentExecution } = await import("../src/lib/agent-run-execution");
    const { AgentRunLimitError } = await import("../src/lib/agent-run-limits");
    const entered = deferred();
    const release = deferred();
    const toolFinished = deferred();
    const db = prisma as unknown as TransactionDb;
    const original = db.$transaction;
    const table = target === "card" ? "paulPendingAction" : target === "plan_action" ? "actionPlanItem" : "uncoveredRequest";
    let intercepted = false;
    db.$transaction = (operation, options) => original.call(prisma, (tx) => operation(new Proxy(tx, {
      get(transaction, key) {
        const model = Reflect.get(transaction, key);
        if (key !== table) return model;
        return new Proxy(model, { get(delegate, method) {
          const fn = Reflect.get(delegate, method);
          if (method !== "create") return fn;
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(fn, delegate, args);
            intercepted = true;
            entered.resolve();
            await release.promise;
            return result;
          };
        } });
      },
    })), options);
    let chat: Promise<unknown> | undefined;
    try {
      await withRunner((tools) => (async function* () {
        try {
          const name = target === "card" ? "propose_profile_update" : target === "plan_action" ? "propose_launch_contenu" : "record_uncovered_request";
          const input = target === "card" ? { ownerName: "Samuel Morel" }
            : target === "plan_action" ? { actionTitle: "Préparer trois posts", brief: "Montrer les chantiers", outcome: "Trois posts à relire", theme: "Visibilité", priority: 2 }
              : { request: "Gérer ma comptabilité" };
          await tools.find((tool) => tool.name === name)!.run(input);
          yield finalMessage();
        } finally { toolFinished.resolve(); }
      })(), async () => {
        const context = createAgentExecution({ companyId: company.id });
        const execution = withAgentExecution(context, () => {
          chat = runCoCeoTurn(company.id, "Prépare cette demande.");
          return chat;
        });
        await entered.promise;
        context.controller.abort(new AgentRunLimitError("cancelled"));
        await expect(execution).rejects.toBeInstanceOf(AgentRunLimitError);
        release.resolve();
        await chat?.catch(() => undefined);
        await toolFinished.promise;
        expect(intercepted).toBe(true);
        expect(await prisma.paulPendingAction.count({ where: { companyId: company.id } })).toBe(0);
        expect(await prisma.actionPlanItem.count({ where: { companyId: company.id } })).toBe(0);
        expect(await prisma.uncoveredRequest.count({ where: { companyId: company.id } })).toBe(0);
      });
    } finally {
      release.resolve();
      await chat?.catch(() => undefined);
      db.$transaction = original;
    }
  });
}
