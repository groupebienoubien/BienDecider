---
title: 'Story 10.4 : Lancer, suspendre, reprendre et réorienter une mission'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '5ead4bd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-10-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant ne peut ni comprendre pourquoi une mission lui est proposée, ni la lancer dans un cadre précis, ni la suspendre, la reprendre, l'écarter ou en reformuler l'objectif (#286, #313).

**Approach:** le détail d'une mission et ses dialogues (§13.7), qui appellent les transitions du serveur ; chaque décision est journalisée.

## Boundaries & Constraints

**Always:**
- Détail : statut, priorité, « Paul coordonne », résultat recherché ; modèle, canal, périmètre, étape, suivi ; « Pourquoi cette mission ? » ; « Ce que vous choisissez » (canal tant qu'aucune version n'est validée, périmètre du modèle, verrouillés si écartée ou arrêtée) ; « Les actions de la mission » (5 actions, n / 5 étapes) ; « Notre contrat de mission » (résultat, coût, 0 € de dépense, règle d'arrêt, délégation).
- « Confirmer le cadre de la mission » : résultat, canal, périmètre, coût et solde (ou « Reprise sans frais »), 0 € engagé, règle d'arrêt ; crédits insuffisants : bouton inactif, M-15 et « Écrivez-nous » ; « Lancer n'envoie et ne publie rien ».
- Mettre en pause (« Garder en cours » / « Confirmer la pause »), écarter (« Garder au plan » / « Écarter »), remettre au plan, modifier l'objectif (5 à 120 caractères, « Y revenir » à l'objectif d'origine), selon le statut ; aucun bouton de lancement sur une mission arrêtée ou écartée.
- Journal, dans la transaction de la décision : J-01 création, J-17 lancement ou reprise, J-18 pause, J-09 écartée, J-10 remise au plan, J-11 objectif, J-12 périmètre, J-29 canal ; rien sur un refus.
- « Ajuster avec Paul » ouvre Paul avec la mission comme contexte.

**Never:**
- Le lancement n'autorise aucune diffusion ; pas de lancement direct depuis Paul ou une liste.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lancer | À décider, 20 crédits | En cours, 17 crédits, J-17 | — |
| Crédits insuffisants | 1 crédit | bouton inactif, message M-15 | 422 si forcé |
| Pause puis reprise | En cours | En pause (J-18), puis En cours sans débit (J-17) | — |
| Objectif modifié | « Trois devis » | J-11 ; « Y revenir » propose l'objectif d'origine | M-25 hors bornes, M-26 si arrêtée |
| Écarter en cours | En cours | refusé | M-22 |
| Version périmée | double onglet | refusé | M-02, 409 |
| Mission d'une autre entreprise | identifiant étranger | page introuvable | 404 |

</frozen-after-approval>

## Code Map

`src/app/missions/[id]/page.tsx`, `scope-editor.tsx` ; `src/components/mission-actions.tsx` ; `src/lib/missions/service.ts` (journal) ; `src/lib/journal.ts` ; tests `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Détail, dialogues de cadre, pause, écart, objectif ; canal et périmètre modifiables.
- [x] Journal écrit dans la transaction de chaque décision.
- [ ] Refus de validation et de diffusion d'un contenu d'une mission non active : avec l'atelier et la diffusion (#289, #315).
- [ ] Annulation des programmations à la pause : avec la programmation (#261).
- [ ] « Examiner » les destinataires, agences et réalisations avant lancement : avec chaque modèle (#316, #287, #317).
