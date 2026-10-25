import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Connexion d'une Page Facebook par Facebook Login. Jamais de mot de passe
 * utilisateur. Le dirigeant autorise l'application, choisit explicitement
 * UNE Page parmi celles qu'il gère, et seule cette Page est déclarée
 * connectée, après vérification auprès de Meta. Les jetons sont chiffrés
 * au repos et liés à l'entreprise. Instagram n'est pas couvert ici.
 *
 * Version et permissions vérifiées dans la documentation Meta le
 * 2026-10-13 (Graph API v26.0, Pages API). Les permissions demandent une
 * App Review avant d'être utilisables par un compte sans rôle sur l'app.
 */
export const META_GRAPH_VERSION = "v26.0";
export const META_CALLBACK = "/api/oauth/meta/callback";
export const META_STATE_COOKIE = "biendecider_meta_oauth";
// pages_show_list : lister les Pages gérées ; pages_read_engagement : lire la Page choisie ; pages_manage_posts : y publier après validation.
export const FACEBOOK_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"] as const;
export const FACEBOOK_PUBLISH_TASK = "CREATE_CONTENT";
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const graphOrigin = "https://graph.facebook.com";

export const META_ERROR_MESSAGES = {
  meta_config: "Facebook n'est pas configuré sur ce déploiement.",
  meta_start: "Impossible de démarrer la connexion Facebook. Réessayez.",
  meta_state: "Cette demande Facebook a expiré ou n'est pas valide. Recommencez depuis Connexions.",
  meta_denied: "L'autorisation Facebook a été annulée. Votre connexion précédente, si elle existe, est conservée.",
  meta_token_request: "Facebook a refusé l'échange du code ou n'a pas répondu. Recommencez depuis Connexions.",
  meta_token_response: "La réponse de Facebook ne contient pas les informations attendues.",
  meta_scope: "Les permissions Facebook accordées sont incomplètes. Recommencez en acceptant l'accès aux Pages et à leur publication.",
  meta_profile: "Impossible de lire le compte Facebook autorisé.",
  meta_pages: "Impossible de lire la liste de vos Pages Facebook.",
  meta_no_page: "Aucune Page Facebook n'a été partagée avec BienDecider. Recommencez en sélectionnant au moins une Page dans l'écran de Facebook.",
  meta_storage: "L'autorisation Facebook n'a pas pu être enregistrée. Réessayez ou contactez le support.",
} as const;

export class MetaOAuthError extends Error {
  constructor(readonly diagnostic: keyof typeof META_ERROR_MESSAGES) {
    super(META_ERROR_MESSAGES[diagnostic]);
    this.name = "MetaOAuthError";
  }
}

export function isMetaOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET &&
    /^[a-f0-9]{64}$/i.test(process.env.META_TOKEN_ENCRYPTION_KEY ?? ""));
}

function encryptionKey() {
  const key = process.env.META_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error("Chiffrement Facebook non configuré.");
  return Buffer.from(key, "hex");
}

const pageSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  token: z.string().min(1).max(10000),
  canPublish: z.boolean(),
});

export const facebookAccountSchema = z.object({
  userToken: z.string().min(1).max(10000),
  userId: z.string().min(1).max(64),
  userName: z.string().min(1).max(300),
  scopes: z.array(z.string()).refine((scopes) => FACEBOOK_SCOPES.every((scope) => scopes.includes(scope))),
  pages: z.array(pageSchema).max(200),
  selectedPageId: z.string().min(1).max(64).nullable(),
});
export type FacebookAccount = z.infer<typeof facebookAccountSchema>;

export function encryptFacebookAccount(account: FacebookAccount, companyId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`facebook:${companyId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(facebookAccountSchema.parse(account)), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptFacebookAccount(value: string, companyId: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Autorisation Facebook invalide.");
  const [, nonce, tag, ciphertext] = parts;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`facebook:${companyId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return facebookAccountSchema.parse(JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final(),
  ]).toString("utf8")));
}

type StateBinding = { companyId: string; session: string; redirectUri: string };

function stateSignature(nonce: string, expiresAt: number, binding: StateBinding) {
  const session = createHash("sha256").update(binding.session).digest("hex");
  return createHmac("sha256", encryptionKey())
    .update(`meta-state:${nonce}:${expiresAt}:${binding.companyId}:${session}:${binding.redirectUri}`)
    .digest("base64url");
}

