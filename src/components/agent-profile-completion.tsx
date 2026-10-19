"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";

const DETAILS = {
  objective: { label: "Objectif principal", maxLength: 500 },
  website: { label: "Site web", maxLength: 500 },
  socialHandles: { label: "Comptes Instagram / Facebook", maxLength: 500 },
  description: { label: "Activité et savoir-faire", maxLength: 2000 },
  phone: { label: "Téléphone affiché aux clients", maxLength: 100 },
  certifications: { label: "Certifications et labels", maxLength: 500 },
  openingHours: { label: "Horaires d'ouverture", maxLength: 500 },
};
type DetailKey = keyof typeof DETAILS;
const AGENT_DETAILS: Record<AgentKey, DetailKey[]> = {
  co_ceo: ["objective"],
  marketing: ["objective", "website", "socialHandles"],
  contenu: ["objective", "description", "phone", "certifications", "openingHours"],
  demarchage: ["objective", "description"],
};

type PendingRequest = { agent: AgentKey; fields: DetailKey[]; proceed: () => Promise<void> };

export function useAgentProfileCompletion() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [values, setValues] = useState<Partial<Record<DetailKey, string>>>({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (pending && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);

  async function requestProfile(agent: AgentKey, proceed: () => Promise<void>) {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/companies");
      if (!response.ok) throw new Error("Impossible de charger le profil. Réessayez.");
      const company = await response.json();
      if (!company) throw new Error("Profil indisponible.");
      const fields = AGENT_DETAILS[agent].filter((field) => !company[field]?.trim());
      if (fields.length === 0) {
        await proceed();
      } else {
        setValues({});
        setPending({ agent, fields, proceed });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profil indisponible.");
    } finally {
      setChecking(false);
    }
  }

  async function continueRequest(save: boolean) {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      if (save) {
        const data = Object.fromEntries(pending.fields.filter((field) => values[field]?.trim()).map((field) => [field, values[field]!.trim()]));
        if (Object.keys(data).length > 0) {
          const response = await fetch("/api/companies", {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error(result?.error ?? "Impossible d'enregistrer les compléments.");
        }
      }
      const proceed = pending.proceed;
      setPending(null);
      await proceed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La demande a échoué.");
    } finally {
      setSaving(false);
    }
  }

  const profileDialog = <>
    {!pending && error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { if (saving) event.preventDefault(); else setPending(null); }}>
      {pending && <form className="modal-content" onSubmit={(event) => { event.preventDefault(); void continueRequest(true); }}>
        <h2 id={titleId}>Compléments pour {PERSONAS[pending.agent].name}</h2>
        <div>
          {pending.fields.map((field) => <label key={field} className="field">
            {DETAILS[field].label} (facultatif)
            <input value={values[field] ?? ""} onChange={(event) => setValues({ ...values, [field]: event.target.value })} maxLength={DETAILS[field].maxLength} disabled={saving} />
          </label>)}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="primary">{saving ? "Enregistrement…" : "Enregistrer et continuer"}</button>
          <button type="button" onClick={() => void continueRequest(false)} disabled={saving}>Continuer sans complément</button>
          <button type="button" onClick={() => { setPending(null); setError(null); }} disabled={saving} className="quiet">Annuler</button>
        </div>
      </form>}
    </dialog>
  </>;

  return { requestProfile, profileDialog, checking: checking || saving || pending !== null };
}