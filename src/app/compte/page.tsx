import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { PageHeading } from "@/components/mockup-ui";
import { getSessionCompany } from "@/lib/session";
import { getShellProps } from "@/lib/shell-data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MONEY = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export default async function AccountPage() {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [shell, usage] = await Promise.all([
    getShellProps(company),
    prisma.usageEvent.aggregate({
      where: { companyId: company.id, createdAt: { gte: monthStart } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
  ]);
  const spent = usage._sum.costUsd ?? 0;
  return <AppShell {...shell}>
    <PageHeading kicker="ESPACE PERSONNEL" title="Mon compte" description={company.ownerEmail} />
    <div className="settings-grid">
      <section className="setting-section" aria-labelledby="account-budget">
        <h2 id="account-budget">Crédits &amp; limites</h2>
        <p>Budget IA : {MONEY.format(spent)} $ consommés sur {MONEY.format(company.monthlySpendLimitUsd)} $ par mois.</p>
        <progress value={Math.min(spent, company.monthlySpendLimitUsd)} max={company.monthlySpendLimitUsd} aria-label="Budget consommé" />
        <p>Depuis le {monthStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} à 00:00 UTC. Coûts estimés des appels IA enregistrés, en dollars américains.</p>
        <dl className="modal-details">
          <dt>Appels</dt><dd>{usage._count} enregistrés ce mois-ci</dd>
          <dt>Tokens</dt><dd>{new Intl.NumberFormat("fr-FR", { notation: "compact" }).format((usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0))} traités</dd>
          <dt>Budget</dt><dd>{company.dailySpendLimitUsd} $ par jour / {company.monthlySpendLimitUsd} $ par mois</dd>
          <dt>Agents</dt><dd>{company.dailyAgentRunLimit} lancements par jour / {company.monthlyAgentRunLimit} par mois</dd>
        </dl>
        <p>Cette consommation n’est ni un solde de crédits ni une facture. Les réservations en cours peuvent réduire temporairement le budget disponible. Pour ajuster vos limites : <a href="mailto:contact@biendecider.com">contact@biendecider.com</a>.</p>
      </section>
      <section className="setting-section" aria-labelledby="account-access">
        <h2 id="account-access">Accès &amp; confidentialité</h2>
        <p>Rôle : propriétaire · Accès exclusif à {company.name}.</p>
        <dl className="modal-details">
          <dt>E-mail</dt><dd>{company.ownerEmail}</dd>
          <dt>Entreprise</dt><dd>{company.name}</dd>
        </dl>
        <form action="/api/auth/logout" method="post"><button type="submit">Se déconnecter</button></form>
        <p><Link href="/confidentialite">Politique de confidentialité</Link> · <Link href="/connexions">Gérer les comptes connectés</Link></p>
        <DeleteAccountSection requiresPassword={Boolean(company.passwordHash)} />
      </section>
    </div>
  </AppShell>;
}
