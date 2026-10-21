/**
 * Chronologie des résultats, semaine par semaine (#223). Calcul déterministe : deux sources
 * distinctes, jamais mélangées ni interprétées.
 * - « diffusion » : publication ou envoi confirmé par le canal (preuve technique) ;
 * - « declaration » : ce que le dirigeant a déclaré (contact, réponse, rendez-vous, client).
 * Aucune vente n'est déduite d'une publication.
 */
export type TimelineItem = { kind: "diffusion" | "declaration"; at: Date; text: string; agent?: string; productionKind?: string };
export type TimelineWeek = { start: Date; items: TimelineItem[]; diffusions: number; declarations: number };

type PublishedProduction = { title: string; agent: string; kind: string; at: Date };
type DeclaredLead = { name: string; stage: string; contactedAt: Date | null; repliedAt: Date | null; meetingAt: Date | null; closedAt: Date | null };

const DIFFUSION_LABELS: Record<string, string> = {
  social_post: "Post publié sur Facebook",
  site_web_content: "Page mise en ligne",
  gmail_email: "Email envoyé",
  prospecting_email: "Email envoyé",
};

/** Lundi 00:00 (heure locale) de la semaine de `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function declarations(lead: DeclaredLead): TimelineItem[] {
  const declared: TimelineItem[] = [];
  const add = (at: Date | null, text: string) => { if (at) declared.push({ kind: "declaration", at, text }); };
  add(lead.contactedAt, `Contact pris avec ${lead.name}`);
  add(lead.repliedAt, `Réponse de ${lead.name}`);
  add(lead.meetingAt, `Rendez-vous avec ${lead.name}`);
  if (lead.stage === "gagne") add(lead.closedAt, `${lead.name} est devenu client`);
  return declared;
}

export function buildResultsTimeline(published: PublishedProduction[], leads: DeclaredLead[], since: Date): TimelineWeek[] {
  const items: TimelineItem[] = [
    ...published.map((production) => ({
      kind: "diffusion" as const,
      at: production.at,
      text: `${DIFFUSION_LABELS[production.kind] ?? "Production diffusée"} : ${production.title}`,
      agent: production.agent,
      productionKind: production.kind,
    })),
    ...leads.flatMap(declarations),
  ].filter((item) => item.at >= since).sort((a, b) => b.at.getTime() - a.at.getTime());

  const weeks = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const key = weekStart(item.at).getTime();
    weeks.set(key, [...(weeks.get(key) ?? []), item]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b - a)
    .map(([start, weekItems]) => ({
      start: new Date(start),
      items: weekItems,
      diffusions: weekItems.filter((item) => item.kind === "diffusion").length,
      declarations: weekItems.filter((item) => item.kind === "declaration").length,
    }));
}
