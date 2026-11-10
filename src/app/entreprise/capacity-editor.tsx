"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { CAPACITY_BOUNDS, CAPACITY_RECONFIRM_DAYS } from "@/lib/capacity";

const GENERIC_ERROR = "Votre capacité n'a pas pu être enregistrée. Réessayez dans un instant.";

/** « Modifier » la capacité disponible (#292) : enregistrer, même sans changement, la reconfirme pour 30 jours. */
export function CapacityEditor({ capacity }: { capacity: number | null }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(capacity?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  function show() {
    setValue(capacity?.toString() ?? "");
    setError(null);
    setStatus("");
    setOpen(true);
  }

  function close(message?: string) {
    setOpen(false);
    if (message) setStatus(message);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/entreprise/capacite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capacity: value.trim() === "" ? null : value.trim() }) });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
        requestAnimationFrame(() => document.getElementById("capacity-input")?.focus());
        return;
      }
      close(value.trim() === "" ? "Capacité retirée." : "Capacité confirmée.");
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button ref={trigger} type="button" className="small" onClick={show}><Icon name="pencil" />Modifier<span className="sr-only"> la capacité disponible</span></button>
      <span className="sr-only" role="status">{status}</span>
      <Modal
        open={open}
        onClose={() => close()}
        kicker="Vos repères"
        title="Votre capacité disponible"
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void save()}>Confirmer ma capacité</button>}
      >
        <label className="field" htmlFor="capacity-input">Nouveaux projets clients que vous pouvez prendre par mois</label>
        <input id="capacity-input" type="number" inputMode="numeric" min={CAPACITY_BOUNDS.min} max={CAPACITY_BOUNDS.max} step={1} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? "capacity-error" : "capacity-help"} onChange={(event) => setValue(event.target.value)} />
        <small id="capacity-help">De {CAPACITY_BOUNDS.min} à {CAPACITY_BOUNDS.max}, déclaré par vous. Paul en tient compte pour ne pas vous proposer plus de travail que vous ne pouvez en prendre ; à reconfirmer dans {CAPACITY_RECONFIRM_DAYS} jours. Laissez vide pour la retirer.</small>
        {error && <p id="capacity-error" role="alert" className="warning">{error}</p>}
      </Modal>
    </>
  );
}
