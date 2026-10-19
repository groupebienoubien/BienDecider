"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FacebookConnectionView } from "@/lib/oauth/meta";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

export function FacebookPanel({ configured, view }: { configured: boolean; view: FacebookConnectionView }) {
  const router = useRouter();
  const selectablePages = view.status === "selection" ? view.pages.filter((page) => page.canPublish) : [];
  const [pageId, setPageId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const labels = {
    disconnected: "Non autorisé",
    error: "Autorisation à refaire · reconnectez votre Page",
    selection: "Autorisation reçue · choisissez la Page à connecter",
    connected: "Page reliée et vérifiée",
  };

  async function send(url: string, body: unknown, fallback: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? fallback);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choosePage(event: React.FormEvent) {
    event.preventDefault();
    const data = await send("/api/facebook/page", { pageId }, "Impossible de connecter cette Page. Réessayez.");
    if (!data) return;
    setNotice(`Page « ${data.pageName} » connectée. Aucune publication n'a été effectuée.`);
    router.refresh();
  }

  async function disconnect(event: React.FormEvent) {
    event.preventDefault();
    const data = await send("/api/facebook/disconnect", { confirmed }, "Impossible de retirer Facebook. Réessayez.");
    if (!data) return;
    setConfirmed(false);
    setNotice(data.revoked
      ? "Accès retiré de BienDecider et révoqué chez Facebook."
      : "Accès retiré de BienDecider. Facebook n'a pas confirmé la révocation : retirez aussi BienDecider dans Facebook, Paramètres → Intégrations professionnelles.");
    router.refresh();
  }

  return (
    <section aria-label="Facebook · Page" className="setting-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-medium">Facebook · Page</h2>
          <p className="mt-1 text-sm text-slate-600">{labels[view.status]}</p>
          {view.status === "connected" && <p className="mt-1 break-words text-sm font-medium">{view.pageName}</p>}
          {(view.status === "connected" || view.status === "selection") && <p className="mt-1 break-words text-xs text-slate-500">Autorisé par {view.userName}</p>}
          <p className="mt-2 text-xs text-slate-600">{CHANNEL_CAPABILITIES.facebook.nextStep} {CHANNEL_CAPABILITIES.instagram.label} : {CHANNEL_CAPABILITIES.instagram.availability.charAt(0).toLowerCase() + CHANNEL_CAPABILITIES.instagram.availability.slice(1)}</p>
          {!configured && <p className="mt-2 text-xs text-amber-700">La liaison Facebook n&apos;est pas disponible sur cette version.</p>}
        </div>
        {configured && <a href="/api/oauth/meta/start" className="btn primary">{view.status === "disconnected" ? "Autoriser Facebook" : "Réautoriser Facebook"}</a>}
      </div>

      {view.status === "selection" && (
        <form onSubmit={choosePage} className="mt-4 space-y-3">
          <fieldset disabled={busy}>
            <legend className="text-sm font-medium">Quelle Page voulez-vous connecter ?</legend>
            <div className="mt-2 space-y-2">
              {view.pages.map((page) => (
                <label key={page.id} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="facebook-page" value={page.id} checked={pageId === page.id} onChange={() => setPageId(page.id)} disabled={!page.canPublish} className="mt-1" />
                  <span className="min-w-0 break-words">
                    {page.name}
                    {!page.canPublish && <span className="block text-xs text-slate-500">Votre rôle sur cette Page ne permet pas d&apos;y créer du contenu.</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {selectablePages.length === 0 && <p className="text-xs text-amber-700">Aucune de ces Pages ne vous permet de créer du contenu. Demandez ce droit à un administrateur de la Page, puis réautorisez Facebook.</p>}
          <button type="submit" disabled={!pageId || busy} className="primary">{busy ? "Vérification…" : "Connecter cette Page"}</button>
        </form>
      )}

      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="warning">{error}</p>}

      {view.status !== "disconnected" && <details className="mt-3">
        <summary className="cursor-pointer text-sm text-slate-600">Déconnecter Facebook</summary>
        <form onSubmit={disconnect} className="mt-3 space-y-3">
          <p className="text-xs text-slate-600">Le retrait efface l&apos;autorisation de BienDecider et demande à Facebook de la révoquer.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="mt-1" />
            Je confirme le retrait de ma Page Facebook.
          </label>
          <button type="submit" disabled={!confirmed || busy}>{busy ? "Retrait…" : "Confirmer le retrait Facebook"}</button>
        </form>
      </details>}
    </section>
  );
}
