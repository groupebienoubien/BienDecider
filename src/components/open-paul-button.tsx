"use client";

import { openPaul } from "@/lib/paul-context";

export function OpenPaulButton({ children = "Échanger", className }: { children?: React.ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={() => openPaul()}>{children}</button>;
}
