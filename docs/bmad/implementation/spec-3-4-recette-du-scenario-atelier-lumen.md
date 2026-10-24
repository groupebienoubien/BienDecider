---
title: 'Story 3.4 — Recette du scénario Atelier Lumen'
type: 'chore'
created: '2026-10-24'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-3-context.md'
  - '{project-root}/BienDecider-test-entrepreneur-2026-10-23.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** les deux tests en production (22 et 23 octobre) ont été faits à la main ; rien ne rejoue automatiquement le parcours Atelier Lumen pour vérifier que Paul reste fiable à chaque livraison.

**Approach:** un bloc de tests du moteur, sans appel au modèle, rejoue le scénario de bout en bout en appelant les outils de Paul et des agents et les routes de confirmation ; une recette manuelle courte décrit le même parcours avec le vrai modèle, pour les PF.

## Boundaries & Constraints

**Always:** les tests vivent dans `tests/engine.spec.ts` (déjà exécuté par la CI, sans changer `.github/workflows/ci.yml`), dans un `test.describe("Recette Atelier Lumen", …)` ; une seule entreprise de test Atelier Lumen (140 000 → 200 000 €/an, 18 000 € par client, 6 cuisines par an, Instagram `@atelierlumen.nantes`, nom « Samuel Morel ») ; aucun appel au modèle : les outils sont capturés (`capturePaulTools`, `captureAgentTools`, `processWithScenario`) ; la recette manuelle est `docs/bmad/implementation/recette-paul-fiable.md`, en français, au plus 2 pages, avec les phrases exactes du rapport du 23 octobre et le résultat attendu à chaque étape.

**Never:** pas de nouveau script ni de nouvelle étape de CI ; pas de test qui dépend du texte généré par le modèle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Onboarding | première création du profil | une action d'audit de Martine `en_cours`, un run | N/A |
| Objectif | outil d'objectif (an), puis confirmation | `Company` : 16 667 €/mois visés ; écart « environ 3,3 clients de plus par an » ; rien avant le clic | N/A |
| Profil | outil de profil (Instagram, horaires, nom), puis confirmation | champs enregistrés ; le contexte de Jean-Claude contient « Samuel Morel » | N/A |
| Lancement | proposition de lancement Jean-Claude | aucun run avant le clic ; un run après « Lancer » | N/A |
| Doublon | seconde proposition de prospection pendant l'exécution | aucune nouvelle action ; `already_running` au clic | N/A |
| Plafonds | Jean-Claude tente 9 prospects, 3 emails, 3 pistes ; Martine 3 propositions de fiche | au plus 11 décisions en attente, réparties 5/2/2/2 | N/A |
| Révision | carte de révision d'un email, confirmée, exécution simulée | même production en v2, v1 conservée, aucune production en plus | N/A |
| État | `buildCurrentStatus` deux fois de suite | mêmes statuts, heures présentes, `monMessagePrecedent` renseigné au second appel | N/A |
| Compteurs | badge, accueil, Décisions | même nombre | N/A |

</frozen-after-approval>

## Code Map

- `tests/engine.spec.ts` -- helpers existants : `inRequestScope`, `capturePaulTools`, `captureAgentTools`, `processWithScenario`, `withSignedUpCompany`, `deleteCompany` ; ajouter le bloc de recette à la fin.
- `src/lib/agents/co-ceo.ts` (`buildCurrentStatus`), `src/lib/agents/pending-actions.ts` (`decidePendingAction`), `src/lib/team-state.ts`, `src/lib/shell-data.ts` -- fonctions appelées par la recette.
- `docs/bmad/implementation/recette-paul-fiable.md` (nouveau) -- recette manuelle.

## Tasks & Acceptance

**Execution:**
- [ ] `tests/engine.spec.ts` -- bloc « Recette Atelier Lumen », un test par ligne de la matrice, enchaînés sur la même entreprise -- non-régression du parcours
- [ ] `docs/bmad/implementation/recette-paul-fiable.md` -- recette manuelle -- les PF rejouent avec le vrai modèle

**Acceptance Criteria:**
- Étant donné la CI, quand `npm run test:engine` tourne, alors le bloc « Recette Atelier Lumen » s'exécute et passe.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npx playwright test tests/engine.spec.ts --list` -- expected: le bloc de recette est listé (exécution en CI)
