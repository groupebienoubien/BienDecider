import { prisma } from "@/lib/prisma";
import { channelLabel } from "@/lib/missions/channels";
import { loadMissionViews, type MissionView } from "@/lib/missions/view";
import {
  CONTENT_STATUS_LABELS, channelBodyLimit, checkNewVersion, contentStatus, exposureFor, isReadOnly, reviewChecklist, titleLabel,
  type ChecklistItem, type ContentFormat, type ContentStatus,
} from "@/lib/contents/rules";
import { readSuggestion, snapshotOf, type ContentSuggestion } from "@/lib/contents/service";
import { PAUL_VERSION_CREDITS } from "@/lib/credits";

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
};

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
    include: { mission: true, company: { select: { name: true } }, versions: { orderBy: { number: "desc" } } },
  });
  if (!content) return null;
  const missions = await loadMissionViews(companyId);
  const mission = missions.find((item) => item.id === content.missionId);
  if (!mission) return null;
  const snapshot = snapshotOf(content);
  const status = contentStatus(snapshot);
  const editRefusal = checkNewVersion(snapshot);
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
    channelConnected: mission.content?.channelConnected ?? false,
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
        : version.rejectionReason ? "Refusée · archive" : CONTENT_STATUS_LABELS.archive,
    })),
    suggestion: readSuggestion(content.suggestion),
    variantCost: PAUL_VERSION_CREDITS,
  };
}

/** Points à vérifier pour une version (#179), calculés une fois côté serveur. */
export function checklistFor(version: Pick<VersionView, "title" | "body">): ChecklistItem[] {
  return reviewChecklist(`${version.title}\n${version.body}`);
}
