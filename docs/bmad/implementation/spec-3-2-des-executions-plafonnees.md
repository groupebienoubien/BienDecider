---
title: 'Story 3.2 — Des exécutions plafonnées'
type: 'feature'
created: '2026-10-23'
status: 'ready-for-dev'
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
- [ ] `src/lib/agents/run-caps.ts` -- plafonds et compteur -- règle unique
- [ ] outils des trois agents et prompts -- application -- moins de décisions
- [ ] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une exécution de Jean-Claude qui tente 9 prospects, quand elle se termine, alors 5 prospects au plus sont en attente.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
