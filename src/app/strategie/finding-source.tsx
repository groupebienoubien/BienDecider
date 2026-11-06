"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { openPaul } from "@/lib/paul-context";
import { CERTAINTY_DETAILS, CERTAINTY_LABELS, FINDING_CATEGORY_LABELS, findingOrigin, formatReadDate, safeSourceUrl, type MissionSourceFinding } from "@/lib/findings/certainty";

/**
 * « Voir la source » d'une mission reliée à un constat (#168) : titre, type, contenu, origine, date de lecture,
 * incertitude et lien (http(s) seulement). « Questionner ce constat » ouvre Paul dans la conversation des sources.
 */
export function FindingSource({ source }: { source: MissionSourceFinding }) {
  const [open, setOpen] = useState(false);
  const category = FINDING_CATEGORY_LABELS[source.category] ?? source.category;
  const link = safeSourceUrl(source.sourceUrl);

  function question() {
    setOpen(false);
    openPaul({ type: "finding", id: source.id, title: source.title }, "sources");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Voir la source<span className="sr-only"> : {source.title}</span></button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        kicker={`Constat · ${CERTAINTY_LABELS[source.certainty]}`}
        title={source.title}
        cancelLabel="Fermer"
        actions={<button type="button" onClick={question}>Questionner ce constat</button>}
      >
        <p className="whitespace-pre-wrap">{source.content}</p>
        <dl className="decision-reasons">
          <div><dt>Type</dt><dd>{category}</dd></div>
          <div><dt>Origine</dt><dd>{findingOrigin(source.category, source.sourceUrl)}</dd></div>
          <div><dt>Lu le</dt><dd>{formatReadDate(source.createdAt)}</dd></div>
          <div><dt>Incertitude</dt><dd>{CERTAINTY_DETAILS[source.certainty]}</dd></div>
          {link && <div><dt>Source{source.sourceStatus ? ` (${source.sourceStatus})` : ""}</dt><dd><a href={link} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{link}</a></dd></div>}
        </dl>
      </Modal>
    </>
  );
}
