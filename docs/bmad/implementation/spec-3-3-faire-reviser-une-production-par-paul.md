---
title: 'Story 3.3 — Faire réviser une production par Paul'
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

**Problem:** au second test en production, « retire l'avertissement et signe avec mon nom » a conduit Paul à proposer une nouvelle exécution complète de Jean-Claude : de nouveaux emails auraient été créés à côté des anciens, avec un nouveau lot de prospects. Le dirigeant ne peut pas faire corriger une production presque bonne.

**Approach:** Paul propose une carte de révision (`PaulPendingAction` de type `revise_proposal`) ; au clic, une exécution de révision demande à l'agent auteur une version N+1 de la même production, avec la consigne ; la version précédente est conservée et consultable.

## Boundaries & Constraints

**Always:** seule une production `en_attente` se révise ; la production garde son identifiant et passe de la version N à N+1 ; la version précédente et la consigne sont conservées (`ProposalRevision`) ; l'écriture vérifie que la version est toujours N (sinon conflit) ; la révision est une exécution (`AgentRun` de payload `revision`, clé active `revision:{proposalId}`, quota, budget, carte d'exécution, motifs typés) ; l'agent auteur reçoit le contenu actuel, la consigne, le profil et le contexte d'exécution (date, nom du dirigeant) et n'a qu'un outil d'écriture, la nouvelle version ; carte : « Demander à {agent} une version {N+1} de « {titre} » » avec la consigne en ligne, boutons « Confirmer » / « Annuler » ; vue de la production : « Version N » et « Voir la version précédente » repliable ; Paul, quand le dirigeant demande une correction d'une production existante, propose une révision, jamais une nouvelle exécution.

**Never:** aucune nouvelle production n'est créée par une révision ; pas de révision d'un prospect (`prospect`), dont la fiche se corrige dans Prospection ; pas de comparaison côte à côte (différée).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proposition | email `en_attente` v1, consigne « retire l'avertissement » | carte de révision ; aucune exécution | N/A |
| Confirmer | POST `confirm` | `AgentRun` de révision ; à la fin, même production en v2, contenu nouveau ; `ProposalRevision` (v1, consigne) | N/A |
| Déjà décidée | production `validee` ou `rejetee` | aucune carte ; Paul l'explique | N/A |
| Prospect | production `prospect` | aucune carte ; Paul renvoie vers la fiche Prospection | N/A |
| Concurrence | version changée par « Modifier » pendant la révision | l'écriture de l'agent est refusée ; l'exécution échoue en `no_result` | carte : message en clair |
| Double révision | seconde confirmation pendant une révision en cours | `already_running` avec le `runId` | N/A |
| Version précédente | production en v2 | « Voir la version précédente » affiche le contenu v1 et la consigne | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- modèle `ProposalRevision` (`id`, `proposalId` + relation, `fromVersion`, `previousContent`, `instruction`, `agentRunId?`, `createdAt`) + migration additive.
- `src/lib/agent-runs.ts` -- payload `{ kind: "revision", proposalId, fromVersion, instruction }` (`AgentRunPayload`), `enqueueRevisionRun`, branche dans `executeRun` (≈`:261-273`).
- `src/lib/agents/revision.ts` (nouveau) -- `runRevision` : un appel au modèle avec la persona de l'agent auteur (`PERSONAS`), le contenu actuel, la consigne, `companyProfileLines`, `runtimeContextLines` (story 3.1), un outil `revise_proposal({ content })` qui écrit dans une transaction (`version === fromVersion`, création de `ProposalRevision`, `version + 1`) ; `ensureAgentProduced` si rien n'est écrit.
- `src/lib/agents/pending-action-view.ts`, `pending-actions.ts` -- type `revise_proposal` (payload `proposalId`, `instruction` ≤ 1 000 caractères, `agent`, `title`, `fromVersion`), description, exécuteur appelant `enqueueRevisionRun` après la confirmation (comme les lancements), résultat dans la carte.
- `src/lib/agents/co-ceo.ts` -- outil `propose_revision` (plafond de cartes commun) ; prompt : correction d'une production existante = révision.
- `src/app/dashboard/dashboard-client.tsx` (file de relecture, ≈`:600-613`) et `src/components/production-preview.tsx` -- « Voir la version précédente » ; une route ou une donnée de page pour lire la dernière `ProposalRevision`.
- `tests/delegation.spec.ts`, `tests/engine.spec.ts` (`capturePaulTools`, `inRequestScope`).

## Tasks & Acceptance

**Execution:**
- [ ] schéma + migration -- `ProposalRevision` -- version précédente conservée
- [ ] `agent-runs.ts` + `revision.ts` -- exécution de révision -- nouvelle version de la même production
- [ ] intentions + outil de Paul + prompt -- carte de révision -- Paul propose une révision
- [ ] file de relecture -- version précédente repliable -- le dirigeant compare
- [ ] tests -- une ligne de la matrice par test (le modèle est remplacé par une réponse simulée via la capture du `toolRunner`) -- non-régression

**Acceptance Criteria:**
- Étant donné une révision confirmée et terminée, quand on compte les productions de Jean-Claude, alors leur nombre n'a pas changé.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
