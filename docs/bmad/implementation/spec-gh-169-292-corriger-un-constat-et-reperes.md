---
title: 'GH-169 et GH-292 — Corriger un constat, chiffrage facultatif et repères avec la capacité disponible'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
baseline_commit: '4bef05c'
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md'
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

## Intent

**Problème :**
- Un constat faux du diagnostic ne peut pas être corrigé : il faut le redire à Paul dans plusieurs écrans, et les missions qui en découlent n'en savent rien (critères d'octobre de #169).
- Le chiffrage facultatif (CA actuel, valeur moyenne d'un client) existe dans « Corriger mon profil » (onglet Objectifs), mais l'écart n'est calculé qu'avec un CA visé en euros. Or l'ambition V5.2 se dit en pourcentage (D8) : sans CA visé, aucun écart.
- Les repères d'Entreprise n'ont ni statut, ni capacité disponible (#292, « Votre boussole »).

**Approche (lot B1) :**
- **Corriger cette information**, sur chaque ligne de « Des constats aux décisions ».
- **Chiffrage D8** : l'écart part de l'ambition quand aucun CA visé n'est saisi.
- **Vos repères** : statut de chaque repère, et capacité disponible à reconfirmer tous les 30 jours.
- **Missions de départ** reliées aux premiers constats à l'inscription.

## Livré

### Corriger cette information (#169)

- **Entrée.** Le bouton « Corriger cette information » ouvre un dialogue rattaché au constat.
  - Les champs « Constat » et « Détail » sont préremplis.
  - Le dialogue annonce ses effets : « Les missions issues de ce constat seront à réexaminer. Rien n'est relancé ni publié. »
  - Échap ou « Annuler » ferme sans rien écrire. Le focus revient sur le bouton de la ligne, après l'enregistrement aussi : c'est le retour au point de départ.
- **Contrôles du serveur** (`POST /api/entreprise/constats/[id]/correction`) :
  - constat de 5 à 120 caractères, détail de 10 à 600, sans balise ;
  - constat de l'entreprise et du diagnostic courant ;
  - refus M-98 si rien n'a changé.
- **Le constat corrigé reste à sa place** : même identifiant, même ordre, mêmes missions.
  - Il devient « Déclaré par vous », sans source.
  - Sa date de correction est affichée : « Corrigé par vous le … ».
- **Version remplacée.** La version remplacée est archivée dans une nouvelle ligne `AuditFinding` (`versionOfId`, `replacedAt`), avec sa certitude, sa source et sa date de lecture d'origine.
  - Elle n'apparaît plus dans aucune vue courante (`getAuditFindingsView` l'exclut).
  - Le dialogue la montre sous « Constat remplacé ».
- **Missions à réexaminer.** Les missions reliées (`sourceFindingId`), hors arrêtées et écartées, reçoivent `Mission.findingReviewAt`.
  - Le badge « À réexaminer » apparaît sur Entreprise, sur la Stratégie et sur le détail de la mission.
  - Sur le détail, « J'ai réexaminé cette mission » retire le badge (`POST /api/missions/[id]/reexamen`, J-36).
  - Ni le statut, ni le contenu, ni les programmations ne changent. Aucune régénération ni publication n'est lancée.
- **Trace.** J-34 au journal, auteur « vous », avec l'ancien et le nouveau constat et le nombre de missions à réexaminer.
- **Annuler une correction.** « Revenir au constat remplacé » (`DELETE` sur la même route) restaure la dernière version archivée et écrit J-35.
  - Si la version restaurée est celle de Paul, le badge des missions est retiré.
- **Certitude « Déclaré par vous »** (`declare`) : elle est ajoutée aux libellés, aux détails et aux couleurs.
  - Le modèle ne peut pas la donner : l'outil `record_audit_finding` garde l'énumération `CERTAINTY_LEVELS`, sans `declare`.
- **Contexte conservé.** L'audit suivant reçoit les corrections du dirigeant dans son contexte, comme des déclarations à ne pas contredire sans source consultée.

### Chiffrage facultatif D8 (#169)

- **Calcul de l'écart.** Sans CA visé, `computeBusinessTarget` calcule la cible à partir de l'ambition : CA actuel × (1 + gain %).
  - L'échéance est l'horizon, compté depuis la dernière confirmation de l'ambition.
  - `basis` vaut `ambition` ; un CA visé saisi garde la priorité (`declared`).
  - Les prompts, la page Rapport et le résumé hebdomadaire en profitent sans autre changement.
- **Onglet Objectifs de « Corriger mon profil ».**
  - La légende devient « Chiffrage facultatif ».
  - Le CA actuel et la valeur moyenne d'un client passent en premier ; les autres champs restent.
  - Une phrase dit d'où part l'écart.
- **Vos repères.** Une ligne « Écart à combler » montre l'écart calculé avec la mention « calculé à partir de vos chiffres déclarés ».
  - Sans chiffre, elle devient « Chiffrage » : « À renseigner (facultatif) », avec un lien vers l'onglet Objectifs.

### Vos repères, avec la capacité disponible (#292)

- **Titre.** « Vos repères » garde son titre : la maquette V5 a remplacé « boussole » par « repères ».
- **Repères affichés.**
  - Ambition, avec « Modifier avec Paul ».
  - Localisation, zone et clients, avec « Modifier », qui mène à « Corriger mon profil ».
  - Statut « Confirmé » quand la valeur est renseignée ; sinon « À renseigner ».
- **Capacité disponible**, comptée en nouveaux projets clients par mois (vocabulaire V5), de 0 à 99 :
  - `Company.availableCapacity` et `capacityConfirmedAt` ;
  - « Confirmé » pendant 30 jours, puis « À reconfirmer » ;
  - « Modifier » ouvre un dialogue, qui sert aussi à reconfirmer (`POST /api/entreprise/capacite`, J-37).
- **Contexte de Paul.** `objectiveLine` transmet la capacité à Paul, avec la mention « à reconfirmer » au-delà de 30 jours.

### Missions de départ reliées aux premiers constats (report de #292)

- **Correspondance.** À l'inscription, chaque mission de l'étape 4 est reliée au premier constat repris du même sujet, encore libre, sinon au premier du même sujet :
  - `site_page` correspond à `site_web` ;
  - `google_profile` et `review_reply` correspondent à `fiche_google` ;
  - `social_post` correspond à `reseaux_sociaux` ;
  - `custom` n'est relié à aucun constat.
- **Effet.** La ligne d'Entreprise montre alors la déduction et la mission. Corriger ce constat met la mission à réexaminer.

## Décisions à valider par le PO

1. **Correction en place, version archivée.** Le constat garde son identifiant et sa place, et la version remplacée est archivée. Les missions n'ont donc pas à être rattachées de nouveau, et le diagnostic courant ne change ni d'ordre ni de date.
2. **« À réexaminer » est un signal, sans autre effet.** La mission garde son statut, son contenu et ses programmations, et le dirigeant retire le badge. Une correction de profil, elle, annule les programmations. Pour un constat, nous avons choisi de ne rien annuler sans décision du dirigeant : à confirmer.
3. **Une correction de constat ne touche pas le profil.** Corriger « métier : plombier » dans un constat ne change pas l'activité du profil : celle-ci se corrige dans « Corriger mon profil ».
4. **Capacité disponible.** La maquette V5.2 l'a retirée (« Plus de limite de temps ni de capacité », `maquette_v5.2/state.js`), mais le critère de #292 la demande. Elle est livrée comme un repère facultatif, sans plafond sur l'ambition ni sur les missions. Elle sert seulement de contexte à Paul. Le PO tranche : la garder ou la retirer.
5. **Écart tiré de l'ambition.** Sans CA visé, la cible est le CA actuel augmenté du gain de l'ambition. Un CA visé saisi garde la priorité.
6. **Correspondance modèle ↔ sujet** des missions de départ (ci-dessus).

## Reporté

- `SourceRead` du site lu avant le compte : la couverture des sources ne lit que les lectures d'un audit terminé (`getSourceCoverage`). Une ligne sans exécution n'apparaîtrait nulle part. À faire quand la couverture affichera aussi le diagnostic de départ.
- Positionnement, axes, concurrence locale et concurrents à confirmer ou écarter (#292) : l'audit ne produit pas encore ces données.

## Vérification

- `npm run test:findings` (`node --test`) : bornes et refus de la correction, version archivée, retour en arrière, missions à réexaminer, capacité (bornes, 30 jours, libellés), écart tiré de l'ambition, correspondance des missions de départ.
- `tests/security.spec.ts` (CI) : origine refusée, isolation entre entreprises, M-98, constat en place et version archivée, J-34, missions à réexaminer sans changement de statut ni de programmation, annulation (J-35), réexamen (J-36), capacité (J-37).
- `tests/user-journey.spec.ts` (CI) à 360 px : corriger un constat depuis Entreprise, retour du focus, « À réexaminer » sur la mission, annuler, capacité confirmée, sans défilement horizontal.
- `tsc`, ESLint et `next build`.

## Impacts et retour arrière

- **Migration.** Migration additive `20261109150000_correction_constats` (CODEOWNERS).
  - `AuditFinding` : `versionOfId`, `replacedAt`, `correctedAt`.
  - `Mission` : `findingReviewAt`.
  - `Company` : `availableCapacity`, `capacityConfirmedAt`.
- **Retour arrière.** Supprimer ces colonnes et les lignes archivées (`replacedAt` non nul).
