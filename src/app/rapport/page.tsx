import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AgentByline, EmptyState, PageHeading, SectionTitle, Tag } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { clientGapLabel, computeBusinessTarget, formatDecimal, formatEuros } from "@/lib/business-target";
import { buildResultsTimeline } from "@/lib/results-timeline";

export const dynamic = "force-dynamic";

/** Fenêtre du récit : les huit dernières semaines. */
const WEEKS_SHOWN = 8;
const WEEK_LABEL = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const ITEM_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });

function storySince() {
  return new Date(Date.now() - WEEKS_SHOWN * 7 * 24 * 60 * 60 * 1000);
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export default async function RapportPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const since = storySince();
  const [executed, leads] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { companyId: company.id, status: "executee" },
      select: { title: true, agent: true, kind: true, decidedAt: true, createdAt: true, executionLog: { select: { executedAt: true } } },
    }),
    prisma.lead.findMany({
      where: { companyId: company.id, OR: [{ contactedAt: { gte: since } }, { repliedAt: { gte: since } }, { meetingAt: { gte: since } }, { closedAt: { gte: since } }] },
      select: { name: true, stage: true, contactedAt: true, repliedAt: true, meetingAt: true, closedAt: true },
    }),
  ]);
  const weeks = buildResultsTimeline(
    executed.map((proposal) => ({ title: proposal.title, agent: proposal.agent, kind: proposal.kind, at: proposal.executionLog?.executedAt ?? proposal.decidedAt ?? proposal.createdAt })),
    leads,
    since,
  );
  const target = computeBusinessTarget(company);
  const clientGap = target ? clientGapLabel(target) : null;

  return (
    <AppShell {...await getShellProps(company)}>
      <PageHeading
        kicker="RÉSULTATS"
        title="Ce que vos actions ont donné."
        description="Ce qui a été diffusé, confirmé par le canal, et ce que vous avez déclaré, semaine par semaine."
        actions={<Link className="btn" href="/dashboard?view=historique"><Icon name="history" /> Historique détaillé</Link>}
      />
      <section aria-labelledby="results-target">
        <SectionTitle title="Objectif de chiffre d’affaires"><Link href="/entreprise?tab=objectifs">Actualiser ma situation →</Link></SectionTitle>
        {target ? (
          <div className="metrics metrics-4">
            <div className="metric"><div className="metric-label">CA mensuel déclaré</div><div className="metric-value">{formatEuros(target.current)}</div></div>
            <div className="metric"><div className="metric-label">CA mensuel visé</div><div className="metric-value">{formatEuros(target.target)}</div></div>
            <div className="metric"><div className="metric-label">Écart à combler</div><div className="metric-value">{formatEuros(Math.max(0, target.gap))}</div></div>
            <div className="metric"><div className="metric-label">Clients supplémentaires / {clientGap?.period === "year" ? "an" : "mois"}</div><div className="metric-value">{clientGap ? (clientGap.count === 0 ? "moins de 0,1" : formatDecimal(clientGap.count)) : "Non renseigné"}</div></div>
          </div>
        ) : <EmptyState agent="co_ceo" title="Aucun objectif chiffré renseigné" says="Donnez-moi un chiffre d’affaires à atteindre et je suivrai l’écart avec vous."><Link className="btn primary" href="/entreprise?tab=objectifs#modifier">Renseigner mon objectif chiffré</Link></EmptyState>}
      </section>
      <section aria-label="Semaine par semaine">
        <SectionTitle title="Semaine par semaine">{company.siteSlug && <Link href={`/site/${company.siteSlug}`} target="_blank" rel="noopener noreferrer">Voir le site publié →</Link>}</SectionTitle>
        {weeks.length === 0 ? <EmptyState agent="co_ceo" role="region" label="Résultats à venir" title="Rien de publié pour l’instant" says="Ce qui est réellement publié ou envoyé apparaîtra ici. Une production approuvée ne compte pas tant qu’elle n’est pas diffusée.">
          <Link className={`btn ${target ? "primary" : ""}`} href="/dashboard?view=validation">Examiner les productions</Link>
        </EmptyState> : (
          <div className="results-weeks">
            {weeks.map((week) => (
              <section key={week.start.toISOString()} className="results-week" aria-label={`Semaine du ${WEEK_LABEL.format(week.start)}`}>
                <header>
                  <h3>Semaine du {WEEK_LABEL.format(week.start)}</h3>
                  <small>{[week.diffusions > 0 && plural(week.diffusions, "diffusion", "diffusions"), week.declarations > 0 && plural(week.declarations, "déclaration", "déclarations")].filter(Boolean).join(" · ")}</small>
                </header>
                <ul>
                  {week.items.map((item, index) => (
                    <li key={index} className={`results-item ${item.kind}`}>
                      <span className="results-icon" aria-hidden="true"><Icon name={item.kind === "diffusion" ? "check" : "contact-round"} /></span>
                      <div>
                        <strong>{item.text}</strong>
                        <small>
                          {ITEM_DAY.format(item.at)} · {item.kind === "diffusion"
                            ? <><Tag color="green">Confirmé par le canal</Tag> {item.agent && <AgentByline agent={item.agent} size={16}>l’a préparé</AgentByline>}</>
                            : <Tag color="gray">Déclaré par vous</Tag>}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="legend">Aucun chiffre d’affaires n’est déduit d’une publication. Les mesures avant / après (visites, avis, appels) s’afficheront ici quand elles seront relevées.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
