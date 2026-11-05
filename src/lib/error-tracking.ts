import { prisma } from "@/lib/prisma";
import { listAdminEmails } from "@/lib/admin";
import { appBaseUrl, sendServiceEmail } from "@/lib/service-mail";
import { ERROR_ALERT_WINDOW_MS, ERROR_RETENTION_DAYS, cleanErrorMessage, cleanErrorPath, errorAlertEmail, errorFingerprint } from "@/lib/error-tracking-rules";

type ServerErrorInput = {
  error: unknown;
  request: { path: string; method: string };
  context: { routePath?: string; routeType?: string };
};

/**
 * Trace une erreur serveur et prévient les administrateurs, une fois par erreur et par heure (story 8.1).
 * Ne lève jamais : un suivi en panne ne doit pas aggraver l'erreur qu'il décrit.
 */
export async function recordServerError({ error, request, context }: ServerErrorInput, now = new Date()): Promise<void> {
  try {
    const message = cleanErrorMessage(error);
    const path = cleanErrorPath(request.path);
    const method = request.method.toUpperCase().slice(0, 10);
    const fingerprint = errorFingerprint(message, context.routePath ?? path, method);
    const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest).slice(0, 40) : null;

    const recent = await prisma.errorEvent.findFirst({ where: { fingerprint, createdAt: { gte: new Date(now.getTime() - ERROR_ALERT_WINDOW_MS) } }, select: { id: true } });
    await prisma.errorEvent.create({ data: { fingerprint, message, path, method, routeType: context.routeType?.slice(0, 20) ?? null, digest } });
    if (Math.random() < 0.02) {
      await prisma.errorEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000) } } });
    }
    if (recent) return;

    const content = errorAlertEmail({ message, path, method }, `${appBaseUrl()}/admin`);
    for (const to of listAdminEmails()) await sendServiceEmail({ to, ...content });
  } catch (failure) {
    console.error("Suivi des erreurs impossible:", failure instanceof Error ? failure.name : "erreur inconnue");
  }
}
