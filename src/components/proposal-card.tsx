"use client";

import type { AgentProposal } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { ProductionPreview } from "@/components/production-preview";
import { AgentByline, Tag } from "@/components/mockup-ui";
import { productionNoun } from "@/lib/agent-voice";
import { ReadAloudButton } from "@/components/voice-controls";
import { spokenText } from "@/lib/voice";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { assessActionRisk } from "@/lib/delegation-risk";
import { getApprovalConsequence, getProposalGuidance } from "@/lib/channel-capabilities";
import { proposalStatusView, STATUS_TAG_COLORS } from "@/lib/proposal-status";
import { decideProposalReview, reviewProposal } from "@/lib/proposal-review";
import { proposalChannel } from "@/lib/proposal-channel";
import { openPaul } from "@/lib/paul-context";

const KIND_LABELS: Record<string, string> = {
  gbp_update: "Mise à jour de fiche établissement Google",
  review_reply: "Réponse à un avis",
  site_web_content: "Contenu du site web",
  social_post: "Publication sur les réseaux",
  prospecting_email: "Email de prospection",
  piste_croissance: "Piste de croissance",
  prospect: "Prospect à contacter",
  gmail_email: "Email Gmail manuel",
};

const REJECTION_REASONS = ["Le ton ne me correspond pas", "Informations inexactes", "Pas la bonne priorité", "Autre"];

export type ProposalDecision = {
  status: "brouillon" | "validee" | "modifiee" | "rejetee" | "a_relire";
  expectedVersion: number;
  content?: string;
  rejectionReason?: string;
};

const RISK_FACTOR_LABELS: Record<keyof ReturnType<typeof assessActionRisk>["factors"], string> = {
  publicExposure: "Exposition publique",
  externalCommunication: "Communication externe",
  thirdPartyData: "Données d'un tiers",
  spending: "Dépense engagée",
  irreversible: "Action difficile à annuler",
};

const TERMINAL_STATUSES = ["executee", "envoi_incertain", "publication_incertaine"];

type PlanContext = { title: string; rationale: string; priority: number | null; theme: string | null };

