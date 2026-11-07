import { prisma } from "@/lib/prisma";
import { emailVerificationGateOpen } from "@/lib/email-verification-policy";
import { channelLabel } from "@/lib/missions/channels";
import { loadMissionViews, type MissionView } from "@/lib/missions/view";
import {
  CONTENT_STATUS_LABELS, channelBodyLimit, checkNewVersion, contentStatus, exposureFor, isReadOnly, reviewChecklist, titleLabel,
  type ChecklistItem, type ContentFormat, type ContentStatus,
} from "@/lib/contents/rules";
import { readSuggestion, snapshotOf, type ContentSuggestion } from "@/lib/contents/service";
import { PAUL_VERSION_CREDITS } from "@/lib/credits";
import { renderMissionMessage } from "@/lib/missions/messages";
import { DELEGATION_LABELS, asDelegationLevel, type DelegationLevel } from "@/lib/delegation-level";
import { SENDING_STALE_MS, formatMoment, readDestination } from "@/lib/contents/publish";
import { checkDiffusion } from "@/lib/contents/rules";
import { scopeAgencies } from "@/lib/agencies/service";

export type AtelierItem = { contentId: string; missionId: string; label: string };

export type VersionView = {
  number: number;
  title: string;
  body: string;
  author: "owner" | "paul" | "system";
  note: string | null;
  createdAt: string;
  rejectionReason: string | null;
  state: string;
};

/** Tout ce que l'atelier affiche d'un contenu, calculé côté serveur avec les mêmes règles que les décisions. */
export type ContentDetail = {
  id: string;
  mission: Pick<MissionView, "id" | "title" | "status" | "outcome" | "channel" | "channelLabel" | "scopeSummary">;
  format: ContentFormat;
  formatLabel: string;
  titleLabel: string;
  bodyLimit: number;
  currentNumber: number;
  validatedNumber: number | null;
  status: ContentStatus;
  statusLabel: string;
  readOnly: boolean;
  editRefusal: string | null;
  canValidate: boolean;
  channelConnected: boolean;
  exposure: string;
  companyName: string;
  versions: VersionView[];
  suggestion: ContentSuggestion | null;
  variantCost: number;
  delegation: DelegationLevel;
  delegationLabel: string;
  destination: { label: string; enabled: boolean; connected: boolean };
  /** Refus de « Diffuser maintenant » si on cochait la case : null quand la diffusion est possible. */
  publishRefusal: string | null;
  /** Dernière diffusion de la version courante (envoyée, déclarée, échouée, incertaine). */
  publication: PublicationView | null;
  /** La version courante attend une vérification qu'on peut déjà faire (incertaine, ou envoi sans réponse depuis 15 minutes). */
  resolvable: boolean;
  /** Dernière programmation de la version courante annulée par l'ordonnanceur : le dirigeant doit le savoir. */
  systemCancel: string | null;
  /** E-mail : les destinataires du périmètre, un envoi chacun. */
  recipients: { name: string; email: string }[];
};

export type PublicationView = { status: string; mode: string; channelLabel: string; sentAt: string | null; url: string | null; failureReason: string | null; scheduledLabel: string | null; recipients: { name: string; status: string; failureReason: string | null }[] };

const FORMAT_LABELS: Record<ContentFormat, string> = {
  social_post: "Publication",
  email: "E-mail individuel",
  site_page: "Page du site",
  google_post: "Publication Google",
  text: "Texte à diffuser vous-même",
};

/** Contenus de l'atelier dans l'ordre des missions (la priorité d'abord). */
export async function loadAtelierItems(companyId: string): Promise<AtelierItem[]> {
  const missions = await loadMissionViews(companyId);
  return missions.flatMap((mission) => (mission.contentId ? [{ contentId: mission.contentId, missionId: mission.id, label: `${mission.title} · ${mission.channelLabel}` }] : []));
}

