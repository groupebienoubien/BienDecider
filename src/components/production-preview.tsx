"use client";

import { useEffect, useState } from "react";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { proposalChannel } from "@/lib/proposal-channel";

function companyInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toLocaleUpperCase()).join("");
}

/** Aperçu de la production selon son canal (Facebook, mail, site), comme dans la maquette. */
export function ProductionPreview({ kind, title, content, version, companyName, siteDestination }: {
  kind: string;
  title: string;
  content: string;
  version: number;
  companyName: string;
  siteDestination?: string | null;
}) {
  const channel = proposalChannel(kind);
  if (channel === "Facebook") {
    return (
      <div className="preview">
        <div className="social-header"><span className="company-avatar" aria-hidden="true">{companyInitials(companyName)}</span><div><strong>{companyName}</strong><small>Page Facebook · Public</small></div></div>
        <div className="social-copy">{content}</div>
        <div className="social-footer"><span>J’aime</span><span>Commenter</span><span>Partager</span></div>
      </div>
    );
  }
  if (channel === "Gmail") {
    let recipient: string | null = null;
    let text = content;
    if (kind === "gmail_email") {
      try {
        const message: unknown = JSON.parse(content);
        if (message && typeof message === "object" && "to" in message && "text" in message && typeof message.to === "string" && typeof message.text === "string") {
          recipient = message.to;
          text = message.text;
        }
      } catch { /* contenu brut conservé */ }
    }
    return (
      <div className="preview">
        <div className="email-meta">
          {recipient && <div><span>À</span> {recipient}</div>}
          <div><span>Objet</span> {title}</div>
        </div>
        <div className="email-copy">{text}</div>
      </div>
    );
  }
  if (channel === "Site") {
    return (
      <div className="preview site-preview">
        <div className="site-nav">{companyName.toLocaleUpperCase()} <span>Collection / Contact</span></div>
        <h3>{title}</h3>
        <p>{content}</p>
        <div className="social-footer">{siteDestination ?? "Site public de votre entreprise"} · Version {version}</div>
      </div>
    );
  }
  return (
    <div className="preview">
      <div className="email-copy">{content}</div>
    </div>
  );
}

type PreviousRevision = { fromVersion: number; previousContent: string; source: string; instruction: string | null; createdAt: string };
type PreviousState = { key: string } & ({ status: "loaded"; revision: PreviousRevision | null } | { status: "error" });

/** Qui a écrit la version suivante de cette version précédente. */
function revisedBy(revision: PreviousRevision, agentName: string) {
  return revision.source === "owner" ? "modifiée par vous" : `révisée par ${agentName}${revision.instruction ? ` : ${revision.instruction}` : ""}`;
}

/**
 * Version précédente d'une production (story 3.3) : la dernière version
 * conservée (révision par l'agent ou modification du dirigeant), lue dès
 * qu'une production dépasse la version 1 et relue à chaque nouvelle version.
 * Une ligne « Révisée par {agent} : {consigne} » s'affiche sur une version
 * écrite par l'agent ; le contenu précédent est replié par défaut.
 */
export function PreviousVersion({ proposalId, agent, version, kind, title, companyName, siteDestination }: {
  proposalId: string;
  agent: string;
  version: number;
  kind: string;
  title: string;
  companyName: string;
  siteDestination?: string | null;
}) {
  const key = `${proposalId}:${version}`;
  const [loaded, setLoaded] = useState<PreviousState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const agentName = PERSONAS[agent as AgentKey]?.name ?? "l’agent";

  useEffect(() => {
    if (version <= 1) return;
    let cancelled = false;
    fetch(`/api/proposals/${proposalId}/revisions`)
      .then(async (response) => {
        if (!response.ok) throw new Error("revision");
        const data = await response.json() as { revision: PreviousRevision | null };
        if (!cancelled) setLoaded({ key, status: "loaded", revision: data.revision });
      })
      .catch(() => { if (!cancelled) setLoaded({ key, status: "error" }); });
    return () => { cancelled = true; };
  }, [key, proposalId, version, attempt]);

  if (version <= 1) return null;
  // État d'une autre production ou d'une autre version : relecture en cours.
  const state = loaded?.key === key ? loaded : null;
  if (state?.status === "error") {
    return <p role="status" className="legend">La version précédente n’a pas pu être chargée. <button type="button" className="text-link" onClick={() => setAttempt((value) => value + 1)}>Réessayer</button></p>;
  }
  // Aucune version conservée (antérieure à l'historique) : rien à montrer.
  if (state && !state.revision) return null;
  const revision = state?.revision ?? null;
  const current = revision && revision.fromVersion === version - 1;
  return (
    <>
      {current && revision.source === "agent" && <p className="legend">Révisée par {agentName}{revision.instruction ? <> : <span className="whitespace-pre-wrap break-words">{revision.instruction}</span></> : null}</p>}
      <details className="previous-version">
        <summary>Voir la version précédente</summary>
        {!revision && <p role="status">Chargement de la version précédente…</p>}
        {revision && <>
          <p><strong>Version {revision.fromVersion}</strong> · version {revision.fromVersion + 1} {revisedBy(revision, agentName)}</p>
          <ProductionPreview kind={kind} title={title} content={revision.previousContent} version={revision.fromVersion} companyName={companyName} siteDestination={siteDestination} />
        </>}
      </details>
    </>
  );
}
