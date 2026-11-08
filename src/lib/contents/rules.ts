import { channelLabel, type MissionChannel } from "@/lib/missions/channels";
import type { MissionMessageCode } from "@/lib/missions/messages";
import type { MissionStatus } from "@/lib/missions/rules";

/**
 * Règles de l'atelier (spécification §4 et §5.6, stories 11.1 à 11.3), en fonctions pures :
 * le serveur les applique, l'interface les affiche, les tests les vérifient sans base.
 */
export const CONTENT_FORMATS = ["social_post", "email", "site_page", "google_post", "text"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const TITLE_MAX = 100;
export const BODY_MAX = 3000;
export const REJECTION_MIN = 3;
export const REJECTION_MAX = 300;
export const INSTRUCTION_MIN = 5;
export const INSTRUCTION_MAX = 300;

/** Limite de texte propre au canal quand elle est plus stricte que la limite commune (§5.6). */
export const CHANNEL_BODY_LIMITS: Partial<Record<MissionChannel, number>> = { instagram: 2200, google_business_profile: 1500 };
/** Canaux qui ne publient pas sans visuel (§5.6). */
export const VISUAL_REQUIRED: readonly MissionChannel[] = ["instagram"];

export function contentFormat(channel: MissionChannel | null): ContentFormat {
  switch (channel) {
    case "facebook":
    case "instagram":
    case "linkedin":
      return "social_post";
    case "gmail":
      return "email";
    case "site":
      return "site_page";
    case "google_business_profile":
      return "google_post";
    default:
      return "text";
  }
}

/** Nom du champ court selon le format : l'objet d'un e-mail, le titre d'une page, l'accroche d'une publication. */
export function titleLabel(format: ContentFormat): string {
  return format === "email" ? "Objet" : format === "site_page" ? "Titre de la page" : "Accroche";
}

export type Refusal = { code: MissionMessageCode; params?: Record<string, string | number> };
type Checked<T> = { ok: true; value: T } | ({ ok: false } & Refusal);

const length = (element: string, min: number, max: number): Refusal => ({ code: "M-16", params: { element, min, max, unite: "caractères" } });

/** Texte d'une version saisie par le dirigeant : accroche ou objet de 1 à 100 caractères, texte de 1 à 3 000. */
export function validateDraft(input: unknown, format: ContentFormat): Checked<{ title: string; body: string }> {
  const value = input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.replace(/\r\n/g, "\n").trim() : "";
  if (title.length < 1 || title.length > TITLE_MAX) return { ok: false, ...length(titleLabel(format), 1, TITLE_MAX) };
  if (body.length < 1 || body.length > BODY_MAX) return { ok: false, ...length("Le texte", 1, BODY_MAX) };
  return { ok: true, value: { title, body } };
}

export function validateRejection(input: unknown): Checked<string> {
  const reason = typeof input === "string" ? input.trim() : "";
  if (reason.length < REJECTION_MIN || reason.length > REJECTION_MAX) return { ok: false, ...length("Le motif", REJECTION_MIN, REJECTION_MAX) };
  return { ok: true, value: reason };
}

/** Façons de retravailler avec Paul (FR-29) ; la consigne libre est bornée. */
export const VARIANTS = { shorter: "Plus court", human: "Plus humain", angle: "Un autre angle", custom: "Votre consigne" } as const;
export type VariantKind = keyof typeof VARIANTS;
export type VariantRequest = { kind: VariantKind; instruction: string | null };

export function parseVariant(input: unknown): Checked<VariantRequest> {
  const value = input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const kind = (Object.keys(VARIANTS) as VariantKind[]).find((key) => key === value.variant);
  if (!kind) return { ok: false, code: "M-78" };
  if (kind !== "custom") return { ok: true, value: { kind, instruction: null } };
  const instruction = typeof value.instruction === "string" ? value.instruction.trim() : "";
  if (instruction.length < INSTRUCTION_MIN || instruction.length > INSTRUCTION_MAX || /[<>]/.test(instruction)) return { ok: false, code: "M-78" };
  return { ok: true, value: { kind, instruction } };
}

export function variantLabel(request: VariantRequest): string {
  return request.kind === "custom" && request.instruction ? `« ${request.instruction} »` : VARIANTS[request.kind].toLowerCase();
}

/** Ce que l'atelier sait d'un contenu pour décider : la mission, la version courante, sa validation et sa diffusion. */
export type ContentSnapshot = {
  missionStatus: MissionStatus;
  channel: MissionChannel | null;
  format: ContentFormat;
  currentNumber: number;
  validatedNumber: number | null;
  scheduled: boolean;
  currentDiffused: boolean;
  /** Destinataires du périmètre pour un e-mail ; null hors e-mail. */
  recipients: number | null;
  hasVisual: boolean;
  /** Une diffusion de la version courante attend la vérification du dirigeant (§5.5). */
  uncertain?: boolean;
};

/** Ce que la diffusion vérifie en plus du contenu (§5.1). */
export type DiffusionContext = {
  emailVerified: boolean;
  delegation: "prepare" | "review" | "bounded";
  channelEnabled: boolean;
  channelConnected: boolean;
};

export type ContentStatus = "draft" | "validated" | "scheduled" | "diffused";
export const CONTENT_STATUS_LABELS: Record<ContentStatus | "archive", string> = { draft: "Brouillon", validated: "Validée", scheduled: "Programmée", diffused: "Diffusée", archive: "Archive" };

export function contentStatus(content: ContentSnapshot): ContentStatus {
  if (content.currentDiffused) return "diffused";
  if (content.scheduled) return "scheduled";
  return content.validatedNumber === content.currentNumber ? "validated" : "draft";
}

/** Contenu en lecture seule : mission arrêtée ou écartée (M-44). */
export function isReadOnly(content: Pick<ContentSnapshot, "missionStatus">): boolean {
  return content.missionStatus === "stopped" || content.missionStatus === "dismissed";
}

/** Créer une version (§4.3) : refusée si la mission est close, la version programmée, ou diffusée hors « Créer V(n+1) à partir de Vn ». */
export function checkNewVersion(content: ContentSnapshot, options: { fromDiffused?: boolean } = {}): Refusal | null {
  if (isReadOnly(content)) return { code: "M-44" };
  if (content.scheduled) return { code: "M-45" };
  if (content.uncertain) return { code: "M-81" };
  if (content.currentDiffused && !options.fromDiffused) return { code: "M-46", params: { n: content.currentNumber } };
  return null;
}

/** Limite de texte du canal, si elle existe : la limite commune de 3 000 caractères s'applique sinon. */
export function channelBodyLimit(channel: MissionChannel | null): number {
  return (channel && CHANNEL_BODY_LIMITS[channel]) ?? BODY_MAX;
}

/** Contraintes du canal (§5.6) : visuel obligatoire, longueur maximale. */
export function checkChannelConstraints(content: Pick<ContentSnapshot, "channel" | "hasVisual">, body: string): Refusal | null {
  if (!content.channel) return null;
  if (VISUAL_REQUIRED.includes(content.channel) && !content.hasVisual) return { code: "M-65", params: { canal: channelLabel(content.channel) } };
  const limit = channelBodyLimit(content.channel);
  if (body.length > limit) return { code: "M-66", params: { n: limit, canal: channelLabel(content.channel) } };
  return null;
}

/** Note de la version système écrite après une correction du profil (§4.5, J-02). */
export const PROFILE_REVIEW_NOTE = "Profil corrigé : informations du contenu à vérifier";
export const PROFILE_REVIEW_BADGE = "Profil à relire";

/** Version système écrite après une correction du profil (§4.5). */
export function isProfileReview(version: { author?: string | null; note?: string | null } | null | undefined): boolean {
  return version?.author === "system" && version.note === PROFILE_REVIEW_NOTE;
}

/**
 * « Profil à relire » (#169) : une version système de correction du profil existe, et aucune version du dirigeant ou de Paul
 * ne l'a suivie. Une autre version système (canal, destinataires) ne lève pas le blocage : personne n'a relu le contenu.
 */
export function profileReviewPending(versions: readonly { number: number; author: string; note: string | null }[]): boolean {
  const ordered = [...versions].sort((a, b) => a.number - b.number);
  let pending = false;
  for (const version of ordered) {
    if (isProfileReview(version)) pending = true;
    else if (version.author === "owner" || version.author === "paul") pending = false;
  }
  return pending;
}

/**
 * Valider une version (§4.4), conditions dans l'ordre de la spécification.
 * Le profil relu (3) : refusé tant que le contenu est « à relire » après une correction du profil (M-92, #169) ; la réactivation (5)
 * et la marque du visuel (6) arrivent avec leurs US ; elles n'ont pas d'objet ici aujourd'hui.
 */
export function checkValidation(content: ContentSnapshot, version: { number: number; body: string }, input: { number: number; reviewed: boolean; profileToReview?: boolean }): Refusal | null {
  if (input.number !== content.currentNumber || version.number !== content.currentNumber) return { code: "M-02" };
  if (content.missionStatus !== "active") return { code: "M-47" };
  if (input.profileToReview) return { code: "M-92" };
  if (content.format === "email" && !content.recipients) return { code: "M-49" };
  const constraint = checkChannelConstraints(content, version.body);
  if (constraint) return constraint;
  if (content.scheduled) return { code: "M-52" };
  if (content.currentDiffused) return { code: "M-53" };
  if (!input.reviewed) return { code: "M-77" };
  return null;
}

/** Refuser une version : seulement la version courante, non diffusée, d'une mission ouverte. */
export function checkRejection(content: ContentSnapshot, number: number): Refusal | null {
  if (isReadOnly(content)) return { code: "M-44" };
  if (number !== content.currentNumber) return { code: "M-02" };
  if (content.scheduled) return { code: "M-45" };
  if (content.uncertain) return { code: "M-81" };
  if (content.currentDiffused) return { code: "M-46", params: { n: content.currentNumber } };
  return null;
}

/** Diffuser par BienDecider (§5.1), contrôles dans l'ordre de la spécification ; `scheduledAt` programme au lieu de diffuser maintenant. */
export function checkDiffusion(content: ContentSnapshot, context: DiffusionContext, input: { number: number; confirmed: boolean; scheduledAt?: Date | null; now?: Date }): Refusal | null {
  if (input.number !== content.currentNumber) return { code: "M-02" };
  if (!context.emailVerified) return { code: "M-54" };
  if (context.delegation === "prepare") return { code: "M-55" };
  if (content.missionStatus !== "active") return { code: "M-56" };
  if (!content.channel) return { code: "M-80" };
  if (!context.channelEnabled) return { code: "M-67", params: { canal: channelLabel(content.channel) } };
  if (!context.channelConnected) return { code: "M-57" };
  if (content.validatedNumber !== content.currentNumber) return { code: "M-58" };
  if (content.scheduled) return { code: "M-59" };
  if (content.uncertain) return { code: "M-81" };
  if (content.currentDiffused) return { code: "M-53" };
  if (content.format === "email" && !content.recipients) return { code: "M-49" };
  if (input.scheduledAt && !isSchedulable(input.scheduledAt, input.now ?? new Date())) return { code: "M-61" };
  if (!input.confirmed) return { code: "M-82" };
  return null;
}

/** Une programmation part au moins 5 minutes plus tard (le passage de l'ordonnanceur) et au plus dans un an. */
export const SCHEDULE_MIN_MS = 5 * 60 * 1000;
export const SCHEDULE_MAX_MS = 365 * 24 * 3600 * 1000;

export function isSchedulable(at: Date, now: Date): boolean {
  const delay = at.getTime() - now.getTime();
  return Number.isFinite(delay) && delay >= SCHEDULE_MIN_MS && delay <= SCHEDULE_MAX_MS;
}

/** Moment demandé : un instant ISO (UTC) et le fuseau de l'appareil, gardé pour l'affichage ; null pour « Maintenant », undefined si illisible. */
export function parseSchedule(at: unknown, timezone: unknown): { at: Date; timezone: string } | null | undefined {
  if (at === undefined || at === null) return null;
  if (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(at)) return undefined;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return undefined;
  const zone = typeof timezone === "string" && timezone.length <= 64 && isTimeZone(timezone) ? timezone : "Europe/Paris";
  return { at: date, timezone: zone };
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const DECLARED_CHANNEL_MIN = 2;
export const DECLARED_CHANNEL_MAX = 60;

/** Déclarer une diffusion faite par le dirigeant (§5.4) : date passée ou du jour, où, et la case de confirmation. */
export function checkDeclaration(content: ContentSnapshot, input: { number: number; channel: unknown; date: unknown; confirmed: boolean }, now: Date): Checked<{ channel: string; date: Date }> {
  const refuse = (refusal: Refusal): Checked<{ channel: string; date: Date }> => ({ ok: false, ...refusal });
  if (input.number !== content.currentNumber) return refuse({ code: "M-02" });
  if (content.missionStatus !== "active") return refuse({ code: "M-56" });
  if (content.validatedNumber !== content.currentNumber) return refuse({ code: "M-58" });
  if (content.scheduled) return refuse({ code: "M-59" });
  if (content.uncertain) return refuse({ code: "M-81" });
  if (content.currentDiffused) return refuse({ code: "M-53" });
  const channel = typeof input.channel === "string" ? input.channel.trim() : "";
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? new Date(`${input.date}T12:00:00Z`) : null;
  const latest = new Date(now.getTime() + 14 * 3600 * 1000);
  const earliest = new Date(now.getTime() - 366 * 24 * 3600 * 1000);
  if (channel.length < DECLARED_CHANNEL_MIN || channel.length > DECLARED_CHANNEL_MAX || /[<>]/.test(channel) || !date || Number.isNaN(date.getTime()) || date > latest || date < earliest) return refuse({ code: "M-83" });
  if (!input.confirmed) return refuse({ code: "M-84" });
  return { ok: true, value: { channel, date } };
}

/** Qui verra le texte, selon le canal (#179). */
export function exposureFor(channel: MissionChannel | null): string {
  switch (channel) {
    case "facebook":
      return "Les personnes qui suivent votre Page Facebook, et celles à qui elles la partagent.";
    case "instagram":
      return "Les personnes qui suivent votre compte Instagram.";
    case "linkedin":
      return "Votre réseau LinkedIn, sous votre nom.";
    case "google_business_profile":
      return "Toute personne qui consulte votre fiche Google.";
    case "gmail":
      return "Chaque destinataire, depuis votre adresse et sous votre nom.";
    case "site":
      return "Tous les visiteurs de votre site.";
    default:
      return "Les personnes à qui vous le diffuserez vous-même.";
  }
}

export type ChecklistItem = { kind: "price" | "phone" | "email" | "link" | "date" | "promise"; label: string; excerpts: string[] };

const DETECTORS: { kind: ChecklistItem["kind"]; label: string; pattern: RegExp }[] = [
  { kind: "price", label: "Prix, remises et montants", pattern: /\d[\d\s.,]*\s?(?:€|euros?\b|%|EUR\b)/gi },
  { kind: "phone", label: "Numéros de téléphone", pattern: /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g },
  { kind: "email", label: "Adresses e-mail", pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { kind: "link", label: "Liens", pattern: /(?:https?:\/\/|www\.)[^\s)]*[^\s).,;:!?]/gi },
  { kind: "date", label: "Dates, horaires et délais", pattern: /(?<![\p{L}\d])(?:\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{1,2}\s?h(?:\s?\d{2})?|\d{1,2}\s(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)|sous\s\d+\s(?:jours?|heures?|semaines?))(?![\p{L}\d])/giu },
  { kind: "promise", label: "Promesses et engagements", pattern: /(?<!\p{L})(?:garanti(?:e|s|es)?|gratuit(?:e|s|es)?|offert(?:e|s|es)?|sans engagement|satisfait ou rembours\p{L}*|meilleur(?:e|s|es)?|n°\s?1|le moins cher|immédiat(?:e|s|es)?|certifié(?:e|s|es)?|agréé(?:e|s|es)?)(?![\p{L}\d])/giu },
];

/**
 * Points à vérifier avant de valider (#179) : ce qui engage l'entreprise est repéré dans le texte.
 * C'est une aide à la relecture, pas une vérification : seul le dirigeant sait si c'est exact.
 */
export function reviewChecklist(text: string): ChecklistItem[] {
  return DETECTORS.flatMap(({ kind, label, pattern }) => {
    const found = [...new Set((text.match(pattern) ?? []).map((match) => match.trim()).filter(Boolean))].slice(0, 4);
    return found.length ? [{ kind, label, excerpts: found }] : [];
  });
}
