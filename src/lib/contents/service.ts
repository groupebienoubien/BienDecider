import { Prisma, type ContentVersion, type Mission, type MissionContent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAUL_VERSION_CREDITS, debitCredits, ensureCreditGrant } from "@/lib/credits";
import { writeJournal, type JournalActor } from "@/lib/journal";
import { MissionError } from "@/lib/missions/messages";
import { channelLabel, isMissionChannel, type MissionChannel } from "@/lib/missions/channels";
import { scopeSummary } from "@/lib/missions/scope";
import type { MissionStatus } from "@/lib/missions/rules";
import type { TemplateKey } from "@/lib/missions/templates";
import {
  CONTENT_FORMATS, checkNewVersion, checkRejection, checkValidation, contentFormat, isReadOnly, parseVariant, validateDraft, validateRejection, variantLabel,
  type ContentFormat, type ContentSnapshot, type Refusal, type VariantRequest,
} from "@/lib/contents/rules";
import { anthropicDraftWriter, type DraftRequest, type DraftWriter } from "@/lib/contents/writer";
import { agencyNames } from "@/lib/agencies/service";
import { cancelScheduledPublications } from "@/lib/contents/publish";

export class ContentNotFoundError extends Error {
  constructor() {
    super("Contenu introuvable");
    this.name = "ContentNotFoundError";
  }
}

type Tx = Prisma.TransactionClient;
type PublicationState = { versionNumber: number; status: string };
type ContentWithMission = MissionContent & { mission: Mission; publications?: PublicationState[] };

/** Variante proposée par Paul, en attente : elle ne devient une version qu'à l'acceptation (FR-29). */
export type ContentSuggestion = { basedOn: number; variant: VariantRequest; title: string; body: string };

const REJECTIONS_FOR_PAUL = 5;

function refuse(refusal: Refusal): never {
  throw new MissionError(refusal.code, refusal.params);
}

function asFormat(value: string): ContentFormat {
  return (CONTENT_FORMATS as readonly string[]).includes(value) ? (value as ContentFormat) : "text";
}

function recipientsOf(mission: Mission): number {
  const scope = mission.scope !== null && typeof mission.scope === "object" && !Array.isArray(mission.scope) ? (mission.scope as Record<string, unknown>) : {};
  const ids = scope.contactIds ?? scope.agencyIds;
  return Array.isArray(ids) ? ids.length : 0;
}

/** État de la version courante d'après ses diffusions : programmée, diffusée, ou en attente de vérification (envoi en cours ou incertain). */
export function snapshotOf(content: ContentWithMission): ContentSnapshot {
  const format = asFormat(content.format);
  const current = (content.publications ?? []).filter((publication) => publication.versionNumber === content.currentNumber);
  return {
    missionStatus: content.mission.status as MissionStatus,
    channel: isMissionChannel(content.channel) ? content.channel : null,
    format,
    currentNumber: content.currentNumber,
    validatedNumber: content.validatedNumber,
    scheduled: current.some((publication) => publication.status === "scheduled"),
    currentDiffused: current.some((publication) => publication.status === "sent"),
    uncertain: current.some((publication) => publication.status === "uncertain" || publication.status === "sending"),
    recipients: format === "email" ? recipientsOf(content.mission) : null,
    hasVisual: false,
  };
}

export function readSuggestion(value: Prisma.JsonValue | null): ContentSuggestion | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const variant = parseVariant({ variant: (input.variant as Record<string, unknown> | undefined)?.kind, instruction: (input.variant as Record<string, unknown> | undefined)?.instruction });
  if (!variant.ok || typeof input.basedOn !== "number" || typeof input.title !== "string" || typeof input.body !== "string") return null;
  return { basedOn: input.basedOn, variant: variant.value, title: input.title, body: input.body };
}

