"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditFinding } from "@prisma/client";
import { FindingCard } from "@/components/finding-card";
import { PersonaAvatar } from "@/components/persona-avatar";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";

export function DiagnosticClient({ initialFindings }: { initialFindings: AuditFinding[] }) {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const [findings, setFindings] = useState(initialFindings);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(false);
    try {
      const response = await fetch("/api/agents/marketing/run", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Le diagnostic a échoué. Réessayez.");
      const refreshed = await fetch("/api/audit-findings");
      if (!refreshed.ok) throw new Error("Impossible d'actualiser le diagnostic. Rechargez la page.");
      setFindings(await refreshed.json());
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le diagnostic a échoué.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="w-full">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Diagnostic de présence en ligne</p><h1 className="text-2xl font-semibold">Diagnostic</h1><p className="mt-1 text-sm text-slate-500">Visibilité, site et positionnement concurrentiel</p></div>
        {findings.length > 0 && <Link href="/dashboard" className="text-sm font-medium text-indigo-600 underline">Passer au plan d&apos;action</Link>}
      </header>
      <section className="my-6 flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-4">
        <div className="flex items-center gap-3"><PersonaAvatar agentKey="marketing" size={40} /><div><h2 className="text-sm font-medium">Analyse de Martine</h2><p className="text-xs text-slate-500">{findings.length} constat(s){findings[0] && <> · Dernier constat enregistré le {new Date(findings[0].createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</>}</p></div></div>
        <button onClick={() => void requestProfile("marketing", run)} disabled={running || checking} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{running ? "Analyse en cours…" : findings.length ? "Actualiser le diagnostic" : "Lancer le diagnostic"}</button>
      </section>
      {profileDialog}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {done && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Diagnostic actualisé. <Link href="/dashboard?view=validation" className="underline">Voir les productions à valider</Link></p>}
      {findings.length === 0 && (
        <div className="py-6" aria-label="Diagnostic à préparer">
          <h2 className="text-base font-medium">Repérer les premières opportunités</h2>
          <p className="mt-2 max-w-prose text-sm text-slate-600">Aucun diagnostic disponible pour le moment. Martine peut examiner votre présence en ligne et votre positionnement pour proposer des priorités liées à votre objectif.</p>
          <p className="mt-2 text-sm text-slate-500">Lancez le diagnostic pour obtenir les premiers constats. Vous déciderez ensuite des actions à confier.</p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">{findings.map((finding) => <li key={finding.id} className="min-w-0"><FindingCard finding={finding} /></li>)}</ul>
    </div>
  );
}