"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icon";

/** Fenêtre modale de la maquette (élément dialog natif : focus et Échap gérés par le navigateur). */
export function Modal({ open, onClose, kicker, title, children, actions, cancelLabel = "Annuler" }: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  cancelLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose}>
      {open && (
        <div className="modal-content">
          <div className="modal-top">
            <div className="eyebrow">{kicker}</div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer" title="Fermer"><Icon name="x" /></button>
          </div>
          <h2 id={titleId}>{title}</h2>
          {children}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{cancelLabel}</button>
            {actions}
          </div>
        </div>
      )}
    </dialog>
  );
}
