import assert from "node:assert/strict";
import test from "node:test";
import { encodeStreamEvent, splitStreamEvents, streamPreview } from "../src/lib/chat-stream.ts";

test("stream events survive being cut at any byte boundary", () => {
  const wire = [
    encodeStreamEvent({ type: "delta", text: "Bon" }),
    encodeStreamEvent({ type: "reset" }),
    encodeStreamEvent({ type: "done", reply: "Bonjour", references: [] }),
  ].join("");
  for (let cut = 0; cut <= wire.length; cut++) {
    const first = splitStreamEvents(wire.slice(0, cut));
    const second = splitStreamEvents(first.rest + wire.slice(cut));
    assert.deepEqual([...first.events, ...second.events].map((event) => event.type), ["delta", "reset", "done"], `cut at ${cut}`);
    assert.equal(second.rest, "");
  }
});

test("unreadable or unknown lines are ignored", () => {
  const { events } = splitStreamEvents('pas du json\n{"type":"inconnu"}\n{"type":"delta"}\n{"type":"delta","text":"ok"}\n');
  assert.deepEqual(events, [{ type: "delta", text: "ok" }]);
});

test("the live preview never shows a link marker, even a partial one", () => {
  assert.equal(streamPreview("Voyez [[bd:proposal:abc]] ici"), "Voyez  ici");
  for (const partial of ["[", "[[", "[[b", "[[bd", "[[bd:", "[[bd:proposal:ab", "[[bd:proposal:abc]"]) {
    assert.equal(streamPreview(`Voyez ${partial}`), "Voyez ", partial);
  }
  assert.equal(streamPreview("Un [lien] normal"), "Un [lien] normal");
});
