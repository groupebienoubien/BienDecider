import { createTransport } from "nodemailer";
import { z } from "zod";

// E-mails du service (confirmation d'adresse, mot de passe oublié, bilans) : SMTP du domaine biendecider.com.
// Configuration par variables d'environnement, jamais dans le dépôt ni dans les journaux :
//   SERVICE_SMTP_URL  (secret) ex. smtps://utilisateur:motdepasse@smtp.fournisseur.example:465
//   SERVICE_MAIL_FROM expéditeur, ex. BienDecider <noreply@biendecider.com>
//   APP_BASE_URL      adresse publique des liens, repli https://www.biendecider.com
// Distinct de l'envoi Gmail, qui part au nom du dirigeant (src/lib/oauth/gmail.ts).

const DEFAULT_BASE_URL = "https://www.biendecider.com";

const noLineBreak = (value: string) => !/[\r\n]/.test(value);

const messageSchema = z.object({
  to: z.email().max(254).refine(noLineBreak),
  subject: z.string().trim().min(1).max(200).refine(noLineBreak),
  text: z.string().trim().min(1).max(20000),
});

export type ServiceMailResult = "sent" | "not_configured" | "failed";

export function isServiceMailConfigured(): boolean {
  return Boolean(process.env.SERVICE_SMTP_URL?.trim() && process.env.SERVICE_MAIL_FROM?.trim());
}

/** Adresse publique des liens des e-mails : jamais déduite des en-têtes de la requête (injection d'en-tête Host). */
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!configured) return DEFAULT_BASE_URL;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" || url.protocol === "http:" ? configured : DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export async function sendServiceEmail(message: { to: string; subject: string; text: string }): Promise<ServiceMailResult> {
  if (!isServiceMailConfigured()) {
    console.warn("E-mail du service non envoyé : SERVICE_SMTP_URL ou SERVICE_MAIL_FROM n'est pas configuré.");
    return "not_configured";
  }
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) return "failed";
  try {
    const transport = createTransport({
      url: process.env.SERVICE_SMTP_URL!.trim(),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({ from: process.env.SERVICE_MAIL_FROM!.trim(), to: parsed.data.to, subject: parsed.data.subject, text: parsed.data.text });
    return "sent";
  } catch (error) {
    // Ni l'URL SMTP (identifiants), ni le destinataire ne sont journalisés.
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "inconnu";
    console.warn(`Envoi d'un e-mail du service impossible (code ${code}).`);
    return "failed";
  }
}
