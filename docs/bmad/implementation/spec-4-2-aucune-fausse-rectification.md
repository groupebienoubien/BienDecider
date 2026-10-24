---
title: 'Story 4.2 — Aucune fausse rectification'
type: 'bugfix'
created: '2026-10-24'
status: 'done'
baseline_commit: '23a3143254773e09aca144fddc2fd485ecc8b2f6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** au troisième test en production, Paul a écrit « Je rectifie ce que j'ai dit plus haut : l'audit de Martine est terminé ». Il l'avait annoncé en cours à 08:02, ce qui était vrai ; Martine a fini avant son message de 08:03, qui n'en parlait pas. `depuisMonMessagePrecedent` (story 3.5) ne compare qu'au dernier message de Paul, et l'historique relu n'a pas d'heures : Paul ne peut pas savoir que le changement est postérieur à ce qu'il a dit.

**Approach:** chaque exécution et chaque action de `get_current_status` porte `aChangeApresMonMessageDe`, l'heure du dernier message de Paul (parmi ceux qu'il relit) antérieur au changement. Une règle du prompt interdit de présenter un tel élément comme une erreur.

## Boundaries & Constraints

**Always:** `aChangeApresMonMessageDe` au format de `formatParisTime` ; messages de Paul lus dans la même fenêtre que `loadRecentChatHistory` (`CHAT_HISTORY_MESSAGES`), sans le point hebdomadaire (`WEEKLY_REVIEW_MARKER`), et antérieurs au tour en cours ; changement = `startedAt` ou `finishedAt` d'une exécution (le plus récent des deux), `updatedAt` d'une action ; comparaison à la milliseconde ; règle du prompt : « Un élément dont aChangeApresMonMessageDe n'est pas nul a changé après ton message de cette heure-là : ce que tu en disais était peut-être vrai à ce moment. Annonce-le comme une nouvelle (« depuis, Martine a terminé »), jamais avec « je rectifie », « je dois corriger » ou « c'était faux ». » ; `depuisMonMessagePrecedent` et la règle de la story 3.5 restent.

**Never:** pas d'heure ajoutée au contenu des messages de l'historique (le cache de la conversation en dépend) ; pas de changement du calcul d'état (`getTeamState`) ; pas de nouvel outil ; pas de détection de mots dans la réponse de Paul.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cas du test | messages de Paul à 08:02:10 et 08:03:00, audit fini à 08:02:40 | `aChangeApresMonMessageDe: "08:02"`, `depuisMonMessagePrecedent: false` | N/A |
| Depuis le dernier | fin après le message de 08:03:00 | `aChangeApresMonMessageDe: "08:03"`, `depuisMonMessagePrecedent: true` | N/A |
| Avant tout message | exécution finie avant le premier message de Paul relu | `aChangeApresMonMessageDe` nul | N/A |
| Aucun message | aucun message de Paul | nul partout | N/A |
| Point hebdomadaire | message du cron entre deux messages de Paul | ignoré | N/A |
| Action | action mise à jour à 08:02:50 | `aChangeApresMonMessageDe: "08:02"` | N/A |
| Prompt | prompt de Paul | contient la règle | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/co-ceo.ts` (`buildCurrentStatus`, prompt de Paul) -- lire les heures des messages de Paul de la fenêtre ; calculer le champ ; règle du prompt.
- `src/lib/agents/chat-context.ts` -- réutiliser `CHAT_HISTORY_MESSAGES` (et, si utile, une requête commune avec `loadRecentChatHistory`).
- Fonction pure `lastMessageBefore(messageTimes, date)` (ou équivalent) testable sans base.
- `tests/delegation.spec.ts` (fonction pure), `tests/engine.spec.ts` (`buildCurrentStatus`, prompt).
- `docs/bmad/implementation/recette-paul-fiable.md` -- étape ajoutée.

## Tasks & Acceptance

**Execution:**
- [x] fonction pure du dernier message antérieur -- milliseconde, liste vide -- testable
- [x] `buildCurrentStatus` -- `aChangeApresMonMessageDe` sur `planEnCours` et `executionsRecentes` -- Paul situe chaque changement
- [x] prompt de Paul -- règle ci-dessus -- plus de fausse rectification
- [x] recette manuelle -- étape « un message sans rapport pendant l'audit, puis « Où en est l'équipe ? » après la fin » -- le cas du test est rejoué
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné le cas du test du 24 octobre, quand Paul lit `get_current_status`, alors l'audit porte `aChangeApresMonMessageDe: "08:02"`.
- Étant donné la recette rejouée en production, quand le dirigeant redemande l'état après la fin de l'audit, alors Paul n'emploie ni « je rectifie », ni « je dois corriger », ni « c'était faux ».

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge | Réponse de Paul enregistrée en fin de tour : une fin survenue entre la lecture de l'état et l'enregistrement paraît antérieure au message | medium | `chatMessage.create` après la boucle d'outils ; `lastMessageBefore` compare à `createdAt` | patch |
| 2 | verification-gap, blind | Troncature à 40 messages de `loadPaulMessageTimes` non testée | low | aucun test au-delà de 10 messages | patch |
| 3 | verification-gap | Exécution en cours (fin nulle) non testée via `buildCurrentStatus` | low | toutes les exécutions du test ont une fin | patch |
| 4 | blind | Recette : pas de lien vers le rapport du 24 octobre ; rien si l'audit finit avant 1 bis | low | intro et étapes 1 bis à 1 quater | patch |
| 5 | blind | Champ non nul pour presque tout : Paul pourrait annoncer des éléments dont personne n'a parlé | maybe-false | dépend du modèle ; à observer à la recette (étape 8) | defer |
| 6 | edge | `depuisMonMessagePrecedent` (story 3.5) a le même biais de fin de tour que le n° 1 | medium | `previousReply.createdAt` | defer (préexistant) |
| 7 | blind | La règle interdit « c'était faux » même pour une vraie erreur sur un élément changé depuis | false | voulu par l'intention figée : une correction ne vise qu'un élément inchangé | rejet |
| 8 | blind | Doublon avec `depuisMonMessagePrecedent` dans le cas courant | low | les deux champs sont voulus par la spec ; aucun tort nommé | rejet |
| 9 | blind, edge | Heure à la minute : deux messages de Paul dans la même minute | low | format imposé par la spec ; cas rare | rejet |
| 10 | blind, edge | Exécution en file : champ nul | false | la spec définit le changement par début ou fin | rejet |
| 11 | blind | `latestOf` perd une date valide si l'autre est invalide | false | les entrées viennent de Prisma (`Date` ou null) | rejet |
| 12 | blind, edge | Fenêtre lue à l'appel d'outil (`lte now`) et `previousReply` hors fenêtre | low | message concurrent ou 40 messages du dirigeant d'affilée : improbable ; correctif plus que direct | rejet |
| 13 | blind | Bloc automatique « Recette Atelier Lumen » non complété | low | le cas est couvert par le test story 4.2 | rejet |
| 14 | blind | Attendu de 1 ter (« sans parler de l'audit ») arbitraire | false | nécessaire pour reproduire le cas du test (message intermédiaire muet) | rejet |
| 15 | blind | Statuts différents entre spec et sprint-status | false | synchronisés à l'étape de présentation | rejet |
| 16 | edge | Action modifiée par un outil de Paul pendant le tour annoncée comme une nouvelle | low | même comportement que `depuisMonMessagePrecedent` ; Paul voit son propre appel | rejet |
