import { TRADES } from "../trades.ts";
import { monthOf, parisDay, toCsv } from "../activation-rules.ts";
import type { DraftState } from "./draft-rules.ts";
import type { RubricKey } from "./analysis-rules.ts";

/**
 * Trace anonyme des visites du parcours d'entrée (#311, FR-60, spécification §1.5, addendum §4.12) : règles pures.
 * La trace est construite par liste blanche : seuls les champs de `VISIT_TRACE_FIELDS` existent, chacun réduit à une
 * valeur non identifiante (catalogue, code, booléen, nombre). Jamais de prénom, de nom d'entreprise, d'adresse de site,
 * de localisation exacte, de texte libre, d'adresse IP, de jeton, d'e-mail ni de lien vers le compte.
 * Imports relatifs en `.ts` (et de types seulement vers les modules à alias) : les tests node chargent ce fichier tel quel.
 */

export const VISIT_TRACE_RETENTION_MONTHS = 25;
/** En dessous de ce nombre de visites, un groupe (activité, département) n'est pas affiché seul : risque de réidentification. */
export const AGGREGATE_THRESHOLD = 5;
export const OTHER_TRADE = "Autre activité";
export const OTHERS_LABEL = "Autres";
export const UNKNOWN_DEPARTMENT_LABEL = "Non déterminé";
export const MASKED_LABEL = `moins de ${AGGREGATE_THRESHOLD}`;
/** Phrase de l'étape 1 et de la page de confidentialité (FR-60). */
export const VISIT_TRACE_NOTICE = "Nous gardons une trace anonyme de votre visite pour améliorer BienDecider.";

const RUBRICS = ["site", "google", "zone", "identity"] as const satisfies readonly RubricKey[];
const RUBRIC_STATUSES = ["pending", "read", "unavailable", "not_found"] as const;
const RUBRIC_REASONS = ["no_site", "unreadable", "refused", "service", "limit"] as const;
const RECRUITMENT = ["no", "possible", "unspecified"] as const;

export type TraceRubric = { status: (typeof RUBRIC_STATUSES)[number]; reason?: (typeof RUBRIC_REASONS)[number] };
export type TraceAmbition = { gainPercent: number | null; horizonMonths: number | null; mediaBudgetPerMonth: number | null; recruitment: (typeof RECRUITMENT)[number] };

/** Les seuls champs d'une trace (hors identifiant aléatoire) : toute autre clé est un défaut. */
export const VISIT_TRACE_FIELDS = ["startedOn", "lastStep", "abandonedStep", "trade", "department", "hasWebsite", "sourcesRead", "ambition", "proposedTemplates", "accountCreated", "analysisCostUsd"] as const;

export type VisitTraceData = {
  /** Jour de Paris du début du brouillon, à minuit UTC (colonne `DATE`). */
  startedOn: Date;
  lastStep: number;
  abandonedStep: number | null;
  trade: string | null;
  department: string | null;
  hasWebsite: boolean;
  sourcesRead: Partial<Record<RubricKey, TraceRubric>>;
  ambition: TraceAmbition | null;
  proposedTemplates: string[];
  accountCreated: boolean;
  analysisCostUsd: number;
};

/** Le brouillon tel qu'il est lu, avec l'étape la plus avancée et sa date de création. */
export type DraftSnapshot = { state: DraftState; furthestStep: number; createdAt: Date };

const clampStep = (value: number) => (Number.isInteger(value) ? Math.min(5, Math.max(1, value)) : 1);

