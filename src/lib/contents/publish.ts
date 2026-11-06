import { Prisma, type Company, type ContentVersion, type Mission, type MissionContent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { MissionError } from "@/lib/missions/messages";
import { channelLabel, isChannelEnabled, type MissionChannel } from "@/lib/missions/channels";
import { asDelegationLevel } from "@/lib/delegation-level";
import { decryptFacebookAccount, publishFacebookPagePost } from "@/lib/oauth/meta";
import { slugify } from "@/lib/site/slug";
import { checkDeclaration, checkDiffusion, type ContentSnapshot, type Refusal } from "@/lib/contents/rules";
import { ContentNotFoundError, snapshotOf } from "@/lib/contents/service";

/** Une diffusion envoyée sans réponse du canal depuis 15 minutes est traitée comme incertaine (addendum §7). */
export const SENDING_STALE_MS = 15 * 60 * 1000;

export type Destination = {
  channel: MissionChannel | null;
  enabled: boolean;
  connected: boolean;
  label: string;
  facebookPage?: { id: string; token: string; name: string };
};

type Outcome =
  | { status: "sent"; externalId?: string; url?: string; recipientCount?: number }
  | { status: "failed"; reason: string; tokenRejected?: boolean }
  | { status: "uncertain" };

export type DiffusionResult = { status: "sent" | "failed" | "uncertain"; url: string | null; message: string };

function refuse(refusal: Refusal): never {
  throw new MissionError(refusal.code, refusal.params);
}

/** Destination d'un contenu : canal actif, connexion utilisable et libellé en clair (la Page choisie, le site vitrine…). */
export async function readDestination(companyId: string, channel: MissionChannel | null): Promise<Destination> {
  if (!channel) return { channel, enabled: false, connected: false, label: "Hors canal" };
  const enabled = isChannelEnabled(channel);
  if (channel === "site") return { channel, enabled, connected: true, label: "Votre site vitrine" };
  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId, channel } } });
  const live = connection?.status === "connecte" && Boolean(connection.accessToken);
  if (channel === "facebook") {
    let page: Destination["facebookPage"];
    try {
      const account = live && connection?.accessToken ? decryptFacebookAccount(connection.accessToken, companyId) : null;
      const selected = account?.pages.find((candidate) => candidate.id === account.selectedPageId);
      page = selected ? { id: selected.id, token: selected.token, name: selected.name } : undefined;
    } catch {
      page = undefined;
    }
    return { channel, enabled, connected: Boolean(page), label: page ? `Page Facebook « ${page.name} »` : channelLabel(channel), facebookPage: page };
  }
  return { channel, enabled, connected: live, label: channelLabel(channel) };
}

type LoadedContent = MissionContent & { mission: Mission; company: Company; publications: { versionNumber: number; status: string }[] };

async function loadContent(companyId: string, contentId: string): Promise<{ content: LoadedContent; snapshot: ContentSnapshot; version: ContentVersion }> {
  const content = await prisma.missionContent.findFirst({
    where: { id: contentId, companyId },
    include: { mission: true, company: true, publications: { select: { versionNumber: true, status: true } } },
  });
  if (!content || content.currentNumber === 0) throw new ContentNotFoundError();
  const version = await prisma.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId, number: content.currentNumber } } });
  return { content, snapshot: snapshotOf(content), version };
}