export async function loadContentDetail(companyId: string, contentId: string): Promise<ContentDetail | null> {
  const content = await prisma.missionContent.findFirst({
    where: { id: contentId, companyId, currentNumber: { gt: 0 } },
    include: { mission: true, company: { select: { name: true, emailVerifiedAt: true, delegationLevel: true } }, versions: { orderBy: { number: "desc" } }, publications: { orderBy: { createdAt: "desc" }, include: { recipients: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!content) return null;
  const missions = await loadMissionViews(companyId);
  const mission = missions.find((item) => item.id === content.missionId);
  if (!mission) return null;
  const snapshot = snapshotOf(content);
  const status = contentStatus(snapshot);
  const editRefusal = checkNewVersion(snapshot);
  const delegation = asDelegationLevel(content.company.delegationLevel);
  const destination = await readDestination(companyId, snapshot.channel);
  const publishRefusal = checkDiffusion(snapshot, { emailVerified: emailVerificationGateOpen(content.company.emailVerifiedAt), delegation, channelEnabled: destination.enabled, channelConnected: destination.connected }, { number: content.currentNumber, confirmed: true });
  const latest = content.publications.find((publication) => publication.versionNumber === content.currentNumber && publication.status !== "cancelled") ?? null;
  const newest = content.publications.find((publication) => publication.versionNumber === content.currentNumber) ?? null;
  const sentVersions = new Set(content.publications.filter((publication) => publication.status === "sent").map((publication) => publication.versionNumber));
  const now = Date.now();
  return {
    id: content.id,
    mission: { id: mission.id, title: mission.title, status: mission.status, outcome: mission.outcome, channel: snapshot.channel, channelLabel: snapshot.channel ? channelLabel(snapshot.channel) : "Hors canal", scopeSummary: mission.scopeSummary },
    format: snapshot.format,
    formatLabel: FORMAT_LABELS[snapshot.format],
    titleLabel: titleLabel(snapshot.format),
    bodyLimit: channelBodyLimit(snapshot.channel),
    currentNumber: content.currentNumber,
    validatedNumber: content.validatedNumber,
    status,
    statusLabel: CONTENT_STATUS_LABELS[status],
    readOnly: isReadOnly(snapshot),
    editRefusal: editRefusal ? editRefusal.code : null,
    canValidate: mission.status === "active",
    channelConnected: destination.connected,
    exposure: exposureFor(snapshot.channel),
    companyName: content.company.name,
    versions: content.versions.map((version) => ({
      number: version.number,
      title: version.title,
      body: version.body,
      author: version.author === "paul" || version.author === "system" ? version.author : "owner",
      note: version.note,
      createdAt: version.createdAt.toISOString(),
      rejectionReason: version.rejectionReason,
      state: version.number === content.currentNumber
        ? (version.rejectionReason ? "Refusée" : CONTENT_STATUS_LABELS[status])
        : sentVersions.has(version.number) ? "Diffusée · archive" : version.rejectionReason ? "Refusée · archive" : CONTENT_STATUS_LABELS.archive,
    })),
    suggestion: readSuggestion(content.suggestion),
    variantCost: PAUL_VERSION_CREDITS,
    delegation,
    delegationLabel: DELEGATION_LABELS[delegation],
    destination: { label: destination.label, enabled: destination.enabled, connected: destination.connected },
    publishRefusal: publishRefusal ? renderMissionMessage(publishRefusal.code, publishRefusal.params) : null,
    publication: latest && { status: latest.status, mode: latest.mode, channelLabel: latest.channelLabel, sentAt: latest.sentAt?.toISOString() ?? null, url: latest.url, failureReason: latest.failureReason, scheduledLabel: latest.scheduledAt ? formatMoment(latest.scheduledAt, latest.timezone ?? "Europe/Paris") : null, recipients: latest.recipients.map((recipient) => ({ name: recipient.name, status: recipient.status, failureReason: recipient.failureReason })) },
    resolvable: latest !== null && (latest.status === "uncertain" || (latest.status === "sending" && now - latest.createdAt.getTime() > SENDING_STALE_MS)),
    systemCancel: newest?.status === "cancelled" && newest.cancelledBy === "system" ? newest.cancelReason : null,
    recipients: content.mission.template === "agencies" ? (await scopeAgencies(companyId, content.mission.scope)).map((agency) => ({ name: agency.name, email: agency.email })) : [],
  };
}

/** Programmations annulées par l'ordonnanceur (contrôle échoué à l'heure prévue), tant que rien d'autre n'a suivi sur la version courante. */
export async function loadCancelledSchedules(companyId: string): Promise<{ contentId: string; missionTitle: string; versionNumber: number; reason: string }[]> {
  const contents = await prisma.missionContent.findMany({
    where: { companyId, publications: { some: { status: "cancelled", cancelledBy: "system" } } },
    select: { id: true, currentNumber: true, mission: { select: { title: true, status: true } }, publications: { orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  return contents.flatMap((content) => {
    const last = content.publications[0];
    const open = content.mission.status !== "stopped" && content.mission.status !== "dismissed";
    return last && open && last.status === "cancelled" && last.cancelledBy === "system" && last.versionNumber === content.currentNumber
      ? [{ contentId: content.id, missionTitle: content.mission.title, versionNumber: last.versionNumber, reason: last.cancelReason ?? "contrôle échoué" }]
      : [];
  });
}

/** Points à vérifier pour une version (#179), calculés une fois côté serveur. */
export function checklistFor(version: Pick<VersionView, "title" | "body">): ChecklistItem[] {
  return reviewChecklist(`${version.title}\n${version.body}`);
}
