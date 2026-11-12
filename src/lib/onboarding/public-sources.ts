export type PublicSourcePlatform = "website" | "facebook" | "instagram" | "linkedin";
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type PublicSourceCandidate = {
  platform: PublicSourcePlatform;
  url: string;
  source: string;
  readAt: string;
};

export type SocialSourceDecision = {
  platform: SocialPlatform;
  candidateUrl: string;
  confirmedUrl: string | null;
  status: "confirmed" | "rejected";
  source: string;
  readAt: string;
};

type Link = { url: URL; text: string };

export type SocialPublicationStatus = {
  platform: SocialPlatform;
  profile: "candidate_found" | "not_identified_in_read_pages";
  posts: "not_read";
  access: "not_checked";
};

/** Anonymous onboarding identifies links from read pages only; it never probes social posts or access. */
export function socialPublicationStatuses(candidates: PublicSourceCandidate[]): SocialPublicationStatus[] {
  return SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    profile: candidates.some((candidate) => candidate.platform === platform)
      ? "candidate_found"
      : "not_identified_in_read_pages",
    posts: "not_read",
    access: "not_checked",
  }));
}

function platformForHost(hostname: string): SocialPlatform | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "facebook.com" || host === "m.facebook.com") return "facebook";
  if (host === "instagram.com") return "instagram";
  if (host === "linkedin.com") return "linkedin";
  return null;
}

export function normalizeSocialProfileUrl(
  platform: SocialPlatform,
  value: string
): string | null {
  if (value.length > 600) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || platformForHost(url.hostname) !== platform) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const first = (parts[0] ?? "").toLowerCase();
  const blocked = new Set([
    "accounts", "direct", "explore", "login", "p", "reel", "reels", "share",
    "stories", "watch", "events", "groups", "posts", "feed", "in", "school"
  ]);
  if (blocked.has(first)) return null;

  if (platform === "facebook") {
    const simpleProfile = parts.length === 1 && /^[a-z0-9.]+$/i.test(parts[0]);
    const namedPage = parts.length === 3 && first === "pages" &&
      /^[a-z0-9.-]+$/i.test(parts[1]) && /^\d+$/.test(parts[2]);
    if (!simpleProfile && !namedPage) return null;
  }
  if (platform === "instagram" && (parts.length !== 1 || !/^[a-z0-9._]+$/i.test(parts[0]))) {
    return null;
  }
  if (
    platform === "linkedin" &&
    (parts.length !== 2 || first !== "company" || !/^[a-z0-9-]+$/i.test(parts[1]))
  ) {
    return null;
  }

  const canonicalHost = platform === "facebook" ? "www.facebook.com" : url.hostname.replace(/^www\./i, "");
  return `https://${canonicalHost}/${parts.join("/")}`;
}

export function socialCandidatesFromLinks(
  links: Link[],
  source: string,
  readAt: string
): PublicSourceCandidate[] {
  const candidates = new Map<string, PublicSourceCandidate>();
  for (const link of links) {
    const platform = platformForHost(link.url.hostname);
    if (!platform) continue;
    const url = normalizeSocialProfileUrl(platform, link.url.toString());
    if (!url || candidates.has(url)) continue;
    candidates.set(url, { platform, url, source, readAt });
    if (candidates.size >= 8) break;
  }
  return [...candidates.values()];
}

export function readSocialSourceDecisions(value: unknown): SocialSourceDecision[] {
  if (!Array.isArray(value)) return [];
  const decisions: SocialSourceDecision[] = [];
  for (const item of value.slice(0, 10)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (
      (raw.platform !== "facebook" && raw.platform !== "instagram" && raw.platform !== "linkedin") ||
      typeof raw.candidateUrl !== "string" ||
      typeof raw.source !== "string" ||
      typeof raw.readAt !== "string" ||
      (raw.status !== "confirmed" && raw.status !== "rejected")
    ) continue;
    const candidateUrl = normalizeSocialProfileUrl(raw.platform, raw.candidateUrl);
    if (!candidateUrl) continue;
    const confirmedUrl = raw.status === "confirmed" && typeof raw.confirmedUrl === "string"
      ? normalizeSocialProfileUrl(raw.platform, raw.confirmedUrl)
      : null;
    if (raw.status === "confirmed" && !confirmedUrl) continue;
    decisions.push({
      platform: raw.platform,
      candidateUrl,
      confirmedUrl,
      status: raw.status,
      source: raw.source.slice(0, 600),
      readAt: raw.readAt.slice(0, 40)
    });
  }
  return decisions;
}

export function decideSocialSources(
  candidates: PublicSourceCandidate[],
  value: unknown
): SocialSourceDecision[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const submitted = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    if (typeof raw.candidateUrl !== "string" || submitted.has(raw.candidateUrl)) return null;
    submitted.set(raw.candidateUrl, raw);
  }

  const decisions: SocialSourceDecision[] = [];
  for (const candidate of candidates) {
    if (candidate.platform === "website") continue;
    const raw = submitted.get(candidate.url);
    if (!raw) return null;
    const status = raw.status;
    if (status !== "confirmed" && status !== "rejected") return null;
    const confirmedUrl = status === "confirmed" && typeof raw.confirmedUrl === "string"
      ? normalizeSocialProfileUrl(candidate.platform, raw.confirmedUrl)
      : null;
    if (status === "confirmed" && !confirmedUrl) return null;
    decisions.push({
      platform: candidate.platform,
      candidateUrl: candidate.url,
      confirmedUrl,
      status,
      source: candidate.source,
      readAt: candidate.readAt
    });
  }
  return submitted.size === decisions.length ? decisions : null;
}
