---
title: 'Story 2.4 — Pas d''action en double'
type: 'bugfix'
created: '2026-10-23'
status: 'done'
baseline_commit: '0c4cb2f62c516e0daa08ce1791214b5b0afa199f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** en production, deux tours de conversation ont créé deux actions de prospection de Jean-Claude presque identiques, et Paul a ensuite demandé au dirigeant de trier lui-même les doublons. Un audit d'inscription en cours pouvait aussi être recréé par Paul.

**Approach:** une seule action active (à lancer ou en cours) par agent et par thème : quand Paul propose une action, le serveur reprend l'action active existante de même agent et même thème au lieu d'en créer une, de façon atomique.

## Boundaries & Constraints

**Always:** action active = statut `propose` ou `en_cours` ; la reprise se fait dans une transaction sérialisable, réessayée sur conflit (`isSerializationConflict`) ; l'action reprise garde son titre et son brief ; la carte de lancement cible l'action reprise et le dit (« Je reprends l'action déjà au plan : {titre} ») ; une action `lance`, `termine` ou `ecarte` n'empêche pas d'en créer une nouvelle.

**Never:** pas de rapprochement par similarité de titre (différé) ; pas de fusion ni de suppression d'actions existantes ; pas de changement du plan généré par Paul (`runCoCeoPlanning`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reprise à lancer | action Jean-Claude « Prospection » `propose` | Paul propose une prospection → même `id`, aucune nouvelle action | N/A |
| Reprise en cours | action Jean-Claude « Prospection » `en_cours` | même `id` ; « Lancer » renvoie `already_running` avec le `runId` | N/A |
| Autre thème | action Jean-Claude « Visibilité » `propose` | une prospection crée une nouvelle action | N/A |
| Terminée | action Jean-Claude « Prospection » `termine` | une nouvelle action est créée | N/A |
| Simultané | deux propositions concurrentes, aucune action | une seule action créée | conflit réessayé |
| Audit d'inscription | audit Martine « Visibilité » `en_cours` | Paul propose un audit → l'action d'audit est reprise | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/plan-items.ts` (`createChatPlanItem`) -- chercher puis créer dans une transaction sérialisable, renvoyer `{ item, reused }`.
- `src/lib/agent-runs.ts` (`isSerializationConflict`) -- détection des conflits à réutiliser.
- `src/lib/agents/co-ceo.ts` (outils `propose_launch_*` de la story 2.3) -- utiliser `reused` pour le message à Paul et le texte de la carte.
- `src/lib/agents/pending-actions.ts` -- texte de la carte de lancement quand l'action est reprise.
- `tests/engine.spec.ts` -- matrice ; `Promise.all` pour le cas simultané.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agents/plan-items.ts` -- reprise atomique par agent et thème -- AD-16
- [x] `src/lib/agents/co-ceo.ts`, `pending-actions.ts` -- message et carte « je reprends » -- le dirigeant comprend
- [x] `tests/engine.spec.ts` -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné deux tours qui demandent une prospection, quand on compte les actions actives de Jean-Claude en Prospection, alors il y en a une.

## Implementation Notes

- `isSerializationConflict` et `withSerializableRetry` (nouvel essai avec court délai aléatoire) vivent dans `src/lib/serialization-conflict.ts`, utilisés par `plan-items`, `onboarding-audit` et `pending-actions` ; le module évite la dépendance à `agent-runs` (cycle `plan-items → agent-runs → plan-runner → plan-items`).
- Reprise par agent + thème + statut `propose`/`en_cours`, sans filtre sur l'échéance : l'audit d'inscription et les actions du plan de Paul sont aussi repris. Parmi d'anciens doublons, l'action en cours est reprise d'abord, puis la plus ancienne.
- Carte : champ `reused: true` dans le payload `launch_plan_item` et ligne « Je reprends l'action déjà au plan. ».
- Action reprise `en_cours` : la carte est créée (matrice « Reprise en cours ») ; Paul ne dit « y travaille déjà » que si une exécution active existe, sinon il est renvoyé vers `executionsRecentes`. Paul reçoit le titre et le brief repris et le titre de la nouvelle demande, pour dire ce qui diffère.
- `delegatePlanAction` (chemin historique) applique la même reprise.
- Tests existants adaptés : propositions concurrentes ou successives du même agent passent par des thèmes différents ; la restriction AD-16 (même agent et même thème) a son propre test.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | La génération du plan, `POST /api/action-plan` et l'audit d'inscription créent des actions sans la règle agent + thème | medium | seule `createChatPlanItem` vérifie ; la spec exclut le plan généré | defer |
| 2 | blind, gap | Parmi des doublons existants, la plus ancienne est reprise même si une autre est en cours | low | `orderBy: createdAt asc` ; correctif direct (en cours d'abord) | patch |
| 3 | blind, edge | La nouvelle demande (titre, brief) est ignorée sans que Paul puisse le dire | medium | seul l'ancien titre revient à Paul | patch |
| 4 | blind | Les `extras` de la nouvelle demande partent avec l'ancien brief | low | contexte d'exécution voulu | rejeté |
| 5 | blind | Carte « Lancer » créée pour une action déjà en cours | low | prévue par la matrice (« Lancer » renvoie `already_running`) | rejeté |
| 6 | blind, edge | « y travaille déjà » affirmé sans vérifier qu'une exécution tourne | medium | `alreadyRunningResult` non utilisé dans `runCoCeoTurn` | patch |
| 7 | blind | Deux cartes ouvertes pour la même action | false | une nouvelle carte remplace celle de la même action (`sameTarget`, story 2.3) | rejeté |
| 8 | blind | La restriction par thème n'est pas écrite dans un test ; d'anciens tests changés de thème | low | AD-16 validé ; un test explicite manque | patch |
| 9 | blind, gap | Branche de reprise de `delegatePlanAction` non testée | low | appelée seulement par les tests | patch |
| 10 | blind, edge | Boucle de nouvel essai copiée trois fois, sans délai ; déplacement d'import inachevé ; commentaire « sans dépendance » faux | low | correctif direct (`withSerializableRetry`) | patch |
| 11 | blind | Pas d'index pour la lecture sérialisable | low | volume faible | defer |
| 12 | blind | Le titre est répété dans la carte reprise | low | correctif direct | patch |
| 13 | edge | Échec de carte sur une action reprise en cours : Paul dit « à lancer » | low | correctif direct | patch |
| 14 | edge | Action reprise terminée avant le clic : message « n'est plus à lancer » | low | message exact | rejeté |
| 15 | gap | Le test de concurrence ne force pas le conflit | low | aucun point d'injection | defer |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
