"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data && typeof data.error === "string" ? data.error : "Confirmation impossible. Réessayez.");
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confirmation impossible. Réessayez.");
      setState("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 font-sans">
      <h1><Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link></h1>
      <h2 className="mt-6 text-lg font-medium">Confirmer votre adresse e-mail</h2>
      {state === "done" ? (
        <div role="status" className="mt-4 text-sm">
          <p className="font-medium text-green-800">Votre adresse e-mail est confirmée.</p>
          <p className="mt-3"><Link className="underline" href="/dashboard">Aller à mon espace</Link></p>
        </div>
      ) : token ? (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <p className="text-gray-600">Un clic suffit pour confirmer que cette adresse est bien la vôtre.</p>
          <button type="button" onClick={confirm} disabled={state === "loading"} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {state === "loading" ? "Confirmation…" : "Confirmer mon adresse"}
          </button>
          {error && <p role="alert" className="text-red-600">{error}</p>}
        </div>
      ) : (
        <p role="alert" className="mt-4 text-sm text-red-600">Ce lien est incomplet. Utilisez le lien reçu par e-mail, ou demandez-en un nouveau depuis votre espace.</p>
      )}
    </main>
  );
}
