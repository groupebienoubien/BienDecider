/**
 * Certitude et provenance des constats (#168, FR-6, FR-15, prd :101) : règles pures partagées par l'outil
 * de diagnostic, la Stratégie et les tests. Un constat n'est « Observé » que si sa source a été consultée.
 */

/** Certitudes que l'agent peut donner (outil record_audit_finding) : jamais « declare », réservée à la correction du dirigeant. */
export const CERTAINTY_LEVELS = ["observe", "piste", "a_verifier"] as const;
/** Constat corrigé par le dirigeant (#169) : déclaré, sans source à consulter. */
export const DECLARED_CERTAINTY = "declare";
export type Certainty = (typeof CERTAINTY_LEVELS)[number] | typeof DECLARED_CERTAINTY;

/** Libellé d'une mission créée par le dirigeant : son constat est déclaré, jamais observé. */
export const DECLARED_LABEL = "Déclaré par vous";

export const CERTAINTY_LABELS: Record<Certainty, string> = {
  observe: "Observé",
  piste: "Piste à qualifier",
  a_verifier: "À vérifier",
  declare: DECLARED_LABEL,
};

/** Ce que la certitude ne garantit pas, dit dans la fenêtre « Voir la source ». */
export const CERTAINTY_DETAILS: Record<Certainty, string> = {
  observe: "Source consultée par Paul : le constat décrit ce qui a été lu ce jour-là. La situation a pu changer depuis.",
  piste: "Paul en tire une piste sans preuve directe : elle reste à confirmer avec vous.",
  a_verifier: "La source n'a pas pu être lue entièrement : ce constat reste à vérifier.",
  declare: "Information corrigée par vous : Paul la tient pour juste. Elle n'a pas de source à consulter.",
};

export const FINDING_CATEGORY_LABELS: Record<string, string> = {
  site_web: "Site web",
  fiche_google: "Fiche Google",
  reseaux_sociaux: "Réseaux sociaux",
  concurrence: "Concurrence",
};

export const SOURCE_CONSULTED = "consultée";

export function isCertainty(value: unknown): value is Certainty {
  return typeof value === "string" && (value === DECLARED_CERTAINTY || (CERTAINTY_LEVELS as readonly string[]).includes(value));
}

/**
 * Certitude enregistrée : celle donnée par l'agent, sauf « Observé » sans source consultée (statut « consultée »
 * et adresse http(s) présente), ramené à « À vérifier ». Une valeur absente ou inconnue vaut « À vérifier ».
 * « Déclaré par vous » n'est écrit que par la correction du dirigeant (l'outil de l'agent ne l'accepte pas).
 */
export function normalizeCertainty(certainty: unknown, sourceStatus: string | null | undefined, sourceUrl: string | null | undefined): Certainty {
  if (!isCertainty(certainty)) return "a_verifier";
  if (certainty === "observe" && !(sourceStatus === SOURCE_CONSULTED && safeSourceUrl(sourceUrl?.trim()))) return "a_verifier";
  return certainty;
}

/** Adresse de source affichable et cliquable : seulement en http(s). */
export function safeSourceUrl(sourceUrl: string | null | undefined): string | null {
  return sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
}

function sourceDomain(sourceUrl: string | null | undefined): string | null {
  const safe = safeSourceUrl(sourceUrl);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

/** Origine d'un constat : sa catégorie, puis le domaine de sa source s'il y en a une. */
export function findingOrigin(category: string, sourceUrl: string | null | undefined): string {
  const label = FINDING_CATEGORY_LABELS[category] ?? category;
  const domain = sourceDomain(sourceUrl);
  return domain ? `${label} · ${domain}` : label;
}

const READ_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Date de lecture d'un constat, en heure de Paris. */
export function formatReadDate(at: Date | string): string {
  return READ_DATE.format(new Date(at));
}

/** Constat relié à une mission, tel que la Stratégie l'affiche. */
export type MissionSourceFinding = {
  id: string;
  title: string;
  category: string;
  content: string;
  sourceUrl: string | null;
  sourceStatus: string | null;
  certainty: Certainty;
  createdAt: string;
  /** Date de la dernière correction du dirigeant (#169) ; absente ou nulle pour un constat de Paul. */
  correctedAt?: string | null;
};

export type MissionProvenance = {
  title: string;
  origin: string;
  certainty: string;
  /** Couleur de l'étiquette de certitude. */
  tone: "green" | "blue" | "orange" | "gray";
  note: string;
  deduction: string;
  /** Seul un constat relié ouvre « Voir la source ». */
  source: MissionSourceFinding | null;
};

export const CERTAINTY_TONES: Record<Certainty, MissionProvenance["tone"]> = { observe: "green", piste: "blue", a_verifier: "orange", declare: "gray" };

/** Colonnes 1 et 2 d'une ligne de mission : constat relié, mission de Paul sans constat, ou mission du dirigeant. */
export function missionProvenance(mission: { createdBy: string; finding: string; deduction: string | null; source: MissionSourceFinding | null }): MissionProvenance {
  if (mission.createdBy === "owner") {
    return { title: "Votre constat", origin: "Déclaré à la création de la mission", certainty: DECLARED_LABEL, tone: "gray", note: mission.finding, deduction: "Vous avez choisi de le tester.", source: null };
  }
  const deduction = mission.deduction ?? "—";
  if (mission.source) {
    const certainty = normalizeCertainty(mission.source.certainty, mission.source.sourceStatus, mission.source.sourceUrl);
    return {
      title: mission.source.title,
      origin: findingOrigin(mission.source.category, mission.source.sourceUrl),
      certainty: CERTAINTY_LABELS[certainty],
      tone: CERTAINTY_TONES[certainty],
      note: mission.finding,
      deduction,
      source: { ...mission.source, certainty },
    };
  }
  return { title: "Constat relevé par Paul", origin: "Conversation avec Paul", certainty: CERTAINTY_LABELS.a_verifier, tone: "orange", note: mission.finding, deduction, source: null };
}
