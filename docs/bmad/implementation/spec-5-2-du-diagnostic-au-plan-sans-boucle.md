---
title: 'Story 5.2 — Du diagnostic au plan, sans boucle'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '292a9acd2750077b60b70a5552c2c0733c2a2eb8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** reproduit en production le 24 octobre : à la fin du diagnostic, « Voir le plan d'action qui en découle » mène à un plan dont la première action est « Audit de présence en ligne et fiche Google » (Martine), encore « à lancer » ; le plan renvoie donc à refaire le diagnostic. Les recommandations des constats n'arrivent au plan que si le dirigeant clique « Ajouter au plan » constat par constat, et la préparation du plan par Paul ne reçoit que les titres des constats.

**Approach:** décisions des PF du 2026-10-24 : à la fin d'un audit de Martine réussi, les actions de Martine encore « à lancer » dont le titre parle d'audit ou de diagnostic (« audit », « diagnostic », sans tenir compte des majuscules ni des accents) passent dans les actions menées ; les autres actions de Martine (avis, fiche Google) restent à lancer ; sur la page Diagnostic, un bouton « Préparer le plan à partir du diagnostic » fait proposer à Paul 3 à 5 actions tirées des constats du dernier audit (story 5.1), au statut « à lancer » ; rien n'est lancé ; la préparation compte comme un lancement, sur clic seulement ; une action déjà au plan n'est pas recréée.

## Boundaries & Constraints

**Always:** réutiliser la préparation de plan existante (`enqueuePlanGeneration`, `runCoCeoPlanning`, route `POST /api/co-ceo/plan`) ; transmettre à Paul, pour le dernier audit, titre, « à améliorer » et recommandations (`actionItems`) de chaque constat ; le bouton est l'action principale de la page une fois le diagnostic fait, et redevient un lien « Voir le plan d'action » quand le plan contient déjà des actions créées après la fin du dernier audit ; pendant la préparation, le bouton indique qu'elle est en cours, puis mène au plan.

