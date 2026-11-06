/**
 * Conversations de Paul par contexte (spécification §16.1 et §16.2, décision D12, FR-56 et FR-58).
 * Partie pure : clé, titre, introduction et suggestions d'un contexte, sans accès base.
 * Une clé est un texte (« strategie », « mission:{id} », « idee:{n} ») : le contexte n'a pas de cycle de vie propre.
 */
import type { TemplateKey } from "@/lib/missions/templates";

export const PAUL_CONTEXT_KINDS = ["strategie", "mission", "contenu", "resultats", "ambition", "positionnement", "concurrence", "sources", "idee"] as const;
export type PaulContextKind = (typeof PAUL_CONTEXT_KINDS)[number];

/** Contextes sans identifiant (un seul fil par entreprise). */
const SINGLE_KINDS = ["strategie", "resultats", "ambition", "positionnement", "concurrence", "sources"] as const;
type SingleKind = (typeof SINGLE_KINDS)[number];

export type PaulContext =
  | { kind: SingleKind }
  | { kind: "mission" | "contenu"; id: string }
  | { kind: "idee"; n: number };

export const DEFAULT_CONTEXT_KEY = "strategie";
/** Messages relus par Paul et conservés par contexte (spécification §12). */
export const CONTEXT_HISTORY_MESSAGES = 60;
/** Messages affichés dans le panneau. */
export const CONTEXT_DISPLAYED_MESSAGES = 40;
export const MAX_IDEA_NUMBER = 999;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_KEY_LENGTH = 80;

/** Lit une clé de contexte ; null pour toute valeur inconnue ou mal formée (jamais d'exception). */
export function parseContextKey(value: unknown): PaulContext | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_KEY_LENGTH) return null;
  if ((SINGLE_KINDS as readonly string[]).includes(value)) return { kind: value as SingleKind };
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);
  if ((kind === "mission" || kind === "contenu") && ID_PATTERN.test(rest)) return { kind, id: rest };
  if (kind === "idee" && /^[1-9]\d{0,2}$/.test(rest)) return { kind, n: Number(rest) };
  return null;
}

export function contextKeyOf(context: PaulContext): string {
  switch (context.kind) {
    case "mission":
    case "contenu":
      return `${context.kind}:${context.id}`;
    case "idee":
      return `idee:${context.n}`;
    default:
      return context.kind;
  }
}

/** Titre du contexte (§16.1), affiché après « Paul à propos de » et dans le sélecteur. */
export function contextTitle(context: PaulContext, name?: string | null): string {
  switch (context.kind) {
    case "strategie":
      return "Votre stratégie";
    case "mission":
      return `Mission · ${name ?? "mission retirée"}`;
    case "contenu":
      return `Atelier · ${name ?? "contenu"}`;
    case "resultats":
      return "Bilan et prochaine décision";
    case "ambition":
      return "Votre ambition";
    case "positionnement":
      return "Votre positionnement";
    case "concurrence":
      return "La concurrence locale";
    case "sources":
      return "Fiabilité des sources";
    case "idee":
      return `Nouvelle idée n°${context.n}`;
  }
}

/** Introduction de Paul propre au contexte : premier message d'une conversation vide, jamais enregistré. */
export function contextIntro(context: PaulContext): string {
  switch (context.kind) {
    case "strategie":
      return "Parlons de votre stratégie : votre ambition, vos missions et votre prochaine décision. Je peux remettre en question une mission, proposer une priorité ou une nouvelle mission. Rien ne change sans votre accord.";
    case "mission":
      return "Parlons de cette mission : son résultat recherché, son périmètre et son étape. Je peux réduire le périmètre, vous expliquer les risques, la mettre en pause ou l'écarter du plan. Rien ne change sans votre accord.";
    case "contenu":
      return "Dites-moi ce que vous souhaitez changer : plus court, plus humain, un autre angle. Toute retouche crée une nouvelle version, à valider à nouveau.";
    case "resultats":
      return "Regardons d'abord la qualité des retours et leur origine. Une publication n'est pas une vente : si nous manquons de chiffres, gardons le test limité.";
    case "ambition":
      return "Parlons de votre ambition. Qu'est-ce qui doit primer : des retours rapides ou une présence plus solide ? Nous ajusterons le cap avant de le confirmer.";
    case "positionnement":
      return "Parlons de votre positionnement : ce qui vous distingue, et ce que vos clients doivent retenir de vous.";
    case "concurrence":
      return "Parlons de la concurrence locale. Je m'en sers pour affiner votre différence, pas pour copier les promesses des autres.";
    case "sources":
      return "Un constat n'a de valeur que par sa source. Dites-moi lequel vous paraît fragile : je distingue ce qui est observé, déclaré par vous ou supposé.";
    case "idee":
      return "Racontez-moi votre idée en une phrase. Nous préciserons son constat, son résultat attendu et le type d'action avant de créer une mission. Vous confirmerez ensuite son périmètre et son lancement.";
  }
}

/** Suggestion propre au modèle d'une mission (§16.2). */
function missionSuggestion(template?: TemplateKey | null): string {
  if (template === "agencies") return "Réduis à 1 agence";
  if (template === "leads") return "Limite à 5 contacts";
  if (template === "proof") return "Pourquoi cette mission ?";
  return "Quel canal choisir ?";
}

/** Suggestions rapides du contexte (§16.2). */
export function contextSuggestions(context: PaulContext, template?: TemplateKey | null): string[] {
  switch (context.kind) {
    case "strategie":
      return ["Que faire maintenant ?", "Combien ça coûte ?", "Quelle mission écarter ?", "Quel risque ?", "Comparer les pistes"];
    case "mission":
      return ["Que faire maintenant ?", "Quel risque ?", missionSuggestion(template), "Mets cette mission en pause", "Écarte cette mission"];
    case "contenu":
      return ["Plus court", "Plus humain", "Un autre angle", "Quel risque ?"];
    case "resultats":
      return ["Que faire maintenant ?", "Comment mesurer ?", "Comparer les pistes"];
    case "ambition":
      return ["Est-ce réaliste ?", "Quel budget prévoir ?"];
    case "idee":
      return ["Combien ça coûte ?", "Quel risque ?"];
    case "positionnement":
    case "concurrence":
    case "sources":
      return ["Que faut-il en retenir ?", "Comparer les pistes"];
  }
}

/** Contexte ouvert par défaut selon la page (§16.1) : la barre du haut ouvre la stratégie ailleurs. */
export function defaultContextKey(path: string): string {
  const mission = /^\/missions\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (mission && mission[1] !== "nouvelle") return `mission:${mission[1]}`;
  if (path === "/resultats") return "resultats";
  if (path === "/diagnostic") return "positionnement";
  return DEFAULT_CONTEXT_KEY;
}

/** Clé d'une nouvelle idée : le numéro suit la plus haute idée déjà ouverte. */
export function nextIdeaKey(keys: readonly string[]): string {
  const highest = keys.reduce((max, key) => {
    const context = parseContextKey(key);
    return context?.kind === "idee" ? Math.max(max, context.n) : max;
  }, 0);
  return `idee:${Math.min(highest + 1, MAX_IDEA_NUMBER)}`;
}
