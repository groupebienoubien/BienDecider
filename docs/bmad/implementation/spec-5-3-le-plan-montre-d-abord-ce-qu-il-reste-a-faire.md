---
title: 'Story 5.3 — Le plan montre d''abord ce qu''il reste à faire'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le plan mêle, par thème, les actions à lancer, en cours et déjà exécutées (« 14 à examiner ») : le dirigeant cherche ce qu'il lui reste à faire sous ce qui est déjà mené.

**Approach:** décision des PF : deux onglets dans le plan, sur le motif de la page Décisions. « À faire (N) », ouvert par défaut, liste les actions `propose` ; « En cours et menées (N) » liste les actions `en_cours` et `lance`. L'onglet est repris dans l'URL (`?view=plan&onglet=menees`). Un onglet vide le dit : « À faire (0) » propose de compléter le plan ; « En cours et menées (0) » indique qu'aucune action n'est encore lancée. Les actions terminées ou écartées restent dans l'historique, comme aujourd'hui.

</frozen-after-approval>

## Implementation Notes

- `src/lib/action-plan-view.ts` : `splitPlanItems` (« À faire » = `propose` ; « En cours et menées » = le reste des actions ouvertes, statut inconnu compris, déjà affiché « En cours ») et `planTabFromParam`.
- `src/app/dashboard/dashboard-client.tsx` : l'onglet se lit dans l'URL (`useSearchParams`, `?onglet=menees`) et change par `history.pushState`, intégré au routeur de Next : le retour arrière et le lien « Plan d'action » le suivent. Boutons `aria-pressed` comme les filtres de Décisions. Après un lancement, le message dit que l'action est passée dans « En cours et menées ». `proposedItems` reprend `splitPlanItems`.
- Tests : `tests/delegation.spec.ts` (répartition, paramètre) ; `tests/user-journey.spec.ts` (onglets, URL, rechargement, retour arrière, lien du menu ; test de la story 1.4 ouvert sur « En cours et menées »). Tests de parcours exécutés en CI seulement.

## Review Triage Log

| # | Constat | Verdict | Preuve | Route |
|---|---------|---------|--------|-------|
| 1 | L'onglet ne suit pas une navigation ultérieure (état initialisé une fois) | medium | `useState(initialPlanTab)` | patch (lecture de l'URL) |
| 2 | Le commentaire promet le retour arrière, `replaceState` ne le donne pas | low | aucune entrée d'historique | patch (`pushState`) |
| 3 | Une action lancée disparaît de l'onglet sans explication | low | message de lancement | patch |
| 4 | « À faire (0) » sans bouton dans l'état vide | low | « Compléter le plan » reste dans l'encart sous la liste | rejet |
| 5 | Titre « Un plan, N priorités » compte aussi les actions lancées | low | sens discutable, sans tort nommé | rejet |
| 6 | Statuts inconnus rangés dans « En cours et menées » sans trace | low | consigné dans ces notes | rejet |
| 7 | Spec inachevée | false | voie courte, notes ajoutées à la fin | rejet |
| 8 | États vides des deux onglets non testés | low | textes statiques | rejet |
| 9 | Boutons `aria-pressed` plutôt que `tablist` | low | même motif que Décisions (charte) | rejet |
| 10 | Filtre « À faire » calculé en deux endroits | low | `proposedItems` | patch |