/** La version lue protège la diffusion contre une retouche simultanée : elles ne peuvent pas passer toutes les deux (M-02). */
async function guardContent(tx: Prisma.TransactionClient, content: LoadedContent) {
  const guarded = await tx.missionContent.updateMany({ where: { id: content.id, version: content.version, currentNumber: content.currentNumber }, data: { version: { increment: 1 } } });
  if (guarded.count === 0) throw new MissionError("M-02");
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Page du site vitrine : exactement la version validée, servie sous /site/{adresse de l'entreprise}/{adresse de la page} (#172). */
async function publishSitePage(content: LoadedContent, version: ContentVersion, now: Date): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: content.companyId }, select: { id: true, name: true, siteSlug: true } });
    let siteSlug = company.siteSlug;
    if (!siteSlug) {
      siteSlug = slugify(company.name);
      const taken = await tx.company.findUnique({ where: { siteSlug } });
      if (taken && taken.id !== company.id) siteSlug = `${siteSlug}-${company.id.slice(-6)}`;
      await tx.company.update({ where: { id: company.id }, data: { siteSlug } });
    }
    const existing = await tx.sitePage.findUnique({ where: { missionId: content.missionId } });
    const scope = content.mission.scope !== null && typeof content.mission.scope === "object" && !Array.isArray(content.mission.scope) ? (content.mission.scope as Record<string, unknown>) : {};
    let slug = existing?.slug ?? slugify(typeof scope.page === "string" ? scope.page : version.title, "page");
    if (!existing && (await tx.sitePage.findUnique({ where: { companyId_slug: { companyId: content.companyId, slug } } }))) slug = `${slug}-${content.missionId.slice(-6)}`;
    const page = { title: version.title, body: version.body, versionNumber: version.number, publishedAt: now };
    await tx.sitePage.upsert({ where: { missionId: content.missionId }, create: { companyId: content.companyId, missionId: content.missionId, slug, ...page }, update: page });
    return { status: "sent" as const, url: `/site/${siteSlug}/${slug}` };
  });
}

async function execute(destination: Destination, content: LoadedContent, version: ContentVersion, fetchImpl: typeof fetch, now: Date): Promise<Outcome> {
  try {
    if (destination.channel === "site") return await publishSitePage(content, version, now);
    if (destination.channel === "facebook" && destination.facebookPage) {
      const outcome = await publishFacebookPagePost(destination.facebookPage, `${version.title}\n\n${version.body}`, fetchImpl);
      if (outcome.status === "published") return { status: "sent", externalId: outcome.postId };
      if (outcome.status === "uncertain") return { status: "uncertain" };
      return {
        status: "failed",
        tokenRejected: outcome.tokenRejected,
        reason: outcome.tokenRejected ? "Facebook a refusé l'accès à votre Page : reconnectez-la, puis réessayez" : "Facebook a refusé la publication ; rien n'a été publié",
      };
    }
    return { status: "failed", reason: "ce canal n'a pas encore de connecteur de diffusion" };
  } catch (error) {
    // Une erreur après l'appel au canal ne dit pas si la diffusion est partie : jamais de nouvel essai aveugle (§5.5).
    console.error("[diffusion]", error instanceof Error ? error.message : error);
    return destination.channel === "site" ? { status: "failed", reason: "la page n'a pas pu être mise en ligne" } : { status: "uncertain" };
  }
}

/**
 * Diffuser maintenant (§5.1, §5.2) : contrôles dans l'ordre, réservation de la tentative avec sa clé d'idempotence,
 * appel au canal, puis résultat enregistré (envoyée, échec ou incertain) et journalisé. Rien n'est relancé automatiquement.
 */
