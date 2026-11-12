"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { NEW_IDEA_CONTEXT, openPaul } from "@/lib/paul-context";
import type { MissionActionData } from "@/lib/missions/view";

type Dialog = "launch" | "pause" | "dismiss" | "outcome" | null;

/**
 * Ouvre Paul dans la conversation de la mission, dans une nouvelle conversation « idée » (`idea`),
 * ou dans celle de la page.
 */
export function PaulButton({ label, mission, idea = false, className }: { label: string; mission?: { id: string; title: string }; idea?: boolean; className?: string }) {
  const open = () => {
    if (mission) openPaul({ type: "mission", id: mission.id, title: mission.title }, `mission:${mission.id}`);
    else openPaul(undefined, idea ? NEW_IDEA_CONTEXT : undefined);
  };
  return (
    <button type="button" className={className} onClick={open}>
      <Icon name="message-circle" />{label}
    </button>
  );
}

async function transition(id: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch(`/api/missions/${id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.error ?? "Action impossible pour le moment.";
}

/**
 * Actions d'une mission selon son statut (§2.2). Les règles sont celles du serveur : l'interface ne montre
 * que les gestes possibles et affiche son refus tel quel. « detail » : page de la mission ; « row » : listes.
 */
export function MissionActions({ mission, credits, launchCost, variant }: { mission: MissionActionData; credits: number; launchCost: number; variant: "detail" | "row" }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [outcome, setOutcome] = useState(mission.outcome);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;
  const [error, setError] = useState("");

  // Carte « Lancer » de Paul acceptée : elle mène ici avec ?cadre=1 et le dialogue de cadre s'ouvre ; rien n'est
  // débité avant « Confirmer le lancement ». État ajusté pendant le rendu, pas dans un effet.
  const detail = variant === "detail";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cadreInUrl = searchParams.get("cadre") === "1";
  const frameRequested = cadreInUrl && detail && (mission.status === "proposed" || mission.status === "paused");
  const [frameSeen, setFrameSeen] = useState(false);
  if (frameRequested !== frameSeen) {
    setFrameSeen(frameRequested);
    if (frameRequested) {
      setError("");
      setOutcome(mission.outcome);
      setDialog("launch");
    }
  }

  const cost = mission.launched ? 0 : launchCost;
  const short = credits < cost;

  /** Ferme le dialogue et retire ?cadre=1 : un rechargement ou un retour ne le rouvre pas, une nouvelle carte « Lancer » si. */
  function closeDialog() {
    setDialog(null);
    if (!cadreInUrl) return;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("cadre");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
  }

  function open(next: Dialog) {
    setError("");
    setOutcome(mission.outcome);
    setDialog(next);
  }

  async function run(body: Record<string, unknown>) {
    setSending(true);
    setError("");
    const refused = await transition(mission.id, { ...body, expectedVersion: mission.version });
    setSending(false);
    if (refused) {
      setError(refused);
      return;
    }
    // Le dialogue se ferme avec l'affichage de l'état à jour : un geste suivant part toujours de la bonne version.
    startRefresh(() => {
      closeDialog();
      router.refresh();
    });
  }

  const canEdit = mission.status !== "stopped";
  const canDismiss = mission.status === "proposed" || mission.status === "paused";

  return (
    <div className="heading-actions mission-actions">
      {!detail && (
        <Link className="btn" href={`/missions/${mission.id}`}>{mission.status === "proposed" ? "Examiner et lancer" : "Voir la mission"}<Icon name="arrow-right" /></Link>
      )}
      {detail && mission.status === "proposed" && <button type="button" className="primary" onClick={() => open("launch")}><Icon name="play" />Confirmer et lancer</button>}
      {detail && mission.status === "paused" && <button type="button" className="primary" onClick={() => open("launch")}><Icon name="play" />Reprendre la mission</button>}
      {detail && mission.status === "active" && <button type="button" onClick={() => open("pause")}><Icon name="pause" />Mettre en pause</button>}
      <PaulButton label={detail ? "Ajuster avec Paul" : "Affiner avec Paul"} mission={mission} />
      {canEdit && <button type="button" onClick={() => open("outcome")}><Icon name="pencil" />Modifier l&apos;objectif</button>}
      {canDismiss && <button type="button" onClick={() => open("dismiss")}><Icon name="trash-2" />{detail ? "Écarter du plan" : "Écarter"}</button>}
      {mission.status === "dismissed" && <button type="button" disabled={busy} onClick={() => void run({ action: "restore" })}><Icon name="undo-2" />Remettre au plan</button>}
      {!dialog && error && <p role="alert" className="warning">{error}</p>}

      <Modal
        open={dialog === "launch"}
        onClose={closeDialog}
        kicker="Votre accord"
        title="Confirmer le cadre de la mission"
        actions={<button type="button" className="primary" disabled={busy || short} onClick={() => void run({ action: mission.launched ? "resume" : "launch" })}><Icon name="play" />{mission.launched ? "Reprendre la mission" : "Confirmer le lancement"}</button>}
      >
        <h3>{mission.title}</h3>
        <dl className="modal-details">
          <dt>Résultat recherché</dt><dd>{mission.outcome}</dd>
          <dt>Canal</dt><dd>{mission.channelLabel}</dd>
          <dt>Périmètre</dt><dd>{mission.scopeSummary}</dd>
          <dt>Coût en crédits</dt><dd>{mission.launched ? "Reprise sans frais" : `${cost} crédits · solde ${credits}`}</dd>
          <dt>Dépenses externes</dt><dd>0 € engagé</dd>
          <dt>Règle d&apos;arrêt</dt><dd>{mission.stopRuleDays ? `${mission.stopRuleDays} jours` : "—"}</dd>
          {mission.decisionPlan && <>
            <dt>Pourquoi cette priorité</dt><dd>{mission.decisionPlan.selectionReason}</dd>
            <dt>Indicateur</dt><dd>{mission.decisionPlan.indicator}</dd>
            <dt>Saisie du résultat</dt><dd>{mission.decisionPlan.collectionMethod}</dd>
            <dt>Effort</dt><dd>{mission.decisionPlan.effort}</dd>
            <dt>Prérequis</dt><dd>{mission.decisionPlan.prerequisites}</dd>
            <dt>Votre action</dt><dd>{mission.decisionPlan.ownerAction}</dd>
          </>}
        </dl>
        {short && <p className="warning">Crédits insuffisants : il en faut {cost}, il vous en reste {credits}. <a href="mailto:contact@biendecider.com">Écrivez-nous</a></p>}
        <p className="notice">Paul coordonne la préparation. Lancer n&apos;envoie et ne publie rien : chaque envoi ou publication reste soumis à votre confirmation.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>

      <Modal
        open={dialog === "pause"}
        onClose={closeDialog}
        kicker="Votre accord"
        title="Mettre cette mission en pause ?"
        cancelLabel="Garder en cours"
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void run({ action: "pause" })}><Icon name="pause" />Confirmer la pause</button>}
      >
        <p><strong>{mission.title}</strong></p>
        <p>La préparation s&apos;arrête et les programmations de cette mission sont annulées. Les diffusions déjà faites sont conservées. Vous pourrez la reprendre sans frais.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>

      <Modal
        open={dialog === "dismiss"}
        onClose={closeDialog}
        kicker="Votre plan"
        title="Écarter cette mission du plan ?"
        cancelLabel="Garder au plan"
        actions={<button type="button" className="danger" disabled={busy} onClick={() => void run({ action: "dismiss" })}><Icon name="trash-2" />Écarter</button>}
      >
        <p><strong>{mission.title}</strong></p>
        <p>Rien n&apos;est effacé : elle reste sous « Écartées » et vous pourrez la remettre au plan.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>

      <Modal
        open={dialog === "outcome"}
        onClose={closeDialog}
        kicker="Votre mission"
        title="Modifier l'objectif de la mission"
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void run({ action: "set_outcome", outcome })}>Enregistrer l&apos;objectif</button>}
      >
        <h3>{mission.title}</h3>
        <label className="field">
          Résultat recherché
          <textarea rows={3} maxLength={120} value={outcome} onChange={(event) => setOutcome(event.target.value)} />
        </label>
        <small>5 à 120 caractères. Paul s&apos;appuiera sur cette phrase pour lire le bilan.</small>
        {mission.originalOutcome !== outcome && (
          <p className="small">Objectif proposé à l&apos;origine : {mission.originalOutcome} <button type="button" onClick={() => setOutcome(mission.originalOutcome)}><Icon name="undo-2" />Y revenir</button></p>
        )}
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>
    </div>
  );
}
