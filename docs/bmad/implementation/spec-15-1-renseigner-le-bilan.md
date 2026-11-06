---
title: 'Story 15.1 : Renseigner le bilan d''une mission et voir mes résultats'
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

**Problem:** après une diffusion, le dirigeant n'a nulle part où noter ce qu'elle a produit, et la page Résultats reste vide (#294).

**Approach:** un bilan déclaratif par mission, rattaché au nombre de diffusions, et une page Résultats qui sépare l'activité (diffusions) des résultats déclarés.

## Boundaries & Constraints

**Always:**
- Bilan après au moins une diffusion (M-37) ; demandes et rendez-vous requis (M-38), entiers (M-39), rendez-vous ≤ demandes (M-33, en direct) ; CA facultatif, vide ≠ 0 ; note de 600 caractères.
- « À mettre à jour » dès qu'une nouvelle diffusion a lieu ; J-15 « Attribution déclarative, non vérifiée ».
- Résultats : indicateurs (« — » sans déclaration), tableau par mission, diffusions et programmations avec lien vers la version, point de Paul et prochain point daté.

**Never:**
- Présenter une diffusion comme un résultat ; inventer un chiffre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aucune diffusion | — | refus | M-37 |
| Rendez-vous > demandes | 1 / 2 | refus, alerte en direct | M-33 |
| Décimale, texte | 2,5 | refus | M-39 |
| Bilan saisi | 3 / 1 / vide | enregistré, J-15, étape `décider` | — |
| Nouvelle diffusion | — | bilan « à mettre à jour », étape `bilan` | — |
| Autre entreprise | identifiant connu | refus | 404 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (MissionReport) ; `src/lib/missions/{report,results,results-view,view}.ts` ; `src/app/api/missions/[id]/report/route.ts` ; `src/app/resultats/{page,results-client}.tsx` ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Saisie et règles du bilan, état « à mettre à jour ».
- [x] Page Résultats (§13.4) hors « Décisions & traçabilité ».
- [ ] « Décisions & traçabilité » (journal) : avec #41.
