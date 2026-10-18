"use client";

import { useState } from "react";
import Link from "next/link";
import type { Lead } from "@prisma/client";
import { Icon } from "@/components/icon";
import { LeadCard, NEXT_LEAD_STAGES, type LeadMode, type LeadPatch } from "@/components/lead-card";
import { Modal } from "@/components/modal";
import { PageHeading, SectionTitle, Tag } from "@/components/mockup-ui";
import { PERSONAS } from "@/lib/agents/personas";
import { countLeads, MIN_CONTACTS_TO_CONCLUDE, type LeadStage } from "@/lib/funnel-shared";
import { pickNextLead } from "@/lib/lead-followup";

const STAGE_LABELS: Record<string, string> = {
  a_contacter: "À contacter",
  contacte: "Contacté",
  repondu: "Réponse reçue",
  rdv: "Rendez-vous",
  gagne: "Gagné",
  perdu: "Perdu",
  ecarte: "Écarté",
};

const ORDER: LeadStage[] = ["a_contacter", "contacte", "repondu", "rdv", "gagne", "perdu"];
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Étapes que le menu peut déclarer directement ; « Contacté » depuis « À contacter » passe par la date du contact. */
function reachableStages(stage: string): LeadStage[] {
  return stage === "a_contacter" ? ["contacte"] : NEXT_LEAD_STAGES[stage] ?? [];
}

