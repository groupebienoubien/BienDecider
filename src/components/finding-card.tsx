"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { AskPaulButton } from "@/components/ask-paul-button";
import { ReadAloudButton } from "@/components/voice-controls";
import { spokenText } from "@/lib/voice";
import type { AuditFinding } from "@prisma/client";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { parseFindingActionItems, type FindingActionItem } from "@/lib/finding-shared";

const CATEGORY_LABELS: Record<string, string> = {
  site_web: "Site web",
  reseaux_sociaux: "Réseaux sociaux",
  concurrence: "Concurrence",
};

/**
 * Carte compacte + pop-up de détail structuré (ce qui est bien / ce qu'il
 * faut améliorer / plan d'action) — cf. docs/backlog.md "lisibilité des
 * constats". Les constats créés avant cette structuration n'ont que
 * `content` : affiché tel quel dans la pop-up, en repli.
 */
export function FindingCard({ finding }: { finding: AuditFinding }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const actionItems = parseFindingActionItems(finding.actionItems);
  const hasStructure = Boolean(finding.whatWorks || finding.toImprove || actionItems.length > 0);
  const findingSpeech = spokenText(hasStructure
    ? [finding.title, finding.whatWorks && `Ce qui est bien : ${finding.whatWorks}`, finding.toImprove && `Ce qu'il faut améliorer : ${finding.toImprove}`, ...actionItems.map((item) => `Recommandation : ${item.title}`)].filter(Boolean).join(". ")
    : `${finding.title}. ${finding.content}`);

  return (
    <>
      <button
        id={`finding-${finding.id}`}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="scroll-mt-24 w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <span className="text-xs uppercase text-slate-600">{CATEGORY_LABELS[finding.category] ?? finding.category}</span>
        <h3 className="font-medium">{finding.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{finding.content}</p>
        {finding.sourceUrl && <p className="mt-1 text-xs text-slate-500">Source {finding.sourceStatus ?? "à vérifier"}</p>}
        <span className="mt-1 inline-block text-xs text-indigo-600">Voir le détail →</span>
      </button>
      <AskPaulButton element={{ type: "finding", id: finding.id, title: finding.title }} />

      <dialog ref={dialogRef} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs uppercase text-slate-600">{CATEGORY_LABELS[finding.category] ?? finding.category}</span>
                <h2 id={titleId} className="text-lg font-semibold">{finding.title}</h2>
              </div>
              <button onClick={() => dialogRef.current?.close()} className="min-h-11 shrink-0 px-2 text-sm text-slate-700 hover:text-slate-900">
                Fermer
              </button>
            </div>
            <ReadAloudButton text={findingSpeech} label="Écouter ce constat" />
            {finding.sourceUrl && <p className="mt-3 break-all text-xs text-slate-600">Source ({finding.sourceStatus ?? "à vérifier"}) : <a href={finding.sourceUrl} target="_blank" rel="noreferrer" className="underline">{finding.sourceUrl}</a></p>}

            {hasStructure ? (
              <div className="mt-4 space-y-4">
                {finding.whatWorks && (
                  <section>
                    <h3 className="text-sm font-medium text-emerald-700">✓ Ce qui est bien</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{finding.whatWorks}</p>
                  </section>
                )}
                {finding.toImprove && (
                  <section>
                    <h3 className="text-sm font-medium text-amber-700">Ce qu&apos;il faut améliorer</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{finding.toImprove}</p>
                  </section>
                )}
                {actionItems.length > 0 && (
                  <section>
                    <h3 className="text-sm font-medium text-indigo-700">Recommandations</h3>
                    <ul className="mt-2 space-y-2">
                      {actionItems.map((item, i) => (
                        <ActionItemRow key={i} item={item} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{finding.content}</p>
            )}
      </dialog>
    </>
  );
}

function ActionItemRow({ item }: { item: FindingActionItem }) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const persona = PERSONAS[item.agent as Exclude<AgentKey, "co_ceo">];

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
    <li className="border-t border-slate-200 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-600">{persona?.name ?? item.agent}</p>
          <p className="text-sm font-medium">{item.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{item.rationale}</p>
        </div>
        <button
          onClick={addToPlan}
          disabled={status === "saving" || status === "done"}
          className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800 disabled:opacity-60"
        >
          {status === "done" ? "Ajouté ✓" : status === "saving" ? "…" : status === "error" ? "Réessayer" : "Ajouter au plan"}
        </button>
      </div>
      {status === "done" && <Link href="/dashboard" className="mt-2 inline-block text-xs text-indigo-600 underline">Voir dans le plan d&apos;action</Link>}
    </li>
  );
}
