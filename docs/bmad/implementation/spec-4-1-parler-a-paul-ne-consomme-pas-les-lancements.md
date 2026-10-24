---
title: 'Story 4.1 — Parler à Paul ne consomme pas les lancements'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: 'd3a3c6ed83fb1a555541c81305142df3b9dbd4d2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** au troisième test en production, 7 messages à Paul, l'audit, une exécution de Jean-Claude et une révision ont épuisé le quota de 10 lancements par jour : Paul, les agents et « Préremplir mon profil » étaient bloqués jusqu'au lendemain. Chaque appel direct au modèle compte autant qu'une exécution d'agent.

**Approach:** décision des PF du 2026-10-24 (option A) : deux compteurs. Les messages à Paul et « Préremplir mon profil » ont leur propre limite, 50 par jour et 500 par mois ; les lancements d'agents (tentatives d'exécution et mise en ligne du site) gardent 10 par jour et 100 par mois. Le plafond de dépense reste commun et inchangé. Jours et mois comptés en heure de Paris ; les messages de limite disent quand réessayer.

## Boundaries & Constraints

**Always:** colonnes `Company.dailyChatMessageLimit` (défaut 50) et `monthlyChatMessageLimit` (défaut 500), migration additive (les entreprises existantes reçoivent les défauts) ; compteur de messages = `UsageReservation` de `purpose` `co_ceo_chat` ou `onboarding_interpret` ; compteur de lancements = `AgentRunAttempt` + toute autre `UsageReservation` ; un appel de Paul ou de « Préremplir » ne vérifie que le compteur de messages et le budget, un lancement que le compteur de lancements et le budget ; fenêtres jour et mois à minuit, heure de Paris, pour les deux compteurs et le budget, via une seule fonction pure ; messages : « Vous avez atteint la limite de messages à Paul pour aujourd'hui. Vous pourrez lui écrire de nouveau demain matin. », « … pour ce mois-ci. Vous pourrez lui écrire de nouveau le 1er {mois}. », « Les agents ont atteint leur limite de lancements pour aujourd'hui. Ils reprendront demain matin. », « … pour ce mois-ci. Ils reprendront le 1er {mois}. » ; budget mensuel : « Réessayez le 1er {mois}. » à la place de « Contactez l'administrateur » ; `failureMessage("quota_runs")` sans « contactez l'administrateur » ; page Admin : les deux compteurs, lisibles et modifiables (jour ≤ mois) ; page Compte : les deux limites et « heure de Paris ».

