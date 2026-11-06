import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer";
import { z } from "zod";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_CALLBACK = "/api/oauth/gmail/callback";
const gmailAccountSchema = z.object({ token: z.string().min(1), email: z.email() });

export const gmailMessageSchema = z.object({
  to: z.email().max(254).refine((value) => !/[\r\n]/.test(value)),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  text: z.string().trim().min(1).max(20000),
  confirmed: z.literal(true),
});

function encryptionKey() {
  const value = process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Clé de chiffrement OAuth non configurée.");
  return Buffer.from(value, "hex");
}

export function isGmailConfigured() {
  return Boolean(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET &&
    /^[a-f0-9]{64}$/i.test(process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? ""));
}

export function gmailClient(redirectUri?: string) {
  if (!isGmailConfigured()) throw new Error("Gmail non configuré côté serveur.");
  return new OAuth2Client({
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
    redirectUri,
  });
}

export function buildGmailAuthUrl(redirectUri: string, state: string, codeChallenge: string) {
  return gmailClient(redirectUri).generateAuthUrl({
    scope: [GMAIL_SCOPE, "openid", "email"], access_type: "offline", prompt: "consent select_account",
    state, code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
  });
}

export function encryptGmailToken(token: string, companyId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`gmail:${companyId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGmailToken(value: string, companyId: string) {
  const [version, nonce, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext) throw new Error("Jeton Gmail invalide.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`gmail:${companyId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function decryptGmailAccount(value: string, companyId: string) {
  return gmailAccountSchema.parse(JSON.parse(decryptGmailToken(value, companyId)));
}

/** Retire l'autorisation chez Google. Ne lève jamais : l'effacement local ne doit pas en dépendre. */
export async function revokeGmailConnection(connection: { refreshToken: string | null; accessToken: string | null } | null, companyId: string): Promise<boolean> {
  try {
    const encrypted = connection?.refreshToken ?? connection?.accessToken;
    if (!connection || !encrypted) return false;
    const token = connection.refreshToken ? decryptGmailAccount(connection.refreshToken, companyId).token : decryptGmailToken(encrypted, companyId);
    await gmailClient().revokeToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function buildGmailMessage(message: z.infer<typeof gmailMessageSchema>, sender: string) {
  const validated = gmailMessageSchema.parse(message);
  const from = z.email().parse(sender);
  const mime = await new MailComposer({
    from, to: validated.to, subject: validated.subject, text: validated.text,
    disableFileAccess: true, disableUrlAccess: true,
  }).compile().build();
  return mime.toString("base64url");
}

export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Jeton d'accès Gmail utilisable : celui enregistré s'il vaut encore une minute, sinon renouvelé puis réenregistré par `save`. */
export async function freshGmailAccessToken(
  connection: { accessToken: string | null; refreshToken: string | null; expiresAt: Date | null },
  companyId: string,
  save: (data: { accessToken: string; expiresAt: Date | null }) => Promise<unknown>,
  now = new Date(),
): Promise<string> {
  if (!connection.accessToken || !connection.refreshToken) throw new Error("Gmail non autorisé.");
  if (connection.expiresAt && connection.expiresAt.getTime() - now.getTime() > 60_000) return decryptGmailToken(connection.accessToken, companyId);
  const client = gmailClient();
  const account = decryptGmailAccount(connection.refreshToken, companyId);
  client.setCredentials({ access_token: decryptGmailToken(connection.accessToken, companyId), refresh_token: account.token, expiry_date: connection.expiresAt?.getTime() });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Jeton Gmail non renouvelé.");
  await save({ accessToken: encryptGmailToken(token, companyId), expiresAt: client.credentials.expiry_date ? new Date(client.credentials.expiry_date) : connection.expiresAt });
  return token;
}