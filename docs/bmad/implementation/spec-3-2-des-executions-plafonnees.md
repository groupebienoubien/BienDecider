---
title: 'Story 3.2 — Des exécutions plafonnées'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: '410d613f00495c52493ed59235b3975419407968'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** au second test en production, un seul passage de Jean-Claude a produit 13 éléments (9 prospects, 2 emails, 2 pistes) ; avec Martine, 15 décisions attendaient le dirigeant après un quart d'heure d'usage.

**Approach:** chaque outil d'écriture d'un agent compte ce qu'il a déjà écrit pour l'exécution en cours et refuse d'écrire au-delà d'un plafond par type, validé par les PF ; les prompts annoncent ces plafonds.

## Boundaries & Constraints

**Always:** plafonds par exécution (`RUN_CAPS`, `src/lib/agents/run-caps.ts`) : 5 prospects (`prospect`), 2 pistes (`piste_croissance`), 2 modèles d'email (`prospecting_email`), 3 posts (`social_post`), 1 contenu de site (`site_web_content`), 2 propositions de fiche Google (`gbp_update` et `review_reply` ensemble), 4 constats d'audit ; le compte se fait en base sur l'`agentRunId` de l'exécution ; au-delà, l'outil n'écrit rien et répond au modèle « Plafond atteint pour {type} dans ce passage : n'en propose pas d'autre. » ; une écriture refusée parce qu'elle doublonne un rejet n'est pas comptée ; sans `agentRunId` (appel hors exécution), aucun plafond.

**Never:** pas de plafond global sur les décisions en attente ; pas de suppression des productions existantes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sous le plafond | 4e prospect d'une exécution | écrit | N/A |
| Plafond atteint | 6e prospect de la même exécution | rien n'est écrit ; message de plafond au modèle | N/A |
| Autre exécution | 6e prospect, mais 5 dans une autre exécution | écrit (compte par exécution) | N/A |
| Fiche Google | 2 `gbp_update` puis 1 `review_reply` | le 3e est refusé (plafond commun) | N/A |
| Constats | 5e constat d'audit | refusé | N/A |
| Scénario | une exécution de Jean-Claude et une de Martine | au plus 5 + 2 + 2 + 2 = 11 décisions en attente | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/run-caps.ts` (nouveau) -- `RUN_CAPS`, `capGroup(kind)`, `checkRunCap(agentRunId, group)` qui compte `AgentProposal` (par `kind` du groupe) ou `AuditFinding` du run.
- `src/lib/agents/demarchage.ts:44,77,128` -- `propose_growth_lead`, `propose_prospect`, `propose_prospecting_email` : vérifier le plafond avant d'écrire (après le contrôle de doublon de rejet).
- `src/lib/agents/marketing.ts:42,101` -- `record_audit_finding`, `propose_action`.
- `src/lib/agents/contenu.ts:41` -- `propose_content`.
- Prompts des trois agents -- annoncer les plafonds.
- `tests/delegation.spec.ts` (`capGroup`), `tests/engine.spec.ts` (plafond par exécution, avec des runs créés en base).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agents/run-caps.ts` -- plafonds et compteur -- règle unique
- [x] outils des trois agents et prompts -- application -- moins de décisions
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une exécution de Jean-Claude qui tente 9 prospects, quand elle se termine, alors 5 prospects au plus sont en attente.

## Implementation Notes

- `withRunCap(agentRunId, kind, write)` enveloppe l'écriture de chaque outil ; le contrôle de doublon d'un rejet se fait dans `write`, sous le verrou : une écriture refusée pour doublon n'écrit rien, donc n'est pas comptée, et deux appels identiques simultanés sont sérialisés. Un `kind` sans groupe (ex. `gmail_email`) ou un appel sans `agentRunId` écrit sans plafond ni verrou.
- Le Tool Runner exécute en parallèle les appels d'outils d'un même tour (`Promise.all`) : le contrôle et l'écriture sont sérialisés par `agentRunId` (verrou en mémoire, valable au sein d'un processus ; une exécution tourne aujourd'hui dans un seul processus). Le contrôle et le verrou sont injectables pour les tests sans base.
- Une relance réutilise l'`agentRunId` : seules les écritures postérieures à `AgentRun.startedAt` (remis à jour par `processAgentRun` à chaque tentative) comptent. `startedAt` et `createdAt` sont tous deux posés côté application (Prisma génère `now()`).
- Le message de plafond nomme le groupe en français (ex. « les propositions de fiche Google (mise à jour et réponse aux avis) »).
- Le prospect et son `Lead` s'écrivent dans une même transaction.
- Index `@@index([agentRunId])` sur `AgentProposal` et `AuditFinding` (migration `20261024100000_run_cap_indexes`).
- Prompts et descriptions d'outils annoncent les plafonds, interpolés depuis `RUN_CAPS` : prospects « entre 3 et 5 », sinon « jusqu'à N, les meilleurs ».
- `prisma` est importé à la demande dans `run-caps.ts` pour que `capGroup` et `withRunCap` restent testables dans `test:delegation`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Une relance réutilise l'identifiant d'exécution : les écritures de la tentative échouée épuisent le plafond | medium | `countRunWrites` filtre seulement sur `agentRunId` | patch |
| 2 | blind, edge | Le message de refus nomme un code (`review_reply`) et pas le groupe | low | correctif direct (libellé français du groupe) | patch |
| 3 | blind, edge | Prospect et fiche Lead écrits hors transaction | low | correctif direct | patch |
| 4 | blind | Contrôle de doublon de rejet hors du verrou | low | deux appels parallèles identiques passent | patch |
| 5 | blind | Verrou en mémoire d'un seul processus, non documenté | low | correctif direct (commentaire) | patch |
| 6 | blind | Camille sans consigne de choix au plafond ; descriptions d'outils muettes | low | correctif direct | patch |
| 7 | blind | « 1 à N » fragile ; plus de borne basse pour les prospects | low | correctif direct | patch |
| 8 | blind | Nom de test inexact | low | correctif direct | patch |
| 9 | blind | `withRunCap` sans test unitaire (libération du verrou, runs distincts) | low | correctif direct | patch |
| 10 | gap | Plafonds jamais testés à travers l'exécution réelle (`agent-runs.ts`, `executePlanItem`) | medium | tous les tests appellent les agents directement | patch |
| 11 | blind | Pas d'index sur `agentRunId` pour les comptages | low | migration additive simple | patch |
| 12 | blind | Le test des 11 décisions ne vérifie pas la répartition par type | low | correctif direct | patch |
| 13 | edge | Une écriture bloquée bloque les suivantes du même run | low | délai maximal du run déjà en place | rejeté |
| 14 | edge | Identifiant de run vide ignoré | low | jamais vide en pratique | rejeté |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