**Never:** aucun lancement d'agent ; aucune action supprimée ; pas de nouvelle table.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Audit terminé | action d'audit de Martine `propose`, audit de Martine réussi | l'action passe à `lance` (« En cours et menées ») | N/A |
| Audit échoué | même action, audit échoué | l'action reste `propose` | N/A |
| Autre action de Martine | « Répondre aux avis » `propose`, audit réussi | reste `propose` | N/A |
| Préparer le plan | dernier audit avec 3 constats | Paul crée 3 à 5 actions `propose` | quota atteint : message de limite (story 4.1) |
| Doublon | action équivalente déjà au plan | non recréée | N/A |
| Plan à jour | actions créées après la fin du dernier audit | lien « Voir le plan d'action » au lieu du bouton | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agent-runs.ts` (`processAgentRun`, passage à `succeeded`, l. 350 environ) -- point d'accroche de la fin d'un audit de Martine (exécution `agent: "marketing"`, directe ou issue d'une action).
- `src/lib/agents/onboarding-audit.ts` (`ONBOARDING_AUDIT_TITLE`) -- titre de l'audit d'inscription.
- `src/lib/agents/co-ceo.ts` (`runCoCeoPlanning`, l. 703 ; prompt l. 791 « Derniers constats ») -- ne reçoit que les titres ; y ajouter « à améliorer » et `actionItems` du dernier audit (`getLatestAuditFindings`, story 5.1) ; « Actions déjà au plan (ne les répète pas) » existe déjà.
- `src/app/api/co-ceo/plan/route.ts` -- route de préparation, déjà soumise au quota de lancements.
- `src/app/diagnostic/diagnostic-client.tsx` (lien l. 83) et `src/app/diagnostic/page.tsx` -- bouton, état « plan à jour » (actions créées après `latestAt`).
- `src/app/dashboard/dashboard-client.tsx` (`handleGeneratePlan`, l. 145) -- modèle d'appel et de suivi (`waitForAgentRun`).
- Tests : `tests/engine.spec.ts` (clôture, prompt de préparation), `tests/user-journey.spec.ts` (bouton, lien), `tests/delegation.spec.ts` (règle de sélection, si fonction pure).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agent-runs.ts` -- clore les actions d'audit à la fin d'un audit réussi -- plus de boucle
- [x] `src/lib/agents/co-ceo.ts` -- détail du dernier audit dans la préparation -- un plan qui découle du diagnostic
- [x] `src/app/diagnostic/*` -- bouton « Préparer le plan à partir du diagnostic », état « plan à jour » -- le chemin du diagnostic au plan
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné le compte reproduit le 24 octobre, quand le dirigeant suit le diagnostic vers le plan, alors l'onglet « À faire » ne propose plus de refaire l'audit.

## Implementation Notes

- Fermeture : `closeAuditPlanItems` (`src/lib/agent-runs.ts`) après une exécution réussie de Martine (directe ou issue d'une action, hors révision) qui a enregistré au moins un constat ; actions de Martine `propose` dont le titre est un audit (`isAuditPlanItemTitle`, `src/lib/agents/plan-item-shared.ts` : le titre commence par « audit » ou « diagnostic », précédé au plus de « faire », « refaire », « lancer », « réaliser », « nouvel/nouveau », « un/le/l' ») → `lance`. Un échec de fermeture est journalisé sans faire échouer l'exécution.
- Préparation : `runCoCeoPlanning` lit le dernier audit (`latestAuditLines`, `src/lib/agents/audit-plan-context.ts` : titre, à améliorer, recommandations ; 8 constats et 3 recommandations au plus) et refuse dans l'outil un titre déjà pris (au plan, écarté, ou proposé dans la même exécution).
- Page Diagnostic : bouton principal « Préparer le plan à partir du diagnostic » ; « plan à jour » = une préparation de plan réussie après la fin du dernier audit, alors lien « Voir le plan d'action ». Suivi abandonné au démontage.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, verification-gap | Toute exécution `plan_item` de Martine ferme les actions d'audit (ex. « Répondre aux avis ») ; chemin non testé | medium | `isAuditRun` sur le seul genre d'exécution | patch (constat enregistré requis) |
| 2 | blind, edge | La règle de titre attrape les suites d'audit (« Corriger les points relevés par l'audit ») et « diagnostiquer » | medium | `/\b(audit|diagnostic)/` sans fin de mot | patch |
| 3 | edge | Audit réussi sans constat ferme quand même | low | même cause que 1 | patch (avec 1) |
| 4 | blind, edge | « Plan à jour » : toute action créée après l'audit compte ; une préparation sans création repropose le bouton | medium | comptage d'`actionPlanItem` | patch |
| 5 | blind, edge | Suivi sans abandon au démontage ; `data.run` non vérifié ; bouton actif pendant `checking` | low | `preparePlan` | patch |
| 6 | blind, edge | Titres écartés absents du contrôle de doublon | low | `plannedTitles` | patch |
| 7 | blind | Contexte d'audit sans limite de taille | low | `take: 6` retiré | patch (8 constats, 3 recommandations) |
| 8 | blind, edge | Action fermée affichée « Terminée · Voir la production » sans production | low | `planItemStatusView("lance")` | defer |
| 9 | edge | Deux préparations simultanées créent des doublons | false | clé active `plan-generation` : une seule à la fois | rejet |
| 10 | blind | Plage d'accents écrite en caractères combinants | low | même écriture que `slugify` | rejet |
| 11 | edge | Action d'audit créée pendant l'audit fermée par lui | low | cas rare, sans tort durable | rejet |
| 12 | edge | Paul peut reformuler un audit (« Nouvel audit… ») | maybe-false | consigne « audit fait, ne pas le reproposer » ; règle de titre l'attrape | rejet |
| 13 | edge | Nombre d'actions non borné à 3-5 | low | consigne du prompt ; plafond de la story 3.2 hors périmètre | rejet |
| 14 | verification-gap | Retour au bouton après « Actualiser » non testé ; plan entièrement écarté non testé | low | branches simples | defer |
