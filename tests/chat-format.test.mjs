import assert from "node:assert/strict";
import test from "node:test";
import { dayKey, dayLabel, parseInline, parseMessage, plainMessage } from "../src/lib/chat-format.ts";

test("a reply is split into paragraphs, headings, lists and code without any HTML", () => {
  const blocks = parseMessage("## Priorités\nVoici **trois** points :\n\n- Le *site*\n- Les `avis`\n\n1. Valider\n2. Publier\n\n```\n<script>alert(1)</script>\n```");
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "code"]);
  const [, paragraph, bullets, numbers, code] = blocks;
  assert.deepEqual(paragraph.type === "paragraph" && paragraph.inline.map((node) => node.type), ["text", "bold", "text"]);
  assert.equal(bullets.type === "list" && bullets.ordered, false);
  assert.equal(numbers.type === "list" && numbers.ordered, true);
  assert.equal(code.type === "code" && code.text, "<script>alert(1)</script>");
});

test("link markers become marker nodes and unfinished emphasis stays literal while streaming", () => {
  assert.deepEqual(parseInline("Voyez [[bd:proposal:abc]] ici"), [
    { type: "text", text: "Voyez " }, { type: "marker", marker: "[[bd:proposal:abc]]" }, { type: "text", text: " ici" },
  ]);
  assert.deepEqual(parseInline("un **gras en cours"), [{ type: "text", text: "un **gras en cours" }]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ type: "text", text: "2 * 3 * 4" }]);
  const open = parseMessage("```\nligne en cours");
  assert.deepEqual(open, [{ type: "code", text: "ligne en cours" }]);
});

test("copied text keeps the object names and drops unknown markers", () => {
  const references = [{ marker: "[[bd:lead:z]]", type: "lead", id: "z", label: "Association suivie", href: "/prospection" }];
  assert.equal(plainMessage("À contacter : [[bd:lead:z]] puis [[bd:finding:q]] \nFin", references), "À contacter : Association suivie puis\nFin");
});

test("days are labelled relative to today", () => {
  const now = new Date(2026, 9, 18, 15, 0);
  assert.equal(dayLabel(new Date(2026, 9, 18, 8, 0).toISOString(), now), "Aujourd'hui");
  assert.equal(dayLabel(new Date(2026, 9, 17, 23, 0).toISOString(), now), "Hier");
  assert.match(dayLabel(new Date(2026, 9, 12, 9, 0).toISOString(), now), /12 octobre/);
  assert.match(dayLabel(new Date(2025, 11, 31, 9, 0).toISOString(), now), /2025/);
  assert.notEqual(dayKey(new Date(2026, 9, 17, 23, 59).toISOString()), dayKey(new Date(2026, 9, 18, 0, 1).toISOString()));
});