**Never:** pas de nouveau motif d'échec (une limite de messages garde `quota_runs`) ; pas de changement des valeurs du budget ni de la réservation de 1 $ ; pas de changement des plafonds par exécution (story 3.2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Séance du test | 10 lancements utilisés aujourd'hui, 7 messages | message à Paul et « Préremplir » acceptés | N/A |
| Lancements épuisés | 10 tentatives aujourd'hui | lancement refusé, message à Paul accepté | 429, `quota_runs`, « Ils reprendront demain matin. » |
| Messages épuisés | 50 réservations de chat aujourd'hui | message refusé, lancement accepté | 429, `quota_runs`, « demain matin » |
| Mois | limite mensuelle atteinte le 24 octobre | refus | « le 1er novembre » |
| Minuit à Paris | usage le 23 à 23:50 Paris, appel le 24 à 00:30 Paris | l'usage de la veille ne compte pas | N/A |
| Site | mise en ligne du site | comptée dans les lancements | N/A |
| Admin | jour > mois pour les messages | refus | 400 |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma`, `prisma/migrations/` -- deux colonnes `Company`, migration datée après `20261024140000_action_plan_item_updated_at`.
- `src/lib/agent-runs.ts` -- `utcQuotaWindows` (l. 379) remplacée ; `assertRunQuota` (l. 386) prend le genre de compteur ; `reserveUsageBudget(companyId, purpose)` choisit le compteur selon `purpose` ; les appels de `enqueue…` (l. 88, 136) restent sur les lancements.
- Fonction pure des fenêtres de Paris : réutiliser `parisDateKey` de `src/lib/agents/personas.ts`.
- `src/lib/agents/agent-errors.ts` -- `failureMessage("quota_runs")`.
- `src/app/api/co-ceo/message/route.ts`, `src/app/api/onboarding/interpret/route.ts`, `src/lib/site/publish.ts` -- appelants de `reserveUsageBudget`, inchangés hors `purpose`.
- `src/app/admin/page.tsx` (fenêtres l. 40-41, comptages l. 42-90), `src/app/admin/company-quota-form.tsx`, `src/app/api/admin/companies/[id]/limits/route.ts` -- deux compteurs.
- `src/app/compte/page.tsx`, `src/lib/shell-data.ts` (l. 17) -- fenêtre de Paris, limites affichées.
- Tests : `tests/engine.spec.ts` (quotas l. 480-545, textes « journalier »/« mensuel » à adapter), `tests/security.spec.ts` (l. 415, corps de la route `limits`), `tests/delegation.spec.ts` (fenêtres).

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- deux colonnes -- limite des messages
- [x] fonction pure des fenêtres de Paris -- jour et mois, changement d'heure compris -- un seul calcul
- [x] `src/lib/agent-runs.ts` -- deux compteurs, messages de limite -- Paul ne consomme plus les lancements
- [x] `src/lib/agents/agent-errors.ts` -- message `quota_runs` -- pas de renvoi à l'administrateur
- [x] admin (page, formulaire, route) -- deux compteurs -- réglage par les PF
- [x] `src/app/compte/page.tsx`, `src/lib/shell-data.ts` -- limites et heure de Paris -- information du dirigeant
- [x] tests -- une ligne de la matrice par test ; tests existants adaptés -- non-régression

**Acceptance Criteria:**
- Étant donné une entreprise dont les lancements du jour sont épuisés, quand le dirigeant écrit à Paul, alors Paul répond.
- Étant donné la page Admin, quand un PF ouvre une entreprise, alors il voit et règle séparément messages à Paul et lancements.

## Implementation Notes

- Fenêtres : `src/lib/quota-windows.ts` (`parisQuotaWindows`, `CHAT_USAGE_PURPOSES`, `usageCounterFor`), pur, testé dans `tests/delegation.spec.ts` (minuit à Paris, changements d'heure, 31 décembre).
- Migration `20261024160000_chat_message_limits`. La route `limits` exige désormais les six champs (schéma strict).
- Tests base de données (`tests/engine.spec.ts`, `tests/security.spec.ts`) écrits, non exécutés localement (base locale arrêtée) : à vérifier en CI.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Limite journalière vérifiée avant la mensuelle : « demain matin » alors que le blocage dure jusqu'au 1er | medium | ordre des `if` dans `assertRunQuota` | patch |
| 2 | blind, edge, verification-gap | `failureMessage("quota_runs")` promet « demain matin », y compris pour un mois ; absence d'« administrateur » non testée | low | `agent-errors.ts` ; repli de `co-ceo.ts:212`, `agent-runs.ts:362` | patch |
| 3 | blind | Phrase de la page Compte trop large : un lancement confirmé depuis une carte consomme | low | correction directe du texte | patch |
| 4 | verification-gap | Le test « Minuit à Paris » passe aussi avec des fenêtres UTC | medium | minuit à Paris est toujours avant minuit UTC | patch |
| 5 | blind | « Messages épuisés » : lancement vérifié seulement via `site_publish` | low | appels `assertRunQuota(tx, …, "runs")` de `persistRun` non couverts | patch |
| 6 | verification-gap | Compteurs de la page Admin non testés | low | aucun test sur le rendu | patch |
| 7 | verification-gap | Les vrais appelants (`onboarding/interpret`, `publish.ts`) ne sont pas testés avec leur `purpose` | low | appelants inchangés ; test HTTP nécessite le modèle | defer |
| 8 | blind | `failureMessage("quota_budget")` dit « demain » même pour le budget mensuel | low | préexistant ; repli rare | rejet |
| 9 | blind | Pas d'index pour les comptages par `purpose` et `createdAt` | low | quelques centaines de lignes par entreprise et par mois ; index `companyId` en tête existant | rejet |
| 10 | blind | `purpose` en chaîne libre, une faute compterait comme lancement | low | trois appelants connus ; un type union casserait les tests qui utilisent d'autres libellés | rejet |
| 11 | blind | Statuts spec / sprint-status différents | false | synchronisés à l'étape de présentation | rejet |
| 12 | blind | Tâche de tests cochée sans exécution des tests base de données | low | exécutés en CI avant fusion | rejet |
| 13 | blind | Un message échoué consomme la limite de messages | low | comportement préexistant (réservation comptée avant l'appel) ; 50 par jour | rejet |
| 14 | blind | La page Compte n'affiche pas l'usage en cours | low | hors intention | rejet |
| 15 | blind | Formulaire Admin : pas de contrôle jour ≤ mois avant envoi ; libellé sans « Préremplir » | low | la route renvoie 400 avec un message | rejet |
| 16 | blind, edge | Schéma strict : un formulaire Admin ouvert avant le déploiement échoue | low | page réservée aux PF ; recharger suffit | rejet |
