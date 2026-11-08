"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { waitForAgentRun } from "@/lib/agent-runs-client";

const FAILED = "Paul n'a pas pu préparer vos missions. Réessayez.";

/**
 * « Préparer mes missions » (#284) : un clic, un `requestId`, une exécution de Paul qui ajoute au plus trois missions
 * « À décider » issues du diagnostic. Sans diagnostic courant, un lien vers le diagnostic remplace le bouton.
 */
export function PrepareMissions({ hasDiagnostic }: { hasDiagnostic: boolean }) {
  if (!hasDiagnostic) return <Link className="btn" href="/diagnostic"><Icon name="scan-line" />Ouvrir mon diagnostic</Link>;
  return <PrepareMissionsButton />;
}

function PrepareMissionsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; href?: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Le suivi s'arrête quand le dirigeant quitte la page ; l'exécution continue côté serveur.
  const following = useRef<AbortController | null>(null);
  useEffect(() => () => following.current?.abort(), []);

  async function prepare() {
    setBusy(true);
    setError(null);
    setDone(null);
    following.current?.abort();
    const controller = new AbortController();
    following.current = controller;
    const { signal } = controller;
    try {
      const response = await fetch("/api/co-ceo/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError({ message: data?.error ?? FAILED, href: data?.reason === "no_diagnostic" ? "/diagnostic" : undefined });
        return;
      }
      if (!data?.run?.id) throw new Error(FAILED);
      let count: number = data.run.resultCount ?? 0;
      if (data.run.status !== "succeeded") {
        const finished = await waitForAgentRun(data.run.id, () => undefined, signal);
        if (signal.aborted) return;
        if (finished?.status === "failed") throw new Error(finished.errorMessage ?? FAILED);
        if (!finished) throw new Error("Paul prend plus de temps que prévu : vos missions apparaîtront ici une fois prêtes. Rechargez la page plus tard.");
        count = finished.resultCount;
      }
      setDone(count > 1 ? `Paul a ajouté ${count} missions à décider.` : "Paul a ajouté une mission à décider.");
      router.refresh();
    } catch (failure) {
      if (signal.aborted) return;
      setError({ message: failure instanceof Error ? failure.message : FAILED });
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => void prepare()} disabled={busy} aria-busy={busy}>
        <Icon name="list-checks" />{busy ? "Paul prépare vos missions…" : error ? "Réessayer de préparer mes missions" : "Préparer mes missions"}
      </button>
      {/* 409 « cap » (M-75) ou « no_diagnostic » : le message du serveur est affiché tel quel. */}
      {error && <p role="alert" className="warning">{error.message}{error.href && <> <Link href={error.href}>Voir le diagnostic</Link></>}</p>}
      {done && <p role="status" className="notice">{done} Rien n&apos;est lancé sans vous.</p>}
    </>
  );
}
