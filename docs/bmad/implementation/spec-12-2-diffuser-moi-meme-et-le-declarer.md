---
title: 'Story 12.2 : Diffuser moi-même et le déclarer'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: '3db6de2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** en « Préparer seulement », sans canal connecté ou pour une mission menée hors canal, le dirigeant ne peut pas dire qu'il a diffusé lui-même : la mission n'avance pas (#295).

**Approach:** « Récupérer le texte » puis « Je l'ai diffusé moi-même » : une diffusion déclarée, liée à la version exacte, qui compte comme une diffusion et la verrouille, marquée « déclarée par vous ».

## Boundaries & Constraints

**Always:**
- Conditions : mission en cours (M-56), version courante validée (M-58), pas de programmation (M-59), pas de résultat incertain (M-81), pas déjà diffusée (M-53).
- Saisie : où (2 à 60 caractères), date passée ou du jour (M-83), case « Je confirme avoir diffusé cette version » (M-84).
- Une seule déclaration par version ; J-24 ; « déclarée par vous » dans l'atelier.
- « Préparer seulement » refuse toute exécution externe côté serveur, interface contournée : Gmail, publication Facebook et site (M-55, 403).

**Never:**
- Présenter une diffusion déclarée comme une preuve du canal ; remplacer par une déclaration un canal désactivé (D4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hors canal | « Salon du quartier », aujourd'hui | diffusée, déclarée par vous, J-24 | — |
| Date future | demain | refusée | M-83 |
| Deux déclarations | même version | une seule | M-53 |
| Préparer seulement | `/api/gmail/send`, `/api/proposals/…/execute`, `/api/site/republish` | refusées | 403 M-55 |

</frozen-after-approval>

## Code Map

`src/lib/contents/{rules,publish}.ts` (`checkDeclaration`, `declareContentDiffusion`) ; `src/lib/delegation-level.ts` (`prepareOnlyRefusal`) ; routes Gmail, propositions, site ; atelier ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Déclaration, idempotente, journalisée, visible dans l'atelier.
- [x] Refus serveur des exécutions externes en « Préparer seulement ».
- [ ] Diffusion déclarée dans Résultats (#294) ; prospects « contactés » (#180, avec #287).
