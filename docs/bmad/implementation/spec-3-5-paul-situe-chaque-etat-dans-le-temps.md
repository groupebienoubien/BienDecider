---
title: 'Story 3.5 — Paul situe chaque état dans le temps'
type: 'bugfix'
created: '2026-10-23'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** au second test en production, Paul a écrit « J'avais écrit qu'il était encore en cours, et c'était faux » alors que l'exécution tournait bien au moment de son message ; même chose pour Martine (« je dois corriger un point »). Le dirigeant croit que Paul se trompe alors qu'il est exact.

**Approach:** Paul reçoit l'heure de chaque état (début et fin des exécutions, dernière mise à jour des actions), l'heure courante et l'heure de son message précédent ; une règle du prompt lui fait annoncer un changement survenu depuis comme une mise à jour, et réserver « je me suis trompé » aux vraies contradictions.

## Boundaries & Constraints

**Always:** heures au format « HH:MM » (Europe/Paris), avec la date si ce n'est pas aujourd'hui ; `buildCurrentStatus` expose `maintenant` et `monMessagePrecedent` ; chaque exécution de `executionsRecentes` porte `debut` et `fin` lisibles en plus des champs existants ; chaque action de `planEnCours` porte `misAJour` ; règle du prompt : « Si un état a changé depuis ton message précédent (fin postérieure à ton message), dis "depuis mon dernier message, …". Ne dis "je me suis trompé" que si l'état à l'heure de ton message contredisait ce que tu as écrit. »

**Never:** pas de changement des données lues ni du calcul d'état (story 1.1) ; pas de nouvel outil.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Heures | run démarré à 23:37, fini à 23:39 (Paris) | `executionsRecentes[i]` contient `debut: "23:37"`, `fin: "23:39"` | N/A |
| En cours | run sans `finishedAt` | `fin` absent ou nul | N/A |
| Autre jour | run fini la veille | `fin` contient la date (« 22/10 23:39 ») | N/A |
| Message précédent | dernier message de Paul à 23:38 | `monMessagePrecedent: "23:38"` | N/A |
| Premier message | aucun message de Paul | `monMessagePrecedent` nul | N/A |
| Prompt | prompt de Paul | contient la règle « depuis mon dernier message » | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/co-ceo.ts` (`buildCurrentStatus`, prompt de Paul) -- ajouter `maintenant`, `monMessagePrecedent` (dernier `ChatMessage` assistant avant le tour), heures lisibles ; règle du prompt.
- `src/lib/team-state.ts` -- exposer `updatedAt` des actions si absent (le select actuel ne le lit pas).
- `src/lib/agents/personas.ts` (story 3.1) -- réutiliser le formatage Europe/Paris si une fonction existe ; sinon une fonction pure `formatParisTime(date, now)`.
- `tests/delegation.spec.ts` (formatage), `tests/engine.spec.ts` (`buildCurrentStatus`).

## Tasks & Acceptance

**Execution:**
- [ ] formatage des heures (pur) -- Europe/Paris, date si autre jour -- lisible
- [ ] `team-state.ts`, `buildCurrentStatus` -- heures et message précédent -- Paul situe les états
- [ ] prompt de Paul -- règle mise à jour / erreur -- plus de fausses corrections
- [ ] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une exécution terminée après le dernier message de Paul, quand il lit `get_current_status`, alors il dispose de l'heure de fin et de l'heure de son message précédent.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
