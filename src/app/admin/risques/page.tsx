import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionEmail } from "@/lib/session";
import { isExplicitAdminEmail } from "@/lib/admin";
import { DelegationRiskSettings } from "../delegation-risk-settings";

export const dynamic = "force-dynamic";

export default async function DelegationRiskPage() {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const authorized = isExplicitAdminEmail(email);
  return (
    <AppShell>
      <div className="w-full">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Administration · Gouvernance</p>
            <h1 className="mt-1 text-2xl font-semibold">Niveaux de risque</h1>
            <p className="mt-1 text-sm text-slate-600">Politique globale de BienDecider, par type d&apos;action.</p>
          </div>
          <Link href="/admin" className="text-sm text-indigo-600 underline">Retour à l&apos;administration</Link>
        </header>
        <DelegationRiskSettings explicitlyAuthorized={authorized} />
        <p className="mt-6 max-w-3xl text-xs text-slate-500">Toute modification concerne l&apos;ensemble des entreprises. La décision fondatrice sur les modes d&apos;autonomie reste à acter ; ce réglage ne désactive pas la validation humaine.</p>
      </div>
    </AppShell>
  );
}