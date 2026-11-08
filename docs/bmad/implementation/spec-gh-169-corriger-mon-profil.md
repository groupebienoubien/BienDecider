---
title: 'GH-169 — Corriger mon profil, avec l’origine de chaque information et ses effets sur les contenus'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'c36ba396da7a06f925d1c8abc747fcae469d6b08'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** après le compte, Entreprise ne permet pas de corriger le prénom, la localisation, les clients ni les offres, et n'indique d'où vient aucune information. Une correction recrée bien une version système des contenus (#41), mais rien ne la signale « à relire » et la validation de cette version reste possible. Les repères (ambition, localisation, zone, clients) ne sont pas affichés.

**Approche :**
- « Corriger mon profil » dans Entreprise : les sept champs (prénom, entreprise, localisation, activité, zone, clients, offres), chacun avec son origine, gardée sur `Company`.
- Les effets FR-33 existants sont complétés : badge « Profil à relire » et validation refusée tant qu'aucune nouvelle version n'est enregistrée.
- Un bloc de repères s'ajoute à Entreprise.

Décision de Samir (2026-11-08) : périmètre A seul. Le chiffrage (D8) et les critères d'octobre sur les constats sont reportés (`deferred-work.md`, à reprendre avec #292).

## Boundaries & Constraints

**Always :**
- **Effets d'une correction.** Une correction réelle (`profileChanges`), après la première création, passe par `markProfileChanged`, inchangé :
  - les programmations sont annulées ;
  - chaque contenu modifiable reçoit une version système « Profil corrigé : informations du contenu à vérifier » ;
  - J-02 est écrit.
- **Validation bloquée.** Tant que la version courante d'un contenu est cette version système, sa validation est refusée avec un nouveau message M-92 : « Profil corrigé : relisez ce contenu et enregistrez une nouvelle version avant de le valider. »
  - Le contenu porte le badge « Profil à relire » sur la mission et dans l'atelier.
  - Enregistrer une nouvelle version, par le dirigeant ou par Paul, lève le blocage.
- **Origine affichée** (décision de Samir du 2026-11-08) :
  - « Lu sur le site » pour une valeur `observed` confirmée telle quelle à l'inscription ;
  - « Proposé par Paul, confirmé par vous » pour une valeur `hypothesis` confirmée telle quelle ;
  - « Déclaré par vous » pour une valeur saisie ou modifiée par le dirigeant ;
  - « À renseigner par vous » pour une valeur vide.

  Un champ modifié sur Entreprise passe à « Déclaré par vous ». Un champ inchangé garde son origine.
- **Tracé côté serveur.** Les champs sont nettoyés et bornés côté serveur, avec les mêmes limites qu'à l'étape 2 de l'inscription.
- **Repères :**
  - l'ambition (`capLabel`), avec « Modifier avec Paul » qui ouvre l'éditeur d'ambition existant ;
  - la localisation, la zone et les clients ;
  - « À renseigner » quand une valeur est vide.
- **Charte :** une action principale par section, Paul seul, de 320 à 1440 px.

**Never :**
- Aucune publication ni régénération payante déclenchée par une correction.
- Aucune mission modifiée.
- Pas de chiffrage (D8), pas de correction de constat, pas d'effets de marque ou de logo (J-05, J-06).
- Ne pas changer le comportement de `markProfileChanged` pour les autres déclencheurs (PATCH des détails, carte `update_profile` de Paul).

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Attendu | Erreur |
|---|---|---|---|
| Correction réelle | Offres modifiées, un contenu validé et programmé | Programmation annulée, version système, badge « Profil à relire », J-02, origine « offres » à declared | — |
| Rien de changé | Formulaire renvoyé à l'identique | Aucune version, aucun J-02, origines inchangées | — |
| Validation bloquée | Version courante = version système du profil | Refus M-92, rien n'est validé | 422 M-92 |
| Nouvelle version | Le dirigeant enregistre une retouche | Validation de nouveau possible, badge retiré | — |
| Contenu diffusé | Version diffusée | Laissé tel quel (comportement de #41) | — |
| Champ vide | Clients vidé | Accepté (facultatif), repère « À renseigner », origine « missing » | — |
| Champ invalide | Balise `<` ou valeur trop longue | Refusé, rien n'est écrit | 400 avec le message du champ |
| Compte d'avant #169 | `profileOrigins` absent | Aucune étiquette d'origine, sinon même comportement | — |

</frozen-after-approval>

## Code Map

- `src/app/entreprise/page.tsx`
  - L55-60 : en-tête et `<section id="modifier">` avec `AmbitionEditor`. C'est là que vont les repères.
  - L92 : `CompanyProfileForm`.
- `src/components/company-profile-form.tsx`
  - Onglet « Informations » (L308+) : ajouter firstName, location, targetClients et offers, avec leur origine, et renommer le titre en « Corriger mon profil ». L'onglet « Objectifs » et `#chiffres` ne changent pas.
- `src/app/api/companies/route.ts` : POST (L52+) écrit les nouveaux champs et met à jour `profileOrigins`. L'appel à `markProfileChanged` se fait déjà dans la transaction (L141-151).
- `src/lib/company-profile.ts` : `PROFILE_TEXT_LIMITS`, `cleanProfileText` et `profileChanges` (L73).
- `src/lib/onboarding/draft-rules.ts` : `ProfileOrigin`, `PROFILE_ORIGIN_LABELS` (L688, à exporter ou à déplacer), `profileOriginLabel` et `prefillFromPaul`. Les limites des champs de l'étape 2 y sont aussi.
- `src/app/api/auth/signup/route.ts` (L84-104) : écrire `profileOrigins` à partir du brouillon (prefill et analyse).
- `prisma/schema.prisma`, avec la nouvelle migration `20261108110000_origines_profil` : `Company.profileOrigins Json?`.
- `src/lib/contents/service.ts`
  - `markProfileChanged` (L188-201) est à garder tel quel.
  - Il faut une constante exportée pour la note « Profil corrigé : informations du contenu à vérifier ».
- `src/lib/contents/rules.ts` : `checkValidation` (L151) ajoute M-92 quand la version courante est la version système du profil.
- `src/lib/missions/messages.ts` : M-92.
- `src/lib/contents/view.ts` : exposer `profileToReview` (version courante = version système du profil). Afficher le badge dans l'atelier et sur la page mission.
- `src/lib/ambition-rules.ts` : `capLabel`.
- Tests
  - `tests/engine.spec.ts` : L4113 et L4224 (GH-41).
  - `tests/user-journey.spec.ts` : L745 (Entreprise, ambition) et L367 (atelier).
  - `tests/delegation.spec.ts` : L2004.

## Tasks & Acceptance

**Exécution :**
- [x] `prisma/schema.prisma` et la migration : `profileOrigins Json?`, qui associe chacun des sept champs à son origine. Vérifier les horodatages sur `origin/main` avant de pousser.
- [x] `src/lib/company-profile.ts` : `readProfileOrigins` (lecture défensive), `nextProfileOrigins(before, after, origins)` (un champ changé passe à declared, un champ vide à missing) et les libellés d'origine.
- [x] `src/app/api/auth/signup/route.ts` : écrire `profileOrigins` à l'inscription.
- [x] `src/app/api/companies/route.ts` : accepter et nettoyer `firstName`, `location`, `targetClients` et `offers` ; mettre à jour `profileOrigins` dans la même transaction.
- [x] `src/components/company-profile-form.tsx` : titre « Corriger mon profil », sept champs avec leur origine (l'étiquette disparaît dès que le champ est modifié), et l'avertissement « Vos contenus en cours seront à relire et leurs programmations annulées. ».
- [x] `src/app/entreprise/page.tsx` : bloc des repères (ambition et « Modifier avec Paul », localisation, zone, clients).
- [x] `src/lib/contents/rules.ts`, `messages.ts`, `view.ts` et les composants de l'atelier et de la mission : M-92 et le badge « Profil à relire ».
- [x] Tests
  - `tests/delegation.spec.ts` : `nextProfileOrigins`, M-92 dans `checkValidation`, libellés.
  - `tests/engine.spec.ts` : correction des quatre nouveaux champs, puis refus de validation, puis nouvelle version, puis validation.
  - `tests/user-journey.spec.ts` : Entreprise (origines, repères, correction) et atelier (badge).

**Critères d'acceptation :**
- Étant donné une correction enregistrée, quand le dirigeant ouvre une mission avec un contenu, il voit « Profil à relire », et aucune diffusion ne part.
- Étant donné un compte créé par le parcours d'entrée, quand il ouvre Entreprise, chaque champ de « Corriger mon profil » montre l'origine retenue à l'inscription.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Passe 1 : Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V).

| # | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|
| B1/E2/E6/E8/V3 | Un compte existant ne peut plus enregistrer si son nom, son activité ou sa zone dépasse 100 caractères | high | `profileFieldIssue` est appliqué à chaque enregistrement, alors que les anciennes bornes étaient de 160/160/240 | patch (contrôler seulement une valeur modifiée) |
| E1/E7 | Un formulaire renvoyé à l'identique compte comme un changement (prénom) | medium | Le prénom est rogné à l'inscription, mais passe par `cleanOwnerName` dans la route | patch |
| E4 | `""` et `null` sont comptés comme deux valeurs différentes | medium | Un champ facultatif vide renvoyé déclenche J-02 | patch |
| B2 | Une version système ultérieure lève le blocage « Profil à relire » | medium | `isProfileReview` ne regarde que la version courante (changement de canal, destinataires) | patch |
| B3 | Le blocage repose sur le texte de la note | low | La note est une constante partagée ; seule une modification future du texte casserait la détection | rejet |
| B4 | `CompanyOrigin` duplique `ProfileOrigin` | low | Correction directe (type dérivé) | patch |
| B5 | Le formulaire guidé de création n'écrit pas les origines | low | L'ancien parcours `/onboarding` n'est plus le parcours d'entrée V5.2 | rejet |
| B6 | « Prénom » et « Votre prénom et nom » ne sont pas reliés | medium | La signature reste celle de `ownerName` ; cela relève de l'intention et non d'un défaut du diff | defer |
| B7 | Erreur de champ non rattachée au champ, cachée sur l'onglet Objectifs | medium | Le serveur renvoie `field`, mais le formulaire n'affiche qu'un message global | patch |
| B8 | `OPTIONAL_CORRECTION_FIELDS` n'est pas utilisé | low | Suppression directe | patch |
| B9 | Repère d'ambition « À renseigner » quand `ambitionText` vaut `""` | low | Correction directe (`?.trim() \|\|`) | patch |
| B10 | Accord « La description … doit être compris » | low | Préexistant à l'étape 2, avec un test qui le fixe | rejet |
| B11 | Vérification et matrice incomplètes (contenu diffusé) | low | Le cas du contenu diffusé est couvert par le test GH-41 ; la CI lance toutes les suites | rejet |
| B12 | `loadProfileToReview` ajoute une requête | low | Une requête par vue, sans effet notable | rejet |
| E3 | Deux POST simultanés perdent une origine | low | Concurrence improbable sur un même formulaire | rejet |
| E5 | Ajouter des espaces masque l'étiquette d'origine | low | Cosmétique ; la correction ajoute une règle | rejet |
| V1 | Origines issues de l'analyse jamais testées à l'inscription | medium | Écart signalé, déjà vérifié | patch |
| V2 | Bornes du nom, de l'activité et de la zone non testées | medium | Écart signalé, déjà vérifié | patch |

## Verification

**Commandes :**
- `npm run lint` -- attendu : aucune erreur
- `npx tsc --noEmit` -- attendu : aucune erreur
- `npx prisma validate` -- attendu : schéma valide
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- attendu : tous verts
- `npm run build` -- attendu : succès
