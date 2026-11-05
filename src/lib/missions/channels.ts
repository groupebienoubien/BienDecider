import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

/** Canaux d'une mission (addendum §2.2), rattachés à la source unique des capacités de canal. */
export const MISSION_CHANNELS = ["facebook", "instagram", "linkedin", "google_business_profile", "gmail", "site"] as const;
export type MissionChannel = (typeof MISSION_CHANNELS)[number];

const CAPABILITY_KEY = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  google_business_profile: "googleBusiness",
  gmail: "gmail",
  site: "site",
} as const satisfies Record<MissionChannel, keyof typeof CHANNEL_CAPABILITIES>;

export function isMissionChannel(value: unknown): value is MissionChannel {
  return typeof value === "string" && (MISSION_CHANNELS as readonly string[]).includes(value);
}

export function channelLabel(channel: MissionChannel): string {
  return CHANNEL_CAPABILITIES[CAPABILITY_KEY[channel]].label;
}

/** Un canal n'est actif que si son connecteur est livré (décision D4). */
export function isChannelEnabled(channel: MissionChannel): boolean {
  return CHANNEL_CAPABILITIES[CAPABILITY_KEY[channel]].enabled;
}
