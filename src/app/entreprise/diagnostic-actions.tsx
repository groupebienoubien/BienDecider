"use client";

import { openPaul } from "@/lib/paul-context";

/** « À discuter avec Paul » : un constat sans mission ouvre la conversation des sources sur ce constat. */
export function DiscussFinding({ id, title }: { id: string; title: string }) {
  return (
    <button type="button" className="small" onClick={() => openPaul({ type: "finding", id, title }, "sources")}>
      À discuter avec Paul<span className="sr-only"> : {title}</span>
    </button>
  );
}

/** « Questionner avec Paul » : la conversation du positionnement. */
export function AskPaulPositioning() {
  return <button type="button" onClick={() => openPaul(undefined, "positionnement")}>Questionner avec Paul</button>;
}
