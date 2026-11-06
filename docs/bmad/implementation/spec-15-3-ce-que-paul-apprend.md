---
title: 'Story 15.3 : Voir ce que Paul apprend du bilan d''une mission'
type: 'feature'
created: '2026-11-07'
status: 'review'
baseline_commit: 'origin/main'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-15-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant ne sait pas si le résultat recherché est atteint ni ce que Paul en retient pour la suite du plan (#53).

**Approach:** une lecture déterministe du bilan comparé au résultat recherché, affichée sur la Stratégie et donnée à Paul.

## Boundaries & Constraints

**Always:**
- Quatre rubriques : Observé, Ce que cela suggère, Ce que cela ne prouve pas, Impact sur le plan (§7.3).
- Résultat recherché non chiffré : « impossible de juger », proposition de le préciser.
- Avant l'échéance de la règle d'arrêt : attendre, mêmes limites.

**Never:**
- Un chiffre inventé ; une proposition d'élargir ; une proposition appliquée sans confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Atteint | 3 demandes pour « Deux demandes » | poursuivre dans les mêmes limites | — |
| Partiel | 1 sur 2 | poursuivre ou réduire | — |
| Non atteint | 0 rendez-vous pour « Un rendez-vous » | arrêter ou autre piste | — |
| Non chiffré | « Des demandes de devis » | préciser le résultat recherché | — |
| Avant l'échéance | — | attendre la fin du test | — |
| Sans bilan | — | aucun bloc | — |

</frozen-after-approval>

## Code Map

`src/lib/missions/{report,results-view}.ts` ; `src/app/strategie/page.tsx` ; `src/lib/agents/co-ceo.ts` (`bilan`, `lectureDuBilan`, `regleDArret`) ; tests `delegation`, `engine`, `user-journey`.

## Tasks & Acceptance

- [x] Lecture du bilan, testée (atteint, partiel, non atteint, non chiffré, avant l'échéance).
- [x] Bloc « Ce que Paul apprend » sur la Stratégie ; lecture dans l'état de Paul.