async function rejectionsOf(client: Tx | typeof prisma, contentId: string): Promise<string[]> {
  const rejected = await client.contentVersion.findMany({ where: { contentId, rejectionReason: { not: null } }, orderBy: { number: "desc" }, take: REJECTIONS_FOR_PAUL, select: { rejectionReason: true } });
  return rejected.map((version) => version.rejectionReason as string);
}

async function draftRequest(companyId: string, mission: Mission, channel: MissionChannel | null, format: ContentFormat, base: DraftRequest["base"], variant: VariantRequest | null, rejections: string[]): Promise<DraftRequest> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, trade: true, servingArea: true, ownerName: true, website: true, targetClients: true, offers: true } });
  const names = mission.template === "agencies" ? await agencyNames(companyId, mission.scope) : {};
  return {
    companyId,
    company,
    mission: { title: mission.title, outcome: mission.outcome, finding: mission.finding, scopeSummary: scopeSummary(mission.template as TemplateKey, mission.scope, names) },
    channel,
    format,
    base,
    variant,
    rejections,
  };
}

async function write(writer: DraftWriter, request: DraftRequest) {
  try {
    return await writer(request);
  } catch (error) {
    if (error instanceof MissionError) throw error;
    // Quota, budget, modèle indisponible ou réponse illisible : rien n'est écrit, le dirigeant peut réessayer.
    console.error("[contents] Paul n'a pas pu écrire", error instanceof Error ? error.message : error);
    throw new MissionError("M-79");
  }
}

/** Nouvelle version : la validation et la proposition en attente sont retirées ; la version lue protège contre une écriture concurrente (M-02). */
async function addVersion(
  tx: Tx,
  content: ContentWithMission,
  version: { title: string; body: string; author: JournalActor; note: string },
  journal: { origine: string; actor: JournalActor },
  patch: Prisma.MissionContentUpdateManyMutationInput = {},
): Promise<ContentVersion> {
  const number = content.currentNumber + 1;
  const written = await tx.missionContent.updateMany({
    where: { id: content.id, version: content.version },
    data: { ...patch, currentNumber: number, validatedNumber: null, validatedAt: null, suggestion: Prisma.DbNull, version: { increment: 1 } },
  });
  if (written.count === 0) throw new MissionError("M-02");
  const created = await tx.contentVersion.create({ data: { contentId: content.id, number, title: version.title, body: version.body, author: version.author, note: version.note } });
  await writeJournal(tx, { companyId: content.companyId, missionId: content.missionId, code: "J-19", actor: journal.actor, params: { n: String(number), origine: journal.origine, mission: content.mission.title } });
  return created;
}

/**
 * Premier brouillon (§2.2) : préparé par Paul à la création ou au lancement, sans crédit. Idempotent :
 * un contenu qui a déjà une version est rendu tel quel ; deux demandes simultanées n'en créent qu'un.
 */
export async function prepareFirstDraft(companyId: string, missionId: string, writer: DraftWriter = anthropicDraftWriter): Promise<MissionContent> {
  const mission = await prisma.mission.findFirst({ where: { id: missionId, companyId }, include: { content: true } });
  if (!mission) throw new ContentNotFoundError();
  if (mission.content && mission.content.currentNumber > 0) return mission.content;
  if (isReadOnly({ missionStatus: mission.status as MissionStatus })) throw new MissionError("M-44");
  const channel = isMissionChannel(mission.channel) ? mission.channel : null;
  const format = contentFormat(channel);
  const draft = await write(writer, await draftRequest(companyId, mission, channel, format, null, null, []));
  return prisma.$transaction(async (tx) => {
    const content = await tx.missionContent.upsert({ where: { missionId }, create: { companyId, missionId, channel, format }, update: {} });
    if (content.currentNumber > 0) return content;
    await addVersion(tx, { ...content, mission }, { ...draft, author: "paul", note: "Premier brouillon préparé par Paul" }, { origine: "préparée par Paul (premier brouillon)", actor: "paul" });
    return tx.missionContent.findUniqueOrThrow({ where: { id: content.id } });
  }).catch((error: unknown) => {
    // L'autre demande a gagné : son brouillon fait foi.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.missionContent.findUniqueOrThrow({ where: { missionId } });
    throw error;
  });
}

