---
title: 'Story 5.4 — Paul utilisable sur smartphone'
type: 'bugfix'
created: '2026-10-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** à 375 × 812, le panneau de Paul est une carte flottante : 366 px de conversation sur 812, un en-tête de 140 px, un champ de saisie en 12 px (Safari iOS zoome toute la page au focus), des messages en 13 px, et la page derrière continue de défiler ; « Agrandir » n'existe pas sur téléphone.

**Approach:** sous 760 px (le seuil de la barre de navigation mobile), Paul occupe tout l'écran, par-dessus la barre du bas ; en-tête compact sur une ligne ; saisie en 16 px et messages en 16 px ; défilement de la page bloqué tant que Paul est ouvert ; hauteur calée sur la zone visible (`visualViewport`) pour que le champ reste au-dessus du clavier ; pas d'ouverture automatique du clavier à l'ouverture du panneau. Au-delà de 760 px, rien ne change.

</frozen-after-approval>

## Implementation Notes

- `src/components/paul-panel.tsx` : `PHONE_QUERY` (760 px, seuil de la barre mobile), suivi en continu par `useSyncExternalStore` (rotation) ; sur téléphone : pas de focus du champ à l'ouverture, `overflow: hidden` sur `<html>`, hauteur et position du panneau calées sur `visualViewport` (retirées à la fermeture), `aria-modal`, Entrée va à la ligne (pas de Maj sur un clavier virtuel), mention clavier retirée.
- `src/app/maquette.css` : sous 760 px, panneau (et `.wide`) en plein écran, `z-index` 110 au-dessus de la barre du bas, des toasts et de la célébration ; en-tête compact, rôle masqué ; messages et saisie en 16 px ; `overscroll-behavior: contain` sur le fil.
- `tests/user-journey.spec.ts` : test à 375 × 812 (plein écran, en-tête ≤ 60 px, fil ≥ 70 % de la hauteur, polices ≥ 16 px, barre du bas non visible par-dessus, défilement bloqué puis rétabli, pas de focus, « Agrandir » masqué, `aria-modal`). Non exécuté en local (base jetable de la CI).
- Vérification visuelle locale impossible : le `.env` vise une vraie base et la connexion demande un mot de passe.

## Review Triage Log

| # | Constat | Verdict | Preuve | Route |
|---|---------|---------|--------|-------|
| 1 | Entre 640 et 760 px, « Agrandir » applique `.wide`, plus spécifique que la règle plein écran | medium | `hidden sm:inline-flex` (640 px) ; `.mq .paul-panel.wide` | patch |
| 2 | Le mode téléphone n'est lu qu'à l'ouverture (rotation) | medium | `matchMedia` lu une fois | patch |
| 3 | Panneau plein écran déclaré non modal | low | `aria-modal="false"` | patch |
| 4 | `env(safe-area-inset-bottom)` vaut 0 sans `viewport-fit=cover` | low | sans effet, sans tort | rejet |
| 5 | Blocage du défilement incertain sous iOS | maybe-false | à vérifier sur iPhone ; `overscroll-behavior: contain` ajouté | defer |
| 6 | Mention de confidentialité tronquée | low | `nowrap` + ellipse | patch |
| 7 | Sur téléphone, Entrée envoie et la mention clavier est fausse | medium | clavier virtuel sans Maj | patch |
| 8 | Toast et célébration passent au-dessus de Paul | low | `z-index` 60 et 100 | patch |
| 9 | Le retour Android quitte la page | low | hors intention | defer |
| 10 | Clavier et cas au-delà de 760 px non testés | low | Chromium sans clavier virtuel | defer (avec 5) |
| 11 | Taille du champ non limitée au panneau | low | règle globale | patch |
| 12 | Seuil de 760 px en deux endroits | low | commentaire de lien ; correctif plus que direct | rejet |
| 13 | Spec incomplète | false | voie courte : Intent et notes seulement | rejet |
