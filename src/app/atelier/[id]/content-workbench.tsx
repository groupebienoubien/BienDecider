"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { MISSION_MESSAGES } from "@/lib/missions/messages";
import { BODY_MAX, REJECTION_MAX, TITLE_MAX, VARIANTS, variantLabel, type ChecklistItem, type VariantKind } from "@/lib/contents/rules";
import type { AtelierItem, ContentDetail, VersionView } from "@/lib/contents/view";

const AUTHORS: Record<VersionView["author"], string> = { owner: "vous", paul: "Paul", system: "système" };

async function send(id: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch(`/api/contents/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.error ?? "Action impossible pour le moment.";
}

const formatDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

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
            <dt>À</dt><dd>{detail.mission.scopeSummary === "À préciser" ? "Aucun destinataire dans le périmètre" : `${detail.mission.scopeSummary} · envois séparés`}</dd>
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
export function ContentWorkbench({ detail, viewing, items, checklist, credits }: { detail: ContentDetail; viewing: number; items: AtelierItem[]; checklist: ChecklistItem[]; credits: number }) {
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
  const [dialog, setDialog] = useState<"validate" | "reject" | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [variant, setVariant] = useState<VariantKind>("shorter");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<{ area: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const busy = sending !== null || refreshing;

  const dirty = title !== current.title || body !== current.body;
  useEffect(() => {
    if (edit === null) return;
    if (dirty) window.sessionStorage.setItem(draftKey, JSON.stringify(edit));
    else window.sessionStorage.removeItem(draftKey);
  }, [dirty, draftKey, edit]);

  const editRefusal = detail.editRefusal ? MISSION_MESSAGES[detail.editRefusal as keyof typeof MISSION_MESSAGES].replace("{n}", String(current.number)) : null;
  const canEdit = !editRefusal;

  async function run(area: string, payload: Record<string, unknown>, after?: () => void) {
    setSending(area);
    setError(null);
    const refused = await send(detail.id, { ...payload, number: current.number });
    setSending(null);
    if (refused) {
      setError({ area, text: refused });
      return;
    }
    after?.();
    // Le dialogue se ferme avec l'état à jour : un geste suivant part toujours de la bonne version.
    startRefresh(() => {
      setDialog(null);
      if (archive) router.replace(`/atelier/${detail.id}`);
      router.refresh();
    });
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
          <span className={`tag ${validated ? "green" : archive ? "gray" : "orange"}`}>{archive ? version.state : detail.statusLabel}</span>
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

          <div className="atelier-decision" aria-labelledby="decision-title">
            <div>
              <h2 id="decision-title">
                {archive
                  ? `V${version.number} · archive en lecture seule`
                  : version.rejectionReason ? `V${version.number} refusée`
                  : validated ? `V${version.number} validée`
                  : "Votre accord est nécessaire"}
              </h2>
              <p className="small muted">
                {archive
                  ? "Y revenir crée une nouvelle version, à relire et valider."
                  : version.rejectionReason ? `Votre motif : « ${version.rejectionReason} ». Paul en tiendra compte pour les prochaines versions de cette mission.`
                  : validated ? "Aucun envoi effectué. Validation du contenu et diffusion sont deux décisions distinctes : la diffusion sera proposée ici."
                  : detail.canValidate ? "Valider n'envoie rien : la diffusion reste une décision distincte."
                  : MISSION_MESSAGES["M-47"]}
              </p>
            </div>
            <div className="heading-actions">
              {archive && <button type="button" disabled={busy || !canEdit} onClick={() => void run("decision", { action: "restore", from: version.number }, clearDraft)}><Icon name="undo-2" />Revenir à cette version</button>}
              {!archive && !detail.readOnly && !validated && (
                <button type="button" className="primary" disabled={busy || !detail.canValidate} onClick={() => { setError(null); setReviewed(false); setDialog("validate"); }}><Icon name="check" />Valider cette version</button>
              )}
              {!archive && !detail.readOnly && !version.rejectionReason && (
                <button type="button" disabled={busy} onClick={() => { setError(null); setReason(""); setDialog("reject"); }}><Icon name="x" />Je ne veux pas de cette version</button>
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
              <dd>{detail.mission.channelLabel}{detail.mission.channel && detail.mission.channel !== "site" && (detail.channelConnected ? <span className="tag green">Connecté</span> : <> · <Link href="/connexions">Connecter</Link></>)}</dd>
              <dt>Délégation</dt><dd>Vous validez chaque contenu ; rien n&apos;est diffusé sans votre confirmation.</dd>
              {detail.format === "email" && <><dt>Destinataires</dt><dd>{detail.mission.scopeSummary}</dd></>}
            </dl>
          </section>
        </aside>
      </div>

      <Modal
        open={dialog === "validate"}
        onClose={() => setDialog(null)}
        kicker="Votre accord"
        title={`Valider la version V${current.number}`}
        actions={<button type="button" className="primary" disabled={busy || !reviewed || dirty} onClick={() => void run("validate", { action: "validate", reviewed })}><Icon name="check" />Valider sans diffuser</button>}
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
