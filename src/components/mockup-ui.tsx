import type { CSSProperties, ReactNode } from "react";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";

/** En-tête de page de la maquette : surtitre, titre Sora, description et actions. */
export function PageHeading({ kicker, title, description, actions }: { kicker: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{kicker}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{children}</div>;
}

/**
 * Carte de décision de la charte (docs/charte.md, section 6) : trois informations
 * visibles (qui, quoi, quelle décision), le reste replié dans `details`.
 * Le liseré et le nom prennent la couleur de l'agent.
 */
export function DecisionCard({ agent, byline, title, action, details, detailsLabel = "Détails" }: { agent: string; byline?: string; title: ReactNode; action: ReactNode; details?: ReactNode; detailsLabel?: string }) {
  const key = agent in PERSONAS ? (agent as AgentKey) : null;
  return (
    <article className="decision-card" style={key ? ({ "--agent": `var(--bd-agent-${key})` } as CSSProperties) : undefined}>
      {key ? <PersonaAvatar agentKey={key} size={36} /> : <span aria-hidden="true" />}
      <div>
        <span className="agent-line"><span className="agent-name">{key ? PERSONAS[key].name : agent}</span>{byline && <> {byline}</>}</span>
        <h3>{title}</h3>
      </div>
      {action}
      {details && <details><summary>{detailsLabel}</summary>{details}</details>}
    </article>
  );
}

/** Signature d'agent : avatar, nom à sa couleur, puis ce qu'il fait (« vous propose un post Facebook »). */
export function AgentByline({ agent, children, size = 20 }: { agent: string; children?: ReactNode; size?: number }) {
  const key = agent in PERSONAS ? (agent as AgentKey) : null;
  return (
    <span className="agent-byline" style={key ? ({ "--agent": `var(--bd-agent-${key})` } as CSSProperties) : undefined}>
      {key && <PersonaAvatar agentKey={key} size={size} />}
      <span><span className="agent-name">{key ? PERSONAS[key].name : agent}</span>{children && <> {children}</>}</span>
    </span>
  );
}

/**
 * État vide incarné (charte, section 5) : l'illustration de l'agent concerné, sa phrase
 * à la première personne, puis l'action utile.
 */
export function EmptyState({ agent, title, says, label, role, children }: { agent: AgentKey; title: ReactNode; says: ReactNode; label?: string; role?: string; children?: ReactNode }) {
  return (
    <div className="empty empty-agent" role={role} aria-label={label} style={{ "--agent": `var(--bd-agent-${agent})` } as CSSProperties}>
      <span className="empty-illustration"><PersonaAvatar agentKey={agent} size={56} /></span>
      <h3>{title}</h3>
      <p className="empty-says"><span className="agent-name">{PERSONAS[agent].name}</span> « {says} »</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

export type TagColor = "green" | "orange" | "blue" | "gray" | "red";

export function Tag({ color = "gray", children }: { color?: TagColor; children: ReactNode }) {
  return <span className={`tag ${color}`}>{children}</span>;
}
