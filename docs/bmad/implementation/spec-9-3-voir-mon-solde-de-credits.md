---
title: 'Story 9.3 : Voir mon solde de crédits et le coût de chaque action'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: 'df55fab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant ne sait pas ce qu'il lui reste ni ce que coûte une action avant de la faire (#56, décision D1).

**Approach:** 20 crédits offerts, un registre en ajout seul, un débit unique et atomique au premier lancement d'une mission, et le solde, le barème et l'historique dans Mon compte.

## Boundaries & Constraints

**Always:**
- 20 crédits offerts à chaque entreprise (colonne `creditBalance`, 20 par défaut, aussi pour les comptes existants) ; l'écriture « Crédits offerts à l'inscription » est faite au registre une seule fois, de façon atomique, à la première lecture ou au premier débit.
- Barème : création, reprise, retouche, validation, diffusion, bilan gratuits ; premier lancement 3 crédits ; version préparée avec Paul 1 crédit (constante prête, débit livré avec les versions, #289).
- Débit par mise à jour conditionnelle (`creditBalance >= n`) dans la transaction de la transition, avec son mouvement de registre (`CreditLedger` : variation, libellé, solde après) ; sinon M-15 avec le besoin et le solde, la mission reste inchangée et rien n'est écrit.
- Un nouvel essai ou deux requêtes simultanées ne débitent jamais deux fois.
- `GET /api/credits` : solde et huit derniers mouvements de l'entreprise de la session. Mon compte affiche le solde, le barème et l'historique ; pas de recharge pendant le PoC (« Besoin de crédits » renvoie à l'adresse de contact).
- Les plafonds techniques de coût du modèle restent actifs, indépendants des crédits.

**Never:**
- Pas de paiement, d'abonnement ni de facturation (#55, #57 à #61) ; pas de coût réel affiché au dirigeant.
- Pas de solde modifié sans mouvement de registre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Première lecture | compte sans registre | solde 20, une écriture « offerts » | — |
| Lectures simultanées | deux requêtes | une seule écriture « offerts » | — |
| Premier lancement | solde ≥ 3 | solde moins 3, mouvement « Lancement de la mission « … » » | — |
| Lancement répété ou reprise | mission déjà lancée | aucun débit | — |
| Deux lancements simultanés | même mission | un seul débit | M-02 pour l'autre |
| Crédits insuffisants | solde de 1 | refusé avec « il en faut 3, il vous en reste 1 » | M-15, 422 |
| Autre entreprise | session d'une autre entreprise | son propre solde et son historique | — |
| Sans session | aucun cookie | refusé | 401 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration (`CreditLedger`, `Company.creditBalance`, `Company.creditGrantedAt`) ; `src/lib/credits.ts` ; `src/lib/missions/service.ts` (débit du lancement) ; `src/app/api/credits/route.ts` ; `src/app/compte/page.tsx` ; `tests/engine.spec.ts`, `tests/security.spec.ts`, `tests/user-journey.spec.ts`.

## Tasks & Acceptance

- [x] Colonnes, registre et migration additive ; octroi des 20 crédits atomique.
- [x] Débit atomique dans la transaction du lancement ; refus M-15 sans écriture.
- [x] Route du solde ; Mon compte : solde, barème, historique.
- [x] Tests : octroi unique, débit unique, simultanéité, crédits insuffisants, accès croisé, affichage sur téléphone.
- [ ] Solde rappelé dans la navigation (#278) et coût dans les dialogues de lancement (#286) : hors lot.
