"use client";

import { useRef, useState } from "react";
import type { Lead } from "@prisma/client";
import { buildOutreachDraft, formatDay, hasPlaceholders, isDeferred, leadReadiness } from "@/lib/lead-followup";
import type { LeadStage } from "@/lib/funnel-shared";
import { openPaul } from "@/lib/paul-context";

export type LeadPatch = { stage?: LeadStage; contactedAt?: string; deferUntil?: string | null; reason?: string };

/** Étapes déclarables après un premier contact — le dirigeant dit ce qui s'est passé, BienDecider ne devine rien. */
export const NEXT_LEAD_STAGES: Record<string, LeadStage[]> = {
  contacte: ["repondu", "perdu"],
  repondu: ["rdv", "gagne", "perdu"],
  rdv: ["gagne", "perdu"],
  perdu: ["contacte"],
};

const ACTION_LABELS: Record<string, string> = {
  contacte: "J'ai pris contact",
  repondu: "Il a répondu",
  rdv: "RDV pris",
  gagne: "Devenu client",
  perdu: "Sans suite",
};

export type LeadMode = "draft" | "contact" | "date" | "defer" | "discard" | null;

function localDay(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("sv-SE");
}

export function LeadCard({ lead, now, busy, companyName, trade, phone, onPatch, initialMode = null }: {
  lead: Lead;
  now: number;
  busy: boolean;
  companyName: string;
  trade: string | null;
  phone: string | null;
  onPatch: (id: string, patch: LeadPatch) => Promise<boolean>;
  initialMode?: LeadMode;
}) {
  const [mode, setMode] = useState<LeadMode>(initialMode);
  const [draft, setDraft] = useState("");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [day, setDay] = useState(initialMode === "contact" ? localDay() : "");
  const [reason, setReason] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const readiness = leadReadiness(lead);
  const deferred = isDeferred(lead, now);
  const contacted = lead.stage !== "a_contacter" && lead.stage !== "ecarte" && lead.contactedAt;
  const safeSource = lead.source && /^https?:\/\//i.test(lead.source) ? lead.source : null;

  function open(next: Exclude<LeadMode, null>) {
    setReason("");
    setCopyNotice(null);
    if (next === "contact") setDay(localDay());
    if (next === "date") setDay(lead.contactedAt ? new Date(lead.contactedAt).toISOString().slice(0, 10) : localDay());
    if (next === "defer") setDay(localDay(7));
    if (next === "draft" && !draft) setDraft(buildOutreachDraft({ lead, companyName, trade, phone }));
    setMode(mode === next ? null : next);
  }

  async function submit(patch: LeadPatch) {
    if (await onPatch(lead.id, patch)) setMode(null);
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyNotice("Message copié. Rien n'a été envoyé et ce prospect n'est pas marqué comme contacté.");
    } catch {
      draftRef.current?.select();
      setCopyNotice("Copie automatique impossible : le texte est sélectionné, copiez-le avec Ctrl+C. Rien n'a été envoyé.");
    }
  }

  return (
    <div id={`lead-${lead.id}`} tabIndex={-1}>
      <p><strong>{lead.name}</strong><br />{lead.reason}</p>
      <small>
        {lead.segment && <span className="capitalize">{lead.segment} · </span>}
        {lead.publicContact && <span>{lead.publicContact} · </span>}
        {safeSource && <a href={safeSource} target="_blank" rel="noreferrer">source</a>}
      </small>
      {lead.stage === "a_contacter" && readiness.toConfirm.length > 0 && (
        <div className="warning">
          {readiness.toConfirm.map((item) => <div key={item}>{item}</div>)}
        </div>
      )}
      {deferred && <p className="legend">Différé jusqu’au {formatDay(lead.deferredUntil)}{lead.statusReason ? ` : ${lead.statusReason}` : ""}.</p>}
      {lead.stage === "ecarte" && lead.statusReason && <p className="legend">Écarté : {lead.statusReason}</p>}
      {contacted && <p className="legend">Contact déclaré le {formatDay(lead.contactedAt)}.</p>}

      <div className="production-actions">
        <div>
          <button type="button" className="quiet" onClick={() => openPaul({ type: "lead", id: lead.id, title: lead.name })}>Demander à Paul</button>
          {lead.stage === "a_contacter" && (
            <>
              <button type="button" onClick={() => open("draft")} aria-expanded={mode === "draft"}>Préparer un message</button>
              <button type="button" onClick={() => open("contact")} aria-expanded={mode === "contact"}>J&apos;ai pris contact</button>
              <button type="button" onClick={() => open("defer")} aria-expanded={mode === "defer"}>Différer</button>
              <button type="button" onClick={() => open("discard")} aria-expanded={mode === "discard"}>Écarter</button>
            </>
          )}
          {lead.stage === "ecarte" && <button type="button" disabled={busy} onClick={() => void submit({ stage: "a_contacter" })}>Reprendre ce prospect</button>}
          {NEXT_LEAD_STAGES[lead.stage]?.map((next) => (
            <button key={next} type="button" disabled={busy} onClick={() => void submit({ stage: next })}>{ACTION_LABELS[next]}</button>
          ))}
          {contacted && <button type="button" onClick={() => open("date")} aria-expanded={mode === "date"}>Modifier la date du contact</button>}
          {lead.stage === "contacte" && <button type="button" disabled={busy} onClick={() => void submit({ stage: "a_contacter" })}>Ce n&apos;était pas un contact</button>}
          {lead.stage === "a_contacter" && deferred && <button type="button" disabled={busy} onClick={() => void submit({ deferUntil: null })}>Reprendre maintenant</button>}
        </div>
      </div>

      {mode === "draft" && (
        <div>
          <label className="field" htmlFor={`draft-${lead.id}`}>Message préparé à partir de ce prospect (modifiable)
            <textarea id={`draft-${lead.id}`} ref={draftRef} value={draft} onChange={(event) => { setDraft(event.target.value); setCopyNotice(null); }} rows={10} />
          </label>
          {hasPlaceholders(draft) && <div className="warning">Complétez les passages entre crochets avant d’envoyer.</div>}
          {!lead.publicContact?.trim() && <div className="warning">Aucune adresse n’est proposée : BienDecider n’en invente pas. Trouvez le contact sur la source avant d’écrire.</div>}
          <small>BienDecider n’envoie pas ce message. Copiez-le, envoyez-le vous-même, puis déclarez le contact.</small>
          <div className="production-actions">
            <div><button type="button" onClick={() => setMode(null)}>Fermer</button></div>
            <button type="button" className="primary" onClick={() => void copyDraft()}>Copier le message</button>
          </div>
          {copyNotice && <p role="status" className="notice">{copyNotice}</p>}
        </div>
      )}

      {(mode === "contact" || mode === "date") && (
        <form onSubmit={(event) => { event.preventDefault(); void submit(mode === "contact" ? { stage: "contacte", contactedAt: day } : { contactedAt: day }); }}>
          <p>{mode === "contact" ? "Enregistrez seulement un contact réellement effectué. Vous pourrez en corriger la date ou l’annuler." : "Corrigez la date du contact déclaré."}</p>
          <label className="field" htmlFor={`day-${lead.id}`}>Date du contact
            <input id={`day-${lead.id}`} type="date" value={day} max={localDay()} required onChange={(event) => setDay(event.target.value)} />
          </label>
          <div className="production-actions">
            <div><button type="button" onClick={() => setMode(null)}>Annuler</button></div>
            <button type="submit" className="primary" disabled={busy || !day}>{mode === "contact" ? "Enregistrer le contact" : "Enregistrer la date"}</button>
          </div>
        </form>
      )}

      {(mode === "defer" || mode === "discard") && (
        <form onSubmit={(event) => { event.preventDefault(); void submit(mode === "defer" ? { deferUntil: day, reason } : { stage: "ecarte", reason }); }}>
          {mode === "defer" && (
            <label className="field" htmlFor={`until-${lead.id}`}>Reprendre ce prospect le
              <input id={`until-${lead.id}`} type="date" value={day} min={localDay(1)} required onChange={(event) => setDay(event.target.value)} />
            </label>
          )}
          <label className="field" htmlFor={`reason-${lead.id}`}>{mode === "defer" ? "Raison du report (obligatoire)" : "Raison de l'écart (obligatoire)"}
            <textarea id={`reason-${lead.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={2} required />
          </label>
          <div className="production-actions">
            <div><button type="button" onClick={() => setMode(null)}>Annuler</button></div>
            <button type="submit" className={mode === "discard" ? "danger" : "primary"} disabled={busy || !reason.trim() || (mode === "defer" && !day)}>{mode === "defer" ? "Différer ce prospect" : "Écarter ce prospect"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
