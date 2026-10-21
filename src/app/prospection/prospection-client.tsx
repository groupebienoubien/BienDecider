"use client";

import { useState } from "react";
import Link from "next/link";
import type { Lead } from "@prisma/client";
import { Icon } from "@/components/icon";
import { LeadCard, NEXT_LEAD_STAGES, type LeadMode, type LeadPatch } from "@/components/lead-card";
import { Modal } from "@/components/modal";
import { EmptyState, PageHeading, SectionTitle, Tag } from "@/components/mockup-ui";
import { PERSONAS } from "@/lib/agents/personas";
import { countLeads, MIN_CONTACTS_TO_CONCLUDE } from "@/lib/funnel-shared";
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

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Ce que le dirigeant déclare ensuite, en un geste, sans menu déroulant (charte, section 6). */
const NEXT_ACTION_LABELS: Record<string, string> = {
  repondu: "Il a répondu",
  rdv: "RDV pris",
  gagne: "Devenu client",
  perdu: "Sans suite",
};

/** Filtres par étape, regroupés pour rester lisibles. */
const STAGE_FILTERS: { key: string; label: string; stages: string[] }[] = [
  { key: "all", label: "Tous", stages: [] },
  { key: "todo", label: "À contacter", stages: ["a_contacter"] },
  { key: "ongoing", label: "En cours", stages: ["contacte", "repondu", "rdv"] },
  { key: "won", label: "Clients", stages: ["gagne"] },
  { key: "closed", label: "Sans suite", stages: ["perdu", "ecarte"] },
];

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
  const [stageFilter, setStageFilter] = useState("all");
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


  const nextLead = pickNextLead(leads, openedAt);
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const matchesSearch = (lead: Lead) => !normalizedSearch || [lead.name, lead.reason, lead.segment, lead.publicContact, lead.source]
    .some((value) => value?.toLocaleLowerCase("fr-FR").includes(normalizedSearch));
  const matchesStage = (lead: Lead) => stageFilter === "all" || (STAGE_FILTERS.find((filter) => filter.key === stageFilter)?.stages ?? []).includes(lead.stage);
  const visibleLeads = leads.filter((lead) => matchesSearch(lead) && matchesStage(lead));
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
        kicker="DÉCISIONS"
        title="Vos prospects."
        description={`${t.identifies} identifiés · ${t.contactes} contactés · ${t.reponses} réponses · ${t.rdv} RDV · ${t.clients} clients`}
        actions={<Link className={`btn ${leads.length > 0 ? "primary" : ""}`} href="/equipe"><Icon name="plus" /> Confier une recherche</Link>}
      />

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
      {leads.length > 0 && <div className="tabs" role="group" aria-label="Filtrer par étape">
        {STAGE_FILTERS.map((filter) => (
          <button key={filter.key} type="button" aria-pressed={stageFilter === filter.key} className={stageFilter === filter.key ? "selected" : undefined} onClick={() => setStageFilter(filter.key)}>
            {filter.label} ({filter.key === "all" ? leads.length : leads.filter((lead) => filter.stages.includes(lead.stage)).length})
          </button>
        ))}
      </div>}

      {error && <p role="alert" className="warning">{error}</p>}

      {leads.length === 0 ? (
        <EmptyState agent="demarchage" role="region" label="Prospection à préparer" title="Choisir les organisations à contacter" says="Je repère des organisations qui correspondent à votre cible ; vous choisissez lesquelles contacter.">
          <Link className="btn primary" href="/dashboard?view=validation">Examiner les prospects proposés</Link>
          <Link className="btn" href="/equipe">Confier une recherche à {PERSONAS.demarchage.name}</Link>
        </EmptyState>
      ) : visibleLeads.length === 0 ? (
        <div role="status" className="empty">{search ? <>Aucun prospect ne correspond à « {search} ».</> : "Aucun prospect à cette étape."}</div>
      ) : (
        <div className="lead-tiles">{visibleLeads.map((lead) => {
          const source = lastSource(lead);
          const nextStages = NEXT_LEAD_STAGES[lead.stage] ?? [];
          return (
            <article key={lead.id} id={`lead-${lead.id}`} aria-label={lead.name} className="lead-tile">
              <header>
                <h3>{lead.name}</h3>
                <Tag color={lead.stage === "gagne" ? "green" : lead.stage === "perdu" || lead.stage === "ecarte" ? "gray" : lead.stage === "a_contacter" ? "orange" : "blue"}>{STAGE_LABELS[lead.stage] ?? lead.stage}</Tag>
              </header>
              <p>{lead.reason}</p>
              <div className="lead-next">
                {lead.stage === "a_contacter" && <>
                  <button type="button" onClick={() => setManaged({ id: lead.id, mode: "draft" })}>Préparer un message</button>
                  <button type="button" className="quiet" onClick={() => setManaged({ id: lead.id, mode: "contact" })}>J’ai déjà pris contact</button>
                </>}
                {nextStages.filter((stage) => NEXT_ACTION_LABELS[stage]).map((stage, index) => (
                  <button key={stage} type="button" className={index === 0 ? undefined : "quiet"} disabled={busyId === lead.id} onClick={() => void patchLead(lead.id, { stage })}>{NEXT_ACTION_LABELS[stage]}</button>
                ))}
              </div>
              <details className="lead-details">
                <summary>Détails</summary>
                <p>{[lead.segment, lead.publicContact].filter(Boolean).join(" · ") || "Aucun contact public renseigné"}</p>
                <p>{source.label} · {source.date}</p>
                <button type="button" className="text-link" onClick={() => setManaged({ id: lead.id, mode: null })}>Gérer ce prospect<span className="sr-only"> : {lead.name}</span></button>
              </details>
            </article>
          );
        })}</div>
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
