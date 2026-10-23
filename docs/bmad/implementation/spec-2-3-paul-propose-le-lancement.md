---
title: 'Story 2.3 — Paul propose le lancement, le dirigeant lance'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: '80278e1a7f6785b106557c0425f88532974a674c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-2-context.md'
  - '{project-root}/docs/bmad/implementation/spec-2-1-dire-son-objectif-a-paul-et-le-confirmer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Paul lance lui-même les agents dès qu'il le juge utile (outils `delegate_*`) : en production, il a lancé trois agents au premier message, sans accord du dirigeant, en engageant du budget. C'est contraire à la promesse « Vous décidez ».

**Approach:** les outils de délégation deviennent des propositions : Paul crée ou reprend l'action au plan en « à lancer » et une intention `launch_plan_item` ; la carte « Lancer {agent} : {titre} · Lancer / Plus tard » lance au clic par le même chemin que le bouton du plan. Paul porte partout le titre « Partenaire de croissance ».

## Boundaries & Constraints

**Always:** aucune exécution n'est créée avant le clic « Lancer » ; une demande explicite du dirigeant (« lance Jean-Claude ») passe aussi par la carte (règle validée par les PF) ; à la confirmation, le lancement réutilise `delegatePlanAction` (relance d'un échec, motifs typés de la story 1.2) et la carte affiche le résultat (lancé, ou motif en clair) ; « Plus tard » annule l'intention et laisse l'action au plan en « à lancer » ; au plus 3 cartes par message de Paul ; le titre du panneau et le prompt viennent de `PERSONAS.co_ceo.role` (« Partenaire de croissance »).

**Never:** Paul ne dit jamais « c'est lancé » avant la confirmation ; pas de dédoublonnage d'action dans cette story (story 2.4) ; pas de changement du bouton « Lancer » du plan.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proposition | outil `propose_launch_demarchage` avec titre et brief | action `propose` au plan ; intention `launch_plan_item` `pending` ; aucun `AgentRun` | N/A |
| Lancer | POST `confirm` | `AgentRun` créé ; action `en_cours` ; intention `confirmed` ; la réponse donne le `runId` | N/A |
| Plus tard | POST `cancel` | intention `cancelled` ; action reste `propose` ; aucun run | N/A |
| Refus au lancement | `confirm` avec quota atteint | intention `confirmed` ; réponse `ok: false, reason: quota_runs` et message en clair ; action `propose` | carte : message du motif |
| Déjà en cours | `confirm` sur une action passée `en_cours` entre-temps | `reason: already_running` avec `runId` ; aucun second run | carte : « {agent} y travaille déjà » |
| Plus de trois | Paul tente une 4e proposition dans le même tour | l'outil refuse et le dit à Paul | N/A |
| Titre | panneau ouvert | en-tête « Partenaire de croissance » | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/co-ceo.ts:114` (`delegatePlanAction`) -- conservé pour l'exécution à la confirmation ; ne plus l'appeler depuis les outils.
- `src/lib/agents/co-ceo.ts:259-291` (`delegate_marketing`, `delegate_contenu`, `delegate_demarchage`) -- remplacer par `propose_launch_*` : créent ou reprennent l'action (`createChatPlanItem` / `findLaunchablePlanItem`) puis l'intention ; compteur de cartes par tour (3 au plus, tous types confondus).
- `src/lib/agents/co-ceo.ts:302-314` (prompt) -- « copilote IA » → rôle de Paul ; règles : il propose, n'annonce jamais un lancement non confirmé, lit le résultat de la carte au tour suivant via `get_current_status`.
- `src/lib/agents/pending-actions.ts` (story 2.1) -- type `launch_plan_item` (`planItemId`, `agent`, `extras`) ; exécuteur appelant `delegatePlanAction` dans le contexte de la requête (la route de confirmation est une route Next : `after()` disponible) ; le résultat est renvoyé dans la vue de l'intention.
- `src/components/paul-panel.tsx:351` -- « Votre copilote » → `PERSONAS.co_ceo.role` ; carte de lancement : boutons « Lancer » (vert) et « Plus tard » (lien), résultat affiché après le clic.
- `tests/engine.spec.ts` -- `inRequestScope` pour la confirmation qui lance.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agents/pending-actions.ts` -- type `launch_plan_item` et exécuteur -- lancement sur clic
- [x] `src/lib/agents/co-ceo.ts` -- outils `propose_launch_*`, plafond de 3 cartes, prompt -- Paul propose
- [x] `src/components/paul-panel.tsx` -- carte de lancement et titre -- interface
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné un tour de Paul qui propose de faire travailler un agent, quand on compte les `AgentRun` avant tout clic, alors il n'y en a aucun.

