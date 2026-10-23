# Epic 3 Context: Paul fait corriger, sans vous noyer

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le dirigeant fait corriger une production en une phrase, reçoit des productions datées et signées de son nom, en quantité maîtrisée, et peut croire Paul quand il annonce un changement. Au second test en production (23 octobre), un seul passage de Jean-Claude produisait 13 éléments, une correction d'email déclenchait une nouvelle exécution complète, les emails ne pouvaient pas porter le nom du dirigeant, et Paul présentait un changement d'état survenu depuis son message comme une erreur de sa part.

## Stories

- Story 3.1: Date du jour et nom du dirigeant pour tous les agents
- Story 3.2: Des exécutions plafonnées
- Story 3.3: Faire réviser une production par Paul
- Story 3.4: Recette du scénario Atelier Lumen
- Story 3.5: Paul situe chaque état dans le temps

Ordre de réalisation : 3.1, 3.2, 3.3, 3.5, puis 3.4 (la recette couvre toute l'épopée).

## Requirements & Constraints

- Paul et les agents connaissent la date du jour (Europe/Paris) ; aucun événement terminé n'est proposé ; « dans 8 jours » se calcule sans réserve.
- Le dirigeant renseigne son prénom et son nom (onboarding facultatif, page Entreprise, carte de profil de Paul) ; les agents signent avec ce nom, jamais celui d'un agent ; sans nom, « [Votre prénom et nom] ».
- Plafonds par exécution validés par les PF : 5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats ; au-delà l'outil refuse et le dit au modèle.
- Révision : la production garde son identifiant, passe en version N+1, la version précédente reste consultable ; seule une production à relire (`en_attente`) se révise ; une révision compte comme une exécution (quota, budget, carte d'exécution) ; aucune production sœur n'est créée.
- Paul distingue « depuis mon dernier message, X a terminé » (mise à jour) d'une vraie erreur de sa part.
- Coût : la date et le nom restent hors du bloc système mis en cache.
- Indicateur : après le scénario Atelier Lumen, au plus 12 décisions en attente.

## Technical Decisions

- `Company.ownerName` (migration additive) ; `runtimeContextLines(company, now)` dans `src/lib/agents/personas.ts`, injecté dans un bloc système non mis en cache (ou le contexte du dernier message pour Paul).
- `RUN_CAPS` et compteur par `AgentRun` dans `src/lib/agents/run-caps.ts`, appliqués dans chaque outil d'écriture des agents.
- Révision : `AgentRun` de payload `{ kind: "revision", proposalId, fromVersion, instruction }`, clé active `revision:{proposalId}` ; table `ProposalRevision` (`proposalId`, `fromVersion`, `previousContent`, `instruction`, `agentRunId`) ; écriture contrôlée par `version === fromVersion` ; carte de Paul `revise_proposal` sur le mécanisme `PaulPendingAction` (exécuteurs par type, confirmation atomique, une carte par cible).
- Socle : `getTeamState`, motifs d'échec typés (`classifyRunError`), `withSerializableRetry`, `inRequestScope` et `capturePaulTools` dans les tests du moteur ; tests base de données en CI uniquement.

## UX & Interaction Patterns

- Production révisée : « Version N » et un lien repliable « Voir la version précédente ».
- Carte de révision : « Demander à {agent} une version N+1 : {consigne} · Confirmer / Annuler ».
- Vouvoiement, phrases courtes, aucun détail technique (charte).

## Cross-Story Dependencies

- 3.1 étend `update_profile` (story 2.2) avec `ownerName`.
- 3.2 s'applique aussi aux exécutions de révision de 3.3.
- 3.3 réutilise les cartes de l'épopée 2 et les motifs de l'épopée 1.
- 3.5 s'appuie sur `getTeamState` (story 1.1) et `buildCurrentStatus`.
- 3.4 rejoue l'ensemble.
