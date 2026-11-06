---
title: 'Page de découverte V5.2 : comprendre BienDecider et commencer (#310)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '99b1fbcbd8041329d2e4d1529f160b1b3bed49e4'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'accueil (`src/app/page.tsx`) présente encore l'équipe de quatre agents, un exemple de plombier avec Camille, une capture de l'ancien espace, et « Créer mon compte » / « J'ai déjà un compte ». La V5.2 veut Paul comme seul copilote, la boucle en six étapes et un départ par « C'est parti » (FR-1, charte §7, D3).

**Approach:** Réécrire l'accueil d'après la maquette `landing()` (maquette_v5.2/views.js:95-129) :
- **Promesse** : « Vous décidez. Votre activité avance. »
- **Paul** : « votre copilote unique : il comprend, recommande, prépare et apprend avec vous ».
- **Exemple concret** : une entreprise de rénovation, +20 % de chiffre d'affaires en 12 mois, le plan de Paul en trois missions et un extrait de post préparé par Paul.
- **Vous gardez la main** : les trois engagements.
- **Six étapes, une seule boucle.**
- **Appel final** : « Quel est votre objectif ? ».

**Décisions (2026-11-06) :**
- #310 est livrée avant #279. Tant que le parcours `/bienvenue` n'existe pas, « C'est parti » mène à l'inscription actuelle (`/signup`). #279 changera cette cible.
- Sans session :
  - « C'est parti » est le bouton principal, en haut et en bas de la page ;
  - « Retrouver mon compte » (→ `/login`) est un accès secondaire, sous le bouton du haut et dans l'en-tête.
- Avec une session : les boutons deviennent « Retourner à mon espace » (→ `/strategie`) et l'en-tête « Mon espace ». Aucune donnée n'est remplacée.
- Aucun autre personnage que Paul. La capture de l'ancien espace est retirée.
- Aucune mention de démonstration, de simulation ni de « en préparation ». L'exemple porte la mention « Exemple d'illustration, aucune donnée client » tant qu'aucun cas réel n'est disponible (#88).
- Les liens « Ce que fait chaque canal » et « Comment vos données sont traitées » restent.

</frozen-after-approval>

## Implementation Notes

- `src/app/page.tsx` réécrit en six blocs (promesse, Paul, exemple de rénovation, vous gardez la main, six étapes, objectif). Une seule vérification de session par requête (`cache`) ; seuls les appels à l'action et l'en-tête attendent la session (`Suspense`).
- `src/app/globals.css` : styles de l'équipe, des agents et de la capture retirés, cartes Paul et engagements ajoutées.
- Tests : `tests/brand.spec.ts` (visiteur) et `tests/user-journey.spec.ts` (GH-310, avec une session).
- Vérifié dans le navigateur : « C'est parti » → /signup et « Retrouver mon compte » → /login, aucun autre personnage, pas de défilement horizontal à 320 et 390 px, console sans erreur.

## Review Triage Log

Revue Blind Hunter (route oneshot), 2026-11-06.

- patch : le test vérifiait les liens « Retrouver mon compte » avant d'attendre leur nombre ; ordre inversé.
- patch : « Dites-le à Paul. Paul s'occupe du reste » → « Dites-le à Paul : il s'occupe du reste ».
- patch : titre « Ce que Paul vous propose », redondant avec « Paul prépare un post Facebook » → « Un contenu prêt à relire ».
- defer : images `public/brand/workspace-preview*.png` plus utilisées.
- defer : /canaux parle encore de « l'équipe » alors que l'accueil présente Paul seul.
- reject : « Retrouver mon compte » affiché un instant dans l'en-tête avant « Mon espace » (comportement existant, repli de streaming).
- reject : « Paul » écrit en dur hors de la carte (texte éditorial, aucun renommage prévu).