/** Panneau de production de la maquette : aperçu de la version, contexte de décision et actions distinctes (approuver, confirmer, diffuser). */
export function ProposalCard({
  proposal,
  onDecision,
  onExecute,
  onSetLeadSource,
  busy,
  riskSettings,
  facebookPageName = null,
  siteDestination,
  companyName,
  companyPhone,
  companyCertifications,
  leadSource,
  plan,
}: {
  proposal: AgentProposal;
  onDecision: (id: string, decision: ProposalDecision) => Promise<boolean>;
  onExecute?: (id: string, expectedVersion: number, confirmed: true, acknowledgedReviewIds: string[]) => void;
  onSetLeadSource?: (id: string, source: string) => Promise<boolean>;
  busy?: boolean;
  riskSettings?: Record<string, string>;
  facebookPageName?: string | null;
  siteDestination?: string | null;
  companyName: string;
  companyPhone?: string | null;
  companyCertifications?: string | null;
  leadSource?: string | null;
  plan?: PlanContext | null;
}) {
  const [modal, setModal] = useState<"edit" | "reject" | "confirm" | null>(null);
  const [editedContent, setEditedContent] = useState(proposal.content);
  const [rejectionChoice, setRejectionChoice] = useState(REJECTION_REASONS[0]);
  const [rejectionDetail, setRejectionDetail] = useState("");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState(leadSource ?? "");
  const [reviewAcknowledgement, setReviewAcknowledgement] = useState<{ version: number; ids: string[] }>({ version: proposal.version, ids: [] });
  const persona = PERSONAS[proposal.agent as Exclude<AgentKey, "co_ceo">];
  const channel = proposalChannel(proposal.kind);
  const guidance = getProposalGuidance(proposal.kind, facebookPageName);
  const statusView = proposalStatusView(proposal.status, proposal.kind, facebookPageName);
  const risk = assessActionRisk(proposal.kind, {}, riskSettings?.[proposal.kind]);
  const reviewPoints = reviewProposal({ kind: proposal.kind, content: proposal.content, companyPhone, companyCertifications, leadSource });
  const acknowledgedReviewIds = reviewAcknowledgement.version === proposal.version ? reviewAcknowledgement.ids : [];
  const review = decideProposalReview(reviewPoints, acknowledgedReviewIds);
  const reviewBlocked = review.blockers.length > 0 || review.missingAcknowledgements.length > 0;
  let displayContent = proposal.content;
  if (proposal.kind === "gmail_email") {
    try {
      const message: unknown = JSON.parse(proposal.content);
      if (message && typeof message === "object" && "to" in message && "text" in message && typeof message.to === "string" && typeof message.text === "string") {
        displayContent = `Destinataire : ${message.to}\n\n${message.text}`;
      }
    } catch {
      displayContent = proposal.content;
    }
  }
  const approved = ["validee", "modifiee"].includes(proposal.status);
  // Une approbation antérieure au versionnage ne désigne aucune version : elle doit être reconfirmée avant exécution.
  const approvalNeedsConfirmation = approved && proposal.approvedVersion !== proposal.version;
  const canEdit = proposal.status === "en_attente" || (approved && proposal.kind !== "prospect");
  const canPublish = approved && !approvalNeedsConfirmation && Boolean(onExecute) &&
    (proposal.kind === "site_web_content" || (proposal.kind === "social_post" && facebookPageName !== null));
  const terminal = TERMINAL_STATUSES.includes(proposal.status);
  const destination = proposal.kind === "site_web_content" ? siteDestination ?? "Site public de votre entreprise sur BienDecider" : guidance.destination;
  const decide = (decision: Omit<ProposalDecision, "expectedVersion">) =>
    onDecision(proposal.id, { ...decision, expectedVersion: proposal.version });

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopyNotice("Contenu copié. Publiez-le vous-même sur le canal de votre choix.");
    } catch {
      setCopyNotice("Copie impossible dans ce navigateur. Sélectionnez le contenu pour le copier.");
    }
  }

  // En cas d'échec, la fenêtre reste ouverte avec le texte saisi : rien n'est perdu ni annoncé à tort comme enregistré.
  async function saveDraft() {
    if (await decide({ status: "brouillon", content: editedContent.trim() })) setModal(null);
  }

  async function approveEditedContent(event: React.FormEvent) {
    event.preventDefault();
    if (await decide({ status: "modifiee", content: editedContent.trim() })) setModal(null);
  }

  async function rejectProposal(event: React.FormEvent) {
    event.preventDefault();
    const detail = rejectionDetail.trim();
    if (await decide({ status: "rejetee", rejectionReason: `${rejectionChoice}${detail ? ` : ${detail}` : ""}` })) {
      setModal(null);
      setRejectionDetail("");
    }
  }

  return (
    <article id={`proposal-${proposal.id}`} tabIndex={-1} aria-label={proposal.title}>
      <div className="production-head">
        <div>
          <div className="tags">
            <Tag color="blue">{plan?.theme ?? KIND_LABELS[proposal.kind] ?? "Autre proposition"}</Tag>
            <Tag color={STATUS_TAG_COLORS[statusView.tone]}>{statusView.label}</Tag>
          </div>
          <h2>{proposal.title}</h2>
          <p><AgentByline agent={proposal.agent} size={24}>vous propose {productionNoun(proposal.kind)}</AgentByline> <span className="version-tag">· version {proposal.version}</span></p>
        </div>
        <button type="button" className="icon-button" onClick={() => openPaul({ type: "proposal", id: proposal.id, title: proposal.title })} aria-label="Échanger avec Paul sur cette production" title="Échanger avec Paul"><Icon name="message-circle" /></button>
      </div>
      {proposal.status === "publication_incertaine" && <div role="status" className="warning">Facebook n’a pas confirmé cette publication. Vérifiez votre Page avant toute nouvelle tentative.</div>}
      {proposal.status === "envoi_incertain" && <div role="status" className="warning">Gmail n’a pas confirmé cet envoi. Vérifiez votre boîte d’envoi avant toute nouvelle tentative.</div>}
      {proposal.status === "rejetee" && (
        <div className="warning">
          Cette version est rejetée. Revoir la proposition avant de demander une nouvelle validation.
          {proposal.rejectionReason && <><br /><strong>Raison du rejet :</strong> <span className="whitespace-pre-wrap break-words">{proposal.rejectionReason}</span></>}
        </div>
      )}
      <div className="preview-layout">
        <div>
          <div className="preview-label"><span>{terminal ? "Contenu conservé" : "Aperçu de la version à diffuser"}</span><span>v{proposal.version}</span></div>
          <ProductionPreview kind={proposal.kind} title={proposal.title} content={proposal.content} version={proposal.version} companyName={companyName} siteDestination={siteDestination} />
          {proposal.kind === "site_web_content" && <small className="legend">L’approbation porte sur ce brief : BienDecider génère la page au moment de la mise en ligne. Vérifiez ensuite la page publique.</small>}
          {!modal && <ReadAloudButton text={spokenText(`${proposal.title}. ${displayContent}`)} label={`Écouter la production de ${persona?.name ?? "l'agent"}`} />}
        </div>
        <aside className="review-context">
          <details className="context-block why-block">
            <summary><h3>Pourquoi cette action</h3></summary>
            <p>{plan?.rationale ?? "Demande ponctuelle à l’équipe, hors plan d’action."}</p>
          </details>
          <div className="context-block">
            <h3>Destination</h3>
            <p>{destination}</p>
            <p>{guidance.nextStep}</p>
            {(channel === "Facebook" || channel === "Site") && (
              <div className="connection">
                <span>{channel === "Site" || facebookPageName ? <Tag color="green">Connecté</Tag> : <Tag color="orange">Non connecté</Tag>}</span>
                {channel === "Facebook" && !facebookPageName && <Link className="text-link" href="/connexions">Connecter</Link>}
              </div>
            )}
          </div>
          <div className="context-block">
            <h3>{terminal ? "Retour arrière" : "Avant votre accord"}</h3>
            {terminal ? (
              <p>{channel === "Gmail" ? "Un mail envoyé ne peut pas être rappelé. Un éventuel rectificatif demandera une nouvelle validation." : channel === "Site" ? "Une nouvelle version demandera une nouvelle approbation puis une nouvelle confirmation de mise en ligne." : "Le retrait se fait depuis votre Page Facebook. Les copies et partages ne sont pas effacés."}</p>
            ) : (
              <>
                {reviewPoints.length > 0 && (
                  <section aria-label="Vérifications du contenu">
                    <p><strong>À vérifier avant diffusion · version {proposal.version}</strong></p>
                    {reviewPoints.map((point) => (
                      <div key={point.id}>
                        <p><span aria-hidden="true">{point.blocking ? "BLOQUANT · " : "À vérifier · "}</span><strong>{point.title}</strong></p>
                        {point.evidence && <p>« {point.evidence} »</p>}
                        <p>{point.expectedAction}</p>
                        {point.id === "prospect_source_missing" && onSetLeadSource && (
                          <form
                            onSubmit={async (event) => {
                              event.preventDefault();
                              if (await onSetLeadSource(proposal.id, sourceDraft.trim())) setSourceDraft(sourceDraft.trim());
                            }}
                          >
                            <label className="field">URL de la source
                              <input type="url" required value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} />
                            </label>
                            <button type="submit" disabled={busy || !sourceDraft.trim()}>Enregistrer la source</button>
                          </form>
                        )}
                        {point.requiresAcknowledgement && (
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={acknowledgedReviewIds.includes(point.id)}
                              onChange={(event) => setReviewAcknowledgement({
                                version: proposal.version,
                                ids: event.target.checked ? [...acknowledgedReviewIds, point.id] : acknowledgedReviewIds.filter((id) => id !== point.id),
                              })}
                            />
                            <span>J’ai vérifié ce point pour cette version. Cette confirmation est humaine, pas une vérification indépendante.</span>
                          </label>
                        )}
                      </div>
                    ))}
                  </section>
                )}
                <small>{proposal.status === "en_attente" ? getApprovalConsequence(proposal.kind, facebookPageName) : approved ? "Version approuvée. La confirmation de diffusion reste requise." : "Approuver cette version ne publie rien."}</small>
              </>
            )}
          </div>
          <div className="context-block">
            <h3>Traçabilité</h3>
            <p>
              {plan?.priority ? `Action #${plan.priority}` : "Hors plan d’action"} · Version {proposal.version}
              {proposal.status === "en_attente" && proposal.draftSavedAt && <><br />Brouillon enregistré le {new Date(proposal.draftSavedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}, non approuvé</>}
              {approved && proposal.approvedVersion === proposal.version && <><br />Version approuvée</>}
            </p>
            <details>
              <summary><Tag color={risk.level === "faible" ? "green" : risk.level === "modere" ? "orange" : "red"}>{risk.label}</Tag> <span>Pourquoi ?</span></summary>
              <p>{risk.explanation}</p>
              <p>Ce niveau décrit l’exposition de l’action, pas l’exactitude des affirmations du contenu.</p>
              <ul>
                {(Object.entries(risk.factors) as [keyof typeof risk.factors, boolean][])
                  .filter(([, applies]) => applies)
                  .map(([factor]) => <li key={factor}>{RISK_FACTOR_LABELS[factor]}</li>)}
                {!Object.values(risk.factors).some(Boolean) && <li>Aucun facteur aggravant identifié</li>}
              </ul>
              <p>Dans ce prototype, toute action réelle reste soumise à votre validation.</p>
            </details>
          </div>
        </aside>
      </div>
      <div className="production-actions">
        <div>
          {canEdit && <button type="button" onClick={() => { setEditedContent(proposal.content); setModal("edit"); }} disabled={busy}><Icon name="pencil" /> Modifier</button>}
          {proposal.status === "en_attente" && <button type="button" className="quiet" onClick={() => setModal("reject")} disabled={busy}>Rejeter</button>}
          {proposal.status === "rejetee" && <button type="button" onClick={() => decide({ status: "a_relire" })} disabled={busy}>Rouvrir pour relecture</button>}
          {guidance.canCopy && <button type="button" onClick={() => void copyContent()} disabled={busy}>Copier le contenu</button>}
          {terminal && <Link className="text-link" href={`/dashboard?view=historique&proposal=${encodeURIComponent(proposal.id)}`}><Icon name="history" /> Historique</Link>}
        </div>
        {proposal.status === "en_attente" && <button type="button" className="primary" onClick={() => decide({ status: "validee" })} disabled={busy}><Icon name="check" /> Approuver cette version</button>}
        {approvalNeedsConfirmation && <button type="button" className="primary" onClick={() => decide({ status: "validee" })} disabled={busy}><Icon name="check" /> Confirmer l’approbation de cette version</button>}
        {canPublish && <button type="button" className="primary" onClick={() => setModal("confirm")} disabled={busy}>Préparer la publication <Icon name="arrow-right" /></button>}
      </div>
      {copyNotice && <p role="status" className="version-line">{copyNotice}</p>}
      {(proposal.status === "executee" || proposal.status === "rejetee") && <div className="version-line">
        {proposal.status === "executee" ? "Version conservée dans l’historique." : "Rien n’a été publié ni envoyé : vous pouvez revenir sur ce rejet."}
      </div>}

      <Modal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        kicker={`MODIFICATION · VERSION ${proposal.version}`}
        title="Retravailler cette production"
        cancelLabel="Annuler la modification"
        actions={<>
          <button type="button" onClick={saveDraft} disabled={busy || !editedContent.trim()}>Enregistrer le brouillon</button>
          <button type="submit" form={`edit-form-${proposal.id}`} className="primary" disabled={busy || !editedContent.trim()}>Approuver cette version</button>
        </>}
      >
        <form id={`edit-form-${proposal.id}`} onSubmit={approveEditedContent}>
          <label className="field">Contenu
            <textarea aria-label="Modifier le contenu" value={editedContent} onChange={(event) => setEditedContent(event.target.value)} rows={9} maxLength={5000} required />
          </label>
        </form>
        {approved && <div className="notice">Enregistrer une modification retire l’approbation actuelle : la nouvelle version sera à relire.</div>}
      </Modal>

      <Modal
        open={modal === "reject"}
        onClose={() => setModal(null)}
        kicker="RETOUR À L’ÉQUIPE"
        title="Pourquoi rejeter cette version ?"
        cancelLabel="Annuler le rejet"
        actions={<button type="submit" form={`reject-form-${proposal.id}`} className="danger" disabled={busy}>Rejeter cette version</button>}
      >
        <form id={`reject-form-${proposal.id}`} onSubmit={rejectProposal}>
          <label className="field">Motif
            <select value={rejectionChoice} onChange={(event) => setRejectionChoice(event.target.value)} disabled={busy}>
              {REJECTION_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          <label className="field">Précision (facultative)
            <textarea value={rejectionDetail} onChange={(event) => setRejectionDetail(event.target.value)} rows={3} maxLength={900} placeholder="Ce qu’il faut changer" disabled={busy} />
          </label>
        </form>
      </Modal>

      <Modal
        open={modal === "confirm"}
        onClose={() => setModal(null)}
        kicker="DERNIÈRE CONFIRMATION"
        title="Publier cette version ?"
        actions={<button type="button" className="primary" disabled={busy || reviewBlocked} onClick={() => { setModal(null); onExecute?.(proposal.id, proposal.version, true, acknowledgedReviewIds); }}>Confirmer la publication</button>}
      >
        <dl className="modal-details">
          <dt>Version</dt><dd>{proposal.version} · approuvée</dd>
          <dt>Destination</dt><dd>{channel === "Facebook" && facebookPageName ? `Page « ${facebookPageName} » · Public` : destination}</dd>
          <dt>Contenu</dt><dd>Exactement la version prévisualisée</dd>
        </dl>
        <p>{channel === "Site" ? "Le contenu deviendra accessible à vos clients. Cette confirmation est distincte de l’approbation du brief ; la page finale est générée lors de la publication." : "Le contenu deviendra accessible à votre audience."}</p>
        {reviewBlocked && <div className="warning">Des vérifications restent à confirmer pour cette version avant la diffusion.</div>}
      </Modal>
    </article>
  );
}
