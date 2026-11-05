"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/modal";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABELS, FEEDBACK_TEXT_MAX, type FeedbackKind } from "@/lib/feedback";

/** « Signaler un problème » : action secondaire du pied de page de toutes les pages connectées (story 7.4). */
export function FeedbackDialog() {
  const pathname = usePathname();
  // La fenêtre est rendue dans la coque (.mq) pour garder ses styles, hors du pied de page dont les boutons sont des liens.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const anchor = useCallback((element: HTMLButtonElement | null) => { if (element) setPortalTarget(element.closest(".mq")); }, []);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function show() {
    setKind("problem");
    setText("");
    setSent(false);
    setError("");
    setOpen(true);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text, page: pathname }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'envoyer votre signalement.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'envoyer votre signalement.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button ref={anchor} type="button" onClick={show}>Signaler un problème</button>
      {portalTarget && createPortal(
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          kicker="Votre avis"
          title="Signaler un problème"
          cancelLabel={sent ? "Fermer" : "Annuler"}
          actions={!sent && <button type="submit" form="feedback-form" className="btn primary" disabled={sending || text.trim().length === 0}>{sending ? "Envoi…" : "Envoyer"}</button>}
        >
          {sent ? (
            <p role="status">Merci, votre message est bien transmis à l&apos;équipe BienDecider.</p>
          ) : (
            <form id="feedback-form" onSubmit={send} className="stack">
              <p>Dites-nous ce qui ne va pas, ce qui prête à confusion ou l&apos;idée qui vous manque. Nous le lisons.</p>
              <label className="field">
                Type de signalement
                <select value={kind} onChange={(event) => setKind(event.target.value as FeedbackKind)}>
                  {FEEDBACK_KINDS.map((value) => <option key={value} value={value}>{FEEDBACK_KIND_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="field">
                Votre message
                <textarea required rows={5} maxLength={FEEDBACK_TEXT_MAX} value={text} onChange={(event) => setText(event.target.value)} />
              </label>
              <small>{text.length} / {FEEDBACK_TEXT_MAX} caractères. La page où vous êtes est jointe automatiquement ; aucune capture d&apos;écran.</small>
              {error && <p role="alert" className="warning">{error}</p>}
            </form>
          )}
        </Modal>,
        portalTarget,
      )}
    </>
  );
}