/** Canal changé avant toute validation (J-29) : le texte est repris dans une nouvelle version à relire, au format du nouveau canal. */
export async function adaptContentToChannel(tx: Tx, mission: Mission): Promise<void> {
  const content = await tx.missionContent.findUnique({ where: { missionId: mission.id } });
  if (!content || content.currentNumber === 0) return;
  const current = await tx.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId: content.id, number: content.currentNumber } } });
  const channel = isMissionChannel(mission.channel) ? mission.channel : null;
  const label = channel ? channelLabel(channel) : "hors canal";
  await addVersion(
    tx,
    { ...content, mission },
    { title: current.title, body: current.body, author: "system", note: `Canal changé : ${label}. Texte à adapter` },
    { origine: `reprise pour ${label}`, actor: "system" },
    { channel, format: contentFormat(channel) },
  );
}

/** Verrouillage du périmètre (§6.2) d'après le contenu de la mission : programmation, version courante diffusée ou résultat à vérifier. */
export async function checkScopeLock(tx: Tx, missionId: string): Promise<void> {
  const content = await tx.missionContent.findUnique({ where: { missionId }, include: { mission: true, publications: { select: { versionNumber: true, status: true } } } });
  if (!content || content.currentNumber === 0) return;
  const snapshot = snapshotOf(content);
  if (snapshot.scheduled) throw new MissionError("M-88");
  if (snapshot.uncertain) throw new MissionError("M-81");
  if (snapshot.currentDiffused) throw new MissionError("M-89");
}

/** Agences ou contacts changés sur une mission En cours ou un contenu validé (§4.5) : nouvelle version « Destinataires modifiés », validation retirée. */
export async function markRecipientsChanged(tx: Tx, mission: Mission): Promise<void> {
  const content = await tx.missionContent.findUnique({ where: { missionId: mission.id } });
  if (!content || content.currentNumber === 0) return;
  if (mission.status !== "active" && content.validatedNumber === null) return;
  const current = await tx.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId: content.id, number: content.currentNumber } } });
  await addVersion(tx, { ...content, mission }, { title: current.title, body: current.body, author: "system", note: "Destinataires modifiés" }, { origine: "destinataires modifiés", actor: "system" });
}

/**
 * Profil corrigé après l'inscription (§4.5, J-02), dans la transaction de la correction : les programmations sont annulées (J-23),
 * puis chaque contenu modifiable reçoit une nouvelle version système à relire, sans validation. Un contenu en lecture seule,
 * diffusé ou en attente de vérification est laissé tel quel (checkNewVersion le refuse) ; J-02 est écrit dans tous les cas.
 */
export async function markProfileChanged(tx: Tx, companyId: string): Promise<void> {
  await cancelScheduledPublications(tx, { companyId }, "profil corrigé", "owner");
  const contents = await tx.missionContent.findMany({
    where: { companyId, currentNumber: { gt: 0 } },
    include: { mission: true, publications: { select: { versionNumber: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const content of contents) {
    if (checkNewVersion(snapshotOf(content))) continue;
    const current = await tx.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId: content.id, number: content.currentNumber } } });
    await addVersion(tx, content, { title: current.title, body: current.body, author: "system", note: "Profil corrigé : informations du contenu à vérifier" }, { origine: "à vérifier après correction du profil", actor: "system" });
  }
  await writeJournal(tx, { companyId, code: "J-02", params: {} });
}

const ACTIONS = ["save", "restore", "variant", "accept_variant", "dismiss_variant", "validate", "reject", "next_version"] as const;
export type ContentAction = (typeof ACTIONS)[number];

export type ContentRequest = { action: ContentAction; number: number; input: Record<string, unknown> };

