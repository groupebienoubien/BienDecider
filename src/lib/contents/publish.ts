import { Prisma, type Company, type ContentVersion, type Mission, type MissionContent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { MissionError, renderMissionMessage } from "@/lib/missions/messages";
import { channelLabel, type MissionChannel } from "@/lib/missions/channels";
import { canUseChannel, readChannelAccess } from "@/lib/channel-access";
import { asDelegationLevel } from "@/lib/delegation-level";
import { decryptFacebookAccount, publishFacebookPagePost } from "@/lib/oauth/meta";
import { GMAIL_SEND_URL, buildGmailMessage, decryptGmailAccount, freshGmailAccessToken } from "@/lib/oauth/gmail";
import { scopeAgencies } from "@/lib/agencies/service";
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
  gmail?: { connectionId: string; sender: string };
};

type Outcome =
  | { status: "sent"; externalId?: string; url?: string; recipientCount?: number }
  | { status: "failed"; reason: string; tokenRejected?: boolean }
  | { status: "uncertain" };

export type DiffusionResult = { status: "sent" | "failed" | "uncertain" | "scheduled" | "cancelled"; url: string | null; message: string };

function refuse(refusal: Refusal): never {
  throw new MissionError(refusal.code, refusal.params);
}

/** Destination d'un contenu : canal actif, connexion utilisable et libellé en clair (la Page choisie, le site vitrine…). */
export async function readDestination(companyId: string, channel: MissionChannel | null): Promise<Destination> {
  if (!channel) return { channel, enabled: false, connected: false, label: "Hors canal" };
  const enabled = canUseChannel(await readChannelAccess(companyId, channel));
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
  if (channel === "gmail") {
    let sender: string | undefined;
    try {
      sender = live && connection?.refreshToken ? decryptGmailAccount(connection.refreshToken, companyId).email : undefined;
    } catch {
      sender = undefined;
    }
    return { channel, enabled, connected: Boolean(sender), label: sender ? `Gmail (${sender})` : channelLabel(channel), gmail: sender && connection ? { connectionId: connection.id, sender } : undefined };
  }
  return { channel, enabled, connected: live, label: channelLabel(channel) };
}

type LoadedContent = MissionContent & { mission: Mission; company: Company; publications: { id: string; versionNumber: number; status: string }[] };

