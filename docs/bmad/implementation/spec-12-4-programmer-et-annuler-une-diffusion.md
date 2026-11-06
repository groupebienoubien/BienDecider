---
title: 'Story 12.4 : Programmer la diffusion d''une version validée et pouvoir l''annuler'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '0b4f5d9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant ne peut diffuser qu'immédiatement ; il veut choisir le moment, et pouvoir revenir dessus tant que rien n'est parti (#261).

**Approach:** « Programmer » dans le dialogue de diffusion ; un ordonnanceur appelé toutes les 5 minutes par GitHub Actions rejoue les contrôles à l'heure prévue puis diffuse comme une diffusion immédiate ; chaque annulation est journalisée.

## Boundaries & Constraints

**Always:**
- Moment « Maintenant » ou « Programmer » : date et heure de l'appareil, enregistrées en UTC avec le fuseau ; au moins 5 minutes et au plus un an plus tard (M-61) ; J-21.
- Une version programmée ne se retouche pas (M-45) et ne se diffuse pas deux fois (M-59) ; « Annuler la programmation », confirmé (« Le contenu restera validé. »), seule annulation possible (J-23, par vous).
- À l'heure : réservation unique de la programmation, contrôles §5.1 n° 2 à 9 rejoués ; un refus l'annule (J-23, système) et la signale dans l'atelier et « À valider par vous » ; sinon même appel, même enregistrement et même journal qu'une diffusion immédiate.
- Annulent les programmations : pause et écart de la mission, déconnexion de Facebook ou Gmail, passage en « Préparer seulement ».
- Une diffusion restée « en cours » plus de 15 minutes devient incertaine (§5.5), jamais relancée.
- Précision annoncée : « vers {heure}, à quelques minutes près ».

**Never:**
- Diffuser une programmation deux fois ; diffuser sans contrôles rejoués ; relancer automatiquement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Programmer | demain 9 h | « V1 programmée », J-21 | M-61 si passé ou dans moins de 5 min |
| Deux passages simultanés | programmation due | une seule diffusion | — |
| Contrôle échoué à l'heure | adresse non vérifiée | annulée par le système, J-23, signalée | — |
| Pause de la mission | programmée | annulée, J-23 | — |
| Annuler | rien de programmé | refusé | M-87 |
| Ordonnanceur | sans secret ou mauvais secret | refusé | 500 / 401 |

</frozen-after-approval>

## Code Map

`src/lib/contents/{rules,publish,view}.ts` (`parseSchedule`, `isSchedulable`, `cancelScheduledPublications`, `cancelContentSchedule`, `runDuePublications`) ; `src/app/api/cron/publications/route.ts` ; `.github/workflows/publications-cron.yml` ; `src/app/api/contents/[id]/diffusion/route.ts` ; `src/lib/missions/service.ts` ; routes de déconnexion Facebook et Gmail ; `src/lib/delegation-settings.ts` ; atelier, Stratégie ; colonne `Publication.cancelledBy` ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Programmer, annuler, exécuter à l'heure avec contrôles rejoués, idempotence et journal.
- [x] Annulations par pause, écart, déconnexion et « Préparer seulement ».
- [x] Programmations et annulations par le système visibles dans l'atelier et la Stratégie.
- [ ] Arrêt de la mission (avec la décision de fin, #52) et profil modifié (§4.5) annulent aussi les programmations.
- [ ] Programmation visible dans Résultats et la ligne du canal (#294, #293).
