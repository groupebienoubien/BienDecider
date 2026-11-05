"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data && typeof data.error === "string" ? data.error : "Demande impossible. Réessayez.");
      setSent(typeof data?.message === "string" ? data.message : "Si un compte existe pour cette adresse, un lien vient d'être envoyé.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demande impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 font-sans">
      <h1><Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link></h1>
      <h2 className="mt-6 text-lg font-medium">Mot de passe oublié</h2>
      {sent ? (
        <div role="status" className="mt-4 text-sm">
          <p>{sent}</p>
          <p className="mt-2 text-gray-600">Le lien est valable une heure. Pensez à regarder vos courriers indésirables.</p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">Indiquez l&apos;adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label htmlFor="forgot-email" className="text-sm font-medium">Adresse e-mail</label>
            <input id="forgot-email" required type="email" autoComplete="email" placeholder="votre@email.com" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded border px-3 py-2 text-sm" />
            <button type="submit" disabled={loading} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">{loading ? "Envoi…" : "Envoyer le lien"}</button>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </form>
        </>
      )}
      <p className="mt-6 text-sm text-gray-600"><Link className="underline" href="/login">Retour à la connexion</Link></p>
    </main>
  );
}
