"use client";

import type { AgentProposal } from "@prisma/client";
import { useState } from "react";
import { AskPaulButton } from "@/components/ask-paul-button";
import { ReadAloudButton } from "@/components/voice-controls";
import { spokenText } from "@/lib/voice";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { assessActionRisk } from "@/lib/delegation-risk";
import { getApprovalConsequence, getProposalGuidance } from "@/lib/channel-capabilities";
import { proposalStatusView, STATUS_TONE_CLASSES } from "@/lib/proposal-status";
import { decideProposalReview, reviewProposal } from "@/lib/proposal-review";

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

export function ProposalCard({
  proposal,
  onDecision,
  onExecute,
  onSetLeadSource,
  busy,
  showAgent = false,
  riskSettings,
  facebookPageName = null,
  siteDestination,
  companyPhone,
  companyCertifications,
  leadSource,
  workspace = false,
}: {
  proposal: AgentProposal;
  onDecision: (id: string, decision: ProposalDecision) => Promise<boolean>;
  onExecute?: (id: string, expectedVersion: number, confirmed: true, acknowledgedReviewIds: string[]) => void;
  onSetLeadSource?: (id: string, source: string) => Promise<boolean>;
  busy?: boolean;
  showAgent?: boolean;
  riskSettings?: Record<string, string>;
  facebookPageName?: string | null;
  siteDestination?: string | null;
  companyPhone?: string | null;
  companyCertifications?: string | null;
  leadSource?: string | null;
  workspace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(proposal.content);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmingPublication, setConfirmingPublication] = useState(false);
  const [confirmingSitePublication, setConfirmingSitePublication] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState(leadSource ?? "");
  const [reviewAcknowledgement, setReviewAcknowledgement] = useState<{ version: number; ids: string[] }>({ version: proposal.version, ids: [] });
  const persona = PERSONAS[proposal.agent as Exclude<AgentKey, "co_ceo">];
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
  const canPublishSite =
    proposal.kind === "site_web_content" &&
    approved &&
    !approvalNeedsConfirmation &&
    onExecute;
  const canPublishFacebook =
    proposal.kind === "social_post" &&
    approved &&
    !approvalNeedsConfirmation &&
    facebookPageName !== null &&
    onExecute;
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

  // En cas d'échec, l'éditeur reste ouvert avec le texte saisi : rien n'est perdu ni annoncé à tort comme enregistré.
  async function saveDraft() {
    if (await decide({ status: "brouillon", content: editedContent.trim() })) setEditing(false);
  }

  async function approveEditedContent(event: React.FormEvent) {
    event.preventDefault();
    if (await decide({ status: "modifiee", content: editedContent.trim() })) setEditing(false);
  }

  async function rejectProposal(event: React.FormEvent) {
    event.preventDefault();
    if (await decide({ status: "rejetee", rejectionReason: rejectionReason.trim() })) {
      setRejecting(false);
      setRejectionReason("");
    }
  }

  return (
    <article id={`proposal-${proposal.id}`} tabIndex={-1} className={`scroll-mt-24 rounded-lg border border-slate-200 bg-white p-4 ${workspace ? "production-card-workspace" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600">
          {showAgent && persona ? `${persona.name} · ` : ""}
          {KIND_LABELS[proposal.kind] ?? "Autre proposition"}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${STATUS_TONE_CLASSES[statusView.tone]}`}>
          <span aria-hidden="true">{statusView.icon}</span>
          <span>{statusView.label}</span>
        </span>
      </div>
      <h3 className="mt-1 font-medium">{proposal.title}</h3>
      <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        <p><span className="font-medium">Destination :</span> {proposal.kind === "site_web_content" ? siteDestination ?? "Site public de votre entreprise sur BienDecider" : guidance.destination}</p>
        <p className="mt-1">{guidance.nextStep}</p>
        {proposal.kind === "site_web_content" && <p className="mt-1 text-xs text-amber-900">L&apos;approbation porte sur ce brief ; BienDecider générera le HTML au moment de la mise en ligne. Vérifiez ensuite la page publique.</p>}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Version {proposal.version}
        {proposal.status === "en_attente" && proposal.draftSavedAt && (
          <> · Brouillon enregistré le {new Date(proposal.draftSavedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}, non approuvé</>
        )}
        {approved && proposal.approvedVersion === proposal.version && " · version approuvée"}
      </p>
      <details className="mt-2">
        <summary className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
          <span className={`rounded px-2 py-0.5 font-medium ${risk.level === "faible" ? "bg-emerald-50 text-emerald-800" : risk.level === "modere" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800"}`}>{risk.label}</span>
          <span>Pourquoi ?</span>
        </summary>
        <p className="mt-1 max-w-prose text-xs text-slate-600">{risk.explanation}</p>
        <p className="mt-1 max-w-prose text-xs text-slate-600">Ce niveau décrit l&apos;exposition de l&apos;action, pas l&apos;exactitude des affirmations du contenu.</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {(Object.entries(risk.factors) as [keyof typeof risk.factors, boolean][])
            .filter(([, applies]) => applies)
            .map(([factor]) => <li key={factor}>{RISK_FACTOR_LABELS[factor]}</li>)}
          {!Object.values(risk.factors).some(Boolean) && <li>Aucun facteur aggravant identifié</li>}
        </ul>
        <p className="mt-1 text-xs font-medium text-slate-700">Dans ce prototype, toute action réelle reste soumise à votre validation.</p>
      </details>
      {reviewPoints.length > 0 && (
        <section aria-label="Vérifications du contenu" className="mt-3 border-l-2 border-amber-500 pl-3">
          <h4 className="text-sm font-medium text-slate-900">À vérifier avant diffusion · version {proposal.version}</h4>
          <ul className="mt-2 space-y-2">
            {reviewPoints.map((point) => (
              <li key={point.id} className="text-sm text-slate-800">
                <p><span aria-hidden="true">{point.blocking ? "BLOQUANT · " : "À vérifier · "}</span><span className="font-medium">{point.title}</span></p>
                {point.evidence && <blockquote className="mt-1 border-l border-slate-300 pl-2 text-xs text-slate-600">« {point.evidence} »</blockquote>}
                <p className="mt-1 text-xs text-slate-700">{point.expectedAction}</p>
                {point.id === "prospect_source_missing" && onSetLeadSource && (
                  <form
                    className="mt-2 flex flex-wrap items-end gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (await onSetLeadSource(proposal.id, sourceDraft.trim())) setSourceDraft(sourceDraft.trim());
                    }}
                  >
                    <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
                      URL de la source
                      <input type="url" required value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} className="mt-1 min-h-10 w-full rounded border border-slate-300 px-2 text-sm" />
                    </label>
                    <button type="submit" disabled={busy || !sourceDraft.trim()} className="min-h-10 rounded bg-slate-800 px-3 text-sm text-white disabled:opacity-50">Enregistrer la source</button>
                  </form>
                )}
                {point.requiresAcknowledgement && (
                  <label className="mt-1 flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={acknowledgedReviewIds.includes(point.id)}
                      onChange={(event) => setReviewAcknowledgement({
                        version: proposal.version,
                        ids: event.target.checked ? [...acknowledgedReviewIds, point.id] : acknowledgedReviewIds.filter((id) => id !== point.id),
                      })}
                    />
                    <span>J&apos;ai vérifié ce point pour cette version. Cette confirmation est humaine, pas une vérification indépendante.</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing ? (
        <form onSubmit={approveEditedContent} className="production-preview mt-3 space-y-2">
          <label htmlFor={`proposal-content-${proposal.id}`} className="text-xs font-medium text-slate-700">Modifier le contenu</label>
          <textarea
            id={`proposal-content-${proposal.id}`}
            aria-label="Modifier le contenu"
            value={editedContent}
            onChange={(event) => setEditedContent(event.target.value)}
            rows={6}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {approved && (
            <p className="text-xs text-amber-800">Enregistrer une modification retire l&apos;approbation actuelle : la nouvelle version sera à relire.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveDraft} disabled={busy || !editedContent.trim()} className="min-h-11 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 disabled:opacity-50">
              Enregistrer le brouillon
            </button>
            <button type="submit" disabled={busy || !editedContent.trim()} className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
              Approuver cette version
            </button>
            <button type="button" onClick={() => { setEditedContent(proposal.content); setEditing(false); }} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">
              Annuler la modification
            </button>
          </div>
        </form>
      ) : (
        <details className="production-preview mt-1" open={workspace || proposal.status === "en_attente"}>
          <summary className="cursor-pointer text-xs text-indigo-600">Voir le contenu</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{displayContent}</p>
        </details>
      )}
      <AskPaulButton element={{ type: "proposal", id: proposal.id, title: proposal.title }} />
      {!editing && <ReadAloudButton text={spokenText(`${proposal.title}. ${displayContent}`)} label={`Écouter la production de ${persona?.name ?? "l'agent"}`} />}
      {proposal.status === "rejetee" && proposal.rejectionReason && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600"><span className="font-medium">Raison du rejet : </span>{proposal.rejectionReason}</p>
      )}
      {proposal.status === "rejetee" && (
        <div className="mt-3">
          <button type="button" onClick={() => decide({ status: "a_relire" })} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 disabled:opacity-50">
            Rouvrir pour relecture
          </button>
          <p className="mt-1 text-xs text-slate-600">Rien n&apos;a été publié ni envoyé : vous pouvez revenir sur ce rejet.</p>
        </div>
      )}
      {proposal.status === "en_attente" && rejecting && (
        <form onSubmit={rejectProposal} className="mt-3 space-y-2">
          <label htmlFor={`rejection-reason-${proposal.id}`} className="text-xs font-medium text-slate-700">Raison du rejet (facultative)</label>
          <textarea id={`rejection-reason-${proposal.id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={3} disabled={busy} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmer le rejet</button>
            <button type="button" onClick={() => { setRejecting(false); setRejectionReason(""); }} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Annuler le rejet</button>
          </div>
        </form>
      )}
      {proposal.status === "en_attente" && !editing && !rejecting && (
        <p className="mt-3 text-xs text-slate-700">{getApprovalConsequence(proposal.kind, facebookPageName)}</p>
      )}
      {canEdit && !rejecting && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!editing && (
            <button
              type="button"
              onClick={() => { setEditedContent(proposal.content); setEditing(true); }}
              disabled={busy}
              className="min-h-11 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 disabled:opacity-50"
            >
              Modifier
            </button>
          )}
          {!editing && approvalNeedsConfirmation && (
            <button
              onClick={() => decide({ status: "validee" })}
              disabled={busy}
              className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Confirmer l&apos;approbation de cette version
            </button>
          )}
          {!editing && proposal.status === "en_attente" && (
            <>
              <button
                onClick={() => decide({ status: "validee" })}
                disabled={busy}
                className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Valider
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Rejeter
              </button>
            </>
          )}
        </div>
      )}
      {proposal.status === "publication_incertaine" && (
        <p role="status" className="mt-3 text-sm text-amber-900">
          Facebook n&apos;a pas confirmé cette publication. Vérifiez votre Page avant toute nouvelle tentative.
        </p>
      )}
      {guidance.canCopy && <div className="mt-3">
        <button type="button" onClick={() => void copyContent()} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Copier le contenu</button>
        {copyNotice && <p role="status" className="mt-2 text-xs text-slate-600">{copyNotice}</p>}
      </div>}
      {canPublishFacebook && !confirmingPublication && (
        <button
          onClick={() => setConfirmingPublication(true)}
          disabled={busy}
          className="mt-3 min-h-11 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Publier sur Facebook
        </button>
      )}
      {canPublishFacebook && confirmingPublication && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm text-slate-800">
            La version {proposal.version} sera publiée maintenant sur la Page Facebook « {facebookPageName} », visible par le public.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => { setConfirmingPublication(false); onExecute(proposal.id, proposal.version, true, acknowledgedReviewIds); }}
              disabled={busy || reviewBlocked}
              className="min-h-11 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Confirmer la publication
            </button>
            <button
              onClick={() => setConfirmingPublication(false)}
              disabled={busy}
              className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {canPublishSite && !confirmingSitePublication && (
        <button type="button" onClick={() => setConfirmingSitePublication(true)} disabled={busy} className="mt-3 min-h-11 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          Publier le site
        </button>
      )}
      {canPublishSite && confirmingSitePublication && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm text-slate-800">Confirmer la mise en ligne sur {siteDestination ?? "le site public de votre entreprise sur BienDecider"} ? La page deviendra visible par vos clients.</p>
          <p className="mt-2 text-xs text-slate-600">Cette confirmation est distincte de l&apos;approbation du brief. Le contenu final est généré lors de la publication.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setConfirmingSitePublication(false); onExecute(proposal.id, proposal.version, true, acknowledgedReviewIds); }} disabled={busy || reviewBlocked} className="min-h-11 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmer la mise en ligne</button>
            <button type="button" onClick={() => setConfirmingSitePublication(false)} disabled={busy} className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Annuler</button>
          </div>
        </div>
      )}
    </article>
  );
}
