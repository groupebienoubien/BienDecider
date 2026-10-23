---
title: 'Story 2.4 — Pas d''action en double'
type: 'bugfix'
created: '2026-10-23'
status: 'ready-for-dev'
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
- [ ] `src/lib/agents/plan-items.ts` -- reprise atomique par agent et thème -- AD-16
- [ ] `src/lib/agents/co-ceo.ts`, `pending-actions.ts` -- message et carte « je reprends » -- le dirigeant comprend
- [ ] `tests/engine.spec.ts` -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné deux tours qui demandent une prospection, quand on compte les actions actives de Jean-Claude en Prospection, alors il y en a une.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
