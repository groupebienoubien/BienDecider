"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Suspension réversible (story 7.1) : confirmation avant de suspendre, réactivation en un clic. */
export function SuspendCompanyButton({ companyId, companyName, suspended, isSelf }: { companyId: string; companyName: string; suspended: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function change(next: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/suspension`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suspended: next }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Action impossible.");
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setLoading(false);
    }
  }

  if (suspended) {
    return (
      <span>
        <button onClick={() => change(false)} disabled={loading}>{loading ? "…" : "Réactiver"}</button>
        {error && <small role="alert">{error}</small>}
      </span>
    );
  }
  if (isSelf) return <small>Votre compte</small>;
  if (confirming) {
    return (
      <span className="heading-actions">
        <button onClick={() => change(true)} disabled={loading} className="danger">{loading ? "…" : `Confirmer la suspension de ${companyName || "cette entreprise"}`}</button>
        <button onClick={() => { setConfirming(false); setError(""); }}>annuler</button>
        {error && <small role="alert">{error}</small>}
      </span>
    );
  }
  return <button onClick={() => setConfirming(true)}>Suspendre</button>;
}
