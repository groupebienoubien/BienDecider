import type { ReactNode } from "react";

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

export type TagColor = "green" | "orange" | "blue" | "gray" | "red";

export function Tag({ color = "gray", children }: { color?: TagColor; children: ReactNode }) {
  return <span className={`tag ${color}`}>{children}</span>;
}
