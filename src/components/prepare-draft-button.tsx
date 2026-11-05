"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

/** Demande à Paul le premier brouillon d'une mission (0 crédit), puis ouvre l'atelier sur ce contenu. */
export function PrepareDraftButton({ missionId, className }: { missionId: string; className?: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");

  async function prepare() {
    setSending(true);
    setError("");
    const response = await fetch(`/api/missions/${missionId}/content`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    setSending(false);
    if (!response.ok || typeof payload?.contentId !== "string") {
      setError(payload?.error ?? "Paul n'a pas pu préparer ce contenu. Réessayez dans un instant.");
      return;
    }
    startRefresh(() => router.push(`/atelier/${payload.contentId}`));
  }

  return (
    <>
      <button type="button" className={className} disabled={sending || refreshing} onClick={() => void prepare()}>
        <Icon name="message-circle" />{sending ? "Paul prépare le brouillon…" : "Préparer le brouillon avec Paul"}
      </button>
      {error && <p role="alert" className="warning">{error}</p>}
    </>
  );
}
