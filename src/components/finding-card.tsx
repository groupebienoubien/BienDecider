"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditFinding } from "@prisma/client";
import { Icon, type IconName } from "@/components/icon";
import { Modal } from "@/components/modal";
import { AgentByline, Tag } from "@/components/mockup-ui";
import { ReadAloudButton } from "@/components/voice-controls";
import { spokenText } from "@/lib/voice";
import { openPaul } from "@/lib/paul-context";
import { parseFindingActionItems, type FindingActionItem } from "@/lib/finding-shared";
import { isPositiveFinding } from "@/lib/diagnostic-groups";

const CATEGORY_LABELS: Record<string, string> = {
  site_web: "Site web",
  reseaux_sociaux: "Réseaux sociaux",
  concurrence: "Concurrence",
};

export const CATEGORY_ICONS: Record<string, IconName> = {
  site_web: "panel-top",
  reseaux_sociaux: "messages-square",
  concurrence: "eye",
};

/**
 * Ligne de diagnostic de la maquette + fenêtre de détail structuré (ce qui est bien / ce qu'il
 * faut améliorer / plan d'action) — cf. docs/backlog.md "lisibilité des constats". Les constats
 * créés avant cette structuration n'ont que `content` : affiché tel quel dans la fenêtre, en repli.
 */
export function FindingCard({ finding }: { finding: AuditFinding }) {
  const [open, setOpen] = useState(false);
  const actionItems = parseFindingActionItems(finding.actionItems);
  const hasStructure = Boolean(finding.whatWorks || finding.toImprove || actionItems.length > 0);
  const findingSpeech = spokenText(hasStructure
    ? [finding.title, finding.whatWorks && `Ce qui est bien : ${finding.whatWorks}`, finding.toImprove && `Ce qu'il faut améliorer : ${finding.toImprove}`, ...actionItems.map((item) => `Recommandation : ${item.title}`)].filter(Boolean).join(". ")
    : `${finding.title}. ${finding.content}`);
  const category = CATEGORY_LABELS[finding.category] ?? finding.category;
  const positive = isPositiveFinding(finding);
  const safeSource = finding.sourceUrl && /^https?:\/\//i.test(finding.sourceUrl) ? finding.sourceUrl : null;

  return (
    <>
      {/* Charte : le titre et son état visibles ; texte, source et recommandations dans le détail. */}
      <article id={`finding-${finding.id}`} className="finding-row">
        <div>
          <Tag color={positive ? "green" : "orange"}>{positive ? "Point positif" : "À renforcer"}</Tag>
          <h3>{finding.title}</h3>
        </div>
        <div className="finding-actions">
          <button type="button" onClick={() => setOpen(true)}>Voir le détail<span className="sr-only"> : {finding.title}</span></button>
          <button type="button" className="icon-button" onClick={() => openPaul({ type: "finding", id: finding.id, title: finding.title })} aria-label={`Demander à Paul : ${finding.title}`} title="Demander à Paul"><Icon name="message-circle" /></button>
        </div>
      </article>

      <Modal open={open} onClose={() => setOpen(false)} kicker={category.toLocaleUpperCase("fr-FR")} title={finding.title} cancelLabel="Fermer">
        <ReadAloudButton text={findingSpeech} label="Écouter ce constat" />
        {safeSource && <p>Source ({finding.sourceStatus ?? "à vérifier"}) : <a href={safeSource} target="_blank" rel="noreferrer" className="break-all">{safeSource}</a></p>}
        {hasStructure ? (
          <>
            <p className="whitespace-pre-wrap">{finding.content}</p>
            {finding.whatWorks && <><h3>Ce qui est bien</h3><p className="whitespace-pre-wrap">{finding.whatWorks}</p></>}
            {finding.toImprove && <><h3>Ce qu’il faut améliorer</h3><p className="whitespace-pre-wrap">{finding.toImprove}</p></>}
            {actionItems.length > 0 && <>
              <h3>Recommandations</h3>
              {actionItems.map((item, i) => <ActionItemRow key={i} item={item} />)}
            </>}
          </>
        ) : (
          <p className="whitespace-pre-wrap">{finding.content}</p>
        )}
      </Modal>
    </>
  );
}

function ActionItemRow({ item }: { item: FindingActionItem }) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function addToPlan() {
    setStatus("saving");
    try {
      const res = await fetch("/api/action-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: item.agent, title: item.title, rationale: item.rationale, theme: item.theme, priority: item.priority }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="activity-row">
      <div>
        <small><AgentByline agent={item.agent}>propose</AgentByline></small>
        <strong>{item.title}</strong>
        <small>{item.rationale}</small>
        {status === "done" && <Link className="text-link" href="/dashboard?view=plan">Voir dans le plan d’action</Link>}
      </div>
      <button type="button" onClick={addToPlan} disabled={status === "saving" || status === "done"}>
        {status === "done" ? "Ajouté ✓" : status === "saving" ? "…" : status === "error" ? "Réessayer" : "Ajouter au plan"}
      </button>
    </div>
  );
}