/**
 * State OAuth signé : lié à l'entreprise, à la session et à l'URI de
 * retour, valable dix minutes. Il est aussi posé en cookie au départ et
 * comparé au retour ; le code d'autorisation, lui, n'est accepté qu'une
 * fois par Meta.
 */
export function createMetaState(binding: StateBinding, now = Date.now()) {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = now + STATE_LIFETIME_MS;
  return `${nonce}.${expiresAt}.${stateSignature(nonce, expiresAt, binding)}`;
}

export function verifyMetaState(state: string | null | undefined, binding: StateBinding, now = Date.now()) {
  const [nonce, expires, signature, ...rest] = (state ?? "").split(".");
  const expiresAt = Number(expires);
  if (!nonce || !signature || rest.length > 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expected = Buffer.from(stateSignature(nonce, expiresAt, binding));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Une app au cas d'usage « Gérer tout sur votre Page » passe par Facebook
 * Login for Business : les permissions sont définies dans une configuration
 * de la console Meta, transmise par config_id à la place de scope. Sans
 * configuration (développement, CI), la liste des permissions reste envoyée.
 * Dans les deux cas, les permissions accordées sont revérifiées au retour.
 */
function metaLoginConfigId() {
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim();
  return configId && /^\d{1,32}$/.test(configId) ? configId : null;
}

export function buildMetaAuthUrl(redirectUri: string, state: string) {
  if (!isMetaOAuthConfigured()) throw new Error("Facebook non configuré.");
  const configId = metaLoginConfigId();
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, response_type: "code",
    ...(configId ? { config_id: configId } : { scope: FACEBOOK_SCOPES.join(",") }),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`;
}

type Fetch = typeof fetch;

function graphUrl(path: string, params: Record<string, string> = {}) {
  return `${graphOrigin}/${META_GRAPH_VERSION}/${path}?${new URLSearchParams(params)}`;
}

// Preuve exigible par Meta pour les appels serveur : lie chaque jeton au secret de l'application.
function withProof(token: string, params: Record<string, string> = {}) {
  return { ...params, appsecret_proof: createHmac("sha256", process.env.META_APP_SECRET!).update(token).digest("hex") };
}

async function graphJson<Schema extends z.ZodType>(
  diagnostic: keyof typeof META_ERROR_MESSAGES, schema: Schema, fetchImpl: Fetch, url: string, token?: string,
): Promise<z.infer<Schema>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: AbortSignal.timeout(10000), cache: "no-store",
    });
  } catch {
    throw new MetaOAuthError(diagnostic);
  }
  // Ni l'URL ni le corps de la réponse ne sont journalisés : ils peuvent contenir le secret de l'application ou un jeton.
  if (!response.ok) throw new MetaOAuthError(diagnostic);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new MetaOAuthError(diagnostic === "meta_token_request" ? "meta_token_response" : diagnostic);
  return parsed.data;
}

const tokenSchema = z.object({ access_token: z.string().min(1).max(10000), expires_in: z.number().int().positive().optional() });
const permissionsSchema = z.object({ data: z.array(z.object({ permission: z.string(), status: z.string() })) });
const profileSchema = z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(300) });
const pagesSchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1).max(64), name: z.string().min(1).max(300),
    access_token: z.string().min(1).max(10000), tasks: z.array(z.string()).optional(),
  })),
});
const DEFAULT_USER_TOKEN_LIFETIME_S = 60 * 24 * 60 * 60;

/**
 * Échange le code contre un jeton utilisateur longue durée, vérifie les
 * permissions réellement accordées, puis lit le compte et ses Pages.
 * Aucune Page n'est encore choisie : selectedPageId reste null.
 */
export async function exchangeMetaCode(code: string, redirectUri: string, fetchImpl: Fetch = fetch) {
  if (!isMetaOAuthConfigured()) throw new MetaOAuthError("meta_config");
  const app = { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET! };
  const shortLived = await graphJson("meta_token_request", tokenSchema, fetchImpl,
    graphUrl("oauth/access_token", { ...app, redirect_uri: redirectUri, code }));
  const longLived = await graphJson("meta_token_request", tokenSchema, fetchImpl,
    graphUrl("oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: shortLived.access_token }));
  const userToken = longLived.access_token;

  const permissions = await graphJson("meta_scope", permissionsSchema, fetchImpl, graphUrl("me/permissions", withProof(userToken)), userToken);
  const scopes = permissions.data.filter((entry) => entry.status === "granted").map((entry) => entry.permission);
  if (!FACEBOOK_SCOPES.every((scope) => scopes.includes(scope))) throw new MetaOAuthError("meta_scope");

  const profile = await graphJson("meta_profile", profileSchema, fetchImpl, graphUrl("me", withProof(userToken, { fields: "id,name" })), userToken);
  const pages = await graphJson("meta_pages", pagesSchema, fetchImpl,
    graphUrl("me/accounts", withProof(userToken, { fields: "id,name,access_token,tasks", limit: "100" })), userToken);
  if (pages.data.length === 0) throw new MetaOAuthError("meta_no_page");

  return {
    account: facebookAccountSchema.parse({
      userToken, userId: profile.id, userName: profile.name, scopes, selectedPageId: null,
      pages: pages.data.map((page) => ({ id: page.id, name: page.name, token: page.access_token, canPublish: (page.tasks ?? []).includes(FACEBOOK_PUBLISH_TASK) })),
    }),
    expiresAt: new Date(Date.now() + (longLived.expires_in ?? DEFAULT_USER_TOKEN_LIFETIME_S) * 1000),
  };
}

/** Vérifie auprès de Meta que le jeton de la Page choisie donne bien accès à cette Page. */
export async function verifyFacebookPage(page: { id: string; token: string }, fetchImpl: Fetch = fetch) {
  try {
    const verified = await graphJson("meta_pages", profileSchema, fetchImpl,
      graphUrl(encodeURIComponent(page.id), withProof(page.token, { fields: "id,name" })), page.token);
    return verified.id === page.id ? verified : null;
  } catch {
    return null;
  }
}

/** Retire l'autorisation de l'application chez Meta. Ne lève jamais : le retrait local ne doit pas en dépendre. */
export async function revokeFacebookAuthorization(account: Pick<FacebookAccount, "userId" | "userToken">, fetchImpl: Fetch = fetch) {
  try {
    const response = await fetchImpl(graphUrl(`${encodeURIComponent(account.userId)}/permissions`, withProof(account.userToken)), {
      method: "DELETE", headers: { Authorization: `Bearer ${account.userToken}` }, signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type FacebookConnectionView =
  | { status: "disconnected" }
  | { status: "error" }
  | { status: "selection"; userName: string; pages: { id: string; name: string; canPublish: boolean }[] }
  | { status: "connected"; userName: string; pageName: string };

/**
 * Ce que la page Connexions peut afficher, sans aucun jeton. Une ligne
 * illisible (jeton en clair de l'ancien flux, clé changée, autre
 * entreprise) est une erreur à corriger par une nouvelle autorisation,
 * jamais une connexion.
 */
export function facebookConnectionView(
  connection: { status: string; accessToken: string | null; expiresAt: Date | null } | undefined,
  companyId: string,
  now = Date.now(),
): FacebookConnectionView {
  if (!connection) return { status: "disconnected" };
  try {
    if (!connection.accessToken) throw new Error("Autorisation incomplète.");
    const account = decryptFacebookAccount(connection.accessToken, companyId);
    if (connection.status === "selection_requise" && connection.expiresAt && connection.expiresAt.getTime() > now) {
      return { status: "selection", userName: account.userName, pages: account.pages.map(({ id, name, canPublish }) => ({ id, name, canPublish })) };
    }
    const page = account.pages.find((candidate) => candidate.id === account.selectedPageId);
    if (connection.status === "connecte" && page) return { status: "connected", userName: account.userName, pageName: page.name };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export type FacebookPublishOutcome =
  | { status: "published"; postId: string }
  | { status: "refused"; tokenRejected: boolean }
  | { status: "uncertain" };

const publishedSchema = z.object({ id: z.string().min(1).max(200) });
const graphErrorSchema = z.object({ error: z.object({ code: z.number().optional() }) });

/**
 * Publie un message texte sur la Page avec son propre jeton. Ne lève jamais :
 * un refus explicite de Meta (4xx) n'a rien publié, alors qu'une coupure,
 * un délai dépassé, une erreur 5xx ou une réponse illisible laissent le
 * résultat incertain — il ne faut alors jamais republier automatiquement.
 */
export async function publishFacebookPagePost(
  page: { id: string; token: string }, message: string, fetchImpl: Fetch = fetch,
): Promise<FacebookPublishOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(graphUrl(`${encodeURIComponent(page.id)}/feed`, withProof(page.token)), {
      method: "POST",
      headers: { Authorization: `Bearer ${page.token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message }),
      signal: AbortSignal.timeout(20000), cache: "no-store",
    });
  } catch {
    return { status: "uncertain" };
  }
  const body = await response.json().catch(() => null);
  if (response.ok) {
    const published = publishedSchema.safeParse(body);
    return published.success ? { status: "published", postId: published.data.id } : { status: "uncertain" };
  }
  if (response.status >= 500) return { status: "uncertain" };
  // Code 190 : jeton expiré ou révoqué, la Page doit être reconnectée.
  const graphError = graphErrorSchema.safeParse(body);
  return { status: "refused", tokenRejected: response.status === 401 || (graphError.success && graphError.data.error.code === 190) };
}

