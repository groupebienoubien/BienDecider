---
title: 'Story 12.1 : Confirmer une diffusion, contrôlée côté serveur et enregistrée'
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

**Problem:** une version validée ne peut pas partir : le dirigeant ne peut ni confirmer ce qui part, où et quand, ni retrouver ce qui est parti (#315), ni mettre une page en ligne sur son site vitrine (#172).

**Approach:** un dialogue de confirmation dans l'atelier, des contrôles serveur dans l'ordre §5.1, une diffusion enregistrée par tentative avec sa clé d'idempotence, et un résultat honnête (envoyée, échec, incertain).

## Boundaries & Constraints

**Always:**
- Dialogue « Confirmer la diffusion » : version, destination (Page choisie, site vitrine), moment « Maintenant », qui le verra, case « Je confirme cette version, cette destination et ce moment », bouton « Diffuser maintenant ».
- Contrôles serveur, dans l'ordre : M-02, M-54, M-55, M-56, M-80 (hors canal), M-67, M-57, M-58, M-59, M-81, M-53, M-49, M-82.
- Envoyée : date, canal, version, titre, identifiant externe ou adresse ; J-22 ; version en lecture seule ; « Créer V(n+1) à partir de Vn ».
- Échec : rien n'est parti, la version reste validée, « Réessayer » ; J-28.
- Incertain : jamais compté ni relancé ; « C'est bien parti » / « Ce n'est pas parti » (J-25).
- Site vitrine : la page validée, exactement, en texte, à son adresse publique ; une diffusion suivante la remplace.

**Never:**
- Diffuser deux fois la même version ; relancer automatiquement ; interpréter du HTML venu du contenu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page du site | V1 validée, case cochée | en ligne sous /site/{entreprise}/{page}, J-22 | M-82 sans case |
| Deuxième diffusion | V1 déjà diffusée | refusée | M-53 |
| Facebook sans Page | non reliée | refusée | M-57 |
| Facebook 5xx | délai, panne | incertain, rien de relancé | M-81 sur une nouvelle tentative |
| Facebook 4xx | refus | échec, version validée, J-28 | — |
| Adresse non vérifiée | compte | refusée | M-54 |
| Autre entreprise | identifiant étranger | introuvable | 404 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (Publication, SitePage) ; `src/lib/contents/{rules,publish,service,view}.ts` ; `src/app/api/contents/[id]/diffusion/route.ts` ; `src/app/site/[slug]/[page]/page.tsx` ; `src/app/atelier/[id]/content-workbench.tsx` ; `src/lib/missions/{stage,view}.ts` ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Table et migration additive ; contrôles purs ; services avec idempotence, garde de version et journal.
- [x] Facebook (Page choisie) et site vitrine ; résultat incertain vérifié par le dirigeant.
- [x] Atelier, Stratégie et étapes de mission branchés sur l'état de diffusion.
- [ ] Programmer et annuler (#261, PR suivante).
- [ ] E-mail par destinataire (`PublicationRecipient`) : avec les destinataires réels (#316, #287).
