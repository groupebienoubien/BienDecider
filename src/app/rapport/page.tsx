import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { PageHeading, SectionTitle } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { computeBusinessTarget, formatEuros } from "@/lib/business-target";
import { getFunnelStats } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export default async function RapportPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const [approvedCount, executedCount, executed, funnel] = await Promise.all([
    prisma.agentProposal.count({ where: { companyId: company.id, status: { in: ["validee", "modifiee"] } } }),
    prisma.agentProposal.count({ where: { companyId: company.id, status: "executee" } }),
    prisma.agentProposal.findMany({ where: { companyId: company.id, status: "executee" }, orderBy: { decidedAt: "desc" }, take: 10 }),
    getFunnelStats(company.id),
  ]);
  const target = computeBusinessTarget(company);

  return (
    <AppShell {...await getShellProps(company)}>
      <PageHeading
        kicker="RÉSULTATS COMMERCIAUX"
        title="Résultats"
        description="Seuls les faits enregistrés ou déclarés par vous sont comptés : aucun résultat commercial n’est attribué sans preuve."
        actions={<Link className="btn" href="/dashboard">Revenir aux actions</Link>}
      />
      <section aria-labelledby="results-target">
        <SectionTitle title="Objectif de chiffre d’affaires"><Link href="/entreprise">Actualiser ma situation →</Link></SectionTitle>
        {target ? (
          <div className="metrics metrics-4">
            <div className="metric"><div className="metric-label">CA mensuel déclaré</div><div className="metric-value">{formatEuros(target.current)}</div></div>
            <div className="metric"><div className="metric-label">CA mensuel visé</div><div className="metric-value">{formatEuros(target.target)}</div></div>
            <div className="metric"><div className="metric-label">Écart à combler</div><div className="metric-value">{formatEuros(Math.max(0, target.gap))}</div></div>
            <div className="metric"><div className="metric-label">Clients supplémentaires / mois</div><div className="metric-value">{target.extraClientsPerMonth ?? "Non renseigné"}</div></div>
          </div>
        ) : <div className="empty"><p>Aucun objectif chiffré renseigné.</p><Link className="btn primary" href="/entreprise?tab=objectifs#modifier">Renseigner mon objectif chiffré</Link></div>}
      </section>
      <section>
        <SectionTitle title="Prospection · ce mois-ci"><Link href="/prospection">Suivre les contacts →</Link></SectionTitle>
        <div className="metrics metrics-4">
          {([
            ["Prospects contactés", funnel.thisMonth.contactes],
            ["Réponses reçues", funnel.thisMonth.reponses],
            ["Rendez-vous", funnel.thisMonth.rdv],
            ["Clients gagnés déclarés", funnel.thisMonth.clients],
          ] as const).map(([label, count]) => <div key={label} className="metric"><div className="metric-label">{label}</div><div className="metric-value">{String(count).padStart(2, "0")}</div></div>)}
        </div>
      </section>
      <section>
        <SectionTitle title="Productions · depuis le début"><Link href="/dashboard?view=historique">Consulter l’historique des décisions →</Link></SectionTitle>
        <div className="metrics" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="metric"><div className="metric-label"><span className="dot orange" /> Approuvées, pas encore publiées ni envoyées</div><div className="metric-value">{String(approvedCount).padStart(2, "0")}</div></div>
          <div className="metric"><div className="metric-label"><span className="dot green" /> Exécutées par BienDecider</div><div className="metric-value">{String(executedCount).padStart(2, "0")}</div></div>
        </div>
      </section>
      <section>
        <SectionTitle title="Dernières réalisations">{company.siteSlug && <Link href={`/site/${company.siteSlug}`} target="_blank" rel="noopener noreferrer">Voir le site publié →</Link>}</SectionTitle>
        {executed.length === 0 ? <div className="empty" role="region" aria-label="Résultats à venir">
          <p>Aucune publication ou exécution enregistrée. Seules les actions effectivement réalisées par BienDecider apparaissent ici ; une proposition approuvée ne compte pas comme exécutée.</p>
          <Link className="btn primary" href="/dashboard?view=validation">Examiner les productions</Link>
        </div> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Réalisation</th><th>Agent</th></tr></thead>
            <tbody>{executed.map((proposal) => <tr key={proposal.id}><td><strong>{proposal.title}</strong></td><td>{PERSONAS[proposal.agent as AgentKey]?.name ?? proposal.agent}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </AppShell>
  );
}
