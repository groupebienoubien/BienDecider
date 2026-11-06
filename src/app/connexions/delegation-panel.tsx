"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { DELEGATION_DETAILS, DELEGATION_LABELS, DELEGATION_LEVELS, type DelegationLevel } from "@/lib/delegation-level";

/** Niveau de délégation (§9, #36) : réglé ici seulement ; passer en « Préparer seulement » est confirmé car il annule les programmations. */
export function DelegationPanel({ level }: { level: DelegationLevel }) {
  const router = useRouter();
  const [choice, setChoice] = useState<DelegationLevel>(level);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const busy = sending || refreshing;

  async function save() {
    setSending(true);
    setError("");
    setSaved("");
    const response = await fetch("/api/delegation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level: choice }) });
    const payload = await response.json().catch(() => null);
    setSending(false);
    if (!response.ok) {
      setError(payload?.error ?? "Enregistrement impossible pour le moment.");
      return;
    }
    setSaved(`Règle enregistrée : ${DELEGATION_LABELS[choice]}.${payload?.cancelled ? ` ${payload.cancelled} programmation(s) annulée(s).` : ""}`);
    startRefresh(() => {
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <section className="setting-section" id="delegation" aria-labelledby="delegation-title">
      <h2 id="delegation-title">Ma délégation</h2>
      <p className="small">Ce que BienDecider peut faire sans vous redemander. Une validation de contenu n&apos;autorise jamais une diffusion.</p>
      <fieldset className="delegation-options">
        <legend className="sr-only">Niveau de délégation</legend>
        {DELEGATION_LEVELS.map((option) => (
          <label key={option} className={`delegation-option${choice === option ? " selected" : ""}`}>
            <input type="radio" name="delegation" value={option} checked={choice === option} onChange={() => setChoice(option)} />
            <span>
              <strong>{DELEGATION_LABELS[option]}{option === "review" ? " · conseillé pour démarrer" : ""}</strong>
              <small>{DELEGATION_DETAILS[option]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="heading-actions">
        <button type="button" className="primary" disabled={busy || choice === level} onClick={() => (choice === "prepare" ? setConfirming(true) : void save())}>Enregistrer les règles</button>
      </div>
      {saved && <p role="status" className="notice small">{saved}</p>}
      {!confirming && error && <p role="alert" className="warning">{error}</p>}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        kicker="Vos règles"
        title="Passer en « Préparer seulement » ?"
        cancelLabel="Garder ma règle actuelle"
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void save()}>Passer en préparation seule</button>}
      >
        <p>Passer en préparation seule annule les programmations. Paul continue de préparer ; vous diffusez vous-même, puis vous le déclarez.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>
    </section>
  );
}
