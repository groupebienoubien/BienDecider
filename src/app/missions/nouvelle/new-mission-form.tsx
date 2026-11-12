"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { PaulButton } from "@/components/mission-actions";
import { missionFormErrors, type MissionFormErrors, type MissionFormField } from "@/lib/missions/form-errors";

export type TemplateOption = { key: string; label: string; contentFormat: string; defaultOutcome: string; stopRuleDays: number | null; channels: { key: string; label: string }[] };

const SCOPE_FIELD: Record<string, { key: string; label: string; min: number; max: number; multiline: boolean; required: boolean }> = {
  social_post: { key: "topic", label: "Sujet de la publication", min: 5, max: 120, multiline: false, required: true },
  custom: { key: "description", label: "Ce que vous voulez faire", min: 10, max: 300, multiline: true, required: true },
  site_page: { key: "page", label: "Titre de la page (facultatif)", min: 1, max: 80, multiline: false, required: false },
};

/** Création d'une mission : 0 crédit, aucune diffusion autorisée ; le serveur valide tout et renvoie le message de la spécification. */
export function NewMissionForm({ templates, launchCost, idea = null }: { templates: TemplateOption[]; launchCost: number; idea?: { id: string; text: string } | null }) {
  const router = useRouter();
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "custom");
  const template = templates.find((candidate) => candidate.key === templateKey) ?? templates[0];
  // Idée cadrée (US #312) : son texte préremplit le constat, modifiable ; trop court, le dirigeant le complète (M-20).
  const [finding, setFinding] = useState(idea?.text ?? "");
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState(template?.defaultOutcome ?? "");
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [channel, setChannel] = useState(template?.channels[0]?.key ?? "");
  const [scopeValue, setScopeValue] = useState("");
  const [stopRuleDays, setStopRuleDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<MissionFormErrors>({});
  const field = SCOPE_FIELD[templateKey];

  function chooseTemplate(key: string) {
    const next = templates.find((candidate) => candidate.key === key);
    setTemplateKey(key);
    setChannel(next?.channels[0]?.key ?? "");
    setScopeValue("");
    setFieldErrors((current) => ({ ...current, template: undefined, channel: undefined, scope: undefined, stopRuleDays: undefined }));
    if (!outcomeTouched) setOutcome(next?.defaultOutcome ?? "");
  }

  function fieldDescription(fieldName: MissionFormField) {
    return `${fieldName}-hint${fieldErrors[fieldName] ? ` ${fieldName}-error` : ""}`;
  }

  function clearFieldError(fieldName: MissionFormField) {
    setFieldErrors((current) => ({ ...current, [fieldName]: undefined }));
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    const body = {
      template: templateKey,
      title,
      finding,
      outcome,
      channel: channel || null,
      scope: field && scopeValue.trim() ? { [field.key]: scopeValue } : {},
      ...(templateKey === "custom" ? { stopRuleDays: Number(stopRuleDays) } : {}),
      ...(idea ? { ideaId: idea.id } : {}),
    };
    const generic = "Impossible de créer la mission pour le moment.";
    const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    const missionId: unknown = payload?.mission?.id;
    if (!response || !response.ok || typeof missionId !== "string") {
      // Idée cadrée ou retirée ailleurs : renvoyer son identifiant échouerait toujours.
      const stale = idea && response?.status === 404;
      const message = stale ? "Cette idée n'est plus à cadrer : rechargez la page pour créer la mission sans elle." : response && !response.ok ? (payload?.error ?? generic) : generic;
      const invalidFields = missionFormErrors(payload?.code, {
        finding, title, outcome, scopeValue, stopRuleDays, templateKey,
        hasChannelChoice: Boolean(template && template.channels.length > 1),
      });
      setError(message);
      setFieldErrors(invalidFields);
      const firstInvalid = Object.keys(invalidFields)[0] as MissionFormField | undefined;
      if (firstInvalid) requestAnimationFrame(() => document.getElementById(firstInvalid)?.focus());
      setBusy(false);
      return;
    }
    // Le bouton reste désactivé jusqu'à la page de la mission : pas de second envoi.
    router.push(`/missions/${missionId}`);
  }

  return (
    <form className="new-mission-form stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="finding">Le constat de départ</label>
        <textarea id="finding" rows={3} minLength={10} maxLength={300} required value={finding} aria-invalid={fieldErrors.finding ? true : undefined} aria-describedby={fieldDescription("finding")} onChange={(event) => { setFinding(event.target.value); clearFieldError("finding"); }} />
        <p id="finding-error" className="small warning" hidden={!fieldErrors.finding}>{fieldErrors.finding}</p>
        <p id="finding-hint" className="small muted">10 à 300 caractères, sans balise HTML.</p>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="title">Nom de la mission</label>
          <input id="title" minLength={5} maxLength={80} required value={title} aria-invalid={fieldErrors.title ? true : undefined} aria-describedby={fieldDescription("title")} onChange={(event) => { setTitle(event.target.value); clearFieldError("title"); }} />
          <p id="title-error" className="small warning" hidden={!fieldErrors.title}>{fieldErrors.title}</p>
          <p id="title-hint" className="small muted">5 à 80 caractères, sans balise HTML.</p>
        </div>
        <div className="field">
          <label htmlFor="template">Type d&apos;action</label>
          <select id="template" value={templateKey} aria-invalid={fieldErrors.template ? true : undefined} aria-describedby={fieldDescription("template")} onChange={(event) => chooseTemplate(event.target.value)}>
            {templates.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label} · {candidate.contentFormat}</option>)}
          </select>
          <p id="template-error" className="small warning" hidden={!fieldErrors.template}>{fieldErrors.template}</p>
          <p id="template-hint" className="small muted">Choisissez une action disponible dans le catalogue.</p>
        </div>
      </div>
      {template && template.channels.length > 1 && (
        <div className="field">
          <label htmlFor="channel">Canal</label>
          <select id="channel" value={channel} aria-invalid={fieldErrors.channel ? true : undefined} aria-describedby={fieldDescription("channel")} onChange={(event) => { setChannel(event.target.value); clearFieldError("channel"); }}>
            {template.channels.map((option) => <option key={option.key || "none"} value={option.key}>{option.label}</option>)}
          </select>
          <p id="channel-error" className="small warning" hidden={!fieldErrors.channel}>{fieldErrors.channel}</p>
          <p id="channel-hint" className="small muted">Choisissez le canal de destination.</p>
        </div>
      )}
      {template && template.channels.length === 1 && <p className="small muted">Canal : {template.channels[0].label}</p>}
      {field && (
        <div className="field">
          <label htmlFor="scope">{field.label}</label>
          {field.multiline
            ? <textarea id="scope" rows={3} minLength={field.min} maxLength={field.max} required={field.required} value={scopeValue} aria-invalid={fieldErrors.scope ? true : undefined} aria-describedby={fieldDescription("scope")} onChange={(event) => { setScopeValue(event.target.value); clearFieldError("scope"); }} />
            : <input id="scope" minLength={field.min} maxLength={field.max} required={field.required} value={scopeValue} aria-invalid={fieldErrors.scope ? true : undefined} aria-describedby={fieldDescription("scope")} onChange={(event) => { setScopeValue(event.target.value); clearFieldError("scope"); }} />}
          <p id="scope-error" className="small warning" hidden={!fieldErrors.scope}>{fieldErrors.scope}</p>
          <p id="scope-hint" className="small muted">{field.min} à {field.max} caractères{field.required ? ", sans balise HTML" : " au maximum"}.</p>
        </div>
      )}
      {templateKey === "custom" && (
        <div className="field">
          <label htmlFor="stopRuleDays">Règle d&apos;arrêt (en jours, de 7 à 90)</label>
          <input id="stopRuleDays" type="number" min={7} max={90} required value={stopRuleDays} aria-invalid={fieldErrors.stopRuleDays ? true : undefined} aria-describedby={fieldDescription("stopRuleDays")} onChange={(event) => { setStopRuleDays(event.target.value); clearFieldError("stopRuleDays"); }} />
          <p id="stopRuleDays-error" className="small warning" hidden={!fieldErrors.stopRuleDays}>{fieldErrors.stopRuleDays}</p>
          <p id="stopRuleDays-hint" className="small muted">7 à 90 jours.</p>
        </div>
      )}
      <div className="field">
        <label htmlFor="outcome">Résultat recherché</label>
        <textarea id="outcome" rows={2} minLength={5} maxLength={120} required placeholder="Ex. Obtenir deux échanges qualifiés" value={outcome} aria-invalid={fieldErrors.outcome ? true : undefined} aria-describedby={fieldDescription("outcome")} onChange={(event) => { setOutcome(event.target.value); setOutcomeTouched(true); clearFieldError("outcome"); }} />
        <p id="outcome-error" className="small warning" hidden={!fieldErrors.outcome}>{fieldErrors.outcome}</p>
        <p id="outcome-hint" className="small muted">5 à 120 caractères, sans balise HTML.</p>
      </div>
      <small>La création ne consomme aucun crédit et n&apos;autorise aucun envoi. Le lancement coûtera {launchCost} crédits.</small>
      {error && <p role="alert" className="warning">{error}</p>}
      <div className="heading-actions">
        <button type="submit" className="primary" disabled={busy}><Icon name="plus" />Créer la mission</button>
        <PaulButton label="En discuter avec Paul" />
      </div>
    </form>
  );
}
