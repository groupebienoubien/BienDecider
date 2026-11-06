---
title: 'Story 13.1 : Gérer mes canaux et ma délégation au même endroit'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '5d90d7d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-13-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** la page Connexions mélange canaux actifs et inactifs, annonce des capacités, et une déconnexion ne dit pas ce qu'elle annule (#293, #10).

**Approach:** Entreprise › Canaux & délégation : une ligne par canal actif avec son état et ses programmations, une déconnexion qui liste ce qui sera annulé, le site vitrine, le site lu pour l'analyse et la délégation.

## Boundaries & Constraints

**Always:**
- Facebook (Page choisie) et Gmail : état (relié, à refaire, non autorisé), compte ou Page, « N programmation(s) en cours ».
- Déconnexion confirmée ; liste « Ces programmations seront annulées : {mission} · V{n} · le {date} » ; contenus et validations restent ; programmations annulées (J-23).
- Site vitrine : pages en ligne et leur adresse, ou « Aucune page en ligne pour le moment » ; toujours disponible.
- Site actuel : lu pour l'analyse, pas un canal.
- Lancée depuis l'atelier, la connexion propose « Revenir au contenu » ; rien ne part.

**Never:**
- Afficher ou connecter un canal désactivé ; annoncer une Page ou un compte non vérifiés.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déconnecter Facebook | 1 programmation | listée avant confirmation, annulée après | — |
| Jeton illisible | ancien flux | « Autorisation à refaire », aucun jeton affiché | — |
| Depuis l'atelier | `?retour=/atelier/{id}` | lien « Revenir au contenu » | adresse hors atelier ignorée |

</frozen-after-approval>

## Code Map

`src/app/connexions/{page,facebook-panel,gmail-panel,scheduled-list,return-to-content,delegation-panel}.tsx` ; atelier (lien « Connecter ») ; routes de déconnexion (#331) ; tests `user-journey`, `linkedin`.

## Tasks & Acceptance

- [x] Page restructurée, canaux désactivés retirés, programmations listées à la déconnexion.
- [x] Retour au contenu après connexion.
- [ ] Choix du compte ou de l'établissement pour Instagram, LinkedIn et la fiche Google : avec leurs connecteurs (#300, #148, #14).
