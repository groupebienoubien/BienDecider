"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { PaulButton } from "@/components/mission-actions";
import { MISSION_MESSAGES } from "@/lib/missions/messages";
import { REPORT_NOTE_MAX } from "@/lib/missions/report";

export type ReportChoice = {
  id: string;
  title: string;
  report: { qualifiedLeads: number; meetings: number; signedRevenue: number | null; note: string | null; upToDate: boolean } | null;
};

async function post(path: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return null;
  return (await response.json().catch(() => null))?.error ?? "Action impossible pour le moment.";
}

const asText = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

/** « Renseigner mon bilan » (§7.1) : changer de mission recharge ses chiffres ; le serveur applique les règles et l'affiche tel quel. */
export function ReportForm({ missions, selectedId }: { missions: ReportChoice[]; selectedId: string }) {
  const router = useRouter();
  const mission = missions.find((item) => item.id === selectedId) ?? missions[0];
  const [leads, setLeads] = useState(asText(mission.report?.qualifiedLeads));
  const [meetings, setMeetings] = useState(asText(mission.report?.meetings));
  const [revenue, setRevenue] = useState(asText(mission.report?.signedRevenue));
  const [note, setNote] = useState(mission.report?.note ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const tooManyMeetings = leads !== "" && meetings !== "" && Number(meetings) > Number(leads);

  async function submit() {
    setSending(true);
    setError("");
    setSaved("");
    const refused = await post(`/api/missions/${mission.id}/report`, { qualifiedLeads: leads, meetings, signedRevenue: revenue, note });
    setSending(false);
    if (refused) setError(refused);
    else startRefresh(() => {
      setSaved("Bilan enregistré. Attribution déclarative, non vérifiée.");
      router.refresh();
    });
  }

  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="field">
        Mission
        <select value={mission.id} onChange={(event) => router.push(`/resultats?mission=${event.target.value}#bilan`, { scroll: false })}>
          {missions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {mission.report && !mission.report.upToDate && <p className="notice small">Une nouvelle diffusion a eu lieu depuis ce bilan : il est à mettre à jour.</p>}
      <div className="report-grid">
        <label className="field">Demandes qualifiées<input inputMode="numeric" pattern="[0-9]*" required value={leads} onChange={(event) => setLeads(event.target.value)} /></label>
        <label className="field">Rendez-vous<input inputMode="numeric" pattern="[0-9]*" required value={meetings} onChange={(event) => setMeetings(event.target.value)} /></label>
        <label className="field">CA signé en € (facultatif)<input inputMode="numeric" pattern="[0-9]*" value={revenue} onChange={(event) => setRevenue(event.target.value)} /></label>
      </div>
      {tooManyMeetings && <p role="alert" className="warning small">{MISSION_MESSAGES["M-33"]}</p>}
      <label className="field">
        Origine des demandes et contexte
        <textarea rows={3} maxLength={REPORT_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <small>Laissez le CA vide s&apos;il n&apos;est pas connu : vide n&apos;est pas zéro. Vos chiffres sont déclaratifs ; BienDecider ne les vérifie pas.</small>
      <div className="heading-actions"><button type="submit" className="primary" disabled={sending || refreshing || tooManyMeetings}>Enregistrer le bilan</button></div>
      {saved && <p role="status" className="notice">{saved}</p>}
      {error && <p role="alert" className="warning">{error}</p>}
    </form>
  );
}

export type DecisionMission = {
  id: string;
  title: string;
  outcome: string;
  version: number;
  stopRuleDays: number | null;
  stopRuleDue: string | null;
  contentId: string | null;
  report: { qualifiedLeads: number; meetings: number; signedRevenue: number | null; upToDate: boolean } | null;
};

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** « Décider la suite » (§7.2) : poursuivre (bilan à jour), adapter avec Paul (aucune écriture) ou arrêter. */
export function DecisionButton({ mission }: { mission: DecisionMission }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;
  const canContinue = mission.report?.upToDate === true;

  async function decide(choice: "continue" | "stop") {
    setSending(true);
    setError("");
    const refused = await post(`/api/missions/${mission.id}/decision`, { choice, expectedVersion: mission.version });
    setSending(false);
    if (refused) {
      setError(refused);
      return;
    }
    startRefresh(() => {
      setOpen(false);
      if (choice === "continue" && mission.contentId) router.push(`/atelier/${mission.contentId}`);
      else router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="small" onClick={() => { setError(""); setOpen(true); }}>Décider la suite</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        kicker="Votre décision"
        title="Décider la suite de la mission"
        actions={<>
          <button type="button" className="primary" disabled={busy || !canContinue} onClick={() => void decide("continue")}><Icon name="play" />Poursuivre</button>
          <PaulButton label="Adapter avec Paul" mission={{ id: mission.id, title: mission.title }} />
          <button type="button" className="danger" disabled={busy} onClick={() => void decide("stop")}><Icon name="square" />Arrêter la mission</button>
        </>}
      >
        <h3>{mission.title}</h3>
        <dl className="modal-details">
          <dt>Résultat recherché</dt><dd>{mission.outcome}</dd>
          <dt>Bilan déclaré</dt><dd>{mission.report ? `${mission.report.qualifiedLeads} demande(s) qualifiée(s), ${mission.report.meetings} rendez-vous${mission.report.signedRevenue === null ? "" : `, ${mission.report.signedRevenue.toLocaleString("fr-FR")} € signés`}${mission.report.upToDate ? "" : " · à mettre à jour"}` : "—"}</dd>
          <dt>Règle d&apos;arrêt</dt><dd>{mission.stopRuleDays ? `${mission.stopRuleDays} jours${mission.stopRuleDue ? `, échéance le ${DAY.format(new Date(mission.stopRuleDue))}` : ""}` : "—"}</dd>
        </dl>
        {!canContinue && <p className="notice small">Sans bilan, Paul ne peut pas comparer au résultat recherché : « Poursuivre » reste indisponible. <Link href={`/resultats?mission=${mission.id}#bilan`} onClick={() => setOpen(false)}>Renseigner le bilan</Link></p>}
        <p className="small muted">Poursuivre garde le cadre et ouvre l&apos;atelier pour la série suivante. Arrêter clôt la mission et annule ses programmations ; elle reste dans l&apos;historique.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>
    </>
  );
}
