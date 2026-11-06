"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ideaFrameHref } from "@/lib/idea-text";

/**
 * Actions d'une idée notée (US #312) : « Cadrer avec Paul » ouvre « Cadrons votre nouvelle mission » prérempli,
 * « Retirer l'idée » la supprime (J-30) et rafraîchit la page.
 */
export function IdeaActions({ idea }: { idea: { id: string; text: string } }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const busy = sending || refreshing;

  async function remove() {
    setSending(true);
    setError("");
    const response = await fetch(`/api/ideas/${encodeURIComponent(idea.id)}`, { method: "DELETE" }).catch(() => null);
    setSending(false);
    // Déjà retirée ou cadrée ailleurs (404) : la page rafraîchie ne la montre plus.
    if (!response || (!response.ok && response.status !== 404)) {
      setError("Impossible de retirer l'idée pour le moment. Réessayez.");
      return;
    }
    startRefresh(() => router.refresh());
  }

  return (
    <>
      <div className="heading-actions mission-actions">
        <Link className="btn" href={ideaFrameHref(idea.id)}><Icon name="plus" />Cadrer avec Paul</Link>
        <button type="button" onClick={remove} disabled={busy}><Icon name="trash-2" />Retirer l&apos;idée</button>
      </div>
      {error && <p role="alert" className="warning">{error}</p>}
    </>
  );
}
