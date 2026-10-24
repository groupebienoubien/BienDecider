"use strict";

const { Client } = require("pg");
require("dotenv/config");

const BACKUP_CONFIRMATION = "BACKUP_VERIFIED";
const GOOGLE_REVOCATION_CONFIRMATION = "GOOGLE_ACCESS_REVOKED";
const TOKEN_CHANNELS = ["google_business_profile", "facebook", "instagram"];

function planTokenRow(row, crypto, options = {}) {
  if (row.channel === "google_business_profile") {
    if (options.purgeGoogleConnections) return { action: "delete", id: row.id, companyId: row.companyId, channel: row.channel };
    const transform = (value) => {
      if (value === null) return null;
      if (crypto.isEncryptedTokenEnvelope(value)) {
        crypto.decryptGoogleToken(value, row.companyId);
        return value;
      }
      return crypto.encryptGoogleToken(value, row.companyId);
    };
    const accessToken = transform(row.accessToken);
    const refreshToken = transform(row.refreshToken);
    if (accessToken === row.accessToken && refreshToken === row.refreshToken) return { action: "skip", id: row.id };
    return { action: "update", id: row.id, companyId: row.companyId, accessToken, refreshToken };
  }

  if (["facebook", "instagram"].includes(row.channel)) {
    const values = [row.accessToken, row.refreshToken].filter((value) => value !== null);
    if (values.some((value) => !crypto.isEncryptedTokenEnvelope(value))) {
      return { action: "delete", id: row.id, companyId: row.companyId, channel: row.channel };
    }
  }

  return { action: "skip", id: row.id };
}

function buildMigrationPlan(rows, crypto, options = {}) {
  return rows.map((row) => planTokenRow(row, crypto, options)).filter((entry) => entry.action !== "skip");
}

function parseArgs(argv) {
  const options = { apply: false, allowRemote: false, expectedDatabase: null, confirmation: null, googleRevocationConfirmation: null, purgeGoogleConnections: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--allow-remote") options.allowRemote = true;
    else if (argument === "--purge-google-connections") options.purgeGoogleConnections = true;
    else if (argument === "--confirm-google-revocation") options.googleRevocationConfirmation = argv[++index] ?? null;
    else if (argument === "--expected-database") options.expectedDatabase = argv[++index] ?? null;
    else if (argument === "--confirm-backup") options.confirmation = argv[++index] ?? null;
    else throw new Error(`Argument non reconnu: ${argument}`);
  }
  return options;
}

function guardTarget(databaseUrl, options) {
  if (process.env.VERCEL_ENV === "production") throw new Error("Ne pas exécuter cette migration depuis un build Vercel Production.");
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (options.apply && options.confirmation !== BACKUP_CONFIRMATION) {
    throw new Error(`Application refusée: fournir --confirm-backup ${BACKUP_CONFIRMATION} après vérification de la sauvegarde.`);
  }
  if (options.apply && options.purgeGoogleConnections && options.googleRevocationConfirmation !== GOOGLE_REVOCATION_CONFIRMATION) {
    throw new Error(`Purge GBP refusée: révoquer les accès chez Google, puis fournir --confirm-google-revocation ${GOOGLE_REVOCATION_CONFIRMATION}.`);
  }
  if (!local) {
    if (!options.allowRemote || options.expectedDatabase !== databaseName || !databaseName) {
      throw new Error("Cible distante refusée: --allow-remote et --expected-database correspondant exactement au nom de base sont requis.");
    }
  }
  return { databaseName, local };
}

function normalizeDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const usesLibpqCompatibility = url.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";
    // Reprend la politique Prisma partagée: pas de downgrade implicite de validation TLS.
    if (!usesLibpqCompatibility && ["prefer", "require", "verify-ca"].includes(sslMode ?? "")) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

async function executeMigration(client, options, crypto, target) {
  await client.query("BEGIN");
  try {
    const selected = await client.query(
      `SELECT "id", "companyId", "channel", "accessToken", "refreshToken"
       FROM "ChannelConnection"
       WHERE "channel" = ANY($1::text[])
         AND ("accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL)
      ${options.apply ? "FOR UPDATE" : ""}`,
      [TOKEN_CHANNELS],
    );
    const plan = buildMigrationPlan(selected.rows, crypto, options);
    let encryptedGoogleRows = 0;
    let purgedGoogleRows = 0;
    let purgedLegacyMetaRows = 0;
    for (const entry of plan) {
      if (entry.action === "update") {
        encryptedGoogleRows += 1;
        if (options.apply) {
          const updated = await client.query(
            `UPDATE "ChannelConnection" SET "accessToken" = $1, "refreshToken" = $2 WHERE "id" = $3 AND "companyId" = $4`,
            [entry.accessToken, entry.refreshToken, entry.id, entry.companyId],
          );
          if (updated.rowCount !== 1) throw new Error("La connexion GBP a changé pendant la migration; transaction annulée.");
        }
      } else if (entry.action === "delete") {
        if (entry.channel === "google_business_profile") purgedGoogleRows += 1;
        else purgedLegacyMetaRows += 1;
        if (options.apply) {
          const deleted = await client.query(
            `DELETE FROM "ChannelConnection" WHERE "id" = $1 AND "companyId" = $2 AND "channel" = $3`,
            [entry.id, entry.companyId, entry.channel],
          );
          if (deleted.rowCount !== 1) {
            const provider = entry.channel === "google_business_profile" ? "GBP" : "Meta";
            throw new Error(`La connexion ${provider} a changé pendant la migration; transaction annulée.`);
          }
        }
      }
    }
    if (options.apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    return {
      mode: options.apply ? "applied" : "dry-run",
      target: target.local ? "local" : "explicit-remote",
      encryptedGoogleRows,
      purgedGoogleRows,
      purgedLegacyMetaRows,
      unchangedRows: selected.rows.length - plan.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_PRISMA_DATABASE_URL ?? process.env.DATABASE_POSTGRES_URL;
  if (!databaseUrl) throw new Error("Définir DATABASE_URL (ou l'alias Prisma/Postgres) dans l'environnement privé.");
  const options = parseArgs(argv);
  const target = guardTarget(databaseUrl, options);
  const crypto = await import("../src/lib/oauth/google-token.ts");
  if (!crypto.isGoogleTokenEncryptionConfigured()) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY doit être configurée dans l'environnement privé.");

  const client = new Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    const result = await executeMigration(client, options, crypto, target);
    console.log(JSON.stringify(result));
  } catch (error) {
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration des jetons OAuth échouée.");
    process.exitCode = 1;
  });
}

module.exports = { BACKUP_CONFIRMATION, GOOGLE_REVOCATION_CONFIRMATION, buildMigrationPlan, executeMigration, guardTarget, normalizeDatabaseUrl, parseArgs, planTokenRow };