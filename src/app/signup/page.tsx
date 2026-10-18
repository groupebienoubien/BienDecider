"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data.error === "string" ? data.error : "Inscription impossible. Réessayez.";
        throw new Error(message);
      }
      router.push("/onboarding");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Inscription impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 font-sans">
      <h1><Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link></h1>
      <p className="mt-3 text-sm text-indigo-700">Vous décidez. Votre activité avance.</p>
      <h2 className="mt-4 text-lg font-medium">Créer un compte</h2>
      <p className="mt-1 text-sm text-gray-500">Créez un compte avec votre email et un mot de passe d&apos;au moins 6 caractères.</p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label htmlFor="signup-email" className="text-sm font-medium">Adresse e-mail</label>
        <input
          id="signup-email"
          required
          type="email"
          autoComplete="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <label htmlFor="signup-password" className="text-sm font-medium">Mot de passe</label>
        <input
          id="signup-password"
          required
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={6}
          placeholder="Mot de passe (6 caractères minimum)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
          Afficher le mot de passe
        </label>
        <button type="submit" disabled={loading} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "Création…" : "Créer mon compte"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-gray-600">
          Déjà un compte ? <Link className="underline" href="/login">Se connecter</Link>
        </p>
      </form>
    </main>
  );
}