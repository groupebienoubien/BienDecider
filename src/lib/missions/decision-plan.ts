import { z } from "zod";
import type { TemplateKey } from "@/lib/missions/templates";
import { planningEvidenceSchema } from "@/lib/onboarding/intelligence-rules";

const DECISION_PLAN_TEXT = z.string().trim().min(5).max(240).refine((value) => !/[<>]/.test(value));

export const missionEvidenceSchema = planningEvidenceSchema;
export type MissionEvidence = z.infer<typeof missionEvidenceSchema>;

export const missionDecisionPlanSchema = z.object({
  selectionReason: DECISION_PLAN_TEXT,
  indicator: DECISION_PLAN_TEXT,
  collectionMethod: DECISION_PLAN_TEXT,
  effort: DECISION_PLAN_TEXT,
  prerequisites: DECISION_PLAN_TEXT,
  ownerAction: DECISION_PLAN_TEXT,
  evidence: z.array(missionEvidenceSchema).min(1).max(3).optional(),
}).strict();

const legacyMissionDecisionPlanSchema = missionDecisionPlanSchema.omit({ selectionReason: true });

export type MissionDecisionPlan = z.infer<typeof missionDecisionPlanSchema>;

export function createMissionDecisionPlan(
  template: TemplateKey,
  scope: Record<string, unknown>,
  selectionReason: string,
): MissionDecisionPlan {
  const effortByTemplate: Record<TemplateKey, string> = {
    agencies: "Préparer un contact individuel ; aucun envoi automatique.",
    leads: "Préparer un e-mail individuel ; aucun envoi automatique.",
    proof: "Préparer une publication avec un visuel et vérifier l'accord de diffusion.",
    social_post: `Préparer une publication sur ${typeof scope.topic === "string" ? scope.topic : "un sujet à choisir"}.`,
    google_profile: "Vérifier et préparer les informations de la fiche Google.",
    review_reply: "Choisir les avis concernés et préparer des réponses à valider.",
    site_page: `Préparer le contenu de la page ${typeof scope.page === "string" ? scope.page : "à définir"}.`,
    custom: "À convenir avec vous avant toute action.",
  };
  const prerequisitesByTemplate: Record<TemplateKey, string> = {
    agencies: "Un partenaire pertinent et votre accord pour le contacter.",
    leads: "Des contacts réutilisables et votre accord pour les contacter.",
    proof: "Une réalisation, une photo et l'accord du client.",
    social_post: "Un canal social actif, du temps disponible et votre validation avant publication.",
    google_profile: "L'accès à la fiche Google et votre validation des changements.",
    review_reply: "Des avis choisis et votre validation de chaque réponse.",
    site_page: "L'accès au site, du temps disponible et votre validation avant mise en ligne.",
    custom: "Le périmètre et les moyens sont à confirmer avec vous.",
  };
  const indicatorByTemplate: Record<TemplateKey, string> = {
    agencies: "Réponses reçues du ou des partenaires contactés.",
    leads: "Réponses et rendez-vous déclarés après les contacts.",
    proof: "Demandes attribuées à la publication, déclarées par vous.",
    social_post: "Demandes attribuées à la publication, déclarées par vous.",
    google_profile: "Informations vérifiées et contacts attribués, déclarés par vous.",
    review_reply: "Avis répondus et éventuels contacts déclarés par vous.",
    site_page: "Demandes attribuées à la page, déclarées par vous.",
    custom: "Indicateur à choisir avec vous avant le lancement.",
  };
  return {
    selectionReason,
    indicator: indicatorByTemplate[template],
    collectionMethod: "Au bilan de la mission, vous saisissez les résultats observés ; aucune attribution automatique n'est supposée.",
    effort: effortByTemplate[template],
    prerequisites: prerequisitesByTemplate[template],
    ownerAction: "Relire et confirmer le contenu et le périmètre avant tout envoi ou publication.",
  };
}

export function readMissionDecisionPlan(value: unknown): MissionDecisionPlan | null {
  const parsed = missionDecisionPlanSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const legacy = legacyMissionDecisionPlanSchema.safeParse(value);
  return legacy.success
    ? { ...legacy.data, selectionReason: "La raison comparative n'a pas été conservée pour cette ancienne mission." }
    : null;
}
