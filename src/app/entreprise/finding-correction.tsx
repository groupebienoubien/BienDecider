"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { CERTAINTY_LABELS, formatReadDate, isCertainty } from "@/lib/findings/certainty";
import { CORRECTION_BOUNDS, CORRECTION_EFFECTS, type CorrectionField } from "@/lib/findings/correction";
import type { FindingPreviousVersion } from "@/lib/findings/correction-service";

const GENERIC_ERROR = "La correction n'a pas pu être enregistrée. Réessayez dans un instant.";

/**
 * « Corriger cette information » (#169) : un dialogue rattaché au constat, prérempli, qui annonce ses effets.
 * Annuler, Échap ou l'enregistrement ramènent le focus sur le bouton de la ligne : le point de départ.
 * Un constat déjà corrigé montre la version remplacée et permet d'y revenir.
 */
export function FindingCorrection({ finding, previous }: { finding: { id: string; title: string; content: string; certainty: string }; previous: FindingPreviousVersion | null }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(finding.title);
  const [content, setContent] = useState(finding.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<CorrectionField | null>(null);
  const [status, setStatus] = useState("");
  const ids = { title: `correction-title-${finding.id}`, content: `correction-content-${finding.id}`, error: `correction-error-${finding.id}` };

  function show() {
    setTitle(finding.title);
    setContent(finding.content);
    setError(null);
    setInvalid(null);
    setStatus("");
    setOpen(true);
  }

  function close(message?: string) {
    setOpen(false);
    if (message) setStatus(message);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    setInvalid(null);
    try {
      const response = await fetch(`/api/entreprise/constats/${finding.id}/correction`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ title, content }) : undefined,
      });
      const data = (await response.json().catch(() => null)) as { error?: string; field?: string; missions?: number } | null;
      if (!response.ok) {
        const field = data?.field === "title" || data?.field === "content" ? data.field : null;
        setInvalid(field);
        setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
        if (field) requestAnimationFrame(() => document.getElementById(ids[field])?.focus());
        return;
      }
      const missions = typeof data?.missions === "number" ? data.missions : 0;
      close(method === "DELETE"
        ? "Constat remplacé restauré."
        : `Constat corrigé. ${missions === 0 ? "Aucune mission concernée." : `${missions} mission${missions > 1 ? "s" : ""} à réexaminer, rien n'est relancé.`}`);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const describedBy = (field: CorrectionField) => (invalid === field ? ids.error : undefined);
  const previousCertainty = previous && isCertainty(previous.certainty) ? CERTAINTY_LABELS[previous.certainty] : null;

  return (
    <>
      <button ref={trigger} type="button" className="small" onClick={show}><Icon name="pencil" />Corriger cette information<span className="sr-only"> : {finding.title}</span></button>
      <span className="sr-only" role="status">{status}</span>
      <Modal
        open={open}
        onClose={() => close()}
        kicker={`Constat · ${finding.certainty}`}
        title="Corriger cette information"
        actions={<button type="button" className="primary" disabled={busy} onClick={() => void send("POST")}>Enregistrer la correction</button>}
      >
        <label className="field" htmlFor={ids.title}>Constat</label>
        <input id={ids.title} value={title} maxLength={CORRECTION_BOUNDS.titleMax} aria-invalid={invalid === "title" || undefined} aria-describedby={describedBy("title")} onChange={(event) => setTitle(event.target.value)} />
        <label className="field" htmlFor={ids.content}>Détail</label>
        <textarea id={ids.content} rows={4} value={content} maxLength={CORRECTION_BOUNDS.contentMax} aria-invalid={invalid === "content" || undefined} aria-describedby={describedBy("content")} onChange={(event) => setContent(event.target.value)} />
        <small>Constat de {CORRECTION_BOUNDS.titleMin} à {CORRECTION_BOUNDS.titleMax} caractères, détail de {CORRECTION_BOUNDS.contentMin} à {CORRECTION_BOUNDS.contentMax}. Votre correction sera « Déclaré par vous ».</small>
        <p className="notice">{CORRECTION_EFFECTS}</p>
        {previous && (
          <section aria-label="Constat remplacé" className="flex flex-col gap-2">
            <h3>Constat remplacé</h3>
            <p><strong>{previous.title}</strong></p>
            <p className="small muted">{previousCertainty ?? "—"} · {previous.correctedAt ? `corrigé par vous le ${formatReadDate(previous.correctedAt)}` : `lu le ${formatReadDate(previous.createdAt)}`}</p>
            <p className="whitespace-pre-wrap small">{previous.content}</p>
            <p><button type="button" disabled={busy} onClick={() => void send("DELETE")}><Icon name="undo-2" />Revenir au constat remplacé</button></p>
          </section>
        )}
        {error && <p id={ids.error} role="alert" className="warning">{error}</p>}
      </Modal>
    </>
  );
}