/** Texte comparable : minuscules, sans accents, chaque signe remplacé par une espace. */
export function plainWords(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Activité du catalogue (src/lib/trades.ts), ou « Autre activité » : un texte libre peut contenir un nom propre. */
export function catalogTrade(value: string): string | null {
  const words = plainWords(value);
  if (!words) return null;
  return TRADES.find((trade) => plainWords(trade) === words) ?? OTHER_TRADE;
}

// Départements : nom et villes principales (préfectures et grandes villes), sans les noms ambigus (Saint-Denis, Vienne en Isère…).
const DEPARTMENTS: Record<string, readonly string[]> = {
  "01": ["Ain", "Bourg-en-Bresse", "Oyonnax"],
  "02": ["Aisne", "Laon", "Saint-Quentin", "Soissons"],
  "03": ["Allier", "Moulins", "Vichy", "Montluçon"],
  "04": ["Alpes-de-Haute-Provence", "Digne-les-Bains", "Manosque"],
  "05": ["Hautes-Alpes", "Gap", "Briançon"],
  "06": ["Alpes-Maritimes", "Nice", "Cannes", "Antibes", "Grasse", "Menton"],
  "07": ["Ardèche", "Privas", "Annonay", "Aubenas"],
  "08": ["Ardennes", "Charleville-Mézières", "Sedan"],
  "09": ["Ariège", "Foix", "Pamiers"],
  "10": ["Aube", "Troyes"],
  "11": ["Aude", "Carcassonne", "Narbonne"],
  "12": ["Aveyron", "Rodez", "Millau"],
  "13": ["Bouches-du-Rhône", "Marseille", "Aix-en-Provence", "Arles", "Martigues", "Aubagne", "Salon-de-Provence", "Istres"],
  "14": ["Calvados", "Caen", "Lisieux", "Bayeux"],
  "15": ["Cantal", "Aurillac"],
  "16": ["Charente", "Angoulême", "Cognac"],
  "17": ["Charente-Maritime", "La Rochelle", "Saintes", "Rochefort", "Royan"],
  "18": ["Cher", "Bourges", "Vierzon"],
  "19": ["Corrèze", "Tulle", "Brive-la-Gaillarde"],
  "2A": ["Corse-du-Sud", "Ajaccio", "Porto-Vecchio"],
  "2B": ["Haute-Corse", "Bastia", "Corte", "Calvi"],
  "21": ["Côte-d'Or", "Dijon", "Beaune"],
  "22": ["Côtes-d'Armor", "Saint-Brieuc", "Lannion", "Dinan"],
  "23": ["Creuse", "Guéret"],
  "24": ["Dordogne", "Périgueux", "Bergerac", "Sarlat-la-Canéda"],
  "25": ["Doubs", "Besançon", "Montbéliard", "Pontarlier"],
  "26": ["Drôme", "Valence", "Montélimar", "Romans-sur-Isère"],
  "27": ["Eure", "Évreux", "Vernon"],
  "28": ["Eure-et-Loir", "Chartres", "Dreux"],
  "29": ["Finistère", "Quimper", "Brest", "Morlaix"],
  "30": ["Gard", "Nîmes", "Alès"],
  "31": ["Haute-Garonne", "Toulouse"],
  "32": ["Gers", "Auch"],
  "33": ["Gironde", "Bordeaux", "Mérignac", "Pessac", "Arcachon", "Libourne"],
  "34": ["Hérault", "Montpellier", "Béziers", "Sète"],
  "35": ["Ille-et-Vilaine", "Rennes", "Saint-Malo"],
  "36": ["Indre", "Châteauroux"],
  "37": ["Indre-et-Loire", "Tours"],
  "38": ["Isère", "Grenoble", "Bourgoin-Jallieu", "Voiron"],
  "39": ["Jura", "Lons-le-Saunier", "Dole"],
  "40": ["Landes", "Mont-de-Marsan", "Dax"],
  "41": ["Loir-et-Cher", "Blois"],
  "42": ["Loire", "Saint-Étienne", "Roanne"],
  "43": ["Haute-Loire", "Le Puy-en-Velay"],
  "44": ["Loire-Atlantique", "Nantes", "Saint-Nazaire"],
  "45": ["Loiret", "Orléans", "Montargis"],
  "46": ["Lot", "Cahors"],
  "47": ["Lot-et-Garonne", "Agen"],
  "48": ["Lozère", "Mende"],
  "49": ["Maine-et-Loire", "Angers", "Cholet", "Saumur"],
  "50": ["Manche", "Saint-Lô", "Cherbourg", "Cherbourg-en-Cotentin"],
  "51": ["Marne", "Châlons-en-Champagne", "Reims", "Épernay"],
  "52": ["Haute-Marne", "Chaumont", "Saint-Dizier"],
  "53": ["Mayenne", "Laval"],
  "54": ["Meurthe-et-Moselle", "Nancy"],
  "55": ["Meuse", "Bar-le-Duc", "Verdun"],
  "56": ["Morbihan", "Vannes", "Lorient"],
  "57": ["Moselle", "Metz", "Thionville"],
  "58": ["Nièvre", "Nevers"],
  "59": ["Nord", "Lille", "Roubaix", "Tourcoing", "Dunkerque", "Valenciennes", "Douai", "Cambrai"],
  "60": ["Oise", "Beauvais", "Compiègne", "Creil"],
  "61": ["Orne", "Alençon"],
  "62": ["Pas-de-Calais", "Arras", "Calais", "Boulogne-sur-Mer", "Lens", "Béthune"],
  "63": ["Puy-de-Dôme", "Clermont-Ferrand"],
  "64": ["Pyrénées-Atlantiques", "Pau", "Bayonne", "Biarritz", "Anglet"],
  "65": ["Hautes-Pyrénées", "Tarbes", "Lourdes"],
  "66": ["Pyrénées-Orientales", "Perpignan"],
  "67": ["Bas-Rhin", "Strasbourg"],
  "68": ["Haut-Rhin", "Colmar", "Mulhouse"],
  "69": ["Rhône", "Lyon", "Villeurbanne", "Vénissieux"],
  "70": ["Haute-Saône", "Vesoul"],
  "71": ["Saône-et-Loire", "Mâcon", "Chalon-sur-Saône"],
  "72": ["Sarthe", "Le Mans"],
  "73": ["Savoie", "Chambéry"],
  "74": ["Haute-Savoie", "Annecy"],
  "75": ["Paris"],
  "76": ["Seine-Maritime", "Rouen", "Le Havre", "Dieppe"],
  "77": ["Seine-et-Marne", "Melun", "Meaux", "Fontainebleau"],
  "78": ["Yvelines", "Versailles"],
  "79": ["Deux-Sèvres", "Niort"],
  "80": ["Somme", "Amiens"],
  "81": ["Tarn", "Albi", "Castres"],
  "82": ["Tarn-et-Garonne", "Montauban"],
  "83": ["Var", "Toulon", "Fréjus", "Hyères", "Draguignan"],
  "84": ["Vaucluse", "Avignon"],
  "85": ["Vendée", "La Roche-sur-Yon", "Les Sables-d'Olonne"],
  "86": ["Vienne", "Poitiers", "Châtellerault"],
  "87": ["Haute-Vienne", "Limoges"],
  "88": ["Vosges", "Épinal"],
  "89": ["Yonne", "Auxerre"],
  "90": ["Territoire de Belfort", "Belfort"],
  "91": ["Essonne", "Évry-Courcouronnes"],
  "92": ["Hauts-de-Seine", "Nanterre", "Boulogne-Billancourt"],
  "93": ["Seine-Saint-Denis", "Bobigny", "Montreuil"],
  "94": ["Val-de-Marne", "Créteil", "Vitry-sur-Seine"],
  "95": ["Val-d'Oise", "Cergy", "Argenteuil"],
  "971": ["Guadeloupe", "Pointe-à-Pitre"],
  "972": ["Martinique", "Fort-de-France"],
  "973": ["Guyane", "Cayenne"],
  "974": ["La Réunion", "Réunion"],
  "976": ["Mayotte", "Mamoudzou"],
};

/** Noms comparables, du plus long au plus court : « Haute-Loire » l'emporte sur « Loire », « Marseille nord » sur « Nord ». */
const DEPARTMENT_NAMES: readonly { words: string; code: string }[] = Object.entries(DEPARTMENTS)
  .flatMap(([code, names]) => names.map((name) => ({ words: plainWords(name), code })))
  .sort((a, b) => b.words.length - a.words.length);

export const DEPARTMENT_CODES: readonly string[] = Object.keys(DEPARTMENTS);

function departmentFromPostalCode(code: string): string | null {
  if (code.startsWith("97")) return DEPARTMENTS[code.slice(0, 3)] ? code.slice(0, 3) : null;
  if (code.startsWith("20")) return Number(code.slice(2, 3)) <= 1 ? "2A" : "2B";
  const prefix = code.slice(0, 2);
  return DEPARTMENTS[prefix] ? prefix : null;
}

/**
 * Code du département tiré de la localisation (spécification §1.5) : un code postal à cinq chiffres, un code entre
 * parenthèses ou seul (« (33) », « 2A »), sinon le nom d'un département ou d'une ville principale. Jamais la commune ;
 * null si rien n'est reconnu.
 */
export function departmentFromLocation(location: string): string | null {
  const postal = /(?:^|\D)(\d{5})(?!\d)/.exec(location);
  if (postal) {
    const found = departmentFromPostalCode(postal[1]);
    if (found) return found;
  }
  const trimmed = location.trim().toUpperCase();
  const explicit = /\((\d{2,3}|2[AB])\)/i.exec(location)?.[1]?.toUpperCase() ?? (/^(\d{2,3}|2[AB])$/.test(trimmed) ? trimmed : null);
  if (explicit && DEPARTMENTS[explicit]) return explicit;
  const words = ` ${plainWords(location)} `;
  return DEPARTMENT_NAMES.find((name) => words.includes(` ${name.words} `))?.code ?? null;
}

const finiteOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Ambition interprétée : les quatre éléments retenus, jamais le texte. */
export function traceAmbition(state: DraftState): TraceAmbition | null {
  const terms = state.ambition?.terms;
  if (!terms) return null;
  return {
    gainPercent: finiteOrNull(terms.gainPercent),
    horizonMonths: finiteOrNull(terms.horizonMonths),
    mediaBudgetPerMonth: finiteOrNull(terms.mediaBudgetPerMonth),
    recruitment: (RECRUITMENT as readonly string[]).includes(terms.recruitment) ? terms.recruitment : "unspecified",
  };
}

/** État de chaque rubrique de l'analyse publique (§1.3) : statut et raison du catalogue, rien d'autre. */
export function traceSources(state: DraftState): Partial<Record<RubricKey, TraceRubric>> {
  const rubrics = state.analysis?.rubrics;
  if (!rubrics) return {};
  const sources: Partial<Record<RubricKey, TraceRubric>> = {};
  for (const key of RUBRICS) {
    const rubric = rubrics[key];
    if (!rubric || !(RUBRIC_STATUSES as readonly string[]).includes(rubric.status)) continue;
    const reason = rubric.reason && (RUBRIC_REASONS as readonly string[]).includes(rubric.reason) ? rubric.reason : undefined;
    sources[key] = reason ? { status: rubric.status, reason } : { status: rubric.status };
  }
  return sources;
}

/** Coût arrondi au cent : un montant exact permettrait de rapprocher la trace de la consommation reprise au compte. */
export function roundCost(usd: number): number {
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) / 100 : 0;
}

