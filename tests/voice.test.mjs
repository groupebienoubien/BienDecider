import assert from "node:assert/strict";
import test from "node:test";
import { appendDictation, dictationErrorMessage, spokenText } from "../src/lib/voice.ts";

test("spoken text replaces known reference markers by their label and drops unknown ones", () => {
  const references = [{ marker: "[[bd:proposal:abc]]", type: "proposal", id: "abc", label: "Post de rentrée", href: "/dashboard" }];
  assert.equal(
    spokenText("Voyez [[bd:proposal:abc]] puis [[bd:lead:zzz]] **vite**.", references),
    "Voyez Post de rentrée puis vite.",
  );
});

test("dictation is appended to the existing draft within the field limit", () => {
  assert.equal(appendDictation("", "  bonjour Paul ", 100), "bonjour Paul");
  assert.equal(appendDictation("Question :  ", "où en est mon plan", 100), "Question : où en est mon plan");
  assert.equal(appendDictation("abc", "   ", 100), "abc");
  assert.equal(appendDictation("abcdef", "ghij", 8), "abcdef g");
});

test("dictation errors are explained, except a deliberate stop", () => {
  assert.equal(dictationErrorMessage("aborted"), null);
  assert.match(dictationErrorMessage("not-allowed") ?? "", /micro est refusé/);
  assert.match(dictationErrorMessage("quelque-chose-d-inconnu") ?? "", /La dictée a échoué/);
});