async function loadContent(companyId: string, contentId: string): Promise<{ content: LoadedContent; snapshot: ContentSnapshot; version: ContentVersion }> {
  const content = await prisma.missionContent.findFirst({
    where: { id: contentId, companyId },
    include: { mission: true, company: true, publications: { select: { id: true, versionNumber: true, status: true } } },
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

async function execute(publicationId: string, destination: Destination, content: LoadedContent, version: ContentVersion, fetchImpl: typeof fetch, now: Date): Promise<Outcome> {
  try {
    if (destination.channel === "site") return await publishSitePage(content, version, now);
    if (destination.channel === "gmail" && destination.gmail) return await sendEmails(publicationId, destination.gmail, content, version, fetchImpl, now);
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

type RecipientResult = { status: "sent"; externalId?: string } | { status: "failed"; reason: string; tokenRejected?: boolean } | { status: "uncertain" };

/**
 * E-mail (§5.2) : un envoi par destinataire, chacun tracé avec son résultat. Une agence déjà servie pour cette version
 * (diffusion précédente partiellement partie) n'est jamais relancée ; un accès refusé arrête les envois suivants.
 */
async function sendEmails(publicationId: string, gmail: NonNullable<Destination["gmail"]>, content: LoadedContent, version: ContentVersion, fetchImpl: typeof fetch, now: Date): Promise<Outcome> {
  const agencies = content.mission.template === "agencies" ? await scopeAgencies(content.companyId, content.mission.scope) : [];
  const served = new Set((await prisma.publicationRecipient.findMany({
    where: { status: "sent", publication: { contentId: content.id, versionNumber: version.number } },
    select: { email: true },
  })).map((recipient) => recipient.email));
  const recipients = agencies.filter((agency) => !served.has(agency.email));
  if (recipients.length === 0) return { status: "failed", reason: agencies.length ? "chaque agence du périmètre a déjà reçu cette version" : "aucun destinataire dans le périmètre de cette mission" };
  const connection = await prisma.channelConnection.findUniqueOrThrow({ where: { id: gmail.connectionId } });
  let token: string;
  try {
    token = await freshGmailAccessToken(connection, content.companyId, (data) => prisma.channelConnection.update({ where: { id: connection.id }, data }), now);
  } catch (error) {
    console.error("[diffusion] jeton Gmail", error instanceof Error ? error.message : error);
    return { status: "failed", tokenRejected: true, reason: "Gmail a refusé l'accès à votre compte : reconnectez-le, puis réessayez" };
  }
  const results: RecipientResult[] = [];
  let blocked: string | null = null;
  for (const agency of recipients) {
    const row = await prisma.publicationRecipient.create({ data: { publicationId, leadId: agency.id, name: agency.name, email: agency.email, status: "sending" } });
    const result: RecipientResult = blocked ? { status: "failed", reason: blocked } : await sendOne(token, gmail.sender, agency.email, version, fetchImpl);
    if (result.status === "failed" && result.tokenRejected) blocked = "non tenté : accès Gmail refusé";
    await prisma.publicationRecipient.update({
      where: { id: row.id },
      data: result.status === "sent" ? { status: "sent", sentAt: now, externalId: result.externalId } : result.status === "failed" ? { status: "failed", failureReason: result.reason } : { status: "uncertain" },
    });
    results.push(result);
  }
  const sent = results.filter((result) => result.status === "sent").length;
  if (results.some((result) => result.status === "uncertain")) return { status: "uncertain" };
  if (sent > 0) return { status: "sent", recipientCount: sent };
  const failure = results.find((result): result is Extract<RecipientResult, { status: "failed" }> => result.status === "failed");
  return { status: "failed", reason: failure?.reason ?? "Gmail a refusé l'envoi", tokenRejected: failure?.tokenRejected };
}

async function sendOne(token: string, sender: string, to: string, version: ContentVersion, fetchImpl: typeof fetch): Promise<RecipientResult> {
  const raw = await buildGmailMessage({ to, subject: version.title, text: version.body, confirmed: true }, sender);
  let response: Response;
  try {
    response = await fetchImpl(GMAIL_SEND_URL, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }), signal: AbortSignal.timeout(20000),
    });
  } catch {
    // Sans réponse, l'envoi a pu partir : jamais de nouvel essai aveugle (§5.5).
    return { status: "uncertain" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return { status: "sent", externalId: typeof body?.id === "string" ? body.id : undefined };
  }
  if (response.status === 401 || response.status === 403) return { status: "failed", tokenRejected: true, reason: "Gmail a refusé l'accès à votre compte : reconnectez-le, puis réessayez" };
  if (response.status >= 500) return { status: "uncertain" };
  return { status: "failed", reason: "Gmail a refusé cet envoi" };
}

/**
 * Diffuser maintenant ou programmer (§5.1 à §5.3) : contrôles dans l'ordre, réservation de la tentative avec sa clé d'idempotence,
 * puis appel au canal et résultat enregistré (envoyée, échec ou incertain), ou programmation enregistrée pour l'ordonnanceur.
 */
export async function publishContentNow(
  companyId: string,
  contentId: string,
  input: { number: number; confirmed: boolean; scheduledAt?: Date | null; timezone?: string | null },
  { fetchImpl = fetch, now = new Date() }: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<DiffusionResult> {
  const { content, snapshot, version } = await loadContent(companyId, contentId);
  const destination = await readDestination(companyId, snapshot.channel);
  const refusal = checkDiffusion(snapshot, contextOf(content.company, destination), { ...input, now });
  if (refusal) refuse(refusal);

  const scheduledAt = input.scheduledAt ?? null;
  const timezone = input.timezone ?? "Europe/Paris";
  const attempt = await prisma.publication.count({ where: { contentId, versionNumber: version.number } });
  let publicationId: string;
  try {
    publicationId = await prisma.$transaction(async (tx) => {
      await guardContent(tx, content);
      const created = await tx.publication.create({
        data: {
          companyId, missionId: content.missionId, contentId, versionNumber: version.number, title: version.title,
          channel: snapshot.channel, channelLabel: destination.label, mode: "confirmed", status: scheduledAt ? "scheduled" : "sending",
          scheduledAt, timezone: scheduledAt ? timezone : null,
          idempotencyKey: `${contentId}:v${version.number}:${attempt + 1}`,
        },
      });
      if (scheduledAt) await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-21", params: { n: String(version.number), canal: destination.label, date: formatMoment(scheduledAt, timezone) } });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new MissionError("M-81");
    throw error;
  }
  if (scheduledAt) return { status: "scheduled", url: null, message: `V${version.number} programmée sur ${destination.label} le ${formatMoment(scheduledAt, timezone)}, à quelques minutes près.` };
  return deliver(publicationId, content, version, destination, fetchImpl, now);
}

function contextOf(company: Company, destination: Destination) {
  return { emailVerified: company.emailVerifiedAt !== null, delegation: asDelegationLevel(company.delegationLevel), channelEnabled: destination.enabled, channelConnected: destination.connected };
}

/** « le 7 novembre vers 09:05 » dans le fuseau choisi par le dirigeant. */
export function formatMoment(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: timezone }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} vers ${part("hour")}:${part("minute")}`;
}

/** Appel au canal et résultat enregistré et journalisé ; commun à la diffusion immédiate et à l'ordonnanceur. */
async function deliver(publicationId: string, content: LoadedContent, version: ContentVersion, destination: Destination, fetchImpl: typeof fetch, now: Date): Promise<DiffusionResult> {
  const companyId = content.companyId;
  const outcome = await execute(publicationId, destination, content, version, fetchImpl, now);
  const n = String(version.number);
  await prisma.$transaction(async (tx) => {
    if (outcome.status === "sent") {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "sent", sentAt: now, channelLabel: destination.label, externalId: outcome.externalId, url: outcome.url, recipientCount: outcome.recipientCount } });
      const destinataires = outcome.recipientCount ? ` · ${outcome.recipientCount} destinataire${outcome.recipientCount > 1 ? "s" : ""}` : "";
      await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-22", params: { n, canal: destination.label, destinataires } });
    } else if (outcome.status === "failed") {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "failed", failureReason: outcome.reason } });
      if (outcome.tokenRejected && destination.channel) await tx.channelConnection.updateMany({ where: { companyId, channel: destination.channel }, data: { status: "erreur" } });
      await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-28", actor: "system", params: { n, canal: destination.label, motif: outcome.reason } });
    } else {
      await tx.publication.update({ where: { id: publicationId }, data: { status: "uncertain" } });
    }
  });

  if (outcome.status === "sent") return { status: "sent", url: outcome.url ?? null, message: destination.channel === "gmail" ? `V${n} envoyée depuis ${destination.label} à ${outcome.recipientCount} destinataire${(outcome.recipientCount ?? 0) > 1 ? "s" : ""}, un e-mail chacun.` : `V${n} publiée sur ${destination.label}.` };
  if (outcome.status === "failed") return { status: "failed", url: null, message: `Rien n'a été diffusé : ${outcome.reason}. La version reste validée.` };
  return { status: "uncertain", url: null, message: `${destination.label} n'a pas confirmé la diffusion. Vérifiez sur le canal, puis dites-le.` };
}

/** Annule les programmations visées (§5.3), chacune journalisée (J-23), dans la transaction de la décision qui les annule. */
export async function cancelScheduledPublications(tx: Prisma.TransactionClient, where: Prisma.PublicationWhereInput, reason: string, actor: "owner" | "system"): Promise<number> {
  const scheduled = await tx.publication.findMany({ where: { ...where, status: "scheduled" }, select: { id: true, companyId: true, missionId: true, versionNumber: true } });
  for (const publication of scheduled) {
    const written = await tx.publication.updateMany({ where: { id: publication.id, status: "scheduled" }, data: { status: "cancelled", cancelReason: reason, cancelledBy: actor } });
    if (written.count === 1) await writeJournal(tx, { companyId: publication.companyId, missionId: publication.missionId, code: "J-23", actor, params: { n: String(publication.versionNumber), raison: reason } });
  }
  return scheduled.length;
}

/** « Annuler la programmation » : la seule annulation possible ; la version reste validée. */
export async function cancelContentSchedule(companyId: string, contentId: string, input: { number: number }): Promise<DiffusionResult> {
  const { content, version } = await loadContent(companyId, contentId);
  if (input.number !== content.currentNumber) throw new MissionError("M-02");
  const cancelled = await prisma.$transaction(async (tx) => {
    await guardContent(tx, content);
    const count = await cancelScheduledPublications(tx, { contentId, versionNumber: version.number }, "annulée par vous", "owner");
    if (count === 0) throw new MissionError("M-87");
    return count;
  });
  return { status: "cancelled", url: null, message: `Programmation annulée${cancelled > 1 ? "s" : ""}. V${version.number} reste validée.` };
}

export type SchedulerReport = { sent: number; failed: number; uncertain: number; cancelled: number; stale: number };

/**
 * Ordonnanceur (addendum §7), appelé toutes les 5 minutes : chaque programmation due est réservée une seule fois,
 * les contrôles 2 à 9 sont rejoués (un refus l'annule, J-23, signalée au dirigeant), puis elle part comme une diffusion immédiate.
 * Une diffusion restée « en cours » plus de 15 minutes devient incertaine : jamais de relance.
 */
export async function runDuePublications({ now = new Date(), fetchImpl = fetch, limit = 20 }: { now?: Date; fetchImpl?: typeof fetch; limit?: number } = {}): Promise<SchedulerReport> {
  const report: SchedulerReport = { sent: 0, failed: 0, uncertain: 0, cancelled: 0, stale: 0 };
  report.stale = (await prisma.publication.updateMany({ where: { status: "sending", updatedAt: { lt: new Date(now.getTime() - SENDING_STALE_MS) } }, data: { status: "uncertain" } })).count;
  const due = await prisma.publication.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: limit });
  for (const publication of due) {
    const claimed = await prisma.publication.updateMany({ where: { id: publication.id, status: "scheduled" }, data: { status: "sending" } });
    if (claimed.count !== 1) continue;
    const { content, version } = await loadContent(publication.companyId, publication.contentId);
    const others = { ...content, publications: content.publications.filter((item) => item.id !== publication.id) };
    const destination = await readDestination(publication.companyId, snapshotOf(others).channel);
    const refusal = publication.versionNumber !== content.currentNumber
      ? { code: "M-02" as const }
      : checkDiffusion(snapshotOf(others), contextOf(content.company, destination), { number: publication.versionNumber, confirmed: true });
    if (refusal) {
      const reason = renderMissionMessage(refusal.code, refusal.params).replace(/\.$/, "");
      await prisma.$transaction(async (tx) => {
        await tx.publication.update({ where: { id: publication.id }, data: { status: "cancelled", cancelReason: reason, cancelledBy: "system" } });
        await writeJournal(tx, { companyId: publication.companyId, missionId: publication.missionId, code: "J-23", actor: "system", params: { n: String(publication.versionNumber), raison: reason } });
      });
      report.cancelled += 1;
      continue;
    }
    const result = await deliver(publication.id, content, version, destination, fetchImpl, now);
    report[result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "uncertain"] += 1;
  }
  return report;
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
    // E-mail : les envois sans réponse prennent le résultat vérifié ; ceux déjà partis le restent et ne seront pas renvoyés.
    await tx.publicationRecipient.updateMany({
      where: { publicationId: pending.id, status: { in: ["sending", "uncertain"] } },
      data: input.sent ? { status: "sent", sentAt: pending.createdAt } : { status: "failed", failureReason: "non parti, vérifié par vous" },
    });
    const delivered = await tx.publicationRecipient.count({ where: { publicationId: pending.id, status: "sent" } });
    if (input.sent && delivered > 0) await tx.publication.update({ where: { id: pending.id }, data: { recipientCount: delivered } });
    await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-25", params: { n: String(version.number), résultat: input.sent ? "diffusée" : "non diffusée" } });
  });
  return input.sent
    ? { status: "sent", url: pending.url, message: `V${version.number} enregistrée comme diffusée.` }
    : { status: "failed", url: null, message: `V${version.number} reste validée : vous pouvez la diffuser de nouveau.` };
}
