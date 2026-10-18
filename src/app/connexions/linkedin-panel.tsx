"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

export function LinkedInPanel({ configured, status, name, expiresAt, hasConnection }: {
  configured: boolean;
  status: "authorized" | "expired" | "error" | "disconnected";
  name: string | null;
  expiresAt: string | null;
  hasConnection: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const labels = { authorized: "Profil autorisé", expired: "Autorisation expirée · reconnectez votre profil", error: "Erreur d'autorisation · reconnectez votre profil", disconnected: "Non autorisé" };

  async function disconnect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/linkedin/disconnect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed }),
      });
      if (!response.ok) throw new Error("Impossible de retirer LinkedIn. Réessayez.");
      setRemoved(true);
      setConfirmed(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="LinkedIn · profil personnel" className="setting-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-medium">LinkedIn · profil personnel</h2>
          <p className="mt-1 text-sm text-slate-600">{labels[removed ? "disconnected" : status]}</p>
          {!removed && name && <p className="mt-1 break-words text-sm font-medium">{name}</p>}
          {!removed && expiresAt && <p className="mt-1 text-xs text-slate-500">Autorisation valable jusqu&apos;au {expiresAt} (heure de Paris)</p>}
          <p className="mt-2 text-xs text-slate-600">{CHANNEL_CAPABILITIES.linkedin.availability} Les Pages entreprise ne sont pas reliées.</p>
          {!configured && <p className="mt-2 text-xs text-amber-700">La liaison LinkedIn n&apos;est pas disponible sur cette version.</p>}
        </div>
        {configured && <a href="/api/oauth/linkedin/start" className="btn primary">{hasConnection && !removed ? "Réautoriser LinkedIn" : "Autoriser LinkedIn"}</a>}
      </div>
      {removed && <p role="status" className="notice">Accès retiré de BienDecider. Retirez aussi BienDecider dans LinkedIn : Préférences et confidentialité → Confidentialité des données → Autres applications.</p>}
      {error && <p role="alert" className="warning">{error}</p>}
      {hasConnection && !removed && <details className="mt-3">
        <summary className="cursor-pointer text-sm text-slate-600">Déconnecter LinkedIn</summary>
        <form onSubmit={disconnect} className="mt-3 space-y-3">
          <p className="text-xs text-slate-600">Le retrait efface l&apos;autorisation de BienDecider. Pour révoquer aussi l&apos;autorisation LinkedIn, retirez l&apos;application dans vos paramètres LinkedIn.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="mt-1" />
            Je confirme le retrait de mon profil LinkedIn.
          </label>
          <button type="submit" disabled={!confirmed || busy}>{busy ? "Retrait…" : "Confirmer le retrait LinkedIn"}</button>
        </form>
      </details>}
    </section>
  );
}