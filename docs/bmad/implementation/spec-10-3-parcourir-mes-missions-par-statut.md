---
title: 'Story 10.3 : Parcourir mes missions par statut'
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

**Problem:** le dirigeant ne voit pas d'un coup d'œil ce qui est en cours, ce qu'il doit décider et ce qui est en pause (#285).

**Approach:** la page Missions, filtrée par statut sans rechargement, la priorité de Paul d'abord, et la création d'une mission.

## Boundaries & Constraints

**Always:**
- Onglets Toutes, En cours, À décider, En pause, Arrêtées, Écartées, avec compteurs ; filtre gardé dans l'adresse (`?statut=`), sans rechargement.
- Carte : statut et priorité, titre, résultat recherché, étape, suivi en six temps, « Votre copilote : Paul », « Voir la mission ».
- Bandeau : délégation (vous validez chaque contenu), budget média maximum « — », « Aucune dépense engagée ».
- États vides : aucune mission (« Créer une mission », « Explorer une idée ») ; vue vide (« Voir les propositions »).
- « Cadrons votre nouvelle mission. » : constat, nom, type d'action (modèles proposés seulement), canal si plusieurs, périmètre du modèle, règle d'arrêt pour « Sur mesure », résultat recherché ; 0 crédit, aucun envoi ; le refus du serveur est affiché tel quel.
- Téléphone : cartes en colonne, aucun débordement.

**Never:**
- Pas d'autre personnage que Paul sur les cartes ; pas de création sans confirmation du dirigeant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Filtre partagé | `/missions?statut=en-cours` | seules les missions en cours | — |
| Vue vide | aucune mission écartée | « Aucune mission dans cette vue » | — |
| Création refusée | titre trop court | message M-20 | 422 |
| Création réussie | champs valides | détail de la mission, À décider | — |

</frozen-after-approval>

## Code Map

`src/app/missions/page.tsx`, `mission-list.tsx`, `nouvelle/page.tsx`, `nouvelle/new-mission-form.tsx` ; `src/lib/missions/templates.ts` (Partenariats et Réalisation fermés) ; tests `delegation`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Liste filtrée, compteurs, adresse partagée, états vides, bandeau.
- [x] Création d'une mission depuis l'interface.
- [ ] « Explorer une idée » qui ouvre le contexte « Une nouvelle idée de mission » (#288, #312) : aujourd'hui, ouvre Paul sur la page.
