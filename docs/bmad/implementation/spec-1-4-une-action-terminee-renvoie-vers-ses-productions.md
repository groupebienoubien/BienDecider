---
title: 'Story 1.4 — Une action terminée renvoie vers ses productions'
type: 'bugfix'
created: '2026-10-22'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** une action s'affiche « à valider » sur l'accueil et dans le plan, qu'elle n'ait jamais été lancée ou qu'elle soit retombée à lancer après un échec, et le même mot « valider » sert aussi aux productions. En production, le dirigeant a lu « Martine vous propose une action à valider » alors que l'audit était déjà fait.

**Approach:** un seul libellé par statut d'action, celui du glossaire validé (à lancer, en cours, à décider, terminée), calculé par une fonction pure partagée par l'accueil et le plan ; une action à décider renvoie vers ses productions.

## Boundaries & Constraints

**Always:** `propose` = « À lancer » (bouton « Examiner et lancer », ou « Relancer l'action » si la dernière exécution a échoué) ; `en_cours` = « En cours » ; `lance` = « À décider » avec un lien vers ses productions en attente, ou « Voir la production » s'il n'en reste aucune ; `termine` = « Terminée », absente de « Ce que l'équipe vous a préparé » ; la carte de l'accueil dit « vous propose une action à lancer ».

**Never:** ne pas changer les libellés des productions (« Productions à valider », « Approuver cette version ») ; pas de migration ; pas de changement de comportement des boutons, seulement de leurs libellés.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Jamais lancée | `propose`, aucune exécution | « À lancer », bouton « Examiner et lancer » | N/A |
| Échec | `propose`, dernière exécution `failed` | « À lancer », bouton « Relancer l'action » | N/A |
| En cours | `en_cours` | « En cours » | N/A |
| À décider | `lance`, 3 productions en attente | « À décider », lien « 3 à examiner » vers Décisions | N/A |
| Tout décidé | `lance`, 0 production en attente | lien « Voir la production » | N/A |
| Terminée | `termine` | « Terminée » ; absente des cartes de l'accueil | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/action-plan-view.ts` -- fonctions pures de la vue du plan (`groupPlanItems`), testées dans `tests/delegation.spec.ts` ; y ajouter `planItemStatusView(status, lastRunStatus, pendingCount)` → `{ label, cta }`.
- `src/app/dashboard/dashboard-client.tsx:352-355` -- carte d'accueil d'une action `propose` : « vous propose une action à valider », « Action à valider… La valider lancera… ».
- `src/app/dashboard/dashboard-client.tsx:423-433` -- plan : « À valider / En cours / Lancée » dans les détails, boutons « Examiner et valider », « Relancer l'action », « N à examiner », « Voir la production ».
- `src/app/dashboard/dashboard-client.tsx:579-585` -- fenêtre de l'action : titre « Valider l'action, puis préparer », bouton « Valider et générer le brouillon », texte « Cette validation lance… » : passer à « Lancer l'action », « Lancer et générer le brouillon », « Ce lancement… ».
- `tests/delegation.spec.ts` -- tests unitaires des fonctions pures de vue, à compléter.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/action-plan-view.ts` -- `planItemStatusView` -- libellé unique par statut
- [ ] `src/app/dashboard/dashboard-client.tsx` -- accueil, plan et fenêtre de l'action utilisent `planItemStatusView` et le vocabulaire « lancer » -- cohérence
- [ ] `tests/delegation.spec.ts` -- un test par ligne de la matrice -- non-régression

**Acceptance Criteria:**
- Étant donné une action exécutée avec des productions en attente, quand l'accueil ou le plan l'affichent, alors elle est « À décider » avec un lien vers ses productions, jamais « à valider ».
- Étant donné les tests de parcours existants, quand ils tournent, alors aucun ne dépend d'un libellé modifié sans avoir été mis à jour.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test:delegation` -- expected: tests verts
