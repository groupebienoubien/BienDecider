"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/mockup-ui";

const GENERIC_ERROR = "L'action n'a pas pu être enregistrée. Réessayez dans un instant.";

/**
 * « Confirmer » ou « Écarter » un concurrent potentiel (#292) : un concurrent confirmé reste proposé tel quel ; un
 * concurrent écarté n'est plus jamais reproposé par un audit suivant. Un constat déjà tranché montre son statut, sans autre action.
 */
export function CompetitorActions({ id, actor, status }: { id: string; actor: string; status: "pending" | "confirmed" | "dismissed" }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  async function act(action: "confirmer" | "ecarter") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/entreprise/concurrents/${id}/statut`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
        return;
      }
      setOpen(false);
      setStatusMessage(action === "confirmer" ? "Concurrent confirmé." : "Concurrent écarté : il ne sera plus proposé.");
      requestAnimationFrame(() => trigger.current?.focus());
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (status === "confirmed") return <Tag color="green">Confirmé</Tag>;
  if (status === "dismissed") return <Tag color="gray">Écarté</Tag>;

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <Tag color="orange">À confirmer</Tag>
        <button type="button" className="small" disabled={busy} onClick={() => void act("confirmer")}><Icon name="check" />Confirmer<span className="sr-only"> : {actor}</span></button>
        <button ref={trigger} type="button" className="small" disabled={busy} onClick={() => { setError(null); setOpen(true); }}><Icon name="x" />Écarter<span className="sr-only"> : {actor}</span></button>
      </span>
      <span className="sr-only" role="status">{statusMessage}</span>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        kicker="Concurrence locale"
        title={`Écarter « ${actor} » ?`}
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void act("ecarter")}>Écarter</button>}
      >
        <p>Ce concurrent ne sera plus proposé dans vos prochains diagnostics. Rien d&apos;autre ne change.</p>
        {error && <p role="alert" className="warning">{error}</p>}
      </Modal>
    </>
  );
}
