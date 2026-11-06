"use client";

import { useState } from "react";
import type { AccessState } from "@/lib/channel-access";

/** Canal réservé aux entreprises autorisées (#301) : pas de flux OAuth voué à l'échec, une demande d'accès à la place. */
export function AccessRequest({ channel, state }: { channel: string; state: AccessState }) {
  const [current, setCurrent] = useState(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/channel-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Demande impossible pour le moment.");
      return;
    }
    setCurrent(payload.state);
  }

  return (
    <div className="access-request">
      <p className="small"><strong>Pas encore disponible pour votre compte.</strong> Le fournisseur n&apos;a pas encore approuvé BienDecider : l&apos;accès est ouvert entreprise par entreprise.</p>
      {current === "requested"
        ? <p role="status" className="small muted">Demande envoyée. Nous vous prévenons dès que l&apos;accès est ouvert.</p>
        : <button type="button" disabled={busy} onClick={() => void ask()}>Demander l&apos;accès</button>}
      {error && <p role="alert" className="warning">{error}</p>}
    </div>
  );
}
