"use client";

import { useState } from "react";
import Link from "next/link";
import type { Lead } from "@prisma/client";
import { LeadCard, type LeadPatch } from "@/components/lead-card";
import { PERSONAS } from "@/lib/agents/personas";
import { countLeads, MIN_CONTACTS_TO_CONCLUDE, type LeadStage } from "@/lib/funnel-shared";
import { pickNextLead } from "@/lib/lead-followup";

const STAGE_LABELS: Record<string, string> = {
  a_contacter: "À contacter",
  contacte: "Contacté",
  repondu: "A répondu",
  rdv: "RDV pris",
  gagne: "Client",
  perdu: "Perdu",
};

const ORDER: LeadStage[] = ["a_contacter", "contacte", "repondu", "rdv", "gagne", "perdu"];

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : "—";
}

export function ProspectionClient({
  initialLeads,
  initialAutoOutreach,
  sendingConfigured,
  companyName,
  trade,
  phone,
}: {
  initialLeads: Lead[];
  initialAutoOutreach: boolean;
  sendingConfigured: boolean;
  companyName: string;
  trade: string | null;
  phone: string | null;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState("");
  const [openedAt] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoOutreach, setAutoOutreach] = useState(initialAutoOutreach);
  const [outreachSaving, setOutreachSaving] = useState(false);

  async function toggleAutoOutreach(next: boolean) {
    setOutreachSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Impossible d'enregistrer");
      setAutoOutreach(data.autoOutreachEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setOutreachSaving(false);
    }
  }

  async function patchLead(id: string, patch: LeadPatch): Promise<boolean> {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Impossible d'enregistrer");
      setLeads((prev) => prev.map((l) => (l.id === id ? data : l)));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const nextLead = pickNextLead(leads, openedAt);
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const matchesSearch = (lead: Lead) => !normalizedSearch || [lead.name, lead.reason, lead.segment, lead.publicContact, lead.source]
    .some((value) => value?.toLocaleLowerCase("fr-FR").includes(normalizedSearch));
  const visibleLeads = leads.filter(matchesSearch);
  const visibleNextLead = nextLead && matchesSearch(nextLead) ? nextLead : null;
  const discarded = leads.filter((l) => l.stage === "ecarte");
  const leadCard = (lead: Lead) => (
    <LeadCard lead={lead} now={openedAt} busy={busyId === lead.id} companyName={companyName} trade={trade} phone={phone} onPatch={patchLead} />
  );

  // Recalculé depuis l'état local (pas depuis `funnel`, figé au chargement
  // serveur) pour refléter une déclaration sans attendre un rechargement.
  const t = countLeads(leads);
  const steps = [
    { label: "Identifiés", value: t.identifies },
    { label: "Contactés", value: t.contactes, rate: pct(t.contactes, t.identifies) },
    { label: "Réponses", value: t.reponses, rate: pct(t.reponses, t.contactes) },
    { label: "RDV", value: t.rdv, rate: pct(t.rdv, t.reponses) },
    { label: "Clients", value: t.clients, rate: pct(t.clients, t.rdv) },
  ];

  const segments = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = lead.segment?.trim() || "sans segment";
    segments.set(key, [...(segments.get(key) ?? []), lead]);
  }
  const bySegment = [...segments.entries()]
    .map(([segment, list]) => ({ segment, counts: countLeads(list) }))
    .filter((s) => s.counts.contactes > 0)
    .sort((a, b) => b.counts.contactes - a.counts.contactes);

  return (
  <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Relations commerciales</p>
      <h1 className="text-2xl font-semibold">Prospection</h1>
      <p className="mt-1 text-sm text-slate-500">
        {PERSONAS.demarchage.name} identifie des organisations correspondant à votre cible ; vous décidez lesquelles contacter
        et déclarez ce qui s&apos;est passé. Chiffres calculés en base, jamais estimés par un agent.
      </p>

      {visibleNextLead && (
        <section aria-label="Prochain prospect à traiter" className="mt-4 rounded-lg border-2 border-indigo-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-indigo-900">Prochain prospect à traiter</h2>
          <p className="mb-2 mt-1 text-xs text-slate-700">Informations rapportées par {PERSONAS.demarchage.name} depuis le web : confirmez-les sur la source avant de contacter.</p>
          {leadCard(visibleNextLead)}
        </section>
      )}

      <section className="mt-6 grid grid-cols-5 gap-2">
        {steps.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-3 text-center">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
            {s.rate && <p className="text-xs text-slate-600">{s.rate}</p>}
          </div>
        ))}
      </section>
      <p className="mt-1 text-xs text-slate-600">
        Taux affichés par rapport à l&apos;étape précédente. Les prospects marqués « sans suite » restent comptés comme contactés.
      </p>

      <div className="mt-6 max-w-md">
        <label htmlFor="lead-search" className="mb-1 block text-xs font-medium text-slate-600">Rechercher un prospect</label>
        <input id="lead-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, projet ou source" className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
      </div>

      {bySegment.length > 0 && (
        <section className="mt-6 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-medium">Par type de cible</h2>
          <ul className="mt-2 divide-y text-sm">
            {bySegment
              .map((s) => (
                <li key={s.segment} className="flex flex-wrap items-center gap-x-3 py-2">
                  <span className="font-medium capitalize">{s.segment}</span>
                  <span className="text-slate-500">
                    {s.counts.contactes} contactés · {s.counts.reponses} réponses · {s.counts.rdv} RDV · {s.counts.clients} clients
                  </span>
                  {s.counts.contactes < MIN_CONTACTS_TO_CONCLUDE && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      trop tôt pour conclure (moins de {MIN_CONTACTS_TO_CONCLUDE} contacts)
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {leads.length === 0 ? (
        <div role="region" className="mt-8 border-t border-slate-200 py-5" aria-label="Prospection à préparer">
          <h2 className="text-base font-medium">Choisir les organisations à contacter</h2>
          <p className="mt-2 max-w-prose text-sm text-slate-600">Aucun prospect validé pour l&apos;instant. {PERSONAS.demarchage.name} prépare des propositions ; vous choisissez les organisations à contacter. Les contacts retenus apparaîtront ici pour suivre les échanges et les rendez-vous.</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/dashboard?view=validation" className="text-sm font-medium text-indigo-600 underline">Examiner les prospects proposés</Link>
            <Link href="/equipe" className="text-sm text-indigo-600 underline">Confier une recherche à {PERSONAS.demarchage.name}</Link>
          </div>
        </div>
      ) : (
        visibleLeads.length === 0 ? <p role="status" className="mt-6 border-t border-slate-200 py-5 text-sm text-slate-600">Aucun prospect ne correspond à « {search} ».</p> : ORDER.filter((stage) => visibleLeads.some((l) => l.stage === stage)).map((stage) => (
          <section key={stage} className="mt-6">
            <h2 className="text-sm font-medium text-slate-700">
              {STAGE_LABELS[stage]} <span className="text-slate-600">({visibleLeads.filter((l) => l.stage === stage).length})</span>
            </h2>
            <ul className="mt-2 space-y-2">
              {visibleLeads
                .filter((l) => l.stage === stage && l.id !== visibleNextLead?.id)
                .map((lead) => (
                  <li key={lead.id} className="rounded-lg border bg-white p-3">{leadCard(lead)}</li>
                ))}
            </ul>
          </section>
        ))
      )}

      {discarded.length > 0 && (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-700">Écartés ({discarded.length})</summary>
          <ul className="mt-2 space-y-2">
            {discarded.map((lead) => <li key={lead.id} className="rounded-lg border bg-white p-3">{leadCard(lead)}</li>)}
          </ul>
        </details>
      )}

      <details className="mt-8 rounded-lg border bg-white p-3" open={sendingConfigured}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-800">
          Prise de contact automatique{sendingConfigured ? "" : " (pas encore disponible)"}
        </summary>
        <label className="mt-2 flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoOutreach}
            disabled={outreachSaving || !sendingConfigured}
            onChange={(e) => toggleAutoOutreach(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-800">Laisser {PERSONAS.demarchage.name} prendre contact lui-même</span>{" "}
            avec les prospects que vous validez, sans que vous ayez à envoyer l&apos;email vous-même. Désactivé par défaut :
            c&apos;est vous qui décidez, prospect par prospect, de l&apos;activer ou non.
            {!sendingConfigured && (
              <span className="mt-1 block text-xs text-amber-900">
                Pas encore activable : aucun fournisseur d&apos;envoi d&apos;email n&apos;est configuré côté serveur. Le réglage
                sera mémorisé et appliqué dès qu&apos;un canal d&apos;envoi sera en place.
              </span>
            )}
          </span>
        </label>
      </details>
    </div>
  );
}
