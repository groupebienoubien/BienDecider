---
title: 'Story 1.2 — Motifs d''échec typés et dits en clair'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
baseline_commit: '56b1b89c6f10dd945b10628c4555c2cc18145a55'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** quand Paul délègue, toute exception devient « ÉCHEC… est indisponible » : un quota atteint, une action déjà en cours ou un identifiant d'action non lançable sont présentés au dirigeant comme une panne. En production, Paul a ainsi annoncé « Martine : ÉCHEC » alors qu'elle travaillait.

**Approach:** typer le motif d'échec (`already_running`, `quota_runs`, `quota_budget`, `no_result`, `outage`) en un seul point de conversion, l'enregistrer sur l'exécution échouée, renvoyer à Paul un JSON structuré et un message clair par motif, et exposer ce motif dans l'état de l'équipe.

## Boundaries & Constraints

**Always:** un seul point de conversion `classifyRunError` ; un message affichable par motif, au vouvoiement ; le détail technique reste dans les logs serveur ; les réponses HTTP 429/409 existantes gardent leur statut et leur `error`, et ajoutent `reason` ; un identifiant d'action non lançable (action écartée, terminée ou inconnue) est une erreur de Paul, pas un motif d'échec : `ok: false` avec un message, sans `reason`.

**Never:** pas de carte de confirmation ni de changement du mode de lancement (épopée 2) ; pas de nouveau bouton dans l'interface ; ne pas lire le texte d'une erreur pour la classer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déjà en cours | Paul délègue avec le `planItemId` d'une action `en_cours` dont le run est `running` | `{ ok: false, reason: "already_running", runId, planItemId }` ; aucun nouveau run | message : l'agent y travaille déjà |
| Budget | budget du jour atteint | exception classée `quota_budget` ; route 429 avec `reason: "quota_budget"` | message : budget du jour atteint, réessayez demain |
| Quota | quota journalier de lancements atteint | `quota_runs` ; route 429 avec `reason: "quota_runs"` | message existant du quota |
| Rien produit | l'agent lève `AgentNoResultError` | run `failed`, `failureReason = "no_result"` | message : rien produit, relancez |
| Panne | erreur inattendue (réseau, fournisseur) | run `failed`, `failureReason = "outage"` | message générique, détail en log |
| Délai dépassé | run actif périmé détecté | `failureReason = "outage"` | message existant de délai |
| Succès | délégation lancée | `{ ok: true, message, runId, planItemId }` | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/agent-errors.ts` -- `AgentNoResultError`, `agentFailureMessage` ; y ajouter `RunFailureReason`, `classifyRunError`, `failureMessage(reason, agentName)`, et y déplacer `AgentRunConflictError` et `AgentRunQuotaError` (réexportées par `agent-runs.ts` pour ne casser aucun import) afin d'éviter un import circulaire.
- `src/lib/agent-runs.ts:24` (`AgentRunConflictError`), `:346` (`AgentRunQuotaError`), `:377-387` (quatre `throw` de quota : deux de lancements, deux de budget) -- donner à `AgentRunQuotaError` une propriété `reason` (`quota_runs` ou `quota_budget`) fixée à chaque `throw`.
- `src/lib/agent-runs.ts:300-325` (`processAgentRun`, branche `catch`) et `:210-235` (run périmé) -- écrire `failureReason`.
- `prisma/schema.prisma` (`model AgentRun`) -- colonne `failureReason String?` + migration additive.
- `src/lib/agent-run-types.ts` -- ajouter `failureReason` à `AgentRunView`, `AGENT_RUN_VIEW_SELECT` et `publicRun`.
- `src/lib/agents/co-ceo.ts:160-180` (`delegateThroughPlan`) -- à extraire en fonction exportée `delegatePlanAction(companyId, agent, input, extras)` renvoyant `{ ok, reason?, message, runId?, planItemId? }` ; les outils `delegate_*` renvoient `JSON.stringify` du résultat. Une action trouvée en `en_cours` (ou un run renvoyé déjà actif avant l'appel) donne `already_running`.
- `src/lib/agents/co-ceo.ts:226-230` (prompt) -- remplacer la règle « ÉCHEC » par la lecture de `ok`/`reason`/`message` ; interdire le mot « ÉCHEC ».
- Routes qui répondent 429/409 : `src/app/api/action-plan/[id]/launch/route.ts:51-52`, `src/app/api/agents/{marketing,contenu,demarchage}/run/route.ts`, `src/app/api/co-ceo/plan/route.ts:41`, `src/app/api/co-ceo/message/route.ts:49,58`, `src/app/api/onboarding/interpret/route.ts:70`, `src/app/api/proposals/[id]/execute/route.ts:82` -- ajouter `reason` dans le JSON.
- `tests/engine.spec.ts:195,207,292` -- tests existants d'erreurs et de quotas à étendre.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + `prisma/migrations/<horodatage>_agent_run_failure_reason/migration.sql` -- colonne nullable `failureReason` -- motif persistant
- [x] `src/lib/agents/agent-errors.ts` -- types, classes d'erreur déplacées, `classifyRunError`, `failureMessage` -- point unique de conversion
- [x] `src/lib/agent-runs.ts` -- `reason` sur les `throw` de quota ; `failureReason` dans `processAgentRun` et la détection de run périmé ; réexport des classes -- motif enregistré
- [x] `src/lib/agent-run-types.ts` -- `failureReason` dans la vue -- visible par Paul et l'interface
- [x] `src/lib/agents/co-ceo.ts` -- `delegatePlanAction` exportée, JSON structuré, prompt mis à jour -- Paul dit le vrai motif
- [x] routes listées -- `reason` dans les réponses d'erreur -- interface et Paul alignés
- [x] `tests/engine.spec.ts` -- un test par ligne de la matrice -- non-régression

**Acceptance Criteria:**
- Étant donné un des motifs de la matrice, quand Paul reçoit le résultat de sa délégation, alors le JSON contient le bon `reason` et un `message` sans le mot « ÉCHEC ».
- Étant donné une exécution échouée, quand `getTeamState` est lu, alors l'exécution porte son `failureReason`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge, gap | Une action écartée ou terminée (et un conflit de sérialisation) est classée `already_running` | high | `AgentRunConflictError` sans motif explicite à `agent-runs.ts:88,115,139` prend `already_running` par défaut | patch |
| 2 | blind, edge, gap | Redéléguer une action dont l'exécution a échoué renvoie l'ancien échec, sans relance | medium | `enqueuePlanRun` sans `retryRunId` → `persistRun` renvoie le run `failed` existant (`agent-runs.ts:72`) | patch |
| 3 | blind, edge | Un run `queued` déjà existant est annoncé `ok: true` « lancée » | medium | seul `running` est testé avant de répondre `already_running` | patch |
| 4 | blind, edge | Action `en_cours` sans run actif → `already_running` sans `runId` | maybe-false | suppose un run périmé non encore balayé ; lié au report « run périmé » de la story 1.1 | defer |
| 5 | blind, edge | Messages de quota : la variante mensuelle et la réservation en cours sont perdues, conseil « Réessayez demain » faux | medium | `failureMessage` générique au lieu du message de l'erreur, alors que la matrice dit « message existant du quota » | patch |
| 6 | blind, edge | `processAgentRun` enregistre le texte technique d'un conflit classé `outage` | medium | branche `instanceof AgentRunConflictError` → `error.message` (« Demande de lancement invalide. ») | patch |
| 7 | blind | Route de lancement : 409 pour une erreur interne `outage` | low | cas « agent inconnu » inatteignable en usage normal ; correctif ajoute une branche | rejeté |
| 8 | blind, edge | Runs échoués avant la migration : `failureReason` nul, motif incohérent entre routes et vues | low | colonne nullable sans rattrapage ; correctif direct (UPDATE dans la migration) | patch |
| 9 | edge | `GET /api/co-ceo/plan` renvoie les lignes brutes sans `publicRun` | low | sélection passée à `AGENT_RUN_VIEW_SELECT` dans ce diff ; correctif direct | patch |
| 10 | blind | `AgentRunAttempt` sans motif | low | hors de l'intention (motif de l'exécution) | rejeté |
| 11 | blind, edge | `agentFailureMessage` ne sert plus qu'à un test, texte `no_result` en double | low | correctif direct (suppression) | patch |
| 12 | blind | Le message d'un identifiant non lançable s'adresse à Paul | false | ce message est destiné à Paul, qui le reformule ; voulu | rejeté |
| 13 | blind | Aucun écran ne lit `reason` | low | interdit par la spec (« pas de nouveau bouton ») ; consommateur prévu en épopée 2 | rejeté |
| 14 | blind | Flux de Paul : « Échec de la réponse » générique malgré le motif connu | low | correctif direct via `failureMessage` | patch |
| 15 | gap | Délégation d'une action à run échoué non testée | medium | aucune branche `run.status === "failed"` exercée | patch (avec 2) |
| 16 | gap | `no_result` jamais écrit par `processAgentRun` dans un test | medium (non vérifié) | nécessite un modèle simulé | defer |
| 17 | gap | `reason` des réponses 409 et du flux jamais vérifié | low | aucun consommateur ; à fixer avec le premier écran qui le lit | defer |

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npm run lint` -- expected: 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
