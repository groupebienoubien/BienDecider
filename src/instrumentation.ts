import type { Instrumentation } from "next";

// Erreurs serveur de toutes les routes et pages (story 8.1) ; le suivi tourne dans le runtime Node, celui de la base.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("@/lib/error-tracking");
  await recordServerError({ error, request, context });
};
