# Epic 4 Context: Paul reste disponible et cohérent

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le dirigeant peut échanger avec Paul toute une séance sans bloquer ses agents, et Paul ne se « corrige » jamais à tort. Au troisième test en production (24 octobre), 7 messages à Paul, l'audit, une exécution et une révision ont épuisé le quota de 10 lancements par jour ; Paul a écrit « je rectifie » à propos d'un audit qu'il avait annoncé en cours, à raison, deux messages plus tôt.

## Stories

- Story 4.1: Parler à Paul ne consomme pas les lancements
- Story 4.2: Aucune fausse rectification

Ordre : 4.2 d'abord (aucune décision en attente), 4.1 après le choix du quota par les PF. Fichiers distincts.

## Requirements & Constraints

- Quota : option A de `docs/bmad/planification/sprint-change-proposal-2026-10-24.md`, tranchée par les PF le 2026-10-24 : deux compteurs, 50 messages à Paul par jour et 500 par mois (« Préremplir » compris), lancements 10 et 100 inchangés (mise en ligne du site comprise).
- Le plafond de dépense (`dailySpendLimitUsd`, `monthlySpendLimitUsd`, 1 $ réservé par appel en cours) reste la limite de coût, inchangé sauf décision des PF.
- Jour et mois comptés en heure de Paris.
- Un message de limite dit quand réessayer, sans « contactez l'administrateur ».
- Un état qui a changé après l'un des messages de Paul n'est jamais présenté comme une erreur.
- Coût : aucune donnée variable dans le bloc système mis en cache.

## Technical Decisions

- Quota : `assertRunQuota` et `reserveUsageBudget(companyId, purpose)` dans `src/lib/agent-runs.ts` ; `purpose` vaut `co_ceo_chat`, `onboarding_interpret` ou `site_publish`. Nouvelles colonnes de `Company` par migration additive si l'option A est retenue ; erreur typée `AgentRunQuotaError` (motif `quota_runs` ou `quota_budget`, story 1.2), à étendre si un motif distinct est utile à Paul.
- Temps : `buildCurrentStatus` (`src/lib/agents/co-ceo.ts`, story 3.5) ; fenêtre relue `loadRecentChatHistory` (`src/lib/agents/chat-context.ts`, 40 messages) ; formatage `formatParisTime` (`src/lib/agents/personas.ts`).
- Tests base de données en CI uniquement (`tests/engine.spec.ts`) ; fonctions pures dans `tests/delegation.spec.ts`.

## UX & Interaction Patterns

- Limite atteinte : une phrase, l'heure ou le jour de reprise, pas de jargon (« quota », « run »).
- Vouvoiement, phrases courtes (charte).

## Cross-Story Dependencies

- 4.1 s'appuie sur les motifs d'échec typés (1.2) et les cartes de lancement (2.3).
- 4.2 étend `buildCurrentStatus` et la règle du prompt de 3.5.