/** Forme de la demande ; null si elle n'est pas lisible (400). `number` est la version vue par le dirigeant. */
export function parseContentBody(body: unknown): ContentRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const action = ACTIONS.find((candidate) => candidate === input.action);
  if (!action || typeof input.number !== "number" || !Number.isInteger(input.number) || input.number < 1) return null;
  return { action, number: input.number, input };
}

async function lockContent(tx: Tx, companyId: string, contentId: string, number: number): Promise<{ content: ContentWithMission; snapshot: ContentSnapshot; current: ContentVersion }> {
  const content = await tx.missionContent.findFirst({ where: { id: contentId, companyId }, include: { mission: true, publications: { select: { versionNumber: true, status: true } } } });
  if (!content || content.currentNumber === 0) throw new ContentNotFoundError();
  if (number !== content.currentNumber) throw new MissionError("M-02");
  const current = await tx.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId, number } } });
  return { content, snapshot: snapshotOf(content), current };
}

export type ContentActionResult = { currentNumber: number; balance: number | null };

/** Une décision de l'atelier, une transaction : contrôles, écriture, crédit et journal ensemble, ou rien. */
export async function applyContentAction(companyId: string, contentId: string, request: ContentRequest, writer: DraftWriter = anthropicDraftWriter): Promise<ContentActionResult> {
  if (request.action === "variant") return proposeVariant(companyId, contentId, request, writer);
  return prisma.$transaction(async (tx) => {
    const { content, snapshot, current } = await lockContent(tx, companyId, contentId, request.number);
    const done = async (balance: number | null = null) => ({ currentNumber: (await tx.missionContent.findUniqueOrThrow({ where: { id: content.id } })).currentNumber, balance });
    switch (request.action) {
      case "save": {
        const draft = validateDraft(request.input, snapshot.format);
        if (!draft.ok) refuse(draft);
        const refusal = checkNewVersion(snapshot);
        if (refusal) refuse(refusal);
        if (draft.value.title === current.title && draft.value.body === current.body) return done();
        await addVersion(tx, content, { ...draft.value, author: "owner", note: "Retouche directe par vous" }, { origine: "retouchée par vous", actor: "owner" });
        return done();
      }
      case "restore": {
        const from = request.input.from;
        if (typeof from !== "number" || !Number.isInteger(from) || from < 1 || from >= content.currentNumber) throw new MissionError("M-02");
        const refusal = checkNewVersion(snapshot);
        if (refusal) refuse(refusal);
        const source = await tx.contentVersion.findUniqueOrThrow({ where: { contentId_number: { contentId, number: from } } });
        await addVersion(tx, content, { title: source.title, body: source.body, author: "owner", note: `Reprise de V${from}` }, { origine: `reprise de V${from} par vous`, actor: "owner" });
        return done();
      }
      case "accept_variant": {
        const suggestion = readSuggestion(content.suggestion);
        if (!suggestion || suggestion.basedOn !== content.currentNumber) throw new MissionError("M-02");
        const refusal = checkNewVersion(snapshot);
        if (refusal) refuse(refusal);
        const balance = await debitCredits(tx, { companyId, amount: PAUL_VERSION_CREDITS, kind: "paul_version", label: `Version préparée avec Paul · ${content.mission.title}`, missionId: content.missionId });
        await addVersion(tx, content, { title: suggestion.title, body: suggestion.body, author: "paul", note: `Préparée avec Paul : ${variantLabel(suggestion.variant)}` }, { origine: "préparée avec Paul", actor: "owner" });
        return done(balance);
      }
      case "dismiss_variant": {
        await tx.missionContent.updateMany({ where: { id: content.id, version: content.version }, data: { suggestion: Prisma.DbNull, version: { increment: 1 } } });
        return done();
      }
      case "validate": {
        const refusal = checkValidation(snapshot, current, { number: request.number, reviewed: request.input.reviewed === true });
        if (refusal) refuse(refusal);
        const written = await tx.missionContent.updateMany({ where: { id: content.id, version: content.version }, data: { validatedNumber: current.number, validatedAt: new Date(), version: { increment: 1 } } });
        if (written.count === 0) throw new MissionError("M-02");
        await tx.mission.update({ where: { id: content.missionId }, data: { hasValidatedVersion: true } });
        await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-20", params: { n: String(current.number), titre: current.title } });
        return done();
      }
      case "reject": {
        const reason = validateRejection(request.input.reason);
        if (!reason.ok) refuse(reason);
        const refusal = checkRejection(snapshot, request.number);
        if (refusal) refuse(refusal);
        const written = await tx.missionContent.updateMany({ where: { id: content.id, version: content.version }, data: { validatedNumber: null, validatedAt: null, version: { increment: 1 } } });
        if (written.count === 0) throw new MissionError("M-02");
        await tx.contentVersion.update({ where: { id: current.id }, data: { rejectedAt: new Date(), rejectionReason: reason.value } });
        await writeJournal(tx, { companyId, missionId: content.missionId, code: "J-27", params: { n: String(current.number), motif: reason.value } });
        return done();
      }
      case "next_version": {
        // « Créer V(n+1) à partir de Vn » : seule façon de retravailler une version diffusée (FR-32).
        if (!snapshot.currentDiffused) throw new MissionError("M-02");
        const refusal = checkNewVersion(snapshot, { fromDiffused: true });
        if (refusal) refuse(refusal);
        await addVersion(tx, content, { title: current.title, body: current.body, author: "owner", note: `Nouvelle version créée à partir de V${current.number}, déjà diffusée` }, { origine: `créée à partir de V${current.number} déjà diffusée`, actor: "owner" });
        return done();
      }
      default:
        throw new MissionError("M-02");
    }
  });
}

