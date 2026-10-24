---
title: 'Story 3.5 — Paul situe chaque état dans le temps'
type: 'bugfix'
created: '2026-10-23'
status: 'done'
baseline_commit: '6a5e2f0114b9a705b64f7f49dfafe86ab93453db'
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
- [x] formatage des heures (pur) -- Europe/Paris, date si autre jour -- lisible
- [x] `team-state.ts`, `buildCurrentStatus` -- heures et message précédent -- Paul situe les états
- [x] prompt de Paul -- règle mise à jour / erreur -- plus de fausses corrections
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une exécution terminée après le dernier message de Paul, quand il lit `get_current_status`, alors il dispose de l'heure de fin et de l'heure de son message précédent.

## Implementation Notes

- `formatParisTime(date, now)` (pure, `src/lib/agents/personas.ts`) : « HH:MM » le jour même à Paris, « JJ/MM HH:MM » un autre jour, « JJ/MM/AAAA HH:MM » une autre année ; null si la date est absente ou invalide. Comparaison du jour par `parisDateKey`.
- `ActionPlanItem` n'avait pas de colonne `updatedAt` : migration additive `20261024140000_action_plan_item_updated_at` (`@default(now()) @updatedAt`, rétro-remplie avec `createdAt`). Prisma la met à jour sur `update` et `updateMany` ; aucune écriture SQL brute ne touche cette table. `getTeamState` la lit, sans changer le filtre ni l'ordre.
- `buildCurrentStatus(companyId, now = new Date())` : `maintenant`, `monMessagePrecedent` (dernier `ChatMessage` assistant à `createdAt <= now` ; celui du tour en cours n'est enregistré qu'en fin de tour), `planEnCours[i].misAJour` (le `updatedAt` brut n'est pas transmis), `executionsRecentes[i].debut` (`startedAt`, nul tant que l'exécution est en file) et `fin` (nul tant qu'elle tourne), en plus des champs existants.
- Règle du prompt ajoutée telle que formulée, précédée d'une phrase qui nomme les champs horaires.
- Tests : formatage dans `tests/delegation.spec.ts` ; `buildCurrentStatus` et prompt dans `tests/engine.spec.ts` (base de données, CI).

## Spec Change Log

- 2026-10-24 : `ActionPlanItem` n'avait pas de colonne `updatedAt` ; ajoutée par une migration additive (`20261024140000_action_plan_item_updated_at`, valeur initiale = `createdAt`). Choix de l'orchestrateur : la règle « Never » visait le calcul de l'état, pas l'ajout d'une donnée de date.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Heures UTC brutes laissées à côté des heures de Paris | medium | `...run` conserve `queuedAt`, `startedAt`, `finishedAt` | patch |
| 2 | blind, edge | À la minute près, « fin postérieure à ton message » est indécidable | medium | message et fin dans la même minute | patch |
| 3 | blind, edge | Le bilan hebdomadaire automatique compte comme « message précédent » de Paul | medium | même rôle `assistant` (`cron/weekly-review`) | patch |
| 4 | blind | La règle ne couvre que les fins, pas les démarrages ni les actions mises à jour | low | correctif direct (avec le 2) | patch |
| 5 | blind, edge | Exécution en file sans heure lisible | low | correctif direct | patch |
| 6 | blind, edge | `misAJour` change pour toute modification, pas seulement le statut | low | correctif direct (libellé du prompt) | patch |
| 7 | blind | `maintenant` sans date | low | correctif direct | patch |
| 8 | blind | Mise à jour réelle de `updatedAt` et limite du message précédent non testées | low | correctif direct | patch |
| 9 | edge | Deux tours simultanés : le message précédent peut venir de l'autre tour | low | cas improbable | rejeté |
| 10 | blind | La colonne ajoutée n'a pas été validée par les PF | low | signalé à Samir dans le récapitulatif | defer |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
