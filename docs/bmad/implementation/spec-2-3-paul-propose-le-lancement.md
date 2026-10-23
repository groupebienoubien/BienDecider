---
title: 'Story 2.3 — Paul propose le lancement, le dirigeant lance'
type: 'feature'
created: '2026-10-23'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-2-context.md'
  - '{project-root}/docs/bmad/implementation/spec-2-1-dire-son-objectif-a-paul-et-le-confirmer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Paul lance lui-même les agents dès qu'il le juge utile (outils `delegate_*`) : en production, il a lancé trois agents au premier message, sans accord du dirigeant, en engageant du budget. C'est contraire à la promesse « Vous décidez ».

**Approach:** les outils de délégation deviennent des propositions : Paul crée ou reprend l'action au plan en « à lancer » et une intention `launch_plan_item` ; la carte « Lancer {agent} : {titre} · Lancer / Plus tard » lance au clic par le même chemin que le bouton du plan. Paul porte partout le titre « Partenaire de croissance ».

## Boundaries & Constraints

**Always:** aucune exécution n'est créée avant le clic « Lancer » ; une demande explicite du dirigeant (« lance Jean-Claude ») passe aussi par la carte (règle validée par les PF) ; à la confirmation, le lancement réutilise `delegatePlanAction` (relance d'un échec, motifs typés de la story 1.2) et la carte affiche le résultat (lancé, ou motif en clair) ; « Plus tard » annule l'intention et laisse l'action au plan en « à lancer » ; au plus 3 cartes par message de Paul ; le titre du panneau et le prompt viennent de `PERSONAS.co_ceo.role` (« Partenaire de croissance »).

**Never:** Paul ne dit jamais « c'est lancé » avant la confirmation ; pas de dédoublonnage d'action dans cette story (story 2.4) ; pas de changement du bouton « Lancer » du plan.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proposition | outil `propose_launch_demarchage` avec titre et brief | action `propose` au plan ; intention `launch_plan_item` `pending` ; aucun `AgentRun` | N/A |
| Lancer | POST `confirm` | `AgentRun` créé ; action `en_cours` ; intention `confirmed` ; la réponse donne le `runId` | N/A |
| Plus tard | POST `cancel` | intention `cancelled` ; action reste `propose` ; aucun run | N/A |
| Refus au lancement | `confirm` avec quota atteint | intention `confirmed` ; réponse `ok: false, reason: quota_runs` et message en clair ; action `propose` | carte : message du motif |
| Déjà en cours | `confirm` sur une action passée `en_cours` entre-temps | `reason: already_running` avec `runId` ; aucun second run | carte : « {agent} y travaille déjà » |
| Plus de trois | Paul tente une 4e proposition dans le même tour | l'outil refuse et le dit à Paul | N/A |
| Titre | panneau ouvert | en-tête « Partenaire de croissance » | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/co-ceo.ts:114` (`delegatePlanAction`) -- conservé pour l'exécution à la confirmation ; ne plus l'appeler depuis les outils.
- `src/lib/agents/co-ceo.ts:259-291` (`delegate_marketing`, `delegate_contenu`, `delegate_demarchage`) -- remplacer par `propose_launch_*` : créent ou reprennent l'action (`createChatPlanItem` / `findLaunchablePlanItem`) puis l'intention ; compteur de cartes par tour (3 au plus, tous types confondus).
- `src/lib/agents/co-ceo.ts:302-314` (prompt) -- « copilote IA » → rôle de Paul ; règles : il propose, n'annonce jamais un lancement non confirmé, lit le résultat de la carte au tour suivant via `get_current_status`.
- `src/lib/agents/pending-actions.ts` (story 2.1) -- type `launch_plan_item` (`planItemId`, `agent`, `extras`) ; exécuteur appelant `delegatePlanAction` dans le contexte de la requête (la route de confirmation est une route Next : `after()` disponible) ; le résultat est renvoyé dans la vue de l'intention.
- `src/components/paul-panel.tsx:351` -- « Votre copilote » → `PERSONAS.co_ceo.role` ; carte de lancement : boutons « Lancer » (vert) et « Plus tard » (lien), résultat affiché après le clic.
- `tests/engine.spec.ts` -- `inRequestScope` pour la confirmation qui lance.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/agents/pending-actions.ts` -- type `launch_plan_item` et exécuteur -- lancement sur clic
- [ ] `src/lib/agents/co-ceo.ts` -- outils `propose_launch_*`, plafond de 3 cartes, prompt -- Paul propose
- [ ] `src/components/paul-panel.tsx` -- carte de lancement et titre -- interface
- [ ] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné un tour de Paul qui propose de faire travailler un agent, quand on compte les `AgentRun` avant tout clic, alors il n'y en a aucun.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