export const FACEBOOK_POSTS_SCOPE = "pages_read_user_content";
export const FACEBOOK_POSTS_READ_CAP = 10;

export type FacebookPageOverview = {
  name: string;
  link: string | null;
  category: string | null;
  followers: number | null;
  /** null : lecture des publications non demandée ou échouée ; sinon les dernières publications. */
  posts: { message: string; createdAt: string | null; reactions: number | null; comments: number | null }[] | null;
};
export type FacebookPageReadOutcome =
  | { status: "read"; overview: FacebookPageOverview }
  | { status: "refused"; tokenRejected: boolean }
  | { status: "unavailable" };

const count = z.object({ summary: z.object({ total_count: z.number().int().nonnegative().optional() }).optional() }).optional();
const pageInfoSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  link: z.string().max(500).optional(),
  category: z.string().max(200).optional(),
  followers_count: z.number().int().nonnegative().optional(),
  fan_count: z.number().int().nonnegative().optional(),
});
const pagePostsSchema = z.object({
  data: z.array(z.object({
    message: z.string().max(20000).optional(),
    created_time: z.string().max(40).optional(),
    reactions: count,
    comments: count,
  })).max(100),
});

async function readGraph(url: string, token: string, fetchImpl: Fetch): Promise<
  { ok: true; body: unknown } | { ok: false; refused: boolean; tokenRejected: boolean }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), cache: "no-store" });
  } catch {
    return { ok: false, refused: false, tokenRejected: false };
  }
  // Ni l'URL ni le corps ne sont journalisés : ils peuvent contenir un jeton ou des contenus de tiers.
  const body = await response.json().catch(() => null);
  if (response.ok) return { ok: true, body };
  const graphError = graphErrorSchema.safeParse(body);
  const tokenRejected = response.status === 401 || (graphError.success && graphError.data.error.code === 190);
  return { ok: false, refused: response.status < 500, tokenRejected };
}

