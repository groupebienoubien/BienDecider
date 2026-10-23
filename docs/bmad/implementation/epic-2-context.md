# Epic 2 Context: Paul retient et propose, vous décidez

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le dirigeant dit une fois son objectif et son profil à Paul, et garde la main sur chaque lancement. En production, Paul n'enregistrait rien de ce qu'on lui disait (l'accueil redemandait l'objectif) et lançait les agents sans demander. Cette épopée fait de Paul un partenaire qui propose des intentions (écrire l'objectif, le profil, lancer un agent) sous forme de cartes de confirmation : rien ne s'écrit ni ne se lance avant le clic du dirigeant.

## Stories

- Story 2.1: Dire son objectif à Paul et le confirmer en un clic
- Story 2.2: Faire enregistrer son profil par Paul
- Story 2.3: Paul propose le lancement, le dirigeant lance
- Story 2.4: Pas d'action en double

## Requirements & Constraints

- Aucune écriture et aucun lancement sans clic du dirigeant. Une demande explicite (« lance Jean-Claude ») passe aussi par une carte (règle validée par les PF).
- L'objectif est dit en mois ou en an ; il est stocké en valeurs mensuelles (champs existants de `Company`) ; la conversion est faite par le code. Sans période, Paul demande « par mois ou par an ? ».
- Paul cite les chiffres calculés par `computeBusinessTarget`, jamais les siens.
- Profil modifiable par Paul : site, comptes sociaux, téléphone, horaires, description. Nom commercial, métier et zone restent dans la page Entreprise.
- Au plus 3 cartes par message de Paul. Paul porte le titre « Partenaire de croissance » partout.
- Une action active (à lancer ou en cours) du même agent et du même thème est reprise, jamais recréée.
- Isolation : une carte n'est confirmable que par l'entreprise qui l'a reçue (404 sinon).
- Indicateurs : zéro information redemandée après confirmation ; 100 % des exécutions issues du chat ont un clic « Lancer ».

## Technical Decisions

- **Intention à confirmer** : modèle `PaulPendingAction` (`companyId`, `chatMessageId`, `type` parmi `update_objective`, `update_profile`, `launch_plan_item`, `revise_proposal`, `payload` validé par zod, `status` `pending → confirmed | cancelled | expired`, `expiresAt` à 24 h, `decidedAt`). Les outils de Paul ne créent que ces enregistrements ; une nouvelle intention de même type et même cible annule la précédente.
- **Confirmation** : `POST /api/co-ceo/pending-actions/[id]` (`confirm` ou `cancel`), transition atomique `pending → confirmed` avant d'appeler la fonction du domaine, la même que l'écran manuel équivalent.
- **Objectif** : l'outil reçoit montant + période ; `toMonthly` dans `src/lib/business-target.ts` convertit à la confirmation.
- **Lancement** : à la confirmation, `enqueuePlanRun` ; les refus portent les motifs typés de l'épopée 1 (`already_running`, `quota_runs`, `quota_budget`, `no_result`, `outage`) via `classifyRunError`.
- **Dédoublonnage** : `createChatPlanItem` renvoie l'action `propose`/`en_cours` existante de même agent et thème, dans une transaction (conflit de sérialisation reconnu par `isSerializationConflict`).
- Socle : lecture d'état unique `getTeamState` ; isolation par `companyId` ; erreurs typées ; migrations Prisma additives ; tests du moteur sur base Postgres en CI (non exécutables en local sous Windows), `tests/delegation.spec.ts` pour les fonctions pures ; `inRequestScope` pour appeler du code qui utilise `after()`.

## UX & Interaction Patterns

- Carte de confirmation dans le panneau de Paul, liée au message, rendue depuis `PaulPendingAction` (jamais depuis le texte) : un bouton principal vert (Confirmer / Lancer), un secondaire en lien (Corriger / Plus tard) ; états confirmée, annulée, expirée visibles.
- Vouvoiement, phrases courtes, aucun détail technique visible (charte).

## Cross-Story Dependencies

- 2.1 crée `PaulPendingAction`, la route de confirmation et le rendu des cartes ; 2.2 et 2.3 y ajoutent un type d'intention.
- 2.3 remplace les outils `delegate_*` (qui lancent directement aujourd'hui) par des propositions de lancement.
- 2.4 s'appuie sur 2.3 (la carte cible l'action reprise).
- L'épopée 3 réutilise les intentions (révision d'une production).