function lastSource(lead: Lead) {
  const declared = lead.stage !== "a_contacter" && lead.stage !== "propose";
  const date = lead.meetingAt ?? lead.repliedAt ?? lead.contactedAt ?? lead.closedAt ?? (declared ? lead.updatedAt : lead.createdAt);
  return { label: declared ? "Saisi par vous" : `Proposé par ${PERSONAS.demarchage.name}`, date: DAY.format(new Date(date)) };
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
  const [managed, setManaged] = useState<{ id: string; mode: LeadMode } | null>(null);
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

  function declareStage(lead: Lead, next: LeadStage) {
    if (lead.stage === "a_contacter" && next === "contacte") setManaged({ id: lead.id, mode: "contact" });
    else void patchLead(lead.id, { stage: next });
  }

  const nextLead = pickNextLead(leads, openedAt);
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const matchesSearch = (lead: Lead) => !normalizedSearch || [lead.name, lead.reason, lead.segment, lead.publicContact, lead.source]
    .some((value) => value?.toLocaleLowerCase("fr-FR").includes(normalizedSearch));
  const visibleLeads = leads.filter(matchesSearch);
  const managedLead = leads.find((lead) => lead.id === managed?.id);

  // Recalculé depuis l'état local (pas depuis `funnel`, figé au chargement
  // serveur) pour refléter une déclaration sans attendre un rechargement.
  const t = countLeads(leads);
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
    <div>
      <PageHeading
        kicker="RELATIONS COMMERCIALES"
        title="Les contacts deviennent des échanges."
        description="Les événements du canal et vos déclarations restent identifiables."
        actions={<Link className="btn primary" href="/equipe"><Icon name="plus" /> Confier une recherche</Link>}
      />
      <div className="sync-line">
        <span>{t.identifies} identifiés · {t.contactes} contactés · {t.reponses} réponses · {t.rdv} RDV · {t.clients} clients</span>
        <Link href="/rapport">Suivre les résultats →</Link>
      </div>

      {nextLead && matchesSearch(nextLead) && (
        <section aria-label="Prochain prospect à traiter" className="notice">
          <strong>Prochain prospect à traiter : {nextLead.name}</strong> · {nextLead.reason}{" "}
          <button type="button" className="text-link" onClick={() => setManaged({ id: nextLead.id, mode: null })}>Traiter ce prospect</button>
        </section>
      )}

      <div className="filter-bar">
        <label htmlFor="lead-search">Rechercher</label>
        <input id="lead-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou projet" />
      </div>

      {error && <p role="alert" className="warning">{error}</p>}

      {leads.length === 0 ? (
        <div className="empty" role="region" aria-label="Prospection à préparer">
          <Icon name="contact-round" />
          <h3>Choisir les organisations à contacter</h3>
          <p>Aucun prospect validé pour l’instant. {PERSONAS.demarchage.name} prépare des propositions ; vous choisissez les organisations à contacter. Les contacts retenus apparaîtront ici pour suivre les échanges et les rendez-vous.</p>
          <Link className="btn primary" href="/dashboard?view=validation">Examiner les prospects proposés</Link>{" "}
          <Link className="btn" href="/equipe">Confier une recherche à {PERSONAS.demarchage.name}</Link>
        </div>
      ) : visibleLeads.length === 0 ? (
        <div role="status" className="empty">Aucun prospect ne correspond à « {search} ».</div>
      ) : (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Prospect</th><th>Projet</th><th>Étape</th><th>Dernière source</th><th>Détail</th></tr></thead>
          <tbody>{visibleLeads.map((lead) => {
            const source = lastSource(lead);
            const reachable = reachableStages(lead.stage);
            return <tr key={lead.id} data-search={`${lead.name} ${lead.reason}`.toLowerCase()}>
              <td><strong>{lead.name}</strong>{lead.publicContact && <small>{lead.publicContact}</small>}</td>
              <td>{lead.reason}{lead.segment && <small className="capitalize">{lead.segment}</small>}</td>
              <td>
                <select aria-label={`Étape de ${lead.name}`} value={lead.stage} disabled={busyId === lead.id || lead.stage === "ecarte" || reachable.length === 0} onChange={(event) => declareStage(lead, event.target.value as LeadStage)}>
                  <option value={lead.stage}>{STAGE_LABELS[lead.stage] ?? lead.stage}</option>
                  {ORDER.filter((stage) => reachable.includes(stage) && stage !== lead.stage).map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                </select>
              </td>
              <td><Tag color="gray">{source.label}</Tag><small>{source.date}</small></td>
              <td><button type="button" onClick={() => setManaged({ id: lead.id, mode: null })}><Icon name="eye" /> Gérer<span className="sr-only"> : {lead.name}</span></button></td>
            </tr>;
          })}</tbody>
        </table></div>
      )}
      <p className="legend">{PERSONAS.demarchage.name} identifie des organisations correspondant à votre cible ; vous décidez lesquelles contacter et déclarez ce qui s’est passé. Chiffres calculés en base, jamais estimés par un agent. « Contacté » ne signifie ni « intéressé » ni « client ». Les rendez-vous et ventes sont déclarés par vous. Les prospects marqués « sans suite » restent comptés comme contactés.</p>

      {bySegment.length > 0 && <>
        <SectionTitle title="Par type de cible" />
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Type de cible</th><th>Contactés</th><th>Réponses</th><th>RDV</th><th>Clients</th></tr></thead>
          <tbody>{bySegment.map((s) => <tr key={s.segment}>
            <td><strong className="capitalize">{s.segment}</strong>{s.counts.contactes < MIN_CONTACTS_TO_CONCLUDE && <small>Trop tôt pour conclure (moins de {MIN_CONTACTS_TO_CONCLUDE} contacts)</small>}</td>
            <td>{s.counts.contactes}</td><td>{s.counts.reponses}</td><td>{s.counts.rdv}</td><td>{s.counts.clients}</td>
          </tr>)}</tbody>
        </table></div>
      </>}

      <section className="setting-section" style={{ marginTop: 32 }}>
        <h2>Prise de contact automatique{sendingConfigured ? "" : " (pas encore disponible)"}</h2>
        <label className="check-label">
          <input
            type="checkbox"
            checked={autoOutreach}
            disabled={outreachSaving || !sendingConfigured}
            onChange={(e) => toggleAutoOutreach(e.target.checked)}
          />
          <span>
            <strong>Laisser {PERSONAS.demarchage.name} prendre contact lui-même</strong>{" "}
            avec les prospects que vous validez, sans que vous ayez à envoyer l’email vous-même. Désactivé par défaut :
            c’est vous qui décidez, prospect par prospect, de l’activer ou non.
            {!sendingConfigured && (
              <small>
                Pas encore activable : aucun fournisseur d’envoi d’email n’est configuré côté serveur. Le réglage
                sera mémorisé et appliqué dès qu’un canal d’envoi sera en place.
              </small>
            )}
          </span>
        </label>
      </section>

      <Modal
        open={Boolean(managedLead)}
        onClose={() => setManaged(null)}
        kicker="PROSPECTION"
        title={managedLead?.name ?? ""}
        cancelLabel="Fermer"
      >
        {managedLead && <LeadCard key={managedLead.id} lead={managedLead} now={openedAt} busy={busyId === managedLead.id} companyName={companyName} trade={trade} phone={phone} onPatch={patchLead} initialMode={managed?.mode ?? null} />}
      </Modal>
    </div>
  );
}
