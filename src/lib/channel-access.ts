import { prisma } from "@/lib/prisma";
import { MISSION_CHANNELS, channelLabel, isChannelEnabled, type MissionChannel } from "@/lib/missions/channels";

/**
 * Accès d'une entreprise à un canal (#301). Deux réglages distincts :
 * le connecteur est livré (`channel-capabilities`, D4) ; le fournisseur a approuvé l'application, sinon
 * l'administrateur réserve le canal aux entreprises autorisées (comptes testeurs, #302). Sans réglage : ouvert à tous.
 */
export type AccessState = "disabled" | "open" | "granted" | "requested" | "none";

export const canUseChannel = (state: AccessState) => state === "open" || state === "granted";

/** Le site vitrine est hébergé par BienDecider : aucun fournisseur à approuver. */
export const RESTRICTABLE_CHANNELS = MISSION_CHANNELS.filter((channel) => channel !== "site");

export async function readChannelAccess(companyId: string, channel: MissionChannel): Promise<AccessState> {
  if (!isChannelEnabled(channel)) return "disabled";
  if (channel === "site") return "open";
  const rollout = await prisma.channelRollout.findUnique({ where: { channel } });
  if (!rollout || rollout.openToAll) return "open";
  const access = await prisma.channelAccess.findUnique({ where: { companyId_channel: { companyId, channel } } });
  return access?.status === "granted" ? "granted" : access?.status === "requested" ? "requested" : "none";
}

/** « Demander l'accès » : une seule demande par canal, visible dans l'administration. */
export async function requestChannelAccess(companyId: string, channel: MissionChannel): Promise<AccessState> {
  const state = await readChannelAccess(companyId, channel);
  if (state !== "none") return state;
  await prisma.channelAccess.upsert({
    where: { companyId_channel: { companyId, channel } },
    create: { companyId, channel, status: "requested", requestedAt: new Date() },
    update: {},
  });
  return "requested";
}

export async function setChannelRollout(channel: MissionChannel, openToAll: boolean, adminEmail: string): Promise<void> {
  await prisma.channelRollout.upsert({ where: { channel }, create: { channel, openToAll, updatedBy: adminEmail }, update: { openToAll, updatedBy: adminEmail } });
}

/** Accorder ou retirer l'accès d'une entreprise ; un retrait efface la ligne (une nouvelle demande reste possible). */
export async function setCompanyChannelAccess(companyId: string, channel: MissionChannel, granted: boolean, adminEmail: string): Promise<void> {
  if (!granted) {
    await prisma.channelAccess.deleteMany({ where: { companyId, channel } });
    return;
  }
  const now = new Date();
  await prisma.channelAccess.upsert({
    where: { companyId_channel: { companyId, channel } },
    create: { companyId, channel, status: "granted", grantedAt: now, grantedBy: adminEmail },
    update: { status: "granted", grantedAt: now, grantedBy: adminEmail },
  });
}

export type AccessOverview = {
  rollouts: { channel: MissionChannel; label: string; enabled: boolean; openToAll: boolean }[];
  accesses: { companyId: string; companyName: string; channel: MissionChannel; label: string; status: string; at: string | null }[];
};

export async function readAccessOverview(): Promise<AccessOverview> {
  const [rollouts, accesses] = await Promise.all([
    prisma.channelRollout.findMany(),
    prisma.channelAccess.findMany({ orderBy: [{ status: "desc" }, { requestedAt: "desc" }], take: 100, include: { company: { select: { name: true } } } }),
  ]);
  const open = new Map(rollouts.map((rollout) => [rollout.channel, rollout.openToAll]));
  return {
    rollouts: RESTRICTABLE_CHANNELS.map((channel) => ({ channel, label: channelLabel(channel), enabled: isChannelEnabled(channel), openToAll: open.get(channel) ?? true })),
    accesses: accesses.flatMap((access) => (RESTRICTABLE_CHANNELS as readonly string[]).includes(access.channel)
      ? [{ companyId: access.companyId, companyName: access.company.name, channel: access.channel as MissionChannel, label: channelLabel(access.channel as MissionChannel), status: access.status, at: (access.grantedAt ?? access.requestedAt)?.toISOString() ?? null }]
      : []),
  };
}
