---
title: 'Story 11.2 : Refuser une version avec un motif retenu par Paul'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '45f5056'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-11-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant qui n'aime pas une proposition ne peut que la retoucher lui-même ; Paul ne sait pas pourquoi elle ne convenait pas et recommence les mêmes erreurs (#22, FR-31, décision D11).

**Approach:** une action secondaire « Je ne veux pas de cette version », avec un motif obligatoire gardé sur la version et transmis à Paul pour les versions suivantes de la mission.

## Boundaries & Constraints

**Always:**
- Motif obligatoire, 3 à 300 caractères (M-16) ; bouton « Refuser Vn » inactif tant qu'il manque.
- Seule la version courante, non programmée ni diffusée, d'une mission ni arrêtée ni écartée, peut être refusée (M-02, M-45, M-46, M-44).
- Le refus retire la validation éventuelle ; la version reste dans l'historique avec son motif ; J-27 « Vn refusée : {motif} ».
- Les cinq derniers motifs de la mission sont donnés à Paul à chaque nouvelle proposition.

**Never:**
- Un refus n'efface rien et ne débite aucun crédit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Refuser | V2, « Trop commercial » | V2 refusée, motif affiché, J-27 | — |
| Sans motif | « » | refusé | M-16 |
| Ancienne version | V1 sur V2 | refusé | M-02 |
| Proposition suivante | motif connu | le motif est dans la demande à Paul | — |

</frozen-after-approval>

## Code Map

`src/lib/contents/rules.ts` (`validateRejection`, `checkRejection`) ; `src/lib/contents/service.ts` (action `reject`, motifs transmis) ; `src/lib/contents/writer.ts` (consigne) ; `src/app/atelier/[id]/content-workbench.tsx` ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Refus motivé, gardé sur la version, journalisé, validation retirée.
- [x] Motifs de la mission transmis à Paul.
- [ ] Motifs retenus au-delà de la mission (« retours retenus » de l'entreprise, §13.5) : avec #53.
