"use client";

import { PersonaAvatar } from "@/components/persona-avatar";
import { Icon } from "@/components/icon";
import { openPaul } from "@/lib/paul-context";
import { spokenText } from "@/lib/voice";
import { dayLabel } from "@/lib/chat-format";

const EXCERPT_LENGTH = 180;

/**
 * Résumé de la conversation avec Paul sur l'accueil (charte, section 3) : il n'y a
 * qu'une conversation, dans le panneau ; ce bloc en montre le dernier message et l'ouvre.
 */
export function PaulSummary({ lastMessage }: { lastMessage: { content: string; createdAt: string } | null }) {
  const text = lastMessage ? spokenText(lastMessage.content) : "";
  const excerpt = text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
  return (
    <aside className="paul-summary" aria-label="Conversation avec Paul">
      <header>
        <PersonaAvatar agentKey="co_ceo" size={32} />
        <div>
          <strong>Paul</strong>
          <small>{lastMessage ? `Dernier message · ${dayLabel(lastMessage.createdAt)}` : "Partenaire de croissance"}</small>
        </div>
      </header>
      <p>{excerpt || "Une question sur vos priorités, une production ou un prospect ? Paul connaît votre plan et la page où vous êtes."}</p>
      <button type="button" onClick={() => openPaul()}>
        <Icon name="message-circle" /> {lastMessage ? "Reprendre la conversation" : "Démarrer la conversation"}
      </button>
    </aside>
  );
}