/** Jour de Paris d'une date, à minuit UTC : la valeur d'une colonne `DATE`, sans heure. */
export function dayOnly(date: Date): Date {
  return new Date(`${parisDay(date)}T00:00:00.000Z`);
}

/**
 * Trace d'un brouillon, juste avant son effacement (à l'inscription ou à l'expiration).
 * `proposedTemplates` : modèles des missions de l'étape 4, gardés seulement si le visiteur l'a atteinte.
 */
export function buildVisitTrace(draft: DraftSnapshot, outcome: { accountCreated: boolean; proposedTemplates: readonly string[] }): VisitTraceData {
  const { state } = draft;
  const lastStep = clampStep(Math.max(draft.furthestStep, state.step));
  return {
    startedOn: dayOnly(draft.createdAt),
    lastStep,
    abandonedStep: outcome.accountCreated ? null : clampStep(state.step),
    trade: catalogTrade(state.profile.trade),
    department: departmentFromLocation(state.profile.location),
    hasWebsite: state.profile.website.trim() !== "",
    sourcesRead: traceSources(state),
    ambition: traceAmbition(state),
    proposedTemplates: lastStep >= 4 ? outcome.proposedTemplates.filter((key) => /^[a-z_]{1,40}$/.test(key)) : [],
    accountCreated: outcome.accountCreated,
    analysisCostUsd: roundCost((state.analysis?.cost.usd ?? 0) + (state.ambition?.retainedCost?.usd ?? 0)),
  };
}

