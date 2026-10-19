"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

export function GmailPanel({ configured, authorized, failed, senderEmail }: { configured: boolean; authorized: boolean; failed: boolean; senderEmail: string | null }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [disconnectConfirmed, setDisconnectConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function edited() {
    setConfirmed(false);
    setRequestId(null);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || busy) return;
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text, confirmed, requestId: id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Envoi non confirmé. Vérifiez Gmail avant de réessayer.");
      setNotice("Gmail a confirmé l'envoi du message.");
      setTo(""); setSubject(""); setText(""); setConfirmed(false); setRequestId(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Envoi non confirmé. Vérifiez Gmail avant de réessayer.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!disconnectConfirmed || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/gmail/disconnect", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Déconnexion impossible.");
      setNotice(result.revoked ? "Gmail déconnecté et autorisation révoquée." : "Jetons supprimés de BienDecider. Retirez aussi l'accès dans les paramètres de votre compte Google.");
      setDisconnectConfirmed(false);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Déconnexion impossible."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="gmail-heading" className="setting-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <h2 id="gmail-heading" className="font-medium">Gmail · envoi de messages</h2>
          <p className="mt-1 text-sm text-slate-500">{failed ? "Réautorisation nécessaire" : authorized ? "Envoi autorisé" : "Non autorisé"}</p>
          {senderEmail && <p className="mt-1 break-all text-sm font-medium">{senderEmail}</p>}
          <p className="mt-2 text-sm text-slate-600">{CHANNEL_CAPABILITIES.gmail.nextStep} BienDecider ne lit pas votre boîte de réception.</p>
        </div>
        {configured ? <a href="/api/oauth/gmail/start" className="btn primary">{authorized || failed ? "Relier de nouveau Gmail" : "Relier Gmail"}</a> : <span className="text-sm text-amber-700">L&apos;envoi Gmail n&apos;est pas disponible sur cette version.</span>}
      </div>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="warning">{error}</p>}
      {authorized && configured && (
        <details className="mt-4">
          <summary className="text-link">Écrire un email</summary>
          <form onSubmit={send} className="mt-4 space-y-3">
            <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
              <label className="field">Destinataire<input type="email" required maxLength={254} value={to} onChange={(event) => { setTo(event.target.value); edited(); }} /></label>
              <label className="field">Objet<input required maxLength={200} value={subject} onChange={(event) => { setSubject(event.target.value); edited(); }} /></label>
              <label className="field">Message<textarea required maxLength={20000} rows={6} value={text} onChange={(event) => { setText(event.target.value); edited(); }} /></label>
                <p className="warning"><span className="font-semibold">Le message partira à l&apos;extérieur et ne pourra pas être rappelé.</span> Destinataire : {to || "à préciser"}. Expéditeur : {senderEmail ?? "le compte Gmail relié"}.</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>Je confirme le destinataire et le contenu de cet envoi.</span></label>
              <button disabled={!confirmed || busy} className="primary">{busy ? "Envoi en cours…" : "Envoyer avec Gmail"}</button>
            </fieldset>
          </form>
        </details>
      )}
      {(authorized || failed) && <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-500">Déconnecter Gmail</summary>
        <p className="mt-2 text-xs text-slate-600">La révocation Google peut retirer les autres autorisations du même projet Google. Les jetons Gmail seront supprimés de BienDecider.</p>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={disconnectConfirmed} onChange={(event) => setDisconnectConfirmed(event.target.checked)} /><span>Je confirme le retrait de l&apos;autorisation.</span></label>
        <button onClick={disconnect} disabled={busy || !disconnectConfirmed}>Déconnecter</button>
      </details>}
    </section>
  );
}