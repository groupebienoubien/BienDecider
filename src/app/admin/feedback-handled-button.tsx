"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Bascule Traité / À traiter d'un signalement (story 7.4). */
export function FeedbackHandledButton({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handled: !handled }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Action impossible.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span>
      <button type="button" onClick={toggle} disabled={loading}>{loading ? "…" : handled ? "Remettre à traiter" : "Marquer traité"}</button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
