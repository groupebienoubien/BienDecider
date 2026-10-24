---
title: 'Story 3.3 — Faire réviser une production par Paul'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'eeeeb91b6b3ef4ae05594b01195a9a91e858c818'
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
- [x] schéma + migration -- `ProposalRevision` -- version précédente conservée
- [x] `agent-runs.ts` + `revision.ts` -- exécution de révision -- nouvelle version de la même production
- [x] intentions + outil de Paul + prompt -- carte de révision -- Paul propose une révision
- [x] file de relecture -- version précédente repliable -- le dirigeant compare
- [x] tests -- une ligne de la matrice par test (le modèle est remplacé par une réponse simulée via la capture du `toolRunner`) -- non-régression

**Acceptance Criteria:**
- Étant donné une révision confirmée et terminée, quand on compte les productions de Jean-Claude, alors leur nombre n'a pas changé.

## Implementation Notes

- Schéma : `ProposalRevision` avec `source` (`agent` | `owner`), `instruction` nullable (modification du dirigeant), `@@unique([proposalId, fromVersion])` (une version n'est remplacée qu'une fois) et `@@index([agentRunId])` ; `agentRunId` sans clé étrangère. Migration `20261024120000_proposal_revision`, écrite à la main.
- « Modifier » (PATCH /api/proposals/[id]) conserve aussi la version remplacée (`source: owner`) dans la même transaction que l'écriture conditionnée à la version.
- Approbation : « modifiée » seulement si cette approbation change le contenu ou si le dirigeant a enregistré un brouillon de cette version (`draftSavedAt`, remis à null par une révision de l'agent) ; une version révisée par l'agent approuvée telle quelle est « validée ».
- Révision en cours (clé active `revision:{proposalId}`, src/lib/agents/revision-state.ts) : approbation et diffusion refusées en 409 « Une révision est en cours : attendez la nouvelle version. » ; la file de relecture et la fenêtre d'une production affichent « Révision en cours par {agent}… » et désactivent les boutons d'approbation. `AgentRunView.revision` (proposalId, fromVersion, titre) est lu de la charge de l'exécution ; le tableau de bord suit aussi une exécution lancée depuis une carte de Paul.
- `persistRun` prend `succeededDedupeSeconds` (défaut : 5 min, inchangé pour les lancements directs) ; la révision passe 0 : une révision terminée ne bloque pas la suivante, seule une révision en file ou en cours est renvoyée.
- Conflits : `RevisionConflictError` (sous-classe d'`AgentNoResultError`, donc motif `no_result`) porte trois messages en clair : modifiée (« … a été modifiée pendant la révision : votre version est conservée. »), décidée (« … a été validée ou rejetée entre-temps : rien n'a été changé. »), disparue. Version déjà changée avant l'appel : échec sans appel au modèle. Agent de l'exécution différent de l'auteur : refus (`outage`). Reprise d'une tentative qui avait déjà écrit la version suivante (`ProposalRevision` de cette exécution) : réussite, sans appel au modèle.
- Taille : `max_tokens` = 2 × estimation du contenu (3 caractères par token), entre 2 000 et 16 000 ; au-delà de 24 000 caractères, pas de carte (`propose_revision`) ni d'exécution.
- À la confirmation, `startRevisionFromCard` refuse sans rien lancer une production disparue, décidée, prospect, trop longue ou dont la version a changé depuis la carte (message sans motif) ; une révision en cours donne `already_running` et son `runId`.
- Plafonds (3.2) : l'outil `revise_proposal` n'écrit qu'une fois par exécution (garde de version) ; `withRunCap` n'est pas utilisé.
- Email Gmail (`gmail_email`, JSON `{ to, text }`) : refus si la version actuelle n'est pas un JSON lisible, si la révision n'en est pas un ou change le destinataire. Le contenu de l'agent est enregistré tel quel (pas de trim).
- Paul : `propositionsEnAttente` porte la `version` ; `cartesRecentes` décrit une carte de révision (production, version révisée, consigne, `lancement`) ; le prompt lui fait lire `lancement.message` et ne pas reproposer une révision devancée par une modification ou une décision. Fin d'une exécution de révision : « {agent} a préparé la version N+1 de « titre » », lien vers les décisions.
- Vue : `PreviousVersion` (production-preview.tsx), lue dès la version 2 et relue à chaque nouvelle version (état par production et version) : ligne « Révisée par {agent} : {consigne} » sur une version écrite par l'agent, « Voir la version précédente » replié avec « modifiée par vous » ou « révisée par {agent} : {consigne} » ; rien n'est affiché sans version conservée. Route `GET /api/proposals/[id]/revisions` déclarée dans tests/security.spec.ts. Après « Annuler » sur une carte de révision, le focus revient au champ de saisie de Paul.
- Tests : 3 tests purs (delegation), 16 tests base de données (engine, CI uniquement : non exécutés localement).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge | Approuver une v2 écrite par l'agent l'enregistre « modifiée par le dirigeant » | medium | la route déduit `modifiee` de `version > 1` | patch |
| 2 | blind | Aucune indication de révision en cours ; approuver pendant la révision gaspille l'appel | medium | rien ne bloque ni n'affiche l'état | patch |
| 3 | blind, edge | « Modifier » ne garde aucune version : la v2 de l'agent se perd, libellés trompeurs | medium | pas de `ProposalRevision` côté route | patch |
| 4 | blind, edge | Message de conflit faux quand la production est décidée ou supprimée | medium | un seul texte « la vôtre est conservée » | patch |
| 5 | edge | Une relance après une tentative qui a déjà écrit est annoncée en conflit | medium | `fromVersion` déjà dépassé par le même run | patch |
| 6 | blind | La carte d'exécution d'une révision parle d'« éléments à examiner » ; lien vers Diagnostic pour Martine | medium | `finishedRunMessage` / `runResultHref` génériques | patch |
| 7 | blind | Consigne de Paul pour `no_result` inadaptée aux conflits de révision | medium | invite à relancer une révision impossible | patch |
| 8 | blind, edge | `PreviousVersion` vide si la version change panneau ouvert ; cache sans `proposalId` | low | correctif direct | patch |
| 9 | blind | La production révisée ne dit pas qu'elle a été révisée ni avec quelle consigne | low | correctif direct | patch |
| 10 | blind | `runRevision` ne vérifie pas que l'agent du run est l'auteur | low | correctif direct | patch |
| 11 | blind | `ProposalRevision.agentRunId` sans index ; pas de source (agent ou dirigeant) | low | correctif direct (avec le 3) | patch |
| 12 | edge | Contenu long au-delà du budget de sortie : révision impossible | low | `max_tokens` fixe | patch |
| 13 | edge | Email Gmail au contenu actuel illisible : destinataire modifiable | low | contrôle sauté si `before` nul | patch |
| 14 | blind, edge | Contenu de l'agent tronqué de ses espaces | low | correctif direct | patch |
| 15 | edge | Focus non rendu à la saisie après « Annuler » d'une carte de révision | low | correctif direct | patch |
| 16 | gap | Remplacement des cartes de révision par production non testé | medium | aucun test `revise_proposal` du remplacement | patch |
| 17 | gap, blind | Garde du destinataire Gmail, refus « version changée », ordre de deux révisions, `cartesRecentes`, vraie route « Modifier », modèle qui n'écrit rien : non testés | medium | aucun test correspondant | patch |
| 18 | edge | Production rejetée puis rouverte pendant la révision : la révision s'applique | low | réouverture voulue par le dirigeant | rejeté |
| 19 | edge | Confirmation concurrente qui reçoit le run d'une autre carte | low | cas très improbable | rejeté |
| 20 | edge | Run de clé active « succeeded » sans fin | low | état inexistant en pratique | rejeté |
| 21 | blind | Logique « confirmer puis enregistrer le résultat » dupliquée | low | refonte sans effet visible | rejeté |

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
