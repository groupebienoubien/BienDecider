export type MissionFormField = "finding" | "title" | "template" | "channel" | "scope" | "stopRuleDays" | "outcome";
export type MissionFormErrors = Partial<Record<MissionFormField, string>>;

export type MissionFormValues = {
  finding: string;
  title: string;
  outcome: string;
  scopeValue: string;
  stopRuleDays: string;
  templateKey: string;
  hasChannelChoice: boolean;
};

function invalidText(value: string, min: number, max: number) {
  const text = value.trim();
  return text.length < min || text.length > max || /[<>]/.test(text);
}

/** Lie les refus du serveur de création aux champs dont le contenu peut les avoir provoqués. */
export function missionFormErrors(code: unknown, values: MissionFormValues): MissionFormErrors {
  if (code === "M-20") {
    return {
      ...(invalidText(values.title, 5, 80) ? { title: "Précisez le titre en 5 à 80 caractères, sans balise HTML." } : {}),
      ...(invalidText(values.outcome, 5, 120) ? { outcome: "Décrivez le résultat recherché en 5 à 120 caractères, sans balise HTML." } : {}),
      ...(invalidText(values.finding, 10, 300) ? { finding: "Précisez le constat en 10 à 300 caractères, sans balise HTML." } : {}),
      ...(values.templateKey === "site_page" && values.scopeValue.trim() && invalidText(values.scopeValue, 1, 80)
        ? { scope: "Précisez le titre de la page en 1 à 80 caractères, sans balise HTML." }
        : {}),
    };
  }
  if (code === "M-17" && values.templateKey === "social_post") {
    return { scope: "Précisez le sujet de la publication en 5 à 120 caractères." };
  }
  if (code === "M-18" && values.templateKey === "custom") {
    return {
      ...(invalidText(values.scopeValue, 10, 300) ? { scope: "Décrivez le périmètre en 10 à 300 caractères, sans balise HTML." } : {}),
      ...(!Number.isInteger(Number(values.stopRuleDays)) || Number(values.stopRuleDays) < 7 || Number(values.stopRuleDays) > 90
        ? { stopRuleDays: "Choisissez une règle d'arrêt comprise entre 7 et 90 jours." }
        : {}),
    };
  }
  if (code === "M-25") return { outcome: "Décrivez le résultat recherché en 5 à 120 caractères." };
  if ((code === "M-67" || code === "M-68" || code === "M-69") && values.hasChannelChoice) {
    return { channel: "Choisissez un canal proposé pour ce type d'action." };
  }
  if (code === "M-76") return { template: "Choisissez un type d'action disponible." };
  return {};
}
