"use client";

import { useState } from "react";

/**
 * Consigne durable pour l'équipe : un réglage relu par Paul et les agents à chaque
 * préparation. Ce n'est pas une conversation : on parle à Paul dans son panneau.
 */
export function DirectionForm({ initialDirection }: { initialDirection: string | null }) {
  const [direction, setDirection] = useState(initialDirection ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    try {
      const response = await fetch("/api/companies/direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      setState(response.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={save}>
      <label className="field" htmlFor="direction">Consigne pour l’équipe
        <textarea id="direction" value={direction} onChange={(event) => { setDirection(event.target.value); setState("idle"); }} placeholder="Priorités, contraintes, actualités…" rows={4} maxLength={2000} />
      </label>
      <button type="submit" disabled={state === "saving"}>{state === "saving" ? "Enregistrement…" : "Enregistrer la consigne"}</button>
      {state === "saved" && <p role="status" className="notice">Consigne enregistrée pour les prochaines actions.</p>}
      {state === "error" && <p role="alert" className="warning">La consigne n’a pas pu être enregistrée. Réessayez.</p>}
    </form>
  );
}
