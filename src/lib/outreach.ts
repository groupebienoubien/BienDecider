/**
 * Prise de contact déléguée (cf. docs/archives/backlog.md "partenaire de croissance",
 * décision CEO 2026-10-07) : même principe honnête que les connexions OAuth
 * (src/lib/oauth/*) — le réglage existe et peut être activé, mais tant
 * qu'aucun fournisseur d'envoi n'est configuré, Pepito ne peut matériellement
 * rien envoyer. `Company.autoOutreachEnabled` capture la décision du
 * dirigeant dès maintenant ; cette fonction capture l'état réel de l'infra.
 */
export function isOutreachSendingConfigured(): boolean {
  return Boolean(process.env.OUTREACH_EMAIL_PROVIDER_API_KEY);
}
