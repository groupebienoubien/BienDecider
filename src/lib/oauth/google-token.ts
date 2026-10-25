import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type GoogleBusinessProfileTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
};

function encryptionKey() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Chiffrement Google Business Profile non configuré.");
  return Buffer.from(value, "hex");
}

export function isGoogleTokenEncryptionConfigured() {
  return /^[a-f0-9]{64}$/i.test(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "");
}

export function isEncryptedTokenEnvelope(value: string | null | undefined): value is string {
  return typeof value === "string" && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function encryptGoogleToken(token: string, companyId: string) {
  if (!token || !companyId) throw new Error("Jeton Google Business Profile invalide.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`google_business_profile:${companyId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGoogleToken(value: string, companyId: string) {
  if (!companyId || !isEncryptedTokenEnvelope(value)) throw new Error("Jeton Google Business Profile invalide.");
  const [version, nonce, tag, ciphertext, ...rest] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext || rest.length > 0) {
    throw new Error("Jeton Google Business Profile invalide.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(`google_business_profile:${companyId}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Jeton Google Business Profile invalide.");
  }
}

export function encryptGoogleConnectionTokens(
  tokens: GoogleBusinessProfileTokens,
  companyId: string,
) {
  return {
    accessToken: encryptGoogleToken(tokens.access_token, companyId),
    ...(tokens.refresh_token ? { refreshToken: encryptGoogleToken(tokens.refresh_token, companyId) } : {}),
  };
}