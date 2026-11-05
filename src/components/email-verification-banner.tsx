"use client";

import { useState } from "react";
import { EMAIL_NOT_VERIFIED_MESSAGE } from "@/lib/agents/agent-errors";

/** Bandeau de l'espace tant que l'adresse n'est pas confirmée (story 6.4, FR-11) : il dit pourquoi rien ne part et permet de renvoyer le lien. */
export function EmailVerificationBanner({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data && typeof data.error === "string" ? data.error : "Le lien n'a pas pu être envoyé.");
      setMessage({ text: data?.alreadyVerified ? "Votre adresse est déjà confirmée." : "Un nouveau lien vient d'être envoyé.", failed: false });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Le lien n'a pas pu être envoyé.", failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="warning" role="status" data-testid="email-verification-banner">
      <strong>{EMAIL_NOT_VERIFIED_MESSAGE}</strong>{" "}
      Un lien de confirmation a été envoyé{email ? <> à <strong>{email}</strong></> : null}. En attendant, vous pouvez préparer vos contenus, mais rien ne part vers l&apos;extérieur et les agents ne se lancent pas.{" "}
      <button type="button" className="btn" onClick={resend} disabled={busy}>{busy ? "Envoi…" : "Renvoyer le lien"}</button>
      {message && <p role={message.failed ? "alert" : "status"}>{message.text}</p>}
    </div>
  );
}
