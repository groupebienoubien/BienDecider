/**
 * Plafonds par exécution (story 3.2, validés par les PF) : au second test en
 * production, un seul passage de Jean-Claude produisait 13 éléments. Chaque
 * outil d'écriture d'un agent compte ce que l'exécution a déjà écrit et
 * refuse d'aller au-delà. Aucun plafond global sur les décisions en attente.
 */
export const RUN_CAPS = {
  prospect: 5,
  piste_croissance: 2,
  prospecting_email: 2,
  social_post: 3,
  site_web_content: 1,
  // gbp_update et review_reply partagent un même plafond.
  fiche_google: 2,
  audit_finding: 4,
} as const;

export type RunCapGroup = keyof typeof RUN_CAPS;

/** Kinds de proposition comptés ensemble pour chaque groupe (les constats sont dans une autre table). */
const GROUP_KINDS: Record<Exclude<RunCapGroup, "audit_finding">, string[]> = {
  prospect: ["prospect"],
  piste_croissance: ["piste_croissance"],
  prospecting_email: ["prospecting_email"],
  social_post: ["social_post"],
  site_web_content: ["site_web_content"],
  fiche_google: ["gbp_update", "review_reply"],
};

/** Libellé du groupe dans le message rendu au modèle. */
const GROUP_LABELS: Record<RunCapGroup, string> = {
  prospect: "les prospects",
  piste_croissance: "les pistes de croissance",
  prospecting_email: "les modèles d'email",
  social_post: "les posts",
  site_web_content: "le contenu de site",
  fiche_google: "les propositions de fiche Google (mise à jour et réponse aux avis)",
  audit_finding: "les constats d'audit",
};

/** Groupe de plafond d'un kind de proposition, ou d'un constat d'audit ; null pour un kind sans plafond. */
export function capGroup(kind: string): RunCapGroup | null {
  if (kind === "audit_finding") return "audit_finding";
  for (const [group, kinds] of Object.entries(GROUP_KINDS)) {
    if (kinds.includes(kind)) return group as RunCapGroup;
  }
  return null;
}

/** Message renvoyé au modèle quand le plafond du groupe est atteint. */
export function runCapReachedMessage(group: RunCapGroup) {
  return `Plafond atteint pour ${GROUP_LABELS[group]} dans ce passage : n'en propose pas d'autre.`;
}

/**
 * Nombre d'éléments du groupe déjà écrits par la tentative en cours de
 * l'exécution, compté en base. Une relance réutilise l'identifiant de
 * l'exécution : seules les écritures postérieures au début de la tentative
 * en cours (`AgentRun.startedAt`, remis à jour à chaque reprise) comptent.
 */
async function countRunWrites(agentRunId: string, group: RunCapGroup) {
  // Import différé : les règles de plafond restent testables sans base de données.
  const { prisma } = await import("@/lib/prisma");
  const run = await prisma.agentRun.findUnique({ where: { id: agentRunId }, select: { startedAt: true } });
  const since = run?.startedAt ? { createdAt: { gte: run.startedAt } } : {};
  if (group === "audit_finding") return prisma.auditFinding.count({ where: { agentRunId, ...since } });
  return prisma.agentProposal.count({ where: { agentRunId, kind: { in: GROUP_KINDS[group] }, ...since } });
}

/** true si l'exécution peut encore écrire un élément du groupe ; sans exécution (appel hors run), aucun plafond. */
export async function checkRunCap(agentRunId: string | undefined, group: RunCapGroup) {
  if (!agentRunId) return true;
  return (await countRunWrites(agentRunId, group)) < RUN_CAPS[group];
}

// Le Tool Runner exécute en parallèle les appels d'outils d'un même tour : le
// contrôle et l'écriture d'une même exécution sont sérialisés ici, sinon deux
// appels simultanés liraient le même compte et dépasseraient le plafond.
// Ce verrou est en mémoire : il ne vaut qu'au sein d'un processus, ce qui
// suffit tant qu'une exécution tourne dans un seul processus (c'est le cas
// aujourd'hui : le worker la traite de bout en bout).
const runLocks = new Map<string, Promise<unknown>>();

export type RunCapDeps = {
  check?: (agentRunId: string, group: RunCapGroup) => Promise<boolean>;
  locks?: Map<string, Promise<unknown>>;
};

/**
 * Écrit via `write` si le plafond du groupe n'est pas atteint pour
 * l'exécution, sinon n'écrit rien et renvoie le message de plafond.
 * `write` peut renvoyer son propre refus (ex. doublon d'un rejet) : rien
 * n'étant écrit, il n'est pas compté. Les dépendances sont injectables pour
 * les tests sans base.
 */
export async function withRunCap(
  agentRunId: string | undefined,
  kind: string,
  write: () => Promise<string>,
  { check = checkRunCap, locks = runLocks }: RunCapDeps = {},
): Promise<string> {
  const group = capGroup(kind);
  if (!agentRunId || !group) return write();
  const previous = locks.get(agentRunId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    if (!(await check(agentRunId, group))) return runCapReachedMessage(group);
    return write();
  });
  locks.set(agentRunId, current);
  try {
    return await current;
  } finally {
    if (locks.get(agentRunId) === current) locks.delete(agentRunId);
  }
}
