"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/lib/password-policy";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const policy = passwordPolicyError(password);
    if (policy) return setError(policy);
    if (password !== confirmation) return setError("Les deux mots de passe ne correspondent pas."); // M-13
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data && typeof data.error === "string" ? data.error : "Réinitialisation impossible. Réessayez.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réinitialisation impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 font-sans">
      <h1><Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link></h1>
      <h2 className="mt-6 text-lg font-medium">Nouveau mot de passe</h2>
      {done ? (
        <div role="status" className="mt-4 text-sm">
          <p className="font-medium text-green-800">Votre mot de passe a été modifié. Vos sessions ouvertes ont été fermées.</p>
          <p className="mt-3"><Link className="underline" href="/login">Se connecter</Link></p>
        </div>
      ) : !token ? (
        <p role="alert" className="mt-4 text-sm text-red-600">Ce lien est incomplet. Utilisez le lien reçu par e-mail ou <Link className="underline" href="/mot-de-passe-oublie">demandez-en un nouveau</Link>.</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="reset-password" className="text-sm font-medium">Nouveau mot de passe</label>
          <input id="reset-password" required type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} placeholder={`${PASSWORD_MIN_LENGTH} caractères minimum`} value={password} onChange={(event) => setPassword(event.target.value)} className="rounded border px-3 py-2 text-sm" />
          <label htmlFor="reset-confirmation" className="text-sm font-medium">Confirmation du mot de passe</label>
          <input id="reset-confirmation" required type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="rounded border px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            Afficher le mot de passe
          </label>
          <button type="submit" disabled={loading} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">{loading ? "Enregistrement…" : "Changer mon mot de passe"}</button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </main>
  );
}
