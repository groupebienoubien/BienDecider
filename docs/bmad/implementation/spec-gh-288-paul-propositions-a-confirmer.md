---
title: 'GH-288 : Discuter avec Paul de mes priorités et obtenir une proposition à confirmer'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_commit: '45f5056917ca553b90c36aa5bf9be8b3ed391d5c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-10-context.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la bascule V5.2 (#327), Paul garde les outils de l'ancien plan (lancement d'agents, révision de productions) dont les résultats ne s'affichent plus, n'a qu'un fil de conversation unique et cite encore Martine, Camille et Jean-Claude. Il ne sait rien proposer sur les missions.

**Approach:** Livrer #288 en une PR (choix de Samir du 2026-11-05 : A, B et C ensemble). (A) Remplacer les outils par des propositions à confirmer sur les missions, exécutées par les mêmes services que l'action à la main. (B) Une conversation par contexte, avec le panneau « Paul à propos de… » et un sélecteur. (C) Des suggestions rapides par contexte (spécification §16.2). Paul seul à l'écran dans le panneau et les pages V5.2.

## Boundaries & Constraints

**Always:**
- Spécification §2.2, §15, §16 et addendum §8 font foi ; messages M-xx et journal J-xx existants.
- Une proposition acceptée appelle `applyMissionTransition` / `createMission`, dans la même transaction que la confirmation de la carte ; un refus du service (M-xx) est affiché sur la carte, la carte reste `pending`.
- Rien ne change avant « Accepter » ; refuser = « Garder le cap actuel », la réponse de Paul est « Nous gardons le cap actuel. Aucun changement appliqué. »
- « Lancer » n'exécute rien : il mène au dialogue « Confirmer le cadre de la mission » du détail de la mission.
- Isolation par entreprise sur chaque lecture et écriture (carte, mission, conversation).
- Les corrections iOS du panneau (#249, #250, #251) restent intactes : pas de `<form>`, corps figé, pas d'autofocus au téléphone.
- Journal : J-08 ajouté ; les transitions acceptées depuis une carte gardent l'auteur « vous » (le dirigeant a confirmé).

**Never:**
- Pas de `propose_new_version` (attend l'Atelier #289), ni `propose_idea` (#312), ni `propose_ambition_limit` (#282) : FR-57 reste partielle, la PR dit `Refs #288`.
- Ne pas toucher à la génération de plan (`runCoCeoPlanning`, `propose_plan_item`, `/api/co-ceo/plan`) ni aux pages de l'ancien parcours : elles partent avec les US qui les remplacent.
- Aucun lancement direct, aucune pause ou écart sans carte confirmée.
- Ne pas modifier une migration déjà appliquée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Priorité acceptée | carte `priority` sur une mission À décider | `Company.priorityMissionId` = mission ; J-08 ; aucune mission lancée ni suspendue | — |
| Priorité sur mission écartée | mission devenue Écartée avant l'acceptation | carte reste en attente | message M-21 sur la carte |
| Pause acceptée | mission En cours | statut En pause ; J-18 | si plus En cours : M-43 |
| Écarter la priorité | mission prioritaire écartée | priorité revient à la première non écartée (§2.2) | — |
| Version changée | mission modifiée à la main entre proposition et acceptation | l'acceptation applique la transition sur la version courante si les règles le permettent | M-xx du service sinon |
| Lancer | carte `mission_launch` acceptée | redirection vers `/missions/{id}?cadre=1`, dialogue de cadre ouvert ; rien débité | — |
| Garder le cap | refus de toute carte | carte `cancelled`, message fixe de Paul | — |
| Carte expirée ou en double | 24 h passées, ou nouvelle carte même type et même mission | expirée / remplacée, ignorée | 409 existant |
| Changement de contexte | panneau ouvert sur une mission puis sur Stratégie | chaque contexte a son fil ; l'historique envoyé au modèle est celui du contexte (60 messages au plus) | — |
| Ancien fil | messages existants sans contexte | rattachés à « stratégie » | — |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- `ChatMessage` (248) sans contexte ; `PaulPendingAction` (260) type String ; `Company` sans `priorityMissionId`.
- `src/lib/agents/co-ceo.ts` -- outils (323-617), prompt (624-661) qui nomme les personas, `buildCurrentStatus` (59-129, ancien plan), chemin de lancement 131-275. Planification 697-835 : ne pas toucher.
- `src/lib/agents/pending-action-view.ts` -- types, libellés, schémas de charge, `describePendingAction` ; Records exhaustifs par type.
- `src/lib/agents/pending-actions.ts` -- `EXECUTORS` (dans la transaction), `AFTER_CONFIRM`, `sameTarget`, `createPendingAction`, `decidePendingAction`, `recentPendingActions`.
- `src/app/api/co-ceo/pending-actions/[id]/route.ts` -- seule route accepter/refuser.
- `src/lib/missions/service.ts` -- `applyMissionTransition(companyId, missionId, action, expectedVersion)` et `createMission` à réutiliser ; `rules.ts` `checkTransition` ; `stage.ts:87` `priorityMissionId()` (calculée) ; `view.ts:228` ; `src/lib/journal.ts` `JOURNAL_TEXTS`.
- `src/components/mission-actions.tsx` -- dialogue de cadre (`dialog` local, 76-97) ; `PaulButton` (14).
- `src/lib/agents/chat-context.ts` -- `CHAT_HISTORY_MESSAGES = 40`, filtre société seule ; `src/app/api/co-ceo/message/route.ts`, `messages/route.ts` (50 derniers) ; cron hebdo `api/cron/weekly-review/route.ts:87`.
- `src/lib/paul-context.ts`, `src/lib/agents/page-context.ts` -- `PaulElement`, `openPaul`, `pageContextSchema`.
- `src/components/paul-panel.tsx` -- en-tête persona (488-516), `SUGGESTIONS` figées (25), `PendingActionCard` (163-202), corrections iOS (253-337, 603-617).
- Maquette : `maquette_v5.2/app.js:411-469` (`threadFor`, `chat`), `paul.js:22-44` (libellés), `161-186` (suggestions), `app.js:561-583` (accepter / garder le cap).
- Ancien code mort après retrait : `plan-items.ts` (`resolvePlanLaunchExtras` lit les cartes `launch_plan_item`), `revision.ts` `startRevisionFromCard` (encore utilisé par `api/proposals/[id]/revise` : garder).
- Tests : `tests/engine.spec.ts` (`capturePaulTools` ~2151 ; cartes 1852-2523 ; révision 2927-3100 ; bloc Lumen en fin de fichier) ; `tests/delegation.spec.ts` (cartes 390-749) ; `tests/user-journey.spec.ts` (1677-1760, V5.2 à 243) ; `tests/engine-run-boundaries.spec.ts:266` ; `tests/security.spec.ts:335`.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration `2026110512xxxx_paul_contextes` -- `ChatMessage.contextKey String @default("strategie")` indexé avec `companyId` ; `Company.priorityMissionId String?` ; SQL : cartes `pending` de type `launch_plan_item`/`revise_proposal`/`update_objective` passées `expired` -- socle B et F-12.
- [x] `src/lib/paul-contexts.ts` (nouveau, pur) -- clés `strategie`, `mission:{id}`, `contenu:{id}`, `resultats`, `ambition`, `positionnement`, `concurrence`, `sources`, `idee:{n}` ; libellés §16.1, introduction, suggestions §16.2 ; `parseContextKey` sûr.
- [x] `src/lib/missions/stage.ts`, `view.ts`, `service.ts`, `rules.ts`, `journal.ts` -- priorité choisie si valide (non écartée, non close) sinon calcul actuel ; action `set_priority` (M-21, J-08) ; écarter la mission prioritaire remet `priorityMissionId` à null.
- [x] `src/lib/agents/pending-action-view.ts`, `pending-actions.ts` -- types `update_profile`, `mission_priority`, `mission_scope`, `mission_pause`, `mission_dismiss`, `mission_restore`, `mission_create`, `mission_launch` ; exécuteurs dans la transaction via les services missions ; `MissionError` rendu sur la carte sans changer son statut ; libellés §16.3 ; refus « Garder le cap actuel » ; retrait de `launch_plan_item`, `revise_proposal`, `update_objective` (anciennes lignes ignorées à l'affichage).
- [x] `src/app/api/co-ceo/pending-actions/[id]/route.ts` -- 422 avec message M-xx quand le service refuse ; réponse de Paul fixe au refus, enregistrée dans le fil de la carte ; `redirect` pour `mission_launch`.
- [x] `src/lib/agents/co-ceo.ts` -- outils `get_current_status` (missions, étapes, prochain pas, priorité, crédits, délégation), `propose_priority`, `propose_scope`, `propose_pause`, `propose_dismiss`, `propose_restore`, `propose_mission`, `propose_mission_launch`, `propose_profile_update`, `record_uncovered_request` ; prompt réécrit (Paul seul, contexte courant, liens d'action, « crédit débité à l'acceptation » dit une fois) ; retrait des outils et du chemin de lancement de l'ancien plan.
- [x] `src/lib/agents/chat-context.ts`, `api/co-ceo/message/route.ts`, `messages/route.ts`, `page-context.ts` -- `contextKey` reçu, validé, propriété vérifiée (mission de la société) ; historique du contexte, 60 messages ; liste des conversations non vides ; cron hebdo écrit dans `strategie`.
- [x] `src/components/paul-panel.tsx`, `src/lib/paul-context.ts`, boutons Paul des pages V5.2 -- titre « Paul à propos de » + libellé du contexte, sélecteur (si ≥ 2 fils), avatar et nom Paul seuls, suggestions du contexte, carte « Paul · proposition à confirmer » ; contexte par défaut selon la page.
- [x] `src/components/mission-actions.tsx` -- ouvre le dialogue de cadre quand `?cadre=1`.
- [x] Tests -- `tests/delegation.spec.ts` (contextes, suggestions, libellés de cartes, priorité choisie) ; `tests/engine.spec.ts` avant le bloc Lumen (chaque outil, acceptation = mêmes refus qu'à la main, J-08, garder le cap, isolation) ; mise à jour des tests des outils retirés ; `tests/user-journey.spec.ts` (priorité confirmée/refusée, changement de contexte, 360 et 1440 px).
- [x] `docs/bmad/implementation/deferred-work.md` -- reports : nouvelle version (#289), idée (#312), limite d'ambition (#282), personas des pages de l'ancien parcours.

**Acceptance Criteria:**
- Given une conversation sur une mission, when le dirigeant demande de la mettre en pause, then une carte « Mettre en pause » apparaît et la mission reste En cours tant qu'il n'a pas accepté.
- Given le panneau ouvert, when le dirigeant change de contexte par le sélecteur, then seul le fil de ce contexte s'affiche et part au modèle.
- Given n'importe quel écran V5.2 et le panneau, then aucun autre nom ni avatar que Paul n'apparaît, et le prompt ne nomme aucun autre agent.
- Given une proposition refusée par les règles, when le dirigeant accepte, then le message M-xx de la spécification s'affiche et rien n'est écrit.

## Design Notes

Clé de contexte en texte (`mission:{id}`) plutôt qu'une table de conversations : pas de cycle de vie propre, filtre indexé, migration additive. La priorité choisie est un pointeur nullable : la priorité calculée reste le repli, ce qui garde `nextStep` pur.

## Verification

**Commands:**
- `npm run lint` -- 0 avertissement
- `npx tsc --noEmit` -- 0 erreur
- `npm run test:delegation` -- vert
- `npm run build` -- succès
- CI : `test:engine`, `test:ux`, `test:security`, dérive du schéma -- verts

## Implementation Notes

- Migration nommée `20261106130000_paul_contextes` : elle passe après `20261106110000_bascule_v52` et `20261106120000_mission_contents` (#328).
- Une mission créée en acceptant une carte de Paul porte `createdBy: "paul"` ; le plafond de dix missions ouvertes compte celles du dirigeant et celles acceptées depuis Paul.
- `set_priority` n'est pas exposé sur la route de transition manuelle : il ne passe que par une carte acceptée. Il ne change pas la mission (ni version, ni statut) ; il écrit `Company.priorityMissionId` et J-08.
- La clé `contenu:{id}` est lue par `parseContextKey` mais refusée par les routes (404) tant que l'atelier (#289) n'existe pas.
- Délégation et programmations ne sont stockées nulle part : `get_current_status` renvoie la délégation par défaut et une liste vide.
- Les tests des outils retirés (lancement d'agents par Paul, carte d'objectif, révision proposée par Paul, état du plan et des exécutions dans `get_current_status`) sont supprimés ; les étapes correspondantes de la recette Atelier Lumen aussi. Les tests de la révision du Studio passent désormais par `startRevisionFromCard`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | VG (autres) | Liens `[[bd:mission:ID]]` non rendus côté client (texte brut, copie, lecture à voix haute) | high | `chat-format.ts:17` et `voice.ts:4` ne reconnaissent que proposal, finding, lead | patch |
| 2 | Blind, Edge, VG | Priorité acceptée sur une mission Arrêtée : J-08 écrit, sans effet | medium | `rules.ts` ne refuse que `dismissed` ; `priorityMissionId()` ignore `stopped` | patch |
| 3 | Blind, Edge | Priorité déjà en place : carte inutile et J-08 en double | low | branche `set_priority` avant le test `noop` | patch |
| 4 | Edge | Deux cartes de priorité sur deux missions acceptables à la suite | low | `sameTarget` filtre par `missionId` | patch |
| 5 | Blind | Carte « Créer la mission » sans périmètre ni règle d'arrêt | medium | descripteur `mission_create` | patch |
| 6 | Blind | Carte de périmètre appliquée sur une version plus récente | false | conforme à la ligne « Version changée » de la matrice figée | rejet |
| 7 | Blind | Contextes ambition, concurrence, sources sans point d'entrée | medium | aucun `openPaul` vers ces clés | defer |
| 8 | Blind, VG | Clé de contexte étrangère, `contenu:` ou mal formée : aucun test de route | medium | aucun test n'envoie `contextKey` | patch |
| 9 | Blind | Élément mis en avant conservé au changement de conversation | medium | `paul-panel.tsx:550` n'efface pas l'élément | patch |
| 10 | Blind, Edge | « Explorer une idée » : lecture du fil stratégie, plafond `idee:999`, course, échec réseau | low | cas rares, correctif ajoutant des gardes | rejet |
| 11 | Blind, Edge | `?cadre=1` reste dans l'adresse ; « Lancer » sur une mission déjà en cours ne dit rien | low | pas de `router.replace` ; redirection sans contrôle de statut | patch |
| 12 | Blind | Sélecteur masqué quand une seule conversation est non vide | medium | condition `conversations.length >= 2` | patch |
| 13 | Blind | Garde de la story 4.2 (changé depuis mon message) perdue | medium | `loadPaulMessageTimes` supprimé sans report | patch |
| 14 | Blind, Edge | Sélecteur listant des missions disparues ou `contenu:` | low | `listConversations` ne filtre pas | patch |
| 15 | Blind | Carte refusée par les règles reste en attente, Paul l'ignore | low | correctif = nouvel état stocké | rejet |
| 16 | Edge | Redirection `//hôte` | false | `redirect` est construit côté serveur par `launchFrameHref` | rejet |
| 17 | Edge | Forme du périmètre Réalisation absente de `propose_scope` | low | description de l'outil | patch |
| 18 | VG | Prochain pas de Stratégie avec la priorité choisie non vérifié | medium | tests au niveau des fonctions seulement | patch |
| 19 | VG | Plafond de 10 missions incluant celles de Paul non testé | medium | seul le test M-75 des missions du dirigeant existe | patch |
| 20 | VG | Liens de mission (isolation) non testés | medium | test des références sans mission | patch |
| 21 | VG | `cartesRecentes` et `monMessagePrecedent` par contexte non vérifiés | medium (non vérifié) | données lues par le modèle seulement | defer |
