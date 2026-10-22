# Epic 1 Context: Paul dit vrai

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le dirigeant obtient de Paul et de l'interface un état de l'équipe exact et identique, avec la raison claire de tout lancement qui n'a pas eu lieu. En production, Paul a annoncé trois statuts faux de suite parce qu'il ne voyait pas les actions en cours, qu'un conflit ou un quota était présenté comme une panne et que le premier audit tournait hors du plan. Cette épopée rend Paul crédible avant de lui confier des écritures (épopée 2).

## Stories

- Story 1.1: Une seule lecture de l'état de l'équipe
- Story 1.2: Motifs d'échec typés et dits en clair
- Story 1.3: Le premier audit naît dans le plan
- Story 1.4: Une action terminée renvoie vers ses productions

## Requirements & Constraints

- Paul voit toutes les actions actives : à lancer (`propose`), en cours (`en_cours`), à décider (`lance`). Il voit aussi les exécutions des dernières 24 h, avec leur statut, leur durée, leur nombre d'éléments produits et, plus tard, leur motif d'échec.
- Paul ne crée pas d'action équivalente à une action en cours.
- Le badge Décisions, l'accueil et la page Décisions affichent le même nombre de décisions en attente.
- Un lancement non fait ou échoué porte un motif typé, dit en clair. Le mot « ÉCHEC » en majuscules n'apparaît jamais devant le dirigeant. Les détails techniques restent dans les logs serveur.
- Le premier audit de l'onboarding est une action de Martine au plan, en cours dès l'arrivée sur l'accueil.
- Une action exécutée avec des productions en attente est « à décider », pas « à valider ».
- Indicateur de succès : en rejouant le scénario Atelier Lumen, Paul ne corrige jamais d'un message à l'autre un statut qu'il a annoncé.
- Coût : la lecture d'état ne doit pas alourdir sensiblement les appels à Paul.

## Technical Decisions

- **Lecture d'état unique** : `getTeamState(companyId)` dans `src/lib/team-state.ts` renvoie `{ actions, recentRuns, pendingDecisions }`. L'outil `get_current_status` de Paul, les cartes d'exécution, le badge et l'accueil n'utilisent que cette fonction pour ces informations.
- **Motifs d'échec** : `RunFailureReason = already_running | quota_runs | quota_budget | no_result | outage`. Un seul point de conversion : `classifyRunError(error)` dans `src/lib/agents/agent-errors.ts`. Nouvelle colonne `AgentRun.failureReason`. Les outils de Paul renvoient du JSON `{ ok, reason?, message, runId?, planItemId? }`.
- **Premier audit** : créé côté serveur à la première création de l'entreprise (`POST /api/companies`) : `ActionPlanItem` marketing, puis `enqueuePlanRun`. Le client ne lance plus d'agent.
- Socle hérité : tout lancement passe par `AgentRun` (dédoublonnage, quota) ; isolation par `companyId` ; erreurs typées avec message affichable ; statuts `ActionPlanItem propose → en_cours → lance | termine | ecarte`, `AgentRun queued → running → succeeded | failed`.
- Migrations Prisma additives, une par story qui touche le schéma, appliquées au déploiement Vercel.
- Tests : `node --test` pour les fonctions pures, Playwright (base de test, comme `tests/engine.spec.ts`) pour l'état et les routes. Sous Windows, la CI fait foi.

## UX & Interaction Patterns

- Carte d'exécution : motif d'échec en une phrase, avec l'action utile (« Voir l'exécution en cours », « Réessayer demain », « Relancer »).
- Ton : vouvoiement, phrases courtes, aucune erreur technique visible (charte).

## Cross-Story Dependencies

- 1.1 fournit `getTeamState`, que 1.2 enrichit avec `failureReason` et que 1.4 utilise pour les libellés.
- 1.3 s'appuie sur le motif `already_running` de 1.2.
- L'épopée 2 (cartes de confirmation, dédoublonnage) s'appuie sur `getTeamState` et les motifs typés.
