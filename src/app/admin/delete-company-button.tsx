"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCompanyButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch(`/api/admin/companies/${companyId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="heading-actions">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="danger"
        >
          {loading ? "…" : `Confirmer suppression de ${companyName}`}
        </button>
        <button onClick={() => setConfirming(false)}>
          annuler
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="danger">
      Supprimer
    </button>
  );
}
