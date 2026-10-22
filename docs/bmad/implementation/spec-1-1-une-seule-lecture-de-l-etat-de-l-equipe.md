---
title: 'Story 1.1 — Une seule lecture de l''état de l''équipe'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
baseline_commit: '08132ca78834c9e02e5702baf492fb37385b9442'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Paul lit l'état via `getPlanAndFunnelStatus`, qui ignore les actions `en_cours` et toutes les exécutions. En production, il a annoncé trois statuts faux de suite et recréé des actions déjà en cours. Par ailleurs, le badge et l'accueil comptent les productions plus les actions à lancer, alors que la page Décisions ne compte que les productions (18 contre 16).

**Approach:** créer `getTeamState(companyId)`, une lecture unique des actions actives, des exécutions des dernières 24 h et du nombre de décisions en attente. L'outil `get_current_status` de Paul et le compteur du menu s'appuient dessus, et l'accueil comme la page Décisions comptent selon la même définition.

## Boundaries & Constraints

**Always:** filtrer par `companyId` ; actions actives = `propose`, `en_cours`, `lance` ; exécutions récentes = créées depuis moins de 24 h, au plus 10, plus récentes d'abord ; conserver le suivi des prospects dans la réponse de Paul ; textes en français.

**Never:** pas de migration (le motif d'échec arrive en story 1.2) ; ne pas modifier les outils de délégation ni le texte des réponses de Paul au-delà de la règle de lecture d'état ; ne pas toucher aux libellés des actions (story 1.4).

**Décision (Samir, 2026-10-22) :** une « décision en attente » est une production qui attend le dirigeant (`needsAttention`) ; les actions « à lancer » restent visibles dans le Plan et dans « Ce que l'équipe vous a préparé », mais ne sont pas comptées.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Action en cours | action marketing `en_cours`, run `running` démarré il y a 40 s | `actions` contient l'action avec statut `en_cours` ; `recentRuns` contient le run, `elapsedSeconds ≈ 40` | N/A |
| Run terminé | run demarchage `succeeded`, `resultCount = 15`, il y a 2 h | présent dans `recentRuns` avec `resultCount: 15` | N/A |
| Run ancien | run terminé il y a 25 h | absent de `recentRuns` | N/A |
| Actions closes | actions `termine` et `ecarte` | absentes de `actions` | N/A |
| Compteur | 3 productions `en_attente`, 2 actions `propose` | `pendingDecisions = 3` | N/A |
| Autre entreprise | runs et actions d'une autre entreprise | jamais renvoyés | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/chat-context.ts:32` -- `getPlanAndFunnelStatus` : statuts `propose|lance` seulement ; à remplacer par `getTeamState` dans `get_current_status`, puis supprimer s'il n'a plus d'appelant (le test qui l'utilise est à migrer).
- `src/lib/agents/co-ceo.ts:86-125` -- outil `get_current_status` : appelle `getPlanAndFunnelStatus` et ajoute propositions, constats et prospects ; à brancher sur `getTeamState` en gardant `refusRecents`, `propositionsEnAttente`, `derniersConstatsAudit` et `prospectsSuivis`.
- `src/lib/agents/co-ceo.ts:213-215` -- règles du prompt sur `get_current_status` : ajouter qu'une action `en_cours` ne se relance ni ne se recrée.
- `src/lib/pending-decisions-server.ts` -- `getPendingDecisionCount` (productions qui attendent, prédicat `needsAttention`) : c'est le calcul de `pendingDecisions`, à réutiliser.
- `src/lib/shell-data.ts:17-29` -- badge = `getPendingDecisionCount + count(actions propose)` ; à remplacer par `getTeamState(...).pendingDecisions` (décision du dirigeant).
- `src/app/dashboard/dashboard-client.tsx:256,303-341` -- `actionable` (productions) et `decisions` (actions `propose` + productions) ; le lien « Toutes les décisions (N) » utilise `decisions.length` → passer à `actionable.length`.
- `src/lib/agent-runs.ts:264` -- `listAgentRuns` et `publicRun` : forme `AgentRunView` (`src/lib/agent-run-types.ts`) à réutiliser pour `recentRuns`.
- `tests/engine.spec.ts:48` -- fixture `company` et test de `getPlanAndFunnelStatus`, à remplacer par des tests de `getTeamState`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/team-state.ts` -- créer `getTeamState(companyId, now = new Date())` → `{ actions, recentRuns, pendingDecisions }`. Les actions portent `id`, `agent`, `title`, `rationale`, `timing`, `status`. Les runs ont la forme `AgentRunView` plus `elapsedSeconds`. -- source unique (AD-9)
- [x] `src/lib/agents/co-ceo.ts` -- `get_current_status` renvoie `planEnCours` (depuis `actions`), `executionsRecentes` (depuis `recentRuns`) et `decisionsEnAttente`, plus les champs existants ; compléter les règles du prompt -- Paul voit les actions en cours
- [x] `src/lib/agents/chat-context.ts` -- garder `funnelLines` pour le suivi des prospects ; retirer `getPlanAndFunnelStatus` s'il n'a plus d'appelant -- pas de seconde lecture d'état
- [x] `src/lib/shell-data.ts` -- `decisionCount` = `pendingDecisions` -- même nombre partout
- [x] `src/app/dashboard/dashboard-client.tsx` -- le lien « Toutes les décisions (N) » compte `actionable.length` -- même définition que la page Décisions
- [x] `tests/engine.spec.ts` -- tests de la matrice I/O sur `getTeamState` ; migrer le test de `getPlanAndFunnelStatus` -- non-régression

**Acceptance Criteria:**
- Étant donné une action `en_cours`, quand Paul appelle `get_current_status`, alors le JSON renvoyé la liste avec le statut `en_cours` et son exécution en cours.
- Étant donné le même état, quand on compare le badge du menu, le lien de l'accueil et l'en-tête de la page Décisions, alors les trois nombres sont égaux.

## Implementation Notes

- `publicRun` est exporté depuis `src/lib/agent-runs.ts` pour donner aux runs de `getTeamState` la forme `AgentRunView`.
- `elapsedSeconds` = (`finishedAt` ou maintenant) − (`startedAt` ou `queuedAt`).
- `get_current_status` renvoie `executionsRecentes` tel quel (forme `AgentRunView` + `elapsedSeconds`), pour que la story 1.2 y ajoute `failureReason` sans autre changement.
- Le lien « Toutes les décisions (N) » reste affiché quand plus de trois cartes existent ; seul le nombre change.
- `npm run test:engine` échoue localement avant tout test (`Cannot find module '@/lib/database-url'`, y compris sur des tests non modifiés) : la CI fait foi.

- Après relecture du diff par l'orchestrateur : `publicRun` déplacé dans `src/lib/agent-run-types.ts` (module léger), pour que `team-state.ts`, chargé par le menu de chaque page, n'importe plus la chaîne des agents via `agent-runs.ts`.
- Accueil : le lien « Productions à relire (N) » n'apparaît que s'il y a au moins une production, pour ne pas afficher « (1) » à côté de cinq cartes ; la fenêtre « Actualiser le diagnostic » compte aussi `actionable.length`.
- Tests du moteur non exécutés en local (alias `@/` non résolu sous Windows, même échec sur `main`) : la CI (Postgres 17) fait foi.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge, blind | Une exécution `queued`/`running` créée il y a plus de 24 h ou hors des 10 dernières disparaît de `recentRuns` alors que l'action reste `en_cours` | medium | requête `createdAt > now-24h`, `take: 10` sans exception pour les runs actifs | patch |
| 2 | edge | Run actif périmé (au-delà de `maxDurationSeconds`) lu tel quel, sans la détection de `getAgentRun` | maybe-false | la détection existe au polling de l'interface ; à vérifier si un run peut rester `running` sans polling | defer |
| 3 | edge, blind | `elapsedSeconds` d'un run `queued` compte l'attente | low | `start = startedAt ?? queuedAt` ; rare (la file démarre en quelques secondes), correctif ajoute une branche | rejeté |
| 4 | edge | Run terminal sans `finishedAt` : durée qui croît | false | tous les passages en `failed`/`succeeded` posent `finishedAt` (`agent-runs.ts` 231, 317) | rejeté |
| 5 | edge | Trois lectures hors transaction | low | décalage de quelques millisecondes, sans conséquence visible ; correctif = transaction | rejeté |
| 6 | edge, blind, gap | Lien de l'accueil renommé « Productions à relire » et masqué à 0 : écart à la spec, et `tests/user-journey.spec.ts:672` attend « Toutes les décisions (4) → » | high | le test UX de la CI échouera | patch |
| 7 | blind | `decisionsEnAttente` (needsAttention) et `propositionsEnAttente` (`en_attente` seul) diffèrent sans explication pour Paul | medium | deux définitions dans le même JSON | patch |
| 8 | blind | Le statut `lance` n'est pas expliqué à Paul | medium | le prompt n'explique que `propose` et `en_cours` | patch |
| 9 | gap, blind | Critère 1 non testé sur le JSON réellement lu par Paul | medium | aucun test n'exécute `get_current_status` | patch |
| 10 | gap, blind | Badge sans test avec une action `propose` | medium | les fixtures UX n'ont aucune action `propose` | patch |
| 11 | blind | Le menu charge `payload` et `rationale` à chaque page | low | `findMany` sans `select` sur `AgentRun` ; correctif direct (`select`) | patch |
| 12 | blind | Pas d'index `(companyId, createdAt)` sur `AgentRun` | low | index `(companyId, status, createdAt)` seul ; migration interdite ici | defer |
| 13 | blind | `errorMessage` brut envoyé au modèle | false | `errorMessage` stocké = `agentFailureMessage` ou message de conflit, déjà affichable (`agent-runs.ts:310`) | rejeté |
| 14 | gap | Compte de la fenêtre « Actualiser » non testé | low | texte secondaire | defer |
| 15 | gap | Note d'implémentation périmée sur `publicRun` | low | correctif = éditer la spec | rejeté |
| 16 | blind | Écarts mineurs de fixtures de test (isolation, run sans action) | low | les tests prouvent déjà l'isolation | rejeté |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test:engine` -- expected: tests verts (base locale embedded-postgres ; sinon la CI fait foi)
