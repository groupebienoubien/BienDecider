import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  const { tab: requestedTab } = await searchParams;
  const tab = requestedTab === "budget" || requestedTab === "confidentialite" ? requestedTab : "acces";
  const pendingCount = await getPendingDecisionCount(company.id);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const usage = tab === "budget" ? await prisma.usageEvent.aggregate({
    where: { companyId: company.id, createdAt: { gte: monthStart } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: true,
  }) : null;
  return <AppShell companyName={company.name} pendingCount={pendingCount}>
    <div className="w-full">
      <h1 className="text-2xl font-semibold">Mon compte</h1>
      <p className="mt-2 text-sm text-slate-600">Vos accès, votre consommation et vos données.</p>
      <nav className="section-tabs" aria-label="Rubriques de mon compte">
        {([['acces', 'Accès'], ['budget', 'Budget IA'], ['confidentialite', 'Confidentialité']] as const).map(([key, label]) =>
          <Link key={key} href={`/compte?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}
      </nav>
      {tab === "acces" && <section>
        <h2 className="text-lg font-semibold">Votre accès</h2>
        <dl className="mt-5 divide-y divide-slate-200 text-sm">
          <div className="py-4"><dt className="text-slate-600">Adresse e-mail</dt><dd className="mt-1 break-all font-medium">{company.ownerEmail}</dd></div>
          <div className="py-4"><dt className="text-slate-600">Entreprise</dt><dd className="mt-1 font-medium">{company.name}</dd></div>
        </dl>
        <form action="/api/auth/logout" method="post" className="mt-6"><button className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium">Se déconnecter</button></form>
      </section>}
      {tab === "budget" && usage && <section>
        <h2 className="text-lg font-semibold">Consommation du mois</h2>
        <p className="mt-2 text-sm text-slate-600">Depuis le {monthStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} à 00:00 UTC. Coûts estimés des appels IA enregistrés, en dollars américains.</p>
        <dl className="decision-metrics"><div><dt>Coût estimé</dt><dd>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(usage._sum.costUsd ?? 0)}</dd></div><div><dt>Appels enregistrés</dt><dd>{usage._count}</dd></div><div><dt>Tokens traités</dt><dd>{new Intl.NumberFormat("fr-FR", { notation: "compact" }).format((usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0))}</dd></div></dl>
        <h3 className="border-t border-slate-200 pt-5 font-medium">Limites de votre compte</h3>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-600">Budget journalier / mensuel</dt><dd className="mt-1">{company.dailySpendLimitUsd} $ / {company.monthlySpendLimitUsd} $</dd></div><div><dt className="text-slate-600">Lancements d&apos;agents par jour / mois</dt><dd className="mt-1">{company.dailyAgentRunLimit} / {company.monthlyAgentRunLimit}</dd></div></dl>
        <p className="mt-5 text-sm text-slate-600">Cette consommation n&apos;est ni un solde de crédits ni une facture. Les réservations en cours peuvent réduire temporairement le budget disponible. Pour ajuster vos limites : <a className="underline" href="mailto:contact@biendecider.com">contact@biendecider.com</a>.</p>
      </section>}
      {tab === "confidentialite" && <section>
        <h2 className="text-lg font-semibold">Vos données et vos autorisations</h2>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-indigo-700"><Link href="/confidentialite" className="underline">Politique de confidentialité</Link><Link href="/connexions" className="underline">Gérer les comptes connectés</Link></div>
        <DeleteAccountSection requiresPassword={Boolean(company.passwordHash)} />
      </section>}
    </div>
  </AppShell>;
}