"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { MISSION_MESSAGES } from "@/lib/missions/messages";
import { BODY_MAX, PROFILE_REVIEW_BADGE, REJECTION_MAX, TITLE_MAX, VARIANTS, variantLabel, type ChecklistItem, type VariantKind } from "@/lib/contents/rules";
import { VISUAL_PHOTO_ALT_REQUIRED, VISUAL_PHOTO_MAX_BYTES, VISUAL_PHOTO_TOO_LARGE, VISUAL_RIGHTS_LABEL } from "@/lib/brand/photo";
import { resizeVisualPhoto } from "@/lib/brand/photo-client";
import { SITE_PHOTO_BAD_TYPE } from "@/lib/site/photos";
import { BRAND_COMPOSITIONS, BRAND_COMPOSITION_LABELS, type BrandComposition } from "@/lib/brand/rules";
import type { AtelierItem, ContentDetail, VersionView } from "@/lib/contents/view";

const AUTHORS: Record<VersionView["author"], string> = { owner: "vous", paul: "Paul", system: "système" };
const RECIPIENT_STATES: Record<string, string> = { sent: "envoyé", failed: "non envoyé", uncertain: "à vérifier dans Gmail", sending: "envoi en cours" };

async function send(path: string, body: Record<string, unknown>): Promise<{ error: string | null; message: string | null }> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (response.ok) return { error: null, message: typeof payload?.message === "string" ? payload.message : null };
  return { error: payload?.error ?? "Action impossible pour le moment.", message: null };
}

const formatDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const today = () => new Date().toLocaleDateString("sv-SE");

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BD";
}

const noSubscription = () => () => undefined;

function readDraft(saved: string | null): { title: string; body: string } | null {
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as { title?: unknown; body?: unknown };
    return typeof value.title === "string" && typeof value.body === "string" ? { title: value.title, body: value.body } : null;
  } catch {
    return null;
  }
}

/** Aperçu propre au canal (§5.6) : publication, e-mail au destinataire, page de site ou texte seul. */
function Preview({ detail, title, body }: { detail: ContentDetail; title: string; body: string }) {
  switch (detail.format) {
    case "social_post":
    case "google_post":
      return (
        <article className="social-preview" aria-label={`Aperçu ${detail.mission.channelLabel}`}>
          <div className="social-head">
            <span className="avatar" aria-hidden="true">{initials(detail.companyName)}</span>
            <div><strong>{detail.companyName}</strong><span className="muted">Aperçu {detail.mission.channelLabel} · non publié</span></div>
          </div>
          <div className="social-text"><strong>{title}</strong>{"\n\n"}{body}</div>
        </article>
      );
    case "email":
      return (
        <article className="email-preview" aria-label="Aperçu destinataire">
          <dl>
            <dt>De</dt><dd>{detail.companyName}</dd>
            <dt>À</dt><dd>{detail.recipients.length
              ? <>{detail.recipients.map((recipient) => `${recipient.name} <${recipient.email}>`).join(", ")} · envois séparés</>
              : detail.mission.scopeSummary === "À préciser" ? "Aucun destinataire dans le périmètre" : `${detail.mission.scopeSummary} · envois séparés`}</dd>
            <dt>Objet</dt><dd><strong>{title}</strong></dd>
          </dl>
          <div className="email-body">{body}</div>
        </article>
      );
    case "site_page":
      return (
        <article className="page-preview" aria-label="Aperçu de la page">
          <h2>{title}</h2>
          <div className="page-body">{body}</div>
        </article>
      );
    default:
      return (
        <article className="page-preview" aria-label="Aperçu du texte">
          <strong>{title}</strong>
          <div className="page-body">{body}</div>
        </article>
      );
  }
}

/**
 * L'atelier d'un contenu : les règles sont celles du serveur, l'interface montre seulement les gestes possibles
 * et affiche les refus tels quels. Les retouches non enregistrées sont gardées dans l'onglet et bloquent les décisions (M-60).
 */
