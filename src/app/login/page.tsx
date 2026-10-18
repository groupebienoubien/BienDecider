"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data.error === "string"
            ? data.error
            : "Service de connexion indisponible. Réessayez dans quelques instants.";
        throw new Error(message);
      }
      if (!data || typeof data.hasCompany !== "boolean") {
        throw new Error("Réponse de connexion invalide. Réessayez dans quelques instants.");
      }
      router.push(data.hasCompany ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center p-8 font-sans min-h-screen">
      <h1><Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link></h1>
      <p className="mt-3 text-sm text-indigo-700">Vous décidez. Votre activité avance.</p>
      <h2 className="mt-4 text-lg font-medium">Connexion</h2>
      <p className="mt-1 text-sm text-gray-500">
        Connectez-vous avec l&apos;email et le mot de passe de votre compte.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label htmlFor="login-email" className="text-sm font-medium">Adresse e-mail</label>
        <input
          id="login-email"
          required
          type="email"
          autoComplete="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <label htmlFor="login-password" className="text-sm font-medium">Mot de passe</label>
        <input
          id="login-password"
          required
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Mot de passe (6 caractères minimum)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Afficher le mot de passe
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Connexion…" : "Continuer"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-gray-600">
          Pas encore de compte ? <Link className="underline" href="/signup">Créer un compte</Link>
        </p>
      </form>
    </main>
  );
}
