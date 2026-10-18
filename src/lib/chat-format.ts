import type { PaulReference } from "@/lib/paul-references";

// Mise en forme minimale des réponses de Paul. Tout est rendu en éléments React : jamais de HTML ni d'URL issus du texte.

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "marker"; marker: string };

export type Block =
  | { type: "paragraph" | "heading"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string };

const MARKER_SOURCE = "\\[\\[bd:(?:proposal|finding|lead):[A-Za-z0-9_-]{1,100}\\]\\]";
const INLINE_SOURCE = `(${MARKER_SOURCE})|\\*\\*(.+?)\\*\\*|\`([^\`\\n]+)\`|\\*([^*\\s](?:[^*\\n]*?[^*\\s])?)\\*`;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  const pattern = new RegExp(INLINE_SOURCE, "g");
  let cursor = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > cursor) nodes.push({ type: "text", text: text.slice(cursor, match.index) });
    if (match[1]) nodes.push({ type: "marker", marker: match[1] });
    else if (match[2]) nodes.push({ type: "bold", children: parseInline(match[2]) });
    else if (match[3]) nodes.push({ type: "code", text: match[3] });
    else nodes.push({ type: "italic", children: parseInline(match[4]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push({ type: "text", text: text.slice(cursor) });
  return nodes;
}

const LIST_ITEM = /^\s*(?:([-*•])|(\d{1,3})[.)])\s+(.*)$/;

export function parseMessage(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", inline: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence) {
      if (line.trim().startsWith("```")) { blocks.push({ type: "code", text: fence.join("\n") }); fence = null; }
      else fence.push(line);
      continue;
    }
    if (line.trim().startsWith("```")) { flushParagraph(); flushList(); fence = []; continue; }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); blocks.push({ type: "heading", inline: parseInline(heading[1]) }); continue; }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = Boolean(item[2]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(item[3]);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    flushList();
    paragraph.push(line);
  }
  // Un bloc de code encore ouvert (réponse en cours) s'affiche déjà comme du code.
  if (fence) blocks.push({ type: "code", text: (fence as string[]).join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

/** Texte copié : les marqueurs de lien deviennent le nom de l'objet cité, ou disparaissent s'ils sont inconnus. */
export function plainMessage(content: string, references: PaulReference[] = []): string {
  const labels = new Map(references.map((reference) => [reference.marker, reference.label]));
  return content.replace(new RegExp(MARKER_SOURCE, "g"), (marker) => labels.get(marker) ?? "").replace(/[ \t]+\n/g, "\n").trim();
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) return "Aujourd'hui";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Hier";
  return date.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
