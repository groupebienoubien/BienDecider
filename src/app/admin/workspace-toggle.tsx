"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Bascule de l'espace V5.2 pour une entreprise (bascule progressive, addendum §1.7). */
export function WorkspaceToggle({ companyId, enabled }: { companyId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/companies/${companyId}/workspace`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
    setBusy(false);
    if (!response.ok) {
      setError((await response.json().catch(() => null))?.error ?? "Action impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={enabled}>{enabled ? "Espace V5.2 actif" : "Activer l'espace V5.2"}</button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
