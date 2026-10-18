import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";
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
  const pendingCount = await getPendingDecisionCount(company.id);

  return (
    <AppShell companyName={company.name} companyTrade={company.trade} companyArea={company.servingArea} pendingCount={pendingCount}>
      <div className="w-full">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">Résultats</h1>
          <Link href="/dashboard" className="text-sm font-medium text-indigo-600 underline">Revenir aux actions</Link>
        </header>
        <section className="mt-6 border-y border-slate-200 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Objectif de chiffre d&apos;affaires</h2>
            <Link href="/entreprise" className="text-xs text-indigo-600 underline">Actualiser ma situation</Link>
          </div>
          {target ? (
            <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">CA mensuel déclaré</dt><dd className="mt-1 text-xl font-semibold">{formatEuros(target.current)}</dd></div>
              <div><dt className="text-xs text-slate-500">CA mensuel visé</dt><dd className="mt-1 text-xl font-semibold">{formatEuros(target.target)}</dd></div>
              <div><dt className="text-xs text-slate-500">Écart à combler</dt><dd className="mt-1 text-xl font-semibold text-amber-700">{formatEuros(Math.max(0, target.gap))}</dd></div>
              <div><dt className="text-xs text-slate-500">Clients supplémentaires / mois</dt><dd className="mt-1 text-xl font-semibold">{target.extraClientsPerMonth ?? "Non renseigné"}</dd></div>
            </dl>
          ) : <Link href="/entreprise" className="mt-4 inline-block text-sm text-indigo-600 underline">Renseigner mon objectif chiffré</Link>}
        </section>
        <section className="py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Prospection · ce mois-ci</h2>
            <Link href="/prospection" className="text-sm text-indigo-600 underline">Suivre les contacts</Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {([
              ["Prospects contactés", funnel.thisMonth.contactes],
              ["Réponses reçues", funnel.thisMonth.reponses],
              ["Rendez-vous", funnel.thisMonth.rdv],
              ["Clients gagnés déclarés", funnel.thisMonth.clients],
            ] as const).map(([label, count]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-semibold">{count}</dd></div>)}
          </dl>
        </section>
        <section className="border-t border-slate-200 py-6">
          <h2 className="font-medium">Productions · depuis le début</h2>
          <dl className="mt-4 grid grid-cols-2 gap-5">
            <div><dt className="text-sm text-slate-500">Approuvées, pas encore publiées ni envoyées</dt><dd className="mt-1 text-2xl font-semibold">{approvedCount}</dd></div>
            <div><dt className="text-sm text-slate-500">Exécutées par BienDecider</dt><dd className="mt-1 text-2xl font-semibold text-emerald-700">{executedCount}</dd></div>
          </dl>
          <Link href="/dashboard?view=historique" className="mt-4 inline-block text-sm text-indigo-600 underline">Consulter l&apos;historique des décisions</Link>
        </section>
        <section className="border-t border-slate-200 py-6">
          <h2 className="font-medium">Dernières réalisations</h2>
          {executed.length === 0 ? <div role="region" className="mt-3" aria-label="Résultats à venir">
            <p className="max-w-prose text-sm text-slate-600">Aucune publication ou exécution enregistrée. Seules les actions effectivement réalisées par BienDecider apparaissent ici ; une proposition approuvée ne compte pas comme exécutée.</p>
            <Link href="/dashboard?view=validation" className="mt-3 inline-block text-sm font-medium text-indigo-600 underline">Examiner les productions</Link>
          </div> : (
            <ul className="mt-3 divide-y divide-slate-200">
              {executed.map((proposal) => <li key={proposal.id} className="py-3"><p className="text-xs text-slate-500">{PERSONAS[proposal.agent as AgentKey]?.name ?? proposal.agent}</p><h3 className="mt-1 text-sm font-medium">{proposal.title}</h3></li>)}
            </ul>
          )}
          {company.siteSlug && <Link href={`/site/${company.siteSlug}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-indigo-600 underline">Voir le site publié</Link>}
        </section>
      </div>
    </AppShell>
  );
}