/** Premier jour conservé (heure de Paris) : les traces commencées avant sont effacées. 25 mois, jour borné à la fin du mois. */
export function retentionCutoff(now: Date, months = VISIT_TRACE_RETENTION_MONTHS): Date {
  const [year, month, day] = parisDay(now).split("-").map(Number);
  const index = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

// ——— Vue agrégée et export (administration) ———

export type TraceRow = Pick<VisitTraceData, "startedOn" | "lastStep" | "abandonedStep" | "trade" | "department" | "hasWebsite" | "sourcesRead" | "proposedTemplates" | "accountCreated" | "analysisCostUsd">;

/** Une ligne d'agrégat ; `null` : moins de `AGGREGATE_THRESHOLD`, non affiché. */
export type GroupCell = { label: string; visits: number | null; accounts: number | null };

export type VisitAggregate = {
  total: number;
  accounts: number;
  /** Visiteurs arrivés à « Un cap. Vos premières missions. » (étape 4), et ceux d'entre eux qui ont créé un compte. */
  reachedPlan: number;
  reachedPlanAccounts: number;
  withWebsite: number;
  byStep: { step: number; reached: number; abandoned: number }[];
  byTrade: GroupCell[];
  byDepartment: GroupCell[];
  byMonth: { month: string; visits: number; reachedPlan: number; accounts: number }[];
  sourcesRead: { key: RubricKey; read: number }[];
  proposedTemplates: { key: string; count: number }[];
  /** Coût moyen avant compte des visites sans compte ; null sans visite de ce type. */
  averageCostWithoutAccount: number | null;
};

const masked = (count: number) => (count >= AGGREGATE_THRESHOLD ? count : count === 0 ? 0 : null);

/**
 * Groupes d'une dimension avec seuil : un groupe de moins de 5 visites est fondu dans « Autres » ; si « Autres » reste
 * sous le seuil, ses nombres sont masqués. Les comptes créés d'un groupe affiché suivent la même règle.
 */
export function thresholdGroups(rows: readonly TraceRow[], key: (row: TraceRow) => string): GroupCell[] {
  const groups = new Map<string, { visits: number; accounts: number }>();
  for (const row of rows) {
    const label = key(row);
    const group = groups.get(label) ?? { visits: 0, accounts: 0 };
    group.visits += 1;
    if (row.accountCreated) group.accounts += 1;
    groups.set(label, group);
  }
  const shown: GroupCell[] = [];
  const others = { visits: 0, accounts: 0 };
  for (const [label, group] of [...groups.entries()].sort((a, b) => b[1].visits - a[1].visits || a[0].localeCompare(b[0]))) {
    if (group.visits >= AGGREGATE_THRESHOLD) shown.push({ label, visits: group.visits, accounts: masked(group.accounts) });
    else {
      others.visits += group.visits;
      others.accounts += group.accounts;
    }
  }
  if (others.visits > 0) shown.push({ label: OTHERS_LABEL, visits: masked(others.visits), accounts: masked(others.accounts) });
  return shown;
}

export function aggregateVisits(rows: readonly TraceRow[]): VisitAggregate {
  const plan = rows.filter((row) => row.lastStep >= 4);
  const withoutAccount = rows.filter((row) => !row.accountCreated);
  const months = new Map<string, { visits: number; reachedPlan: number; accounts: number }>();
  for (const row of rows) {
    const month = monthOf(row.startedOn.toISOString().slice(0, 10));
    const entry = months.get(month) ?? { visits: 0, reachedPlan: 0, accounts: 0 };
    entry.visits += 1;
    if (row.lastStep >= 4) entry.reachedPlan += 1;
    if (row.accountCreated) entry.accounts += 1;
    months.set(month, entry);
  }
  const templates = new Map<string, number>();
  for (const row of rows) for (const template of row.proposedTemplates) templates.set(template, (templates.get(template) ?? 0) + 1);
  return {
    total: rows.length,
    accounts: rows.filter((row) => row.accountCreated).length,
    reachedPlan: plan.length,
    reachedPlanAccounts: plan.filter((row) => row.accountCreated).length,
    withWebsite: rows.filter((row) => row.hasWebsite).length,
    byStep: [1, 2, 3, 4, 5].map((step) => ({
      step,
      reached: rows.filter((row) => row.lastStep >= step).length,
      abandoned: rows.filter((row) => row.abandonedStep === step).length,
    })),
    byTrade: thresholdGroups(rows, (row) => row.trade ?? "Activité non renseignée"),
    byDepartment: thresholdGroups(rows, (row) => row.department ?? UNKNOWN_DEPARTMENT_LABEL),
    byMonth: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, entry]) => ({ month, ...entry })),
    sourcesRead: RUBRICS.map((key) => ({ key, read: rows.filter((row) => row.sourcesRead[key]?.status === "read").length })),
    proposedTemplates: [...templates.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count })),
    averageCostWithoutAccount: withoutAccount.length ? withoutAccount.reduce((sum, row) => sum + row.analysisCostUsd, 0) / withoutAccount.length : null,
  };
}