## Implementation Notes

- Le lancement confirmé s'exécute après la transaction `pending → confirmed` (`AFTER_CONFIRM` dans `pending-actions.ts`), pas dans l'exécuteur transactionnel : le lancement a ses propres transactions et `after()`. Il passe par `launchPlanItemFromCard` (`co-ceo.ts`), qui partage la logique de lancement de `delegatePlanAction` sans brief ni thème factices ; importé dynamiquement pour éviter la dépendance circulaire. Un second clic reçoit l'état confirmé sans relancer.
- Le résultat (`{ ok, reason?, message, runId? }`) est écrit dans `payload.result` de la carte : la vue (`result`), l'historique et `cartesRecentes.lancement` (lu par Paul via `get_current_status`) le reprennent. Un échec d'écriture du résultat est journalisé sans faire échouer la décision. Une carte confirmée sans résultat affiche « Lancement en cours de vérification… » et Paul la lit `lancement: { ok: null }`. Une action devenue non lançable (écartée, terminée) donne un message destiné au dirigeant, sans motif.
- Remplacement : une carte `launch_plan_item` ne remplace que la carte en attente visant la même action du plan (filtre JSON sur `payload.planItemId`) ; objectif et profil gardent le remplacement par type.
- Plafond : compteur de cartes du tour réservé avant tout `await` et rendu quand aucune carte n'est créée ; il s'applique aussi aux cartes d'objectif et de profil.
- Vue : `cancelLabel` ajouté (« Corriger » ou « Plus tard ») ; « Plus tard » ne remet pas le focus dans la saisie.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Carte de lancement confirmée sans résultat affichée en succès ; Paul sans consigne pour ce cas | medium | `succeeded = confirmed && result?.ok !== false` | patch |
| 2 | blind, edge | Échec d'écriture du résultat après un lancement réussi présenté comme décision échouée | medium | `updateMany` non protégé après `delegatePlanAction` | patch |
| 3 | blind, gap | Une erreur inattendue est présentée « n'est plus à lancer dans votre plan » | false | `classifyRunError` renvoie `outage` pour toute erreur inconnue (`agent-errors.ts:61`) ; `null` seulement pour une action non lançable ; test ajouté | rejeté |
| 4 | blind | Entrées factices (`brief`, `theme`, `priority`) passées à `delegatePlanAction` | low | correctif direct : point d'entrée dédié | patch |
| 5 | blind | « Oui, lance-le » en réponse à une carte crée une seconde action et une seconde carte | medium | aucune consigne de renvoyer vers la carte ouverte | patch |
| 6 | blind | `cartesRecentes` limité à 5 alors qu'un message peut créer 3 cartes | low | correctif direct | patch |
| 7 | blind | Nom « Jean-Claude » écrit en dur dans le prompt | low | correctif direct | patch |
| 8 | blind | Focus perdu après « Plus tard » ou « Lancer » | low | correctif direct | patch |
| 9 | blind | Champ `launch` de la route jamais lu, seconde source de vérité | low | correctif direct (suppression) | patch |
| 10 | blind | `extras` sans limite de longueur | medium | texte du dirigeant copié sans borne dans la charge utile et l'exécution | patch |
| 11 | edge | `releaseCard` peut être appelé deux fois | low | correctif direct (libération idempotente) | patch |
| 12 | gap | Remplacement de cartes de lancement visant la même action non testé | medium | aucun test avec le même `planItemId` | patch |
| 13 | gap | Branche `planItemId` de `proposeLaunch` non testée | medium | tous les tests passent sans `planItemId` | patch |
| 14 | gap | Retour de la place après un refus non testé | medium | le test de plafond n'a aucun refus | patch |
| 15 | gap | Message de remplacement sans motif non testé | medium | aucun test d'action écartée entre proposition et clic | patch |
| 16 | blind | Cartes de lancement d'autres actions jamais marquées expirées en base | low | l'expiration est appliquée à la lecture | rejeté |
| 17 | edge | Actions de plan sans carte après un tour échoué | low | dédoublonnage de la story 2.4 | defer |
| 18 | edge | Deux propositions de même titre ou de même action dans un tour | low | couvert par la story 2.4 et le remplacement par action | rejeté |
| 19 | gap | Rendu d'un lancement refusé dans le panneau non testé | low | textes déjà fixés par les tests unitaires | defer |
| 20 | gap | `docs/architecture.md` cite encore les outils `delegate_*` | low | correctif direct | patch |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