export async function publishContentNow(
  companyId: string,
  contentId: string,
  input: { number: number; confirmed: boolean },
  { fetchImpl = fetch, now = new Date() }: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<DiffusionResult> {
  const { content, snapshot, version } = await loadContent(companyId, contentId);
  const destination = await readDestination(companyId, snapshot.channel);
  const refusal = checkDiffusion(snapshot, {
    emailVerified: content.company.emailVerifiedAt !== null,
    delegation: asDelegationLevel(content.company.delegationLevel),
    channelEnabled: destination.enabled,
    channelConnected: destination.connected,
  }, input);
  if (refusal) refuse(refusal);

  const attempt = await prisma.publication.count({ where: { contentId, versionNumber: version.number } });
  let publicationId: string;
  try {
    publicationId = await prisma.$transaction(async (tx) => {
      await guardContent(tx, content);
      const created = await tx.publication.create({
        data: {
          companyId, missionId: content.missionId, contentId, versionNumber: version.number, title: version.title,
          channel: snapshot.channel, channelLabel: destination.label, mode: "confirmed", status: "sending",
          idempotencyKey: `${contentId}:v${version.number}:${attempt + 1}`,
        },
      });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new MissionError("M-81");
    throw error;
  }

  const outcome = await execute(destination, content, version, fetchImpl, now);
  const n = String(version.number);
  await prisma.$transaction(async (tx) => {
    if (outcome.status === "sent") {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "sent", sentAt: now, externalId: outcome.externalId, url: outcome.url, recipientCount: outcome.recipientCount } });
      const destinataires = outcome.recipientCount ? ` · ${outcome.recipientCount} destinataire${outcome.recipientCount > 1 ? "s" : ""}` : "";
      await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-22", params: { n, canal: destination.label, destinataires } });
    } else if (outcome.status === "failed") {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "failed", failureReason: outcome.reason } });
      if (outcome.tokenRejected) await tx.channelConnection.updateMany({ where: { companyId, channel: "facebook" }, data: { status: "erreur" } });
      await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-28", actor: "system", params: { n, canal: destination.label, motif: outcome.reason } });
    } else {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "uncertain" } });
    }
  });

  if (outcome.status === "sent") return { status: "sent", url: outcome.url ?? null, message: `V${n} publiée sur ${destination.label}.` };
  if (outcome.status === "failed") return { status: "failed", url: null, message: `Rien n'a été diffusé : ${outcome.reason}. La version reste validée.` };
  return { status: "uncertain", url: null, message: `${destination.label} n'a pas confirmé la diffusion. Vérifiez sur le canal, puis dites-le.` };
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** « Je l'ai diffusé moi-même » (§5.4) : diffusion déclarée, une seule par version, qui verrouille la version comme une diffusion confirmée. */
export async function declareContentDiffusion(
  companyId: string,
  contentId: string,
  input: { number: number; channel: unknown; date: unknown; confirmed: boolean },
  now = new Date(),
): Promise<DiffusionResult> {
  const { content, snapshot, version } = await loadContent(companyId, contentId);
  const checked = checkDeclaration(snapshot, input, now);
  if (!checked.ok) refuse(checked);
  try {
    await prisma.$transaction(async (tx) => {
      await guardContent(tx, content);
      await tx.publication.create({
        data: {
          companyId, missionId: content.missionId, contentId, versionNumber: version.number, title: version.title,
          channel: snapshot.channel, channelLabel: checked.value.channel, mode: "declared", status: "sent", sentAt: checked.value.date,
          idempotencyKey: `${contentId}:v${version.number}:declared`,
        },
      });
      await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-24", params: { n: String(version.number), canal: checked.value.channel, date: DATE.format(checked.value.date) } });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new MissionError("M-53");
    throw error;
  }
  return { status: "sent", url: null, message: `V${version.number} déclarée diffusée par vous.` };
}

/** Résultat incertain vérifié par le dirigeant (§5.5) : « C'est bien parti » l'enregistre, « Ce n'est pas parti » permet une nouvelle diffusion. */
export async function resolveUncertainDiffusion(companyId: string, contentId: string, input: { number: number; sent: boolean }, now = new Date()): Promise<DiffusionResult> {
  const { content, version } = await loadContent(companyId, contentId);
  if (input.number !== content.currentNumber) throw new MissionError("M-02");
  const pending = await prisma.publication.findFirst({
    where: { contentId, versionNumber: version.number, OR: [{ status: "uncertain" }, { status: "sending", createdAt: { lt: new Date(now.getTime() - SENDING_STALE_MS) } }] },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) throw new MissionError("M-86");
  await prisma.$transaction(async (tx) => {
    await guardContent(tx, content);
    const written = await tx.publication.updateMany({
      where: { id: pending.id, status: pending.status },
      data: input.sent ? { status: "sent", sentAt: pending.createdAt } : { status: "failed", failureReason: "non parti, vérifié par vous" },
    });
    if (written.count === 0) throw new MissionError("M-02");
    await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-25", params: { n: String(version.number), résultat: input.sent ? "diffusée" : "non diffusée" } });
  });
  return input.sent
    ? { status: "sent", url: pending.url, message: `V${version.number} enregistrée comme diffusée.` }
    : { status: "failed", url: null, message: `V${version.number} reste validée : vous pouvez la diffuser de nouveau.` };
}