const cellValue = (value: number | null) => (value === null ? MASKED_LABEL : value);

/** Export agrégé des traces : les mêmes tableaux que la vue, seuil compris ; aucune ligne par visite. */
export function visitsCsv(aggregate: VisitAggregate, labels: { step: (step: number) => string; rubric: (key: RubricKey) => string; template: (key: string) => string; period: string }): string {
  const lines: (string | number)[][] = [["Dimension", "Valeur", "Visites", "Comptes créés"]];
  lines.push(["Période", labels.period, aggregate.total, aggregate.accounts]);
  lines.push(["Étape 4 atteinte", "Un cap. Vos premières missions.", aggregate.reachedPlan, aggregate.reachedPlanAccounts]);
  for (const row of aggregate.byStep) lines.push(["Étape atteinte", labels.step(row.step), row.reached, ""], ["Étape d'abandon", labels.step(row.step), row.abandoned, ""]);
  for (const row of aggregate.byTrade) lines.push(["Activité", row.label, cellValue(row.visits), cellValue(row.accounts)]);
  for (const row of aggregate.byDepartment) lines.push(["Département", row.label, cellValue(row.visits), cellValue(row.accounts)]);
  for (const row of aggregate.byMonth) lines.push(["Mois", row.month, row.visits, row.accounts]);
  lines.push(["Site renseigné", "Oui", aggregate.withWebsite, ""]);
  for (const row of aggregate.sourcesRead) lines.push(["Rubrique lue", labels.rubric(row.key), row.read, ""]);
  for (const row of aggregate.proposedTemplates) lines.push(["Modèle proposé à l'étape 4", labels.template(row.key), row.count, ""]);
  lines.push(["Coût moyen avant compte, visites sans compte (USD)", "", aggregate.averageCostWithoutAccount === null ? "—" : aggregate.averageCostWithoutAccount.toFixed(2), ""]);
  return toCsv(lines);
}
