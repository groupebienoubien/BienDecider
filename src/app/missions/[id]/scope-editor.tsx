"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TemplateKey } from "@/lib/missions/templates";

type ChannelOption = { key: string | null; label: string };

async function transition(id: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch(`/api/missions/${id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return null;
  return (await response.json().catch(() => null))?.error ?? "Action impossible pour le moment.";
}

const SCOPE_FIELDS: Partial<Record<TemplateKey, { key: string; label: string; help: string; multiline: boolean; max: number }>> = {
  social_post: { key: "topic", label: "Sujet de la publication", help: "5 à 120 caractères.", multiline: false, max: 120 },
  custom: { key: "description", label: "Ce que vous voulez faire", help: "10 à 300 caractères : l'action, où et avec qui.", multiline: true, max: 300 },
  site_page: { key: "page", label: "Titre de la page (facultatif)", help: "80 caractères au plus.", multiline: false, max: 80 },
};

/** « Ce que vous choisissez » (§6) : canal et périmètre, modifiables tant que la mission n'est ni arrêtée ni écartée. */
export function ScopeEditor({ missionId, version, template, scope, channel, channels, channelLocked, lockedReason }: {
  missionId: string;
  version: number;
  template: TemplateKey;
  scope: Record<string, unknown>;
  channel: string | null;
  channels: ChannelOption[];
  channelLocked: boolean;
  lockedReason: string | null;
}) {
  const router = useRouter();
  const field = SCOPE_FIELDS[template];
  const [value, setValue] = useState(field && typeof scope[field.key] === "string" ? (scope[field.key] as string) : "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;

  async function run(body: Record<string, unknown>, done: string) {
    setSending(true);
    setError("");
    setSaved("");
    const refused = await transition(missionId, { ...body, expectedVersion: version });
    setSending(false);
    if (refused) setError(refused);
    else startRefresh(() => {
      setSaved(done);
      router.refresh();
    });
  }

  if (lockedReason) return <p className="notice">{lockedReason}</p>;

  return (
    <div className="stack">
      {channels.length > 1 && (
        <label className="field">
          Canal de la mission
          <select value={channel ?? ""} disabled={busy || channelLocked} onChange={(event) => void run({ action: "set_channel", channel: event.target.value || null }, "Canal enregistré.")}>
            {channels.map((option) => <option key={option.key ?? "none"} value={option.key ?? ""}>{option.label}</option>)}
          </select>
          {channelLocked && <small>Le canal est figé dès qu&apos;une version est validée.</small>}
        </label>
      )}
      {field && (
        <form onSubmit={(event) => { event.preventDefault(); void run({ action: "set_scope", scope: value.trim() ? { [field.key]: value } : {} }, "Périmètre enregistré."); }}>
          <label className="field">
            {field.label}
            {field.multiline
              ? <textarea rows={3} maxLength={field.max} value={value} onChange={(event) => setValue(event.target.value)} />
              : <input maxLength={field.max} value={value} onChange={(event) => setValue(event.target.value)} />}
          </label>
          <small>{field.help}</small>
          <div className="heading-actions"><button type="submit" disabled={busy}>Enregistrer le périmètre</button></div>
        </form>
      )}
      {saved && <p role="status" className="notice">{saved}</p>}
      {error && <p role="alert" className="warning">{error}</p>}
    </div>
  );
}
