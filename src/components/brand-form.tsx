"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "@/components/mockup-ui";
import {
  BRAND_ELEMENT_LABELS, BRAND_FONT_NOTE, BRAND_LOGO_MAX_BYTES, BRAND_LOGO_ORIGIN, BRAND_LOGO_TOO_LARGE, BRAND_ORIGIN_LABELS, BRAND_RULES, BRAND_STATUS_LABELS, BRAND_TONES, BRAND_TONE_LABELS, normalizeHex, readableOn,
  type BrandElement, type BrandErrors, type BrandKit, type BrandOrigins, type BrandStatus, type BrandTone,
} from "@/lib/brand/rules";

/**
 * Ma marque (#290, FR-33) : aperçu, origine de chaque élément, deux couleurs, un ton et une case de confirmation obligatoire.
 * Les valeurs affichées sont celles de la proposition (site ou identité proposée) tant que le dirigeant ne les a pas confirmées.
 */
export function BrandForm({ name, status, kit, origins, fromSite, source, locked, logo, logoAvailable }: { name: string; status: BrandStatus; kit: BrandKit; origins: BrandOrigins; fromSite: boolean; source: string | null; locked: boolean; logo: { url: string } | null; logoAvailable: boolean }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(kit.primary);
  const [accent, setAccent] = useState(kit.accent);
  const [tone, setTone] = useState<BrandTone>(kit.tone);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<BrandErrors>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function sendLogo(file: File | null) {
    setLogoMessage(null);
    if (file && file.size > BRAND_LOGO_MAX_BYTES) { setLogoMessage({ kind: "error", text: BRAND_LOGO_TOO_LARGE }); return; }
    setBusy(true);
    try {
      let response: Response;
      if (file) {
        const body = new FormData();
        body.set("file", file);
        response = await fetch("/api/entreprise/marque/logo", { method: "POST", body });
      } else {
        response = await fetch("/api/entreprise/marque/logo", { method: "DELETE" });
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setLogoMessage({ kind: "error", text: data.error ?? "Le logo n'a pas pu être enregistré. Réessayez." }); return; }
      setLogoMessage({ kind: "ok", text: file ? "Logo enregistré. Les visuels existants devront être validés à nouveau." : "Logo retiré. Les visuels existants devront être validés à nouveau." });
      router.refresh();
    } catch {
      setLogoMessage({ kind: "error", text: "Le logo n'a pas pu être envoyé. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

  const shownPrimary = normalizeHex(primary) ?? kit.primary;
  const shownAccent = normalizeHex(accent) ?? kit.accent;
  const live: BrandOrigins = {
    primary: shownPrimary === kit.primary ? origins.primary : "declared",
    accent: shownAccent === kit.accent ? origins.accent : "declared",
    tone: tone === kit.tone ? origins.tone : "declared",
  };
  const values: Record<BrandElement, string> = { primary: shownPrimary, accent: shownAccent, tone: BRAND_TONE_LABELS[tone] };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const response = await fetch("/api/entreprise/marque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primary, accent, tone, confirmed }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; errors?: BrandErrors; changed?: boolean };
      if (!response.ok) {
        setErrors(data.errors ?? {});
        setMessage({ kind: "error", text: data.error ?? "Votre marque n'a pas pu être enregistrée. Réessayez." });
        return;
      }
      setMessage({ kind: "ok", text: data.changed ? "Marque confirmée. Les visuels existants devront être validés à nouveau." : "Marque déjà confirmée : rien n'a changé." });
      setConfirmed(false);
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Votre marque n'a pas pu être enregistrée. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ma-marque" aria-labelledby="marque-title" className="section-space">
      <div className="section-title">
        <h2 id="marque-title">Ma marque</h2>
        <p>Confirmez votre identité une fois : les visuels de Paul la respectent sans que vous régliez couleurs ni tailles.</p>
      </div>
      <div className="brand-preview" role="img" aria-label={`Aperçu de la marque : ${name}, couleurs ${shownPrimary} et ${shownAccent}`} style={{ background: shownPrimary, color: readableOn(shownPrimary), borderBottom: `8px solid ${shownAccent}`, padding: "20px 16px", borderRadius: 8, maxWidth: 480, overflowWrap: "anywhere" }}>
        {logo
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fichier Blob public de l'entreprise, déjà réduit */}
            <img src={logo.url} alt={`Logo de ${name}`} style={{ maxHeight: 48, maxWidth: 160, background: "#ffffff", borderRadius: 6, padding: 4 }} />
            <strong style={{ fontSize: 22 }}>{name}</strong>
          </span>
          : <strong style={{ fontSize: 22 }}>{name}</strong>}
      </div>
      <p className="small">
        <Tag color={status === "confirmed" ? "green" : "orange"}>{BRAND_STATUS_LABELS[status]}</Tag>
        {!fromSite && status === "to_confirm" && <span className="muted"> · Identité proposée, non issue d&apos;un site.</span>}
      </p>
      <dl className="modal-details">
        {(["primary", "accent", "tone"] as const).map((element) => (
          <div key={element}>
            <dt>{BRAND_ELEMENT_LABELS[element]}</dt>
            <dd>{values[element]} <span className="muted">· {live[element] === "site" && source ? `Lu sur ${source}` : BRAND_ORIGIN_LABELS[live[element]]}</span></dd>
          </div>
        ))}
        <div><dt>Logo</dt><dd>{logo ? <>Logo ajouté <span className="muted">· {BRAND_LOGO_ORIGIN}</span></> : <span className="muted">Aucun logo : la signature reprend le nom de votre entreprise.</span>}</dd></div>
        <div><dt>Typographie</dt><dd>{BRAND_FONT_NOTE}</dd></div>
      </dl>
      <div className="heading-actions">
        <label className="btn" aria-disabled={busy || locked || !logoAvailable}>
          {logo ? "Remplacer le logo" : "Ajouter un logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={logo ? "Remplacer le logo" : "Ajouter un logo"} disabled={busy || locked || !logoAvailable} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; if (file) void sendLogo(file); }} />
        </label>
        {logo && <button type="button" disabled={busy || locked} onClick={() => void sendLogo(null)}>Retirer le logo</button>}
      </div>
      <p className="small muted">{logoAvailable ? "PNG, JPEG ou WebP, 500 Ko au plus." : "L'envoi du logo n'est pas encore disponible."}</p>
      {logoMessage && <p role={logoMessage.kind === "ok" ? "status" : "alert"} className={logoMessage.kind === "ok" ? "notice" : "warning"}>{logoMessage.text}</p>}
      {locked && <p className="warning small" role="status">Un visuel est programmé : annulez sa diffusion avant de modifier votre marque.</p>}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label className="field" htmlFor="brand-primary">Couleur principale
          <input id="brand-primary" value={primary} onChange={(event) => setPrimary(event.target.value)} inputMode="text" autoComplete="off" spellCheck={false} placeholder="#1f5f4a" aria-invalid={Boolean(errors.primary)} aria-describedby={errors.primary ? "brand-primary-error" : undefined} />
          {errors.primary && <span id="brand-primary-error" role="alert" className="warning small">{errors.primary}</span>}
        </label>
        <label className="field" htmlFor="brand-accent">Couleur d&apos;accent
          <input id="brand-accent" value={accent} onChange={(event) => setAccent(event.target.value)} inputMode="text" autoComplete="off" spellCheck={false} placeholder="#e0a030" aria-invalid={Boolean(errors.accent)} aria-describedby={errors.accent ? "brand-accent-error" : undefined} />
          {errors.accent && <span id="brand-accent-error" role="alert" className="warning small">{errors.accent}</span>}
        </label>
        <label className="field" htmlFor="brand-tone">Ton de marque
          <select id="brand-tone" value={tone} onChange={(event) => setTone(event.target.value as BrandTone)} aria-invalid={Boolean(errors.tone)}>
            {BRAND_TONES.map((key) => <option key={key} value={key}>{BRAND_TONE_LABELS[key]}</option>)}
          </select>
          {errors.tone && <span role="alert" className="warning small">{errors.tone}</span>}
        </label>
        <label className="check" htmlFor="brand-confirm">
          <input id="brand-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} aria-describedby={errors.confirmed ? "brand-confirm-error" : undefined} />
          Je confirme ces éléments pour les prochaines créations
        </label>
        {errors.confirmed && <p id="brand-confirm-error" role="alert" className="warning small">{errors.confirmed}</p>}
        <button type="submit" className="primary" disabled={busy || locked}>{busy ? "Enregistrement…" : status === "confirmed" ? "Mettre à jour ma marque" : "Confirmer ma marque"}</button>
        {message && <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? "notice" : "warning"}>{message.text}</p>}
      </form>
      <h3>Trois règles de contenu</h3>
      <ul className="feedback-list">{BRAND_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
    </section>
  );
}
