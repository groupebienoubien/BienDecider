import type { AgentKey } from "@/lib/agents/personas";

/**
 * Identité visuelle par agent : couleur + icône propre à son rôle (pas une
 * simple pastille générique). Toujours pas de photo réaliste de personne —
 * aucune génération d'image disponible dans cet environnement, et une
 * fausse photo de personne pour une IA serait trompeuse si elle sort un
 * jour du dashboard (cf. docs/backlog.md, décision actée avec le CEO).
 */
// Couleurs : jetons --bd-agent-* de globals.css (charte, section 3).
const STYLE: Record<AgentKey, { color: string; icon: React.ReactNode }> = {
  co_ceo: {
    color: "var(--bd-agent-co_ceo)",
    // Boussole : donne la direction
    icon: (
      <g fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="20" r="10" />
        <path d="M24 16l-6 6-2 6 6-2 6-6z" fill="white" stroke="none" />
      </g>
    ),
  },
  marketing: {
    color: "var(--bd-agent-marketing)",
    // Loupe : diagnostic, analyse
    icon: (
      <g fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="17" cy="17" r="8" />
        <path d="M23 23l6 6" />
      </g>
    ),
  },
  contenu: {
    color: "var(--bd-agent-contenu)",
    // Stylo : création de contenu
    icon: (
      <g fill="white">
        <path d="M14 26l-1.5 5.5L18 30l12-12-4.5-4.5z" />
        <path d="M26.5 10l4.5 4.5 2-2a2 2 0 0 0 0-2.8l-1.7-1.7a2 2 0 0 0-2.8 0z" />
      </g>
    ),
  },
  demarchage: {
    color: "var(--bd-agent-demarchage)",
    // Mallette : prospection, business
    icon: (
      <g fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="16" width="20" height="14" rx="2" />
        <path d="M15 16v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
        <path d="M10 23h20" />
      </g>
    ),
  },
};

export function PersonaAvatar({
  agentKey,
  size = 40,
}: {
  agentKey: AgentKey;
  size?: number;
}) {
  const { color, icon } = STYLE[agentKey];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className="shrink-0 rounded-full"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="20" style={{ fill: color }} />
      {icon}
    </svg>
  );
}
