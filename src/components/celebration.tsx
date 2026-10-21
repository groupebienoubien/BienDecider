"use client";

import { useEffect } from "react";
import { PersonaAvatar } from "@/components/persona-avatar";
import { Icon } from "@/components/icon";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";

const PUBLISHED: Record<string, string> = {
  social_post: "Votre post est en ligne sur votre Page Facebook.",
  site_web_content: "Votre page est en ligne.",
  gmail_email: "Votre email est parti.",
  prospecting_email: "Votre email est parti.",
};

const DURATION_MS = 6000;

/**
 * Moment de réussite (charte, section 5) : une publication confirmée est saluée par l'agent
 * qui l'a préparée, en accent chaud. Brève, refermable, sans animation si l'utilisateur
 * a demandé moins de mouvement (prefers-reduced-motion, géré en CSS).
 */
export function Celebration({ agent, kind, onClose }: { agent: string; kind: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  const key = agent in PERSONAS ? (agent as AgentKey) : "co_ceo";
  return (
    <div className="celebration" role="status" aria-live="polite">
      <span className="celebration-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      <PersonaAvatar agentKey={key} size={40} />
      <p><strong>{PERSONAS[key].name} :</strong> « C’est fait ! {PUBLISHED[kind] ?? "Votre production est diffusée."} »</p>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
    </div>
  );
}
