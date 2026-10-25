"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";

type Candidate = { placeId: string; name: string; address: string | null; link: string };

async function sendDecision(body: { action: "confirm" | "decline"; placeId: string } | { action: "remove" }) {
  const response = await fetch("/api/google-place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "L'enregistrement a échoué. Réessayez.");
}

/** Fenêtre de confirmation de la fiche Google trouvée : rien n'est enregistré avant le clic du dirigeant. */
export function GooglePlaceDialog({ hasCandidate }: { hasCandidate: boolean }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null);

  useEffect(() => {
    if (!hasCandidate) return;
    let cancelled = false;
    void fetch("/api/google-place")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.candidate) return;
        setCandidate(data.candidate as Candidate);
        setDone(null);
        setError(null);
        setOpen(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasCandidate]);

  async function decide(action: "confirm" | "decline") {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      await sendDecision({ action, placeId: candidate.placeId });
      setDone(action === "confirm" ? "confirmed" : "declined");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'enregistrement a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open && (candidate !== null || done !== null)}
      onClose={() => setOpen(false)}
      kicker="FICHE GOOGLE"
      title={done === "confirmed" ? "Fiche enregistrée" : done === "declined" ? "Fiche écartée" : "Est-ce bien votre fiche Google ?"}
      cancelLabel={done ? "Fermer" : "Plus tard"}
      actions={!done && candidate ? <>
        <button type="button" onClick={() => void decide("decline")} disabled={busy}>Ce n’est pas ma fiche</button>
        <button type="button" className="primary" onClick={() => void decide("confirm")} disabled={busy}>{busy ? "Enregistrement…" : "Oui, c’est ma fiche"}</button>
      </> : undefined}
    >
      {done === "confirmed" && <p>Les avis de cette fiche seront lus au prochain diagnostic : cliquez sur « Actualiser le diagnostic ».</p>}
      {done === "declined" && <p>Cette fiche ne sera plus proposée. Martine en cherchera une autre au prochain diagnostic.</p>}
      {!done && candidate && <>
        <p>Martine a trouvé cette fiche. Vérifiez-la avant qu’elle serve à analyser vos avis.</p>
        <p><strong>{candidate.name}</strong><br />{candidate.address ?? "Adresse non communiquée"}</p>
        <p><a href={candidate.link} target="_blank" rel="noopener noreferrer">Voir la fiche sur Google Maps</a></p>
        <p className="legend">Source : Google Maps. Rien n’est enregistré sans votre confirmation.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </>}
    </Modal>
  );
}

/** Ligne « Fiche Google » de la page Entreprise : lien vers la fiche confirmée, et retrait. */
export function GooglePlaceLine({ link }: { link: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await sendDecision({ action: "remove" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le retrait a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connection">
      <span>
        <strong>Fiche Google</strong>
        <small><a href={link} target="_blank" rel="noopener noreferrer">Voir ma fiche sur Google Maps</a> · confirmée par vous</small>
        {error && <small role="alert" className="warning">{error}</small>}
      </span>
      <button type="button" className="btn" onClick={() => void remove()} disabled={busy}>{busy ? "Retrait…" : "Retirer"}</button>
    </div>
  );
}
