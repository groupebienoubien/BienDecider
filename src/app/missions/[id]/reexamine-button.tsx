"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** « J'ai réexaminé cette mission » (#169) : retire le signal posé par la correction de son constat ; rien d'autre ne change. */
export function ReexamineButton({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/missions/${missionId}/reexamen`, { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Votre réexamen n'a pas pu être enregistré. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void confirm()}>J&apos;ai réexaminé cette mission</button>
      {error && <p role="alert" className="warning">{error}</p>}
    </>
  );
}
