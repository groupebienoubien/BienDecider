---
title: 'Story 9.2 : Un catalogue ouvert de modèles d''action, ou une mission sur mesure'
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

**Problem:** le dirigeant est limité à trois types d'action et ne peut pas faire prendre en charge une demande hors catalogue (#314, décision D9).

**Approach:** un catalogue de modèles décrit en données, une création de mission qui en valide les champs, et « Sur mesure » pour tout le reste, y compris hors canal.

## Boundaries & Constraints

**Always:**
- Catalogue en données (`src/lib/missions/templates.ts`) : Partenariats, Réalisation, Réactivation, Publication, Fiche Google à jour, Réponse aux avis, Page du site vitrine, Sur mesure ; chacun avec ses canaux permis, son format, sa règle d'arrêt et la validation de son périmètre. Ajouter un modèle ne change pas les règles communes.
- `POST /api/missions` : session, origine contrôlée ; entreprise de la session (jamais celle du corps) ; titre de 5 à 80, résultat recherché de 5 à 120, constat de 10 à 300 caractères, sans balise HTML (M-20) ; 0 crédit ; aucune diffusion autorisée ; statut À décider.
- Canal : permis par le modèle (M-69), puis actif (M-67) ; choisi au cadrage, ou déduit quand le modèle n'en a qu'un actif, sinon M-68 ; modifiable (`set_channel`) tant qu'aucune version n'est validée (M-19).
- Un modèle n'est proposé que s'il est ouvert et a au moins un canal actif (`enabled` de `channel-capabilities.ts`) ; « Sur mesure » l'est toujours. `GET /api/missions/catalogue` ne liste que ceux-là, avec leurs seuls canaux actifs.
- Sur mesure : périmètre décrit de 10 à 300 caractères et règle d'arrêt de 7 à 90 jours (M-18), canal actif ou hors canal ; la demande est enregistrée pour l'administration (`UncoveredRequest`, source « mission »).
- Dix missions non arrêtées au plus (M-75) ; périmètre par modèle : 1 ou 2 agences (M-30), 1 à 8 contacts (M-31), 1 réalisation (M-32), sujet de 5 à 120 caractères (M-17), 1 à 5 avis (M-64).

**Never:**
- Pas de modèle proposé dont aucun canal n'est actif ; Réactivation reste fermée tant que #69 n'est pas levé.
- Pas de contrôle d'existence des agences, contacts, réalisations et avis ici : il arrive avec chaque modèle (#316, #287, #317, #15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création valide | Publication, sujet, canal Facebook | mission À décider, 0 crédit | — |
| Modèle fermé ou sans canal actif | Réactivation, Fiche Google | refusé | M-76 |
| Canal non actif | Instagram | refusé | M-67 |
| Canal non permis | Gmail pour une Publication | refusé | M-69 |
| Canal omis, plusieurs possibles | modèle à plusieurs canaux actifs | refusé | M-68 |
| Champ hors bornes ou balise | titre de 3 caractères, `<b>` | refusé | M-20 |
| Sur mesure complet | description, règle de 21 jours, hors canal | mission sans canal, demande transmise | — |
| Sur mesure sans règle d'arrêt | règle absente ou de 6 jours | refusé | M-18 |
| Onzième mission | 10 non arrêtées | refusé | M-75 |
| Entreprise dans le corps | `companyId` d'une autre entreprise | ignoré, session utilisée | — |

</frozen-after-approval>

## Code Map

`src/lib/missions/templates.ts`, `channels.ts`, `rules.ts` (`validateNewMission`), `service.ts` (`createMission`) ; `src/lib/channel-capabilities.ts` (`enabled`) ; `src/app/api/missions/route.ts`, `catalogue/route.ts` ; `tests/delegation.spec.ts`, `tests/engine.spec.ts`, `tests/security.spec.ts`.

## Tasks & Acceptance

- [x] Catalogue en données et état actif des canaux.
- [x] Validation de la création et du changement de canal, avec les messages de la spécification.
- [x] Routes de création et de catalogue ; demande « Sur mesure » enregistrée pour l'administration.
- [x] Tests : chaque modèle valide ses champs, canal inactif refusé, plafond, isolation.
- [ ] Création depuis l'interface et proposition par Paul : #285, #288 (hors lot).
