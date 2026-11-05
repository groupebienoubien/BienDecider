"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { PaulButton } from "@/components/mission-actions";

export type TemplateOption = { key: string; label: string; contentFormat: string; defaultOutcome: string; stopRuleDays: number | null; channels: { key: string; label: string }[] };

const SCOPE_FIELD: Record<string, { key: string; label: string; min: number; max: number; multiline: boolean; required: boolean }> = {
  social_post: { key: "topic", label: "Sujet de la publication", min: 5, max: 120, multiline: false, required: true },
  custom: { key: "description", label: "Ce que vous voulez faire", min: 10, max: 300, multiline: true, required: true },
  site_page: { key: "page", label: "Titre de la page (facultatif)", min: 1, max: 80, multiline: false, required: false },
};

/** Création d'une mission : 0 crédit, aucune diffusion autorisée ; le serveur valide tout et renvoie le message de la spécification. */
export function NewMissionForm({ templates, launchCost }: { templates: TemplateOption[]; launchCost: number }) {
  const router = useRouter();
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "custom");
  const template = templates.find((candidate) => candidate.key === templateKey) ?? templates[0];
  const [finding, setFinding] = useState("");
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState(template?.defaultOutcome ?? "");
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [channel, setChannel] = useState(template?.channels[0]?.key ?? "");
  const [scopeValue, setScopeValue] = useState("");
  const [stopRuleDays, setStopRuleDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = SCOPE_FIELD[templateKey];

  function chooseTemplate(key: string) {
    const next = templates.find((candidate) => candidate.key === key);
    setTemplateKey(key);
    setChannel(next?.channels[0]?.key ?? "");
    setScopeValue("");
    if (!outcomeTouched) setOutcome(next?.defaultOutcome ?? "");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      template: templateKey,
      title,
      finding,
      outcome,
      channel: channel || null,
      scope: field && scopeValue.trim() ? { [field.key]: scopeValue } : {},
      ...(templateKey === "custom" ? { stopRuleDays: Number(stopRuleDays) } : {}),
    };
    const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Impossible de créer la mission pour le moment.");
      return;
    }
    router.push(`/missions/${payload.mission.id}`);
  }

  return (
    <form className="new-mission-form stack" onSubmit={submit}>
      <label className="field">
        Le constat de départ
        <textarea rows={3} minLength={10} maxLength={300} required value={finding} onChange={(event) => setFinding(event.target.value)} />
      </label>
      <div className="form-grid">
        <label className="field">
          Nom de la mission
          <input minLength={5} maxLength={80} required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          Type d&apos;action
          <select value={templateKey} onChange={(event) => chooseTemplate(event.target.value)}>
            {templates.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label} · {candidate.contentFormat}</option>)}
          </select>
        </label>
      </div>
      {template && template.channels.length > 1 && (
        <label className="field">
          Canal
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            {template.channels.map((option) => <option key={option.key || "none"} value={option.key}>{option.label}</option>)}
          </select>
        </label>
      )}
      {template && template.channels.length === 1 && <p className="small muted">Canal : {template.channels[0].label}</p>}
      {field && (
        <label className="field">
          {field.label}
          {field.multiline
            ? <textarea rows={3} minLength={field.min} maxLength={field.max} required={field.required} value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} />
            : <input minLength={field.min} maxLength={field.max} required={field.required} value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} />}
        </label>
      )}
      {templateKey === "custom" && (
        <label className="field">
          Règle d&apos;arrêt (en jours, de 7 à 90)
          <input type="number" min={7} max={90} required value={stopRuleDays} onChange={(event) => setStopRuleDays(event.target.value)} />
        </label>
      )}
      <label className="field">
        Résultat recherché
        <textarea rows={2} minLength={5} maxLength={120} required placeholder="Ex. Obtenir deux échanges qualifiés" value={outcome} onChange={(event) => { setOutcome(event.target.value); setOutcomeTouched(true); }} />
      </label>
      <small>La création ne consomme aucun crédit et n&apos;autorise aucun envoi. Le lancement coûtera {launchCost} crédits.</small>
      {error && <p role="alert" className="warning">{error}</p>}
      <div className="heading-actions">
        <button type="submit" className="primary" disabled={busy}><Icon name="plus" />Créer la mission</button>
        <PaulButton label="En discuter avec Paul" />
      </div>
    </form>
  );
}
