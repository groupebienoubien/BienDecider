---
title: 'Story 3.4 — Recette du scénario Atelier Lumen'
type: 'chore'
created: '2026-10-24'
status: 'done'
baseline_commit: '830ae4ee05bfee2b945d34210078b4c6f03a2598'
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
- [x] `tests/engine.spec.ts` -- bloc « Recette Atelier Lumen », un test par ligne de la matrice, enchaînés sur la même entreprise -- non-régression du parcours
- [x] `docs/bmad/implementation/recette-paul-fiable.md` -- recette manuelle -- les PF rejouent avec le vrai modèle

**Acceptance Criteria:**
- Étant donné la CI, quand `npm run test:engine` tourne, alors le bloc « Recette Atelier Lumen » s'exécute et passe.

## Implementation Notes

- Bloc `test.describe("Recette Atelier Lumen")` en mode `serial` à la fin de `tests/engine.spec.ts` : neuf tests (un par ligne de la matrice), une entreprise créée vide en `beforeAll` (comme `withSignedUpCompany`, qui ne peut pas couvrir plusieurs tests) et supprimée par `deleteCompany` en `afterAll`. Un échec arrête la suite du scénario.
- Onboarding, objectif et profil passent par les routes du serveur de test (`POST /api/companies`, `POST /api/co-ceo/pending-actions/{id}`). Les clics « Lancer » et la confirmation de révision passent par `decidePendingAction` dans `inRequestScope` : par la route, le serveur exécuterait l'agent lui-même et le test ne pourrait pas rejouer ses outils.
- L'audit d'inscription est exécuté par le serveur : sans clé de modèle (CI), il échoue sans rien produire ; le premier test attend cet échec pour partir d'un état stable, et l'étape des plafonds le relance (même exécution, via `delegatePlanAction` comme « Relancer l'action ») pour rejouer les propositions de fiche de Martine avec `processWithScenario`. Le bloc est ignoré si `ANTHROPIC_API_KEY` est défini, comme le test d'échec de lancement existant.
- Plafonds : 9 prospects, 3 emails, 3 pistes pour Jean-Claude, 3 propositions de fiche (2 mises à jour, 1 réponse à un avis) pour Martine ; le test vérifie exactement 11 décisions, réparties 5/2/2/2 (fiche : 1 `gbp_update` + 1 `review_reply`).
- Compteurs : badge = `getShellProps().decisionCount` ; accueil et Décisions = `countPendingDecisions` sur les productions lues par `/dashboard` (même filtre `needsAttention` que `dashboard-client.tsx`, aucune Page Facebook) ; Paul = `decisionsEnAttente`. Le HTML des pages n'est pas lu (rendu client).
- État : entre les deux `buildCurrentStatus`, un message de Paul est enregistré (sa réponse à la première question) ; le second appel le date et ne marque aucun état « depuis mon dernier message ».
- Vérifié localement : `npx tsc --noEmit`, `npm run lint`, `npx playwright test tests/engine.spec.ts --list` (les neuf tests sont listés). Exécution réelle en CI uniquement (base de données).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge | Premier test instable : l'audit peut échouer côté serveur avant la lecture, l'action revient à « à lancer » | medium | `after()` s'exécute juste après la réponse 201 | patch |
| 2 | blind | Le cas bloquant de l'étape 9 (« depuis mon dernier message ») n'est pas automatisé | medium | seul le cas sans changement est testé | patch |
| 3 | blind | Plafond des constats d'audit (4) non testé | low | correctif direct | patch |
| 4 | blind | Assertions de plafond hétérogènes ; réponses acceptées non vérifiées | low | correctif direct | patch |
| 5 | blind, gap | Le test « révision » peut garder l'avertissement si le séparateur change | low | `indexOf` à -1 non vérifié | patch |
| 6 | edge | Boucle d'attente sur une liste fermée de statuts ; `planEnCours` vide non vérifié | low | correctif direct | patch |
| 7 | blind | Commentaire dupliqué, espace manquant | low | correctif direct | patch |
| 8 | blind | Recette manuelle : ordre différent des tests, 12 contre 11 non expliqué, étape 2 sans critère, préparation et nettoyage absents, persona (6 × 18 000 ≠ 140 000) non commentée, signature et condition de clé non dites | low | correctif direct (document) | patch |
| 9 | gap, edge | Le test des compteurs ne lit pas ce que les pages affichent (badge et Paul partagent la même fonction) | medium | vérification à faire dans le parcours navigateur | defer |
| 10 | edge | Clé du modèle présente seulement côté serveur : audit réel | low | la CI n'a pas de clé ; à dire dans la recette | patch (document) |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npx playwright test tests/engine.spec.ts --list` -- expected: le bloc de recette est listé (exécution en CI)