/**
 * « Retravailler avec Paul » (FR-29) : la proposition est préparée sans crédit et gardée en attente ;
 * le crédit n'est débité qu'à l'acceptation. Le solde est vérifié avant d'appeler Paul pour ne rien proposer d'inacceptable.
 */
async function proposeVariant(companyId: string, contentId: string, request: ContentRequest, writer: DraftWriter): Promise<ContentActionResult> {
  const variant = parseVariant(request.input);
  if (!variant.ok) refuse(variant);
  const { content, snapshot, current } = await prisma.$transaction((tx) => lockContent(tx, companyId, contentId, request.number));
  const refusal = checkNewVersion(snapshot);
  if (refusal) refuse(refusal);
  await prisma.$transaction((tx) => ensureCreditGrant(tx, companyId));
  const { creditBalance } = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { creditBalance: true } });
  if (creditBalance < PAUL_VERSION_CREDITS) throw new MissionError("M-15", { n: PAUL_VERSION_CREDITS, m: creditBalance });
  const draft = await write(writer, await draftRequest(companyId, content.mission, snapshot.channel, snapshot.format, { title: current.title, body: current.body }, variant.value, await rejectionsOf(prisma, contentId)));
  const suggestion: ContentSuggestion = { basedOn: current.number, variant: variant.value, ...draft };
  const written = await prisma.missionContent.updateMany({ where: { id: content.id, currentNumber: current.number }, data: { suggestion, version: { increment: 1 } } });
  if (written.count === 0) throw new MissionError("M-02");
  return { currentNumber: current.number, balance: null };
}

/** Rejoue le premier brouillon d'une mission qui n'en a pas : pour la création et le lancement, sans bloquer la réponse. */
export async function prepareFirstDraftQuietly(companyId: string, missionId: string): Promise<void> {
  // Sans clé de modèle (poste local, tests), aucun appel ni réservation : l'atelier propose de préparer le brouillon à la demande.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return;
  await prepareFirstDraft(companyId, missionId).catch((error: unknown) => {
    if (!(error instanceof MissionError)) console.error("[contents] premier brouillon", error instanceof Error ? error.message : error);
  });
}
