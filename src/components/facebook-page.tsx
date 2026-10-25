"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";

async function sendDecision(body: { action: "confirm" | "decline"; url: string } | { action: "remove" }) {
  const response = await fetch("/api/facebook-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "L'enregistrement a échoué. Réessayez.");
}

/** Fenêtre de confirmation de la Page Facebook trouvée : rien n'est enregistré avant le clic du dirigeant. */
export function FacebookPageDialog({ hasCandidate }: { hasCandidate: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null);

  useEffect(() => {
    if (!hasCandidate) return;
    let cancelled = false;
    void fetch("/api/facebook-page")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || typeof data?.candidate?.url !== "string") return;
        setUrl(data.candidate.url);
        setDone(null);
        setError(null);
        setOpen(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasCandidate]);

  async function decide(action: "confirm" | "decline") {
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      await sendDecision({ action, url });
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
      open={open && (url !== null || done !== null)}
      onClose={() => setOpen(false)}
      kicker="PAGE FACEBOOK"
      title={done === "confirmed" ? "Page enregistrée" : done === "declined" ? "Page écartée" : "Est-ce bien votre Page Facebook ?"}
      cancelLabel={done ? "Fermer" : "Plus tard"}
      actions={!done && url ? <>
        <button type="button" onClick={() => void decide("decline")} disabled={busy}>Ce n’est pas ma Page</button>
        <button type="button" className="primary" onClick={() => void decide("confirm")} disabled={busy}>{busy ? "Enregistrement…" : "Oui, c’est ma Page"}</button>
      </> : undefined}
    >
      {done === "confirmed" && <p>Cette Page sera utilisée au prochain diagnostic : cliquez sur « Actualiser le diagnostic ».</p>}
      {done === "declined" && <p>Cette Page ne sera plus proposée. Martine en cherchera une autre au prochain diagnostic.</p>}
      {!done && url && <>
        <p>Martine a trouvé cette Page. Vérifiez-la avant qu’elle serve à analyser votre présence sur Facebook.</p>
        <p><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
        <p className="legend">Source : Facebook. Rien n’est enregistré sans votre confirmation.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </>}
    </Modal>
  );
}

/** Ligne « Page Facebook » de la page Entreprise : lien vers la Page confirmée, et retrait. */
export function FacebookPageLine({ url }: { url: string }) {
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
        <strong>Page Facebook</strong>
        <small><a href={url} target="_blank" rel="noopener noreferrer">Voir ma Page sur Facebook</a> · confirmée par vous</small>
        {error && <small role="alert" className="warning">{error}</small>}
      </span>
      <button type="button" className="btn" onClick={() => void remove()} disabled={busy}>{busy ? "Retrait…" : "Retirer"}</button>
    </div>
  );
}
