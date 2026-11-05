import { createEmailToken } from "@/lib/email-tokens";
import { sendServiceEmail, type ServiceMailResult } from "@/lib/service-mail";
import { verificationEmail, verificationLink } from "@/lib/service-mail-templates";

/** Crée un lien de confirmation (annule les précédents) et l'envoie à l'adresse du compte. */
export async function sendVerificationEmail(company: { id: string; ownerEmail: string }): Promise<ServiceMailResult> {
  const token = await createEmailToken(company.id, "verify_email");
  return sendServiceEmail({ to: company.ownerEmail, ...verificationEmail(verificationLink(token)) });
}