/**
 * Lit les informations d'une Page, et ses dernières publications si la
 * permission a été accordée, avec le jeton de la Page. Ne lève jamais. Un échec
 * des seules publications n'invalide pas la lecture des informations.
 */
export async function readFacebookPageOverview(
  page: { id: string; token: string }, options: { withPosts: boolean }, fetchImpl: Fetch = fetch,
): Promise<FacebookPageReadOutcome> {
  const id = encodeURIComponent(page.id);
  const info = await readGraph(graphUrl(id, withProof(page.token, { fields: "id,name,link,category,followers_count,fan_count" })), page.token, fetchImpl);
  if (!info.ok) return info.refused ? { status: "refused", tokenRejected: info.tokenRejected } : { status: "unavailable" };
  const parsed = pageInfoSchema.safeParse(info.body);
  if (!parsed.success || parsed.data.id !== page.id) return { status: "unavailable" };
  const overview: FacebookPageOverview = {
    name: parsed.data.name,
    link: parsed.data.link ?? null,
    category: parsed.data.category ?? null,
    followers: parsed.data.followers_count ?? parsed.data.fan_count ?? null,
    posts: null,
  };
  if (options.withPosts) {
    const fields = "message,created_time,reactions.summary(true).limit(0),comments.summary(true).limit(0)";
    const posts = await readGraph(graphUrl(`${id}/posts`, withProof(page.token, { fields, limit: String(FACEBOOK_POSTS_READ_CAP) })), page.token, fetchImpl);
    const parsedPosts = posts.ok ? pagePostsSchema.safeParse(posts.body) : null;
    if (parsedPosts?.success) {
      overview.posts = parsedPosts.data.data.slice(0, FACEBOOK_POSTS_READ_CAP).map((post) => ({
        message: post.message ?? "",
        createdAt: post.created_time ?? null,
        reactions: post.reactions?.summary?.total_count ?? null,
        comments: post.comments?.summary?.total_count ?? null,
      }));
    }
  }
  return { status: "read", overview };
}