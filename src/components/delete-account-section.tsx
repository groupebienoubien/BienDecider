"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountSection({ requiresPassword }: { requiresPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/companies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed, ...(requiresPassword ? { password } : {}) }),
      });
      if (response.ok) {
        router.replace("/login");
        return;
      }
      const data = await response.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "La suppression a échoué, réessayez.");
    } catch {
      setError("La suppression a échoué, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-account-title" style={{ marginTop: 24 }}>
      <h2 id="delete-account-title">Supprimer mon compte et mes données</h2>
      <p>
        Votre entreprise, votre diagnostic, votre plan, vos productions, vos prospects et vos connexions sont effacés
        définitivement, ainsi que les jetons d&apos;accès. Nous retirons l&apos;autorisation donnée à BienDecider chez Google et Meta
        quand c&apos;est possible. Le site publié par BienDecider est mis hors ligne ; ce qui a déjà été publié ou envoyé
        ailleurs (réseaux sociaux, emails) n&apos;est pas retiré.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="danger">
          Supprimer mon compte…
        </button>
      ) : (
        <form onSubmit={handleDelete} >
          {requiresPassword && (
            <label htmlFor="delete-password" className="field">
              Votre mot de passe
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
               
              />
            </label>
          )}
          <label htmlFor="delete-confirm" className="check-label">
            <input id="delete-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Je comprends que cette suppression est définitive et ne peut pas être annulée.
          </label>
          {error && <p role="alert" className="warning">{error}</p>}
          <div className="production-actions"><div>
            <button type="submit" disabled={busy || !confirmed || (requiresPassword && !password)} className="danger">
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setPassword(""); setConfirmed(false); setError(null); }} >
              Annuler
            </button>
          </div></div>
        </form>
      )}
    </section>
  );
}
