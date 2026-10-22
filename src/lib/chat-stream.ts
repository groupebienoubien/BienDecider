import type { PaulReference } from "@/lib/paul-references";
import type { RunFailureReason } from "@/lib/agents/agent-errors";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

/** Évènements envoyés ligne par ligne pendant que Paul répond. `reset` annonce un nouveau tour après un appel d'outil. */
export type PaulStreamEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "done"; reply: string; references: PaulReference[] }
  | { type: "error"; error: string; reason?: RunFailureReason };

export function encodeStreamEvent(event: PaulStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function isStreamEvent(value: unknown): value is PaulStreamEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const event = value as Record<string, unknown>;
  if (event.type === "delta") return typeof event.text === "string";
  if (event.type === "reset") return true;
  if (event.type === "done") return typeof event.reply === "string" && Array.isArray(event.references);
  return event.type === "error" && typeof event.error === "string";
}

/** Découpe un tampon de lignes JSON : les lignes complètes sont décodées, la ligne partielle est rendue pour le tour suivant. */
export function splitStreamEvents(buffer: string): { events: PaulStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: PaulStreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isStreamEvent(parsed)) events.push(parsed);
    } catch {
      // ligne illisible : ignorée, la réponse finale ("done") reste la référence
    }
  }
  return { events, rest };
}

/** Texte affichable pendant la frappe : les marqueurs de lien, même incomplets, ne doivent jamais apparaître. */
export function streamPreview(content: string): string {
  return content
    .replace(/\[\[bd:[^\]]*\]\]/g, "")
    .replace(/\[\[?(?:b(?:d(?::[^\]]*\]?)?)?)?$/, "");
}
