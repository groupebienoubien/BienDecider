"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Suppression définitive : il faut saisir exactement le nom de l'entreprise (story 7.1). Pour bloquer sans détruire, suspendre. */
export function DeleteCompanyButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${companyId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmName: typed }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Suppression impossible.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.");
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <span className="heading-actions">
        <label className="field">
          Saisissez « {companyName} » pour confirmer la suppression définitive
          <input aria-label={`Nom de l'entreprise à confirmer : ${companyName}`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
        </label>
        <button onClick={handleDelete} disabled={loading || typed !== companyName} className="danger">
          {loading ? "…" : "Supprimer définitivement"}
        </button>
        <button onClick={() => { setConfirming(false); setTyped(""); setError(""); }}>annuler</button>
        {error && <small role="alert">{error}</small>}
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="danger">
      Supprimer
    </button>
  );
}