export function ContentWorkbench({ detail, viewing, items, checklist, credits, visualSvg, visualPreview }: { detail: ContentDetail; viewing: number; items: AtelierItem[]; checklist: ChecklistItem[]; credits: number; visualSvg: string | null; visualPreview: boolean }) {
  const router = useRouter();
  const current = detail.versions[0];
  const version = detail.versions.find((item) => item.number === viewing) ?? current;
  const archive = version.number !== current.number;
  const draftKey = `atelier:${detail.id}:${current.number}`;

  // Des retouches laissées dans l'onglet sont retrouvées telles quelles et signalées (FR-28).
  const stored = readDraft(useSyncExternalStore(noSubscription, () => window.sessionStorage.getItem(draftKey), () => null));
  const [edit, setEdit] = useState<{ title: string; body: string } | null>(null);
  const restored = edit === null && stored !== null;
  const { title, body } = edit ?? stored ?? { title: current.title, body: current.body };
  const setTitle = (value: string) => setEdit({ title: value, body });
  const setBody = (value: string) => setEdit({ title, body: value });
  const [dialog, setDialog] = useState<"validate" | "reject" | "publish" | "declare" | "cancel" | null>(null);
  const [moment, setMoment] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [rights, setRights] = useState(false);
  const [photoAlt, setPhotoAlt] = useState(`Photo de ${detail.companyName}`);
  const [confirmed, setConfirmed] = useState(false);
  const [declaredWhere, setDeclaredWhere] = useState("");
  const [declaredOn, setDeclaredOn] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [variant, setVariant] = useState<VariantKind>("shorter");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<{ area: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [composition, setComposition] = useState<BrandComposition | "none">(detail.visual.composition ?? "none");
  const busy = sending !== null || refreshing;

  const dirty = title !== current.title || body !== current.body;
  useEffect(() => {
    if (edit === null) return;
    if (dirty) window.sessionStorage.setItem(draftKey, JSON.stringify(edit));
    else window.sessionStorage.removeItem(draftKey);
  }, [dirty, draftKey, edit]);

  const editRefusal = detail.editRefusal ? MISSION_MESSAGES[detail.editRefusal as keyof typeof MISSION_MESSAGES].replace("{n}", String(current.number)) : null;
  const canEdit = !editRefusal;

  async function run(area: string, payload: Record<string, unknown>, after?: () => void, path = `/api/contents/${detail.id}`) {
    setSending(area);
    setError(null);
    setNotice(null);
    const result = await send(path, { ...payload, number: current.number });
    setSending(null);
    if (result.error) {
      setError({ area, text: result.error });
      return;
    }
    after?.();
    setNotice(result.message);
    // Le dialogue se ferme avec l'état à jour : un geste suivant part toujours de la bonne version.
    startRefresh(() => {
      setDialog(null);
      if (archive) router.replace(`/atelier/${detail.id}`);
      router.refresh();
    });
  }

  // Import d'une photo (#291) : l'adresse et la version sont fixées au clic ; changer de page pendant l'envoi ne rattache jamais la photo ailleurs.
  async function importPhoto(file: File) {
    const target = `/api/contents/${detail.id}/photo`;
    const sentNumber = current.number;
    setError(null);
    setNotice(null);
    if (dirty) { setError({ area: "photo", text: MISSION_MESSAGES["M-60"] }); return; }
    const alt = photoAlt.trim();
    if (!alt) { setError({ area: "photo", text: VISUAL_PHOTO_ALT_REQUIRED }); return; }
    setSending("photo");
    let resized: Blob;
    try {
      resized = await resizeVisualPhoto(file);
    } catch {
      setSending(null);
      setError({ area: "photo", text: SITE_PHOTO_BAD_TYPE });
      return;
    }
    if (resized.size > VISUAL_PHOTO_MAX_BYTES) { setSending(null); setError({ area: "photo", text: VISUAL_PHOTO_TOO_LARGE }); return; }
    const body = new FormData();
    body.set("file", resized, "photo.jpg");
    body.set("alt", alt);
    body.set("number", String(sentNumber));
    try {
      const response = await fetch(target, { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setSending(null);
      if (!response.ok) { setError({ area: "photo", text: data.error ?? "La photo n'a pas pu être enregistrée. Réessayez." }); return; }
      setNotice("Photo ajoutée. Les droits d'utilisation seront à confirmer à la validation.");
      startRefresh(() => router.refresh());
    } catch {
      setSending(null);
      setError({ area: "photo", text: "La photo n'a pas pu être envoyée. Réessayez." });
    }
  }

  const clearDraft = () => window.sessionStorage.removeItem(draftKey);
  const failure = (area: string) => (error?.area === area ? <p role="alert" className="warning">{error.text}</p> : null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${version.title}\n\n${version.body}`);
      setCopied(true);
    } catch {
      setError({ area: "copy", text: "Copie impossible : sélectionnez le texte de l'aperçu." });
    }
  }

  const overLimit = body.length > detail.bodyLimit;
  const validated = !archive && detail.status === "validated";
  const diffused = !archive && detail.status === "diffused";
  const scheduled = !archive && detail.status === "scheduled";
  const publication = archive ? null : detail.publication;
  const pending = publication && (publication.status === "uncertain" || publication.status === "sending") ? publication : null;
  const lastFailure = validated && publication?.status === "failed" ? publication.failureReason : null;
  const diffusionPath = `/api/contents/${detail.id}/diffusion`;
  const selfPublish = detail.delegation === "prepare" || detail.mission.channel === null;
  const openDialog = (next: "validate" | "reject" | "publish" | "declare" | "cancel") => {
    setError(null);
    setReviewed(false);
    setRights(false);
    setConfirmed(false);
    setReason("");
    setMoment("now");
    setScheduleAt("");
    setDeclaredWhere(detail.mission.channel ? detail.destination.label : "");
    setDeclaredOn(today());
    setDialog(next);
  };
  const scheduleIso = moment === "later" && scheduleAt ? new Date(scheduleAt).toISOString() : null;

  const decisionTitle = archive ? `V${version.number} · archive en lecture seule`
    : pending ? (detail.resolvable ? "Résultat incertain" : "Diffusion en cours")
    : diffused ? `V${version.number} diffusée`
    : scheduled ? `V${version.number} programmée`
    : version.rejectionReason ? `V${version.number} refusée`
    : validated ? `V${version.number} validée`
    : "Votre accord est nécessaire";
  const decisionText = archive ? "Y revenir crée une nouvelle version, à relire et valider."
    : pending ? (detail.resolvable ? `${pending.channelLabel} n'a pas confirmé la diffusion. Vérifiez sur le canal, puis dites-le : rien ne sera renvoyé automatiquement.` : "Le canal n'a pas encore répondu. Rechargez la page dans un instant.")
    : diffused && publication ? `${publication.mode === "declared" ? "Diffusée par vous" : detail.format === "email" ? "Envoyée" : "Publiée"} ${detail.format === "email" && publication.mode !== "declared" ? "depuis" : "sur"} ${publication.channelLabel}${publication.sentAt ? ` le ${formatDay(publication.sentAt)}` : ""}${publication.mode === "declared" ? " · déclarée par vous" : ""}. Elle ne se modifie plus.`
    : scheduled && publication ? `Diffusion prévue le ${publication.scheduledLabel} sur ${publication.channelLabel}, à quelques minutes près. Les contrôles sont refaits à l'heure prévue ; vous pouvez encore l'annuler.`
    : version.rejectionReason ? `Votre motif : « ${version.rejectionReason} ». Paul en tiendra compte pour les prochaines versions de cette mission.`
    : validated ? (selfPublish
      ? (detail.mission.channel === null ? "Mission menée hors canal : récupérez le texte, diffusez-le, puis déclarez-le." : `Votre règle : ${detail.delegationLabel}. Récupérez le texte, diffusez-le vous-même, puis déclarez-le.`)
      : `Aucun envoi effectué. ${detail.publishRefusal ?? "Validation et diffusion sont deux décisions distinctes : rien ne part sans votre confirmation."}`)
    : detail.canValidate && detail.profileToReview ? MISSION_MESSAGES["M-92"]
    : detail.canValidate && detail.visual.composition && detail.visual.brandToConfirm ? MISSION_MESSAGES["M-93"]
    : detail.canValidate ? "Valider n'envoie rien : la diffusion reste une décision distincte."
    : MISSION_MESSAGES["M-47"];

  return (
    <div className="atelier">
      <div className="atelier-toolbar">
        <label className="field atelier-select">
          <span className="eyebrow">Contenu</span>
          <select aria-label="Contenu" value={detail.id} onChange={(event) => router.push(`/atelier/${event.target.value}`)}>
            {items.map((item) => <option key={item.contentId} value={item.contentId}>{item.label}</option>)}
          </select>
        </label>
        <div className="tags">
          <span className="tag blue">V{version.number} · {archive ? "archive" : "courante"}</span>
          <span className={`tag ${validated || diffused ? "green" : archive ? "gray" : "orange"}`}>{archive ? version.state : detail.statusLabel}</span>
          {!archive && detail.profileToReview && <span className="tag orange">{PROFILE_REVIEW_BADGE}</span>}
        </div>
      </div>

      {detail.readOnly
        ? <p className="notice">{MISSION_MESSAGES["M-44"]}</p>
        : !detail.canValidate && <p className="notice">La mission n&apos;est pas en cours : vous pouvez retoucher ce contenu, pas le valider. <Link href={`/missions/${detail.mission.id}`}>Lancer ou reprendre la mission</Link></p>}

      <div className="atelier-layout">
        <section aria-labelledby="preview-title">
          <div className="atelier-toolbar">
            <h2 id="preview-title" className="small muted">{detail.mission.channelLabel} · {detail.formatLabel}</h2>
            <span className="small muted">Mission : <Link href={`/missions/${detail.mission.id}`}>{detail.mission.title}</Link></span>
          </div>
          <div className="preview-stage"><Preview detail={detail} title={version.title} body={version.body} /></div>
          <div className="atelier-copy">
            <span className="small muted">{archive ? `V${version.number}, en lecture seule.` : "Aperçu de la version enregistrée."}</span>
            <button type="button" className="small" onClick={() => void copy()}><Icon name="copy" />{copied ? "Texte copié" : "Copier le texte"}</button>
          </div>
          {failure("copy")}

          {detail.format === "social_post" && (
            <section className="section-space" aria-labelledby="visual-title">
              <h2 id="visual-title">Visuel</h2>
              {visualSvg
                ? <div className="preview-stage" role="group" aria-label="Aperçu du visuel" dangerouslySetInnerHTML={{ __html: visualSvg }} />
                : <p className="small muted">{detail.visual.composition ? "Aucun visuel pour cette version." : "Aucun visuel : cette publication partira sans image."}</p>}
              {detail.visual.composition && visualPreview && <p className="small muted">Aperçu avec une identité proposée : confirmez votre marque pour figer ce rendu.</p>}
              {detail.visual.composition && detail.visual.brandToConfirm && <p className="warning small" role="status">{MISSION_MESSAGES["M-93"]} <Link href="/entreprise#ma-marque">Confirmer ma marque</Link></p>}
              {!archive && canEdit && (
                <div className="heading-actions">
                  <label className="field">Composition
                    <select value={composition} onChange={(event) => setComposition(event.target.value as BrandComposition | "none")}>
                      <option value="none">Sans visuel</option>
                      {BRAND_COMPOSITIONS.map((key) => <option key={key} value={key}>{BRAND_COMPOSITION_LABELS[key]}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy || composition === (detail.visual.composition ?? "none")} onClick={() => void run("visual", { action: "set_visual", composition: composition === "none" ? null : composition }, clearDraft)}><Icon name="check" />Enregistrer le visuel</button>
                </div>
              )}
              {!archive && canEdit && (
                <div className="heading-actions">
                  <label className="field">Description de la photo
                    <input value={photoAlt} maxLength={200} onChange={(event) => setPhotoAlt(event.target.value)} />
                  </label>
                  <label className="btn" aria-disabled={busy || dirty}>
                    <Icon name="plus" />{detail.visual.photo ? "Remplacer la photo" : "Importer une photo"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy || dirty} aria-label="Importer une photo" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importPhoto(file); }} />
                  </label>
                  {detail.visual.photo && <button type="button" disabled={busy} onClick={() => void run("photo", { action: "remove_photo" })}><Icon name="x" />Retirer la photo</button>}
                </div>
              )}
              <p className="small muted">{detail.visual.photo ? `Photo : « ${detail.visual.photo.alt} ». ${detail.visual.rightsConfirmed ? "Droits confirmés pour cette version." : "Droits à confirmer à la validation."}` : "Sans photo, le visuel reprend une illustration neutre de votre marque. JPG, PNG ou WebP, 1 Mo au plus."}</p>
              {failure("photo")}
              {failure("visual")}
            </section>
          )}

          <div className="atelier-decision" aria-labelledby="decision-title">
            <div>
              <h2 id="decision-title">{decisionTitle}</h2>
              <p className="small muted">{decisionText}</p>
              {lastFailure && <p className="warning small">La dernière tentative n&apos;a pas abouti : {lastFailure}. Rien n&apos;a été diffusé.</p>}
              {validated && detail.systemCancel && <p className="warning small">La programmation a été annulée : {detail.systemCancel}. La version reste validée.</p>}
              {diffused && publication?.url && <p className="small"><a href={publication.url} target="_blank" rel="noopener noreferrer">Voir la page publiée</a></p>}
              {publication && publication.recipients.length > 0 && (
                <ul className="small" aria-label="Envois par destinataire">
                  {publication.recipients.map((recipient) => (
                    <li key={recipient.name}>{recipient.name} : {RECIPIENT_STATES[recipient.status] ?? recipient.status}{recipient.failureReason ? ` (${recipient.failureReason})` : ""}</li>
                  ))}
                </ul>
              )}
              {notice && <p className="small" role="status">{notice}</p>}
            </div>
            <div className="heading-actions">
              {archive && <button type="button" disabled={busy || !canEdit} onClick={() => void run("decision", { action: "restore", from: version.number }, clearDraft)}><Icon name="undo-2" />Revenir à cette version</button>}
              {pending && detail.resolvable && <>
                <button type="button" className="primary" disabled={busy} onClick={() => void run("decision", { action: "resolve", sent: true }, undefined, diffusionPath)}><Icon name="check" />C&apos;est bien parti</button>
                <button type="button" disabled={busy} onClick={() => void run("decision", { action: "resolve", sent: false }, undefined, diffusionPath)}><Icon name="x" />Ce n&apos;est pas parti</button>
              </>}
              {diffused && <>
                <button type="button" className="primary" disabled={busy || detail.readOnly} onClick={() => void run("decision", { action: "next_version" }, clearDraft)}><Icon name="plus" />Créer V{current.number + 1} à partir de V{current.number}</button>
                <Link className="btn" href={`/resultats?mission=${detail.mission.id}`}>Voir le suivi</Link>
              </>}
              {validated && !pending && !detail.readOnly && <>
                {selfPublish
                  ? <button type="button" className="primary" onClick={() => void copy()}><Icon name="copy" />{copied ? "Texte copié" : "Récupérer le texte"}</button>
                  : detail.publishRefusal === null
                    ? <button type="button" className="primary" disabled={busy || dirty} onClick={() => openDialog("publish")}><Icon name="megaphone" />{lastFailure ? "Réessayer" : detail.format === "email" ? "Préparer l'envoi" : "Préparer la publication"}</button>
                    : !detail.destination.connected && detail.destination.enabled && <Link className="btn primary" href={`/connexions?retour=/atelier/${detail.id}`}>Connecter {detail.mission.channelLabel}</Link>}
                <button type="button" disabled={busy || dirty} onClick={() => openDialog("declare")}><Icon name="check" />Je l&apos;ai diffusé moi-même</button>
              </>}
              {scheduled && !detail.readOnly && <button type="button" disabled={busy} onClick={() => openDialog("cancel")}><Icon name="x" />Annuler la programmation</button>}
              {!archive && !pending && !diffused && !scheduled && !detail.readOnly && !validated && (
                <button type="button" className="primary" disabled={busy || !detail.canValidate || detail.profileToReview || (detail.visual.composition !== null && detail.visual.brandToConfirm)} onClick={() => openDialog("validate")}><Icon name="check" />Valider cette version</button>
              )}
              {!archive && !pending && !diffused && !scheduled && !detail.readOnly && !version.rejectionReason && (
                <button type="button" disabled={busy} onClick={() => openDialog("reject")}><Icon name="x" />Je ne veux pas de cette version</button>
              )}
            </div>
            {failure("decision")}
          </div>

          <section className="section-space" aria-labelledby="history-title">
            <h2 id="history-title">Historique</h2>
            <ol className="version-list">
              {detail.versions.map((item) => (
                <li key={item.number}>
                  <Link className={`version-row${item.number === version.number ? " active" : ""}`} href={item.number === current.number ? `/atelier/${detail.id}` : `/atelier/${detail.id}?v=${item.number}`} aria-current={item.number === version.number ? "true" : undefined}>
                    <strong>V{item.number}</strong>
                    <div>{item.note ?? "Version"}<small>par {AUTHORS[item.author]} · {formatDate(item.createdAt)}{item.rejectionReason ? ` · motif : ${item.rejectionReason}` : ""}</small></div>
                    <span className="tag gray">{item.state}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </section>

        <aside className="editor-controls">
          <section>
            <h3>Une décision, une version.</h3>
            <p className="small muted">Vous examinez V{version.number}{version.note ? ` (${version.note})` : ""}, par {AUTHORS[version.author]}. Chaque retouche crée une nouvelle version et retire la validation.</p>
          </section>

          <section aria-labelledby="rework-title">
            <h3 id="rework-title">Retravailler avec Paul</h3>
            {detail.suggestion ? (
              <div className="suggestion">
                <p className="small"><strong>Proposition de Paul · {variantLabel(detail.suggestion.variant)}</strong></p>
                <p className="small"><strong>{detail.suggestion.title}</strong></p>
                <p className="small suggestion-body">{detail.suggestion.body}</p>
                <div className="heading-actions">
                  <button type="button" className="primary" disabled={busy || !canEdit || dirty || credits < detail.variantCost} onClick={() => void run("rework", { action: "accept_variant" }, clearDraft)}><Icon name="check" />Garder cette version ({detail.variantCost} crédit)</button>
                  <button type="button" disabled={busy} onClick={() => void run("rework", { action: "dismiss_variant" })}><Icon name="x" />Écarter</button>
                </div>
              </div>
            ) : (
              <>
                <div className="segmented" role="group" aria-label="Façon de retravailler">
                  {(Object.keys(VARIANTS) as VariantKind[]).map((kind) => (
                    <button key={kind} type="button" className={variant === kind ? "active" : undefined} aria-pressed={variant === kind} onClick={() => setVariant(kind)}>{VARIANTS[kind]}</button>
                  ))}
                </div>
                {variant === "custom" && (
                  <label className="field">
                    <span>Votre consigne</span>
                    <input value={instruction} maxLength={300} onChange={(event) => setInstruction(event.target.value)} placeholder="Ex. : parlez de nos délais d'intervention" />
                  </label>
                )}
                <button type="button" disabled={busy || !canEdit || dirty || archive || credits < detail.variantCost} onClick={() => void run("rework", { action: "variant", variant, instruction: variant === "custom" ? instruction : undefined })}>
                  <Icon name="message-circle" />{sending === "rework" ? "Paul prépare une proposition…" : "Demander à Paul"}
                </button>
              </>
            )}
            <p className="small muted">La proposition ne devient une version, et {detail.variantCost} crédit n&apos;est débité, que si vous la gardez. Solde : {credits} crédit{credits > 1 ? "s" : ""}.</p>
            {credits < detail.variantCost && <p className="warning small">{MISSION_MESSAGES["M-15"].replace("{n}", String(detail.variantCost)).replace("{m}", String(credits))}</p>}
            {failure("rework")}
          </section>

          <section aria-labelledby="edit-title">
            <h3 id="edit-title">Texte &amp; composition</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run("edit", { action: "save", title, body }, clearDraft);
              }}
            >
              <label className="field">
                <span>{detail.titleLabel}</span>
                <input name="title" value={title} maxLength={TITLE_MAX} required disabled={!canEdit || archive} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span>Texte</span>
                <textarea name="body" rows={9} value={body} maxLength={BODY_MAX} required disabled={!canEdit || archive} onChange={(event) => setBody(event.target.value)} />
                <small className={overLimit ? "warning" : "muted"}>{body.length} / {detail.bodyLimit} caractères{detail.bodyLimit < BODY_MAX ? ` (limite de ${detail.mission.channelLabel})` : ""}</small>
              </label>
              {dirty && <p className="notice small" role="status">{restored ? "Retouches non enregistrées retrouvées. " : "Retouches non enregistrées. "}{MISSION_MESSAGES["M-60"]}</p>}
              {editRefusal && <p className="small muted">{editRefusal}</p>}
              <div className="heading-actions">
                <button type="submit" disabled={busy || !canEdit || archive || !dirty}><Icon name="save" />Enregistrer une nouvelle version</button>
                {dirty && <button type="button" disabled={busy} onClick={() => setEdit({ title: current.title, body: current.body })}>Annuler mes retouches</button>}
              </div>
              {failure("edit")}
            </form>
          </section>

          <section aria-labelledby="frame-title">
            <h3 id="frame-title">Cadre de diffusion</h3>
            <dl className="atelier-frame small">
              <dt>Canal</dt>
              <dd>{detail.mission.channel ? detail.destination.label : detail.mission.channelLabel}{detail.mission.channel && detail.mission.channel !== "site" && (detail.channelConnected ? <span className="tag green">Connecté</span> : <> · <Link href={`/connexions?retour=/atelier/${detail.id}`}>Connecter</Link></>)}</dd>
              <dt>Délégation</dt><dd>{detail.delegationLabel} · <Link href="/connexions#delegation">Modifier</Link></dd>
              {detail.format === "email" && <><dt>Destinataires</dt><dd>{detail.mission.scopeSummary}</dd></>}
            </dl>
          </section>
        </aside>
      </div>

      <Modal
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        kicker="Votre accord"
        title="Confirmer la diffusion"
        actions={<button type="button" className="primary" disabled={busy || !confirmed || dirty || (moment === "later" && !scheduleIso)} onClick={() => void run("publish", { action: "publish", confirmed, scheduledAt: scheduleIso, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, undefined, diffusionPath)}><Icon name="megaphone" />{sending === "publish" ? "Diffusion en cours…" : moment === "later" ? "Programmer la diffusion" : "Diffuser maintenant"}</button>}
      >
        <dl className="modal-details">
          <dt>Version</dt><dd>V{current.number} · {current.title}</dd>
          <dt>Destination</dt><dd>{detail.destination.label}</dd>
          <dt>Qui le verra</dt><dd>{detail.exposure}</dd>
        </dl>
        <fieldset className="moment-choice">
          <legend>Moment</legend>
          <label><input type="radio" name="moment" checked={moment === "now"} onChange={() => setMoment("now")} /> Maintenant</label>
          <label><input type="radio" name="moment" checked={moment === "later"} onChange={() => setMoment("later")} /> Programmer</label>
          {moment === "later" && (
            <label className="field">
              <span>Date et heure (heure de cet appareil)</span>
              <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
              <small className="muted">La diffusion part vers l&apos;heure choisie, à quelques minutes près, après avoir refait les contrôles.</small>
            </label>
          )}
        </fieldset>
        {dirty && <p className="warning">{MISSION_MESSAGES["M-60"]}</p>}
        <label className="check-field">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Je confirme cette version, cette destination et ce moment</span>
        </label>
        <p className="small muted">Une diffusion faite ne se reprend pas. Si le canal ne répond pas, rien n&apos;est renvoyé automatiquement.</p>
        {failure("publish")}
      </Modal>

      <Modal
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        kicker="Votre décision"
        title="Annuler cette programmation ?"
        cancelLabel="Garder la programmation"
        actions={<button type="button" className="danger" disabled={busy} onClick={() => void run("cancel", { action: "cancel" }, undefined, diffusionPath)}><Icon name="x" />Annuler la programmation</button>}
      >
        <p>Le contenu restera validé. Vous pourrez le diffuser ou le programmer de nouveau.</p>
        {failure("cancel")}
      </Modal>

      <Modal
        open={dialog === "declare"}
        onClose={() => setDialog(null)}
        kicker="Votre déclaration"
        title="Je l'ai diffusé moi-même"
        actions={<button type="button" className="primary" disabled={busy || !confirmed || dirty} onClick={() => void run("declare", { action: "declare", channel: declaredWhere, date: declaredOn, confirmed }, undefined, diffusionPath)}><Icon name="check" />Déclarer la diffusion</button>}
      >
        <p><strong>V{current.number} · {current.title}</strong></p>
        <label className="field">
          <span>Où l&apos;avez-vous diffusé ?</span>
          <input value={declaredWhere} maxLength={60} onChange={(event) => setDeclaredWhere(event.target.value)} placeholder="Ex. : affichage en boutique, salon du quartier" />
        </label>
        <label className="field">
          <span>Date de diffusion</span>
          <input type="date" value={declaredOn} max={today()} onChange={(event) => setDeclaredOn(event.target.value)} />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Je confirme avoir diffusé cette version</span>
        </label>
        <p className="small muted">La diffusion sera marquée « déclarée par vous » partout et la version ne se modifiera plus.</p>
        {failure("declare")}
      </Modal>

      <Modal
        open={dialog === "validate"}
        onClose={() => setDialog(null)}
        kicker="Votre accord"
        title={`Valider la version V${current.number}`}
        actions={<button type="button" className="primary" disabled={busy || !reviewed || (Boolean(detail.visual.composition && detail.visual.photo) && !rights) || dirty} onClick={() => void run("validate", { action: "validate", reviewed, rights })}><Icon name="check" />Valider sans diffuser</button>}
      >
        <h3>{current.title}</h3>
        <dl className="modal-details">
          <dt>Qui le verra</dt><dd>{detail.exposure}</dd>
          <dt>Mission</dt><dd>{detail.mission.title}</dd>
        </dl>
        <h4>À vérifier avant de valider</h4>
        <ul className="review-checklist small">
          {checklist.map((item) => <li key={item.kind}><strong>{item.label}</strong> : {item.excerpts.map((excerpt) => `« ${excerpt} »`).join(", ")}</li>)}
          {checklist.length === 0 && <li>Aucun prix, numéro, lien, date ni promesse repéré dans le texte.</li>}
          <li>Ce qui est dit de votre entreprise (activité, zone, offre, coordonnées) est exact.</li>
          <li>Les repères entre crochets, comme [prix] ou [date], sont complétés ou retirés.</li>
        </ul>
        <p className="notice small">Paul repère ces éléments pour vous aider, mais ne peut pas les vérifier : c&apos;est votre relecture qui les engage.</p>
        {dirty && <p className="warning">{MISSION_MESSAGES["M-60"]}</p>}
        <label className="check-field">
          <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
          <span>J&apos;ai relu le contenu et vérifié les informations qui engagent mon entreprise</span>
        </label>
        {detail.visual.composition && detail.visual.photo && (
          <label className="check-field">
            <input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />
            <span>{VISUAL_RIGHTS_LABEL}</span>
          </label>
        )}
        <p className="small muted">Aucun envoi ne sera effectué.</p>
        {failure("validate")}
      </Modal>

      <Modal
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        kicker="Votre décision"
        title="Je ne veux pas de cette version"
        cancelLabel="Garder cette version"
        actions={<button type="button" className="danger" disabled={busy || reason.trim().length < 3} onClick={() => void run("reject", { action: "reject", reason })}><Icon name="x" />Refuser V{current.number}</button>}
      >
        <p><strong>V{current.number} · {current.title}</strong></p>
        <label className="field">
          <span>Pourquoi ? (obligatoire)</span>
          <textarea rows={3} value={reason} maxLength={REJECTION_MAX} onChange={(event) => setReason(event.target.value)} placeholder="Ex. : trop commercial, on ne tutoie pas nos clients" />
        </label>
        <p className="small muted">Paul retiendra votre motif pour les prochaines versions de cette mission. La version reste dans l&apos;historique.</p>
        {failure("reject")}
      </Modal>
    </div>
  );
}
