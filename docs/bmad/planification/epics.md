---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/bmad/planification/prds/prd-BienDecider-paul-fiable-2026-10-22/prd.md
  - docs/bmad/planification/architecture/architecture-BienDecider-paul-fiable-2026-10-22/ARCHITECTURE-SPINE.md
  - docs/bmad/planification/architecture/architecture-BienDecider-2026-10-22/ARCHITECTURE-SPINE.md
  - docs/charte.md
  - BienDecider-test-entrepreneur-2026-10-22.md
runNotes: "Déroulé sans arrêt aux menus [C], à la demande de Samir (2026-10-22). Les PF valident le document entier."
---

# BienDecider — Découpage en épopées : Paul fiable

## Vue d'ensemble

Ce document découpe le PRD « Paul fiable » et son spine d'architecture en épopées et en stories prêtes à développer. Pas de document UX séparé : la [charte](../../charte.md) s'applique à chaque écran touché.

## Inventaire des exigences

### Exigences fonctionnelles

- FR1 : le dirigeant fait enregistrer son objectif en le disant à Paul, après une carte de confirmation ; valeurs mensuelles stockées, conversion depuis l'année par le code ; période demandée si absente.
- FR2 : le dirigeant fait enregistrer par Paul site, comptes sociaux, téléphone, horaires, description, après confirmation.
- FR3 : Paul cite l'écart et le nombre de clients calculés par le code ; sans objectif enregistré, il propose FR1.
- FR4 : Paul lit toutes les actions actives (à lancer, en cours, à décider) et les exécutions des dernières 24 h ; il ne crée pas d'action équivalente à une action en cours.
- FR5 : un lancement non fait ou échoué a un motif d'échec typé (déjà en cours, quota, budget, rien produit, panne), dit en clair ; jamais « ÉCHEC » en majuscules.
- FR6 : le premier audit de l'onboarding est une action de Martine au plan, en cours, visible dès l'arrivée sur l'accueil.
- FR7 : Paul ne lance rien lui-même ; une carte « Lancer / Plus tard » attend le clic du dirigeant ; double clic = une seule exécution.
- FR8 : Paul reprend une action équivalente existante au lieu d'en créer une seconde.
- FR9 : le dirigeant demande une correction à Paul ; après confirmation, l'agent auteur produit la version N+1 de la même production ; la version précédente reste consultable.
- FR10 : Paul et les agents connaissent la date du jour (Europe/Paris) ; aucun événement passé n'est proposé.
- FR11 : le dirigeant renseigne son prénom et son nom ; les agents signent avec ce nom, jamais avec celui d'un agent.
- FR12 : chaque exécution produit un nombre borné de productions par type.
- FR13 : badge Décisions, accueil et page Décisions affichent le même nombre.
- FR14 : une action dont l'exécution est terminée n'est plus présentée comme « action à valider ».
- FR15 : Paul porte le titre « Partenaire de croissance » partout.

### Exigences non fonctionnelles

- NFR1 : aucune écriture ni aucun lancement sans clic du dirigeant (AD-1, AD-8).
- NFR2 : isolation stricte par entreprise, y compris pour la confirmation d'une carte (AD-3).
- NFR3 : coût modèle par conversation non doublé par la lecture d'état et les révisions (SM-C2) ; la date et le nom restent hors du bloc système mis en cache (AD-13).
- NFR4 : au plus 3 cartes de confirmation par message de Paul (SM-C1).
- NFR5 : textes visibles en français, vouvoiement, conformes à la charte.

### Exigences issues de l'architecture

- Pas de modèle de départ : projet existant (brownfield), aucune story d'initialisation.
- Migrations Prisma additives, une par story qui touche le schéma, appliquées au déploiement Vercel.
- Nouvelles entités, créées par la première story qui en a besoin : `AgentRun.failureReason` (story 1.2), `PaulPendingAction` (story 2.1), `Company.ownerName` (story 3.1), `ProposalRevision` (story 3.3).
- Fonctions uniques : `getTeamState` (AD-9), `classifyRunError` (AD-10), `toMonthly` (AD-15), `runtimeContextLines` (AD-13), `RUN_CAPS` (AD-14).
- Tests : `node --test` pour les fonctions pures, Playwright pour les routes et les parcours ; la CI fait foi.

### Exigences UX

- UX-DR1 : carte de confirmation dans le panneau de Paul, liée au message, avec deux boutons (action principale verte, secondaire en lien) ; états confirmée, annulée, expirée visibles ; une seule action principale par carte.
- UX-DR2 : carte d'exécution qui affiche le motif d'échec en une phrase, avec l'action utile (« Voir l'exécution en cours », « Réessayer demain »).
- UX-DR3 : production révisée qui affiche « Version N » et un lien repliable « Voir la version précédente ».

### Carte de couverture des FR

- FR1 : Épopée 2 — objectif depuis le chat
- FR2 : Épopée 2 — profil depuis le chat
- FR3 : Épopée 2 — chiffres calculés par le code
- FR4 : Épopée 1 — état complet de l'équipe
- FR5 : Épopée 1 — motifs d'échec typés
- FR6 : Épopée 1 — premier audit au plan
- FR7 : Épopée 2 — lancement sur clic
- FR8 : Épopée 2 — pas d'action en double
- FR9 : Épopée 3 — révision d'une production
- FR10 : Épopée 3 — date du jour
- FR11 : Épopée 3 — nom du dirigeant
- FR12 : Épopée 3 — plafonds par exécution
- FR13 : Épopée 1 — un seul compteur
- FR14 : Épopée 1 — statut d'action cohérent
- FR15 : Épopée 2 — un seul titre

## Liste des épopées

### Épopée 1 : Paul dit vrai

Le dirigeant obtient de Paul et de l'interface un état de l'équipe exact et identique, avec la raison claire de tout lancement qui n'a pas eu lieu.
**FR couvertes :** FR4, FR5, FR6, FR13, FR14

### Épopée 2 : Paul retient et propose, vous décidez

Le dirigeant dit une fois son objectif et son profil, et garde la main sur chaque lancement grâce aux cartes de confirmation.
**FR couvertes :** FR1, FR2, FR3, FR7, FR8, FR15

### Épopée 3 : Paul fait corriger, sans vous noyer

Le dirigeant fait corriger une production en une phrase, reçoit des productions datées et signées de son nom, en quantité maîtrisée.
**FR couvertes :** FR9, FR10, FR11, FR12

Ordre : 1 → 2 → 3. L'épopée 1 donne la lecture d'état dont l'épopée 2 a besoin pour éviter les doublons. L'épopée 3 réutilise les cartes de l'épopée 2. Chaque épopée apporte de la valeur seule.

## Epic 1: Paul dit vrai

Le dirigeant obtient de Paul et de l'interface un état de l'équipe exact et identique, avec la raison claire de tout lancement qui n'a pas eu lieu.

### Story 1.1: Une seule lecture de l'état de l'équipe

En tant que dirigeant,
je veux que Paul et l'interface voient les mêmes actions et exécutions, y compris celles en cours,
afin de ne jamais recevoir un statut faux ou corrigé au message suivant.

**Critères d'acceptation :**

**Étant donné** une action de Martine en `en_cours` avec une exécution `running`
**Quand** Paul appelle `get_current_status`
**Alors** la réponse de l'outil contient cette action avec le statut « en cours » et l'exécution avec sa durée écoulée
**Et** l'action n'est pas dans une liste « à lancer »

**Étant donné** une exécution de Jean-Claude `succeeded` il y a 2 h avec `resultCount = 15`
**Quand** Paul appelle `get_current_status`
**Alors** l'exécution figure avec « 15 éléments à examiner »

**Étant donné** une exécution terminée il y a plus de 24 h
**Quand** l'état est lu
**Alors** elle n'apparaît pas dans les exécutions récentes

**Étant donné** des productions en attente
**Quand** le dirigeant ouvre l'accueil, la page Décisions, ou regarde le badge
**Alors** les trois affichent le même nombre, issu de `getTeamState` (FR13)

**Notes techniques :**
- Créer `src/lib/team-state.ts` : `getTeamState(companyId)` → `{ actions, recentRuns, pendingDecisions }`. Les actions couvrent `propose`, `en_cours` et `lance`. `recentRuns` couvre les dernières 24 h, avec `failureReason` à `null` tant que la story 1.2 n'est pas faite.
- `getCurrentStatus` (`src/lib/agents/co-ceo.ts:86`) remplace `getPlanAndFunnelStatus` par `getTeamState` (garder le suivi des prospects).
- Le badge et l'accueil passent par `pendingDecisions` (aujourd'hui `src/lib/pending-decisions-server.ts`) : une seule fonction de comptage.
- Tests : `getTeamState` sur base de test (Playwright, comme `tests/engine.spec.ts`).

### Story 1.2: Motifs d'échec typés et dits en clair

En tant que dirigeant,
je veux savoir pourquoi un agent n'a pas démarré ou a échoué,
afin de savoir quoi faire, sans qu'un conflit soit présenté comme une panne.

**Critères d'acceptation :**

**Étant donné** une action déjà en cours
**Quand** Paul tente de la lancer à nouveau
**Alors** l'outil renvoie `{ ok: false, reason: "already_running", runId }`
**Et** Paul dit que l'agent y travaille déjà, sans le mot « échec »

**Étant donné** le budget journalier atteint
**Quand** un lancement est demandé
**Alors** le motif est `quota_budget` et le message dit « budget du jour atteint, réessayez demain »

**Étant donné** le quota de lancements atteint
**Quand** un lancement est demandé
**Alors** le motif est `quota_runs`

**Étant donné** un agent qui ne produit rien
**Quand** l'exécution se termine
**Alors** `AgentRun.failureReason = "no_result"` et la carte d'exécution propose « Relancer »

**Étant donné** une erreur technique inattendue
**Quand** elle survient
**Alors** le motif est `outage`, le message est générique et le détail ne part que dans les logs serveur

**Et** aucune réponse de Paul ne contient « ÉCHEC » en majuscules (FR5)

**Notes techniques :**
- Migration : `AgentRun.failureReason String?`.
- `classifyRunError(error): RunFailureReason` dans `src/lib/agents/agent-errors.ts`, seul point de conversion (`AgentRunConflictError` → `already_running`, `AgentRunQuotaError` → `quota_runs` ou `quota_budget` selon le cas, `AgentNoResultError` → `no_result`, sinon `outage`). Distinguer les deux quotas par une propriété de l'erreur, pas par son texte.
- `delegateThroughPlan` (`co-ceo.ts:150`) renvoie du JSON `{ ok, reason, message, runId?, planItemId? }`. Retirer du prompt la règle sur « ÉCHEC » et décrire les motifs.
- Le traitement des runs (`processAgentRun`) écrit `failureReason` en cas d'échec. La carte d'exécution (`src/lib/agent-run-progress.ts`) affiche le message du motif (UX-DR2).
- Tests unitaires de `classifyRunError` ; test de route : quota atteint → 429 avec motif.

### Story 1.3: Le premier audit naît dans le plan

En tant que dirigeant qui vient de finir l'onboarding,
je veux voir Martine au travail dès mon arrivée sur l'accueil,
afin de comprendre que l'audit est lancé et de ne pas le relancer.

**Critères d'acceptation :**

**Étant donné** un nouveau compte qui valide l'onboarding
**Quand** il arrive sur l'accueil
**Alors** une action de Martine « Audit de présence en ligne » existe au plan en `en_cours`, avec une carte d'exécution visible
**Et** l'encart de Martine ne dit plus « Je n'ai pas encore examiné votre présence en ligne »

**Étant donné** cet audit en cours
**Quand** le dirigeant demande un audit à Paul
**Alors** Paul répond que Martine y travaille déjà (motif `already_running`) et ne crée pas de seconde action

**Étant donné** une modification ultérieure du profil dans Entreprise
**Quand** le dirigeant enregistre
**Alors** aucun audit n'est relancé automatiquement

**Notes techniques :**
- Dans `POST /api/companies` (première création seulement), créer l'`ActionPlanItem` (agent `marketing`, thème Visibilité) puis appeler `enqueuePlanRun` (AD-11). En cas de quota, l'entreprise est créée quand même et l'action reste `propose`.
- Supprimer le `fetch("/api/agents/marketing/run")` de `src/components/company-profile-form.tsx:142`.
- Test : la création d'une entreprise produit une action et un run liés.

### Story 1.4: Une action terminée renvoie vers ses productions

En tant que dirigeant,
je veux qu'une action déjà exécutée ne me soit plus présentée « à valider »,
afin de savoir ce qui m'attend vraiment.

**Critères d'acceptation :**

**Étant donné** une action dont l'exécution a réussi avec des productions en attente
**Quand** l'accueil ou le plan l'affichent
**Alors** elle est présentée « à décider » avec un lien vers ses productions, pas « action à valider »

**Étant donné** une action `propose` jamais lancée
**Quand** elle est affichée
**Alors** elle reste « à lancer »

**Étant donné** une action terminée sans production en attente
**Quand** elle est affichée
**Alors** elle est « terminée » et ne figure pas dans « Ce que l'équipe vous a préparé »

**Notes techniques :**
- Les libellés d'action dépendent du statut issu de `getTeamState` (story 1.1) ; repérer les libellés dans `src/lib/action-plan-view.ts` et les composants de l'accueil.
- Tests unitaires sur la fonction de libellé.

## Epic 2: Paul retient et propose, vous décidez

Le dirigeant dit une fois son objectif et son profil, et garde la main sur chaque lancement grâce aux cartes de confirmation.

### Story 2.1: Dire son objectif à Paul et le confirmer en un clic

En tant que dirigeant,
je veux donner mon objectif à Paul dans la conversation et le confirmer d'un clic,
afin de ne plus le ressaisir sur chaque écran.

**Critères d'acceptation :**

**Étant donné** le message « Je veux passer de 140 000 € à 200 000 € de CA par an, panier moyen 18 000 €, 6 cuisines par an »
**Quand** Paul répond
**Alors** une carte de confirmation affiche les valeurs annuelles et leur équivalent mensuel (16 667 €/mois visés, 11 667 €/mois actuels, 18 000 € par client, 0,5 client/mois)
**Et** rien n'est écrit dans `Company` avant le clic

**Étant donné** cette carte
**Quand** le dirigeant clique « Confirmer »
**Alors** `Company.revenueTarget`, `monthlyRevenue`, `averageClientValue`, `newClientsPerMonth` sont enregistrés
**Et** la carte passe à l'état « confirmée »
**Et** l'accueil, le plan, les résultats et Entreprise affichent l'objectif

**Étant donné** la même carte
**Quand** le dirigeant clique deux fois sur « Confirmer »
**Alors** l'écriture n'a lieu qu'une fois

**Étant donné** « Je veux 200 000 € » sans période
**Quand** Paul répond
**Alors** il demande « par mois ou par an ? » et n'affiche aucune carte

**Étant donné** un objectif enregistré
**Quand** le dirigeant demande combien de clients il lui faut
**Alors** Paul cite le résultat de `computeBusinessTarget`, pas un calcul à lui (FR3)

**Étant donné** une carte d'une autre entreprise
**Quand** son identifiant est confirmé par un autre compte
**Alors** la route répond 404 (NFR2)

**Étant donné** une carte non confirmée depuis 24 h
**Quand** le dirigeant clique
**Alors** elle est « expirée » et rien n'est écrit

**Notes techniques :**
- Migration : modèle `PaulPendingAction` (`id`, `companyId`, `chatMessageId`, `type`, `payload Json`, `status`, `createdAt`, `decidedAt`, `expiresAt`).
- `src/lib/agents/pending-actions.ts` : création (avec annulation de l'intention `pending` de même type) et exécution par type. Ici, seulement `update_objective`.
- Outil de Paul `propose_objective_update` : entrée `{ targetAmount, currentAmount?, period, targetDate?, averageClientValue?, newClientsPerYear? }` (AD-15).
- `toMonthly` dans `src/lib/business-target.ts`, testé unitairement (200 000 €/an → 16 667 €).
- Route `POST /api/co-ceo/pending-actions/[id]` `{ decision: "confirm" | "cancel" }` : transition atomique `updateMany where status = pending`.
- Le message de Paul est enregistré avant la création de l'intention, pour avoir le `chatMessageId`. Si le texte final est produit après les outils, rattacher les intentions du tour au message enregistré.
- Le panneau (`src/components/paul-panel.tsx`) rend les cartes depuis les `PaulPendingAction` du message (UX-DR1), jamais depuis le texte. L'historique du chat les renvoie avec les messages.
- Le prompt de Paul : demander la période si elle manque ; ne jamais calculer un chiffre affiché.

### Story 2.2: Faire enregistrer son profil par Paul

En tant que dirigeant,
je veux dire à Paul mon Instagram, mon site ou mes horaires et les confirmer d'un clic,
afin que les agents les utilisent tout de suite.

**Critères d'acceptation :**

**Étant donné** « Mon Instagram c'est @atelierlumen.nantes »
**Quand** Paul répond
**Alors** une carte propose « Compte Instagram ou Facebook : @atelierlumen.nantes »

**Étant donné** la confirmation
**Quand** Martine est lancée ensuite
**Alors** son contexte contient `socialHandles = @atelierlumen.nantes`

**Étant donné** une demande de changer le nom commercial, le métier ou la zone
**Quand** Paul répond
**Alors** il renvoie vers la page Entreprise sans proposer de carte

**Notes techniques :**
- Type d'intention `update_profile`, champs autorisés : `website`, `socialHandles`, `phone`, `openingHours`, `description`, validés par les mêmes limites zod que `POST /api/companies`.
- Réutiliser la fonction d'écriture du profil de `src/app/api/companies/route.ts` (l'extraire dans `src/lib` si elle est dans la route).

### Story 2.3: Paul propose le lancement, le dirigeant lance

En tant que dirigeant,
je veux que Paul me propose de lancer un agent et attende mon clic,
afin de garder la main sur ce qui est engagé et dépensé.

**Critères d'acceptation :**

**Étant donné** un message du dirigeant sur ses priorités
**Quand** Paul juge utile de faire travailler Jean-Claude
**Alors** il crée l'action au plan en `propose` et affiche une carte « Lancer Jean-Claude : {titre} · Lancer / Plus tard »
**Et** aucune exécution n'existe en base avant le clic

**Étant donné** la carte
**Quand** le dirigeant clique « Lancer »
**Alors** l'exécution part par `enqueuePlanRun`, comme le bouton du plan, et la carte d'exécution apparaît

**Étant donné** la carte
**Quand** le dirigeant clique « Plus tard »
**Alors** l'action reste au plan en « à lancer »

**Étant donné** « lance Jean-Claude sur les architectes »
**Quand** Paul répond
**Alors** la carte s'affiche, déjà préremplie (règle validée par les PF)

**Étant donné** le panneau de Paul et le prompt système
**Quand** ils présentent Paul
**Alors** le titre est « Partenaire de croissance », jamais « Votre copilote » (FR15)

**Notes techniques :**
- `delegate_marketing`, `delegate_contenu` et `delegate_demarchage` deviennent `propose_launch_*` : ils créent ou reprennent l'action, puis une intention `launch_plan_item` (`planItemId`, `extras`). L'exécution à la confirmation appelle `enqueuePlanRun` et renvoie le motif de la story 1.2 en cas de refus.
- Le prompt de Paul : il propose, il ne dit jamais « c'est lancé » avant la confirmation ; au plus 3 cartes par message (NFR4).
- En-tête du panneau : `PERSONAS.co_ceo.title`.

### Story 2.4: Pas d'action en double

En tant que dirigeant,
je veux que Paul reprenne une action existante plutôt que d'en créer une nouvelle,
afin de ne pas trier moi-même des doublons.

**Critères d'acceptation :**

**Étant donné** une action Jean-Claude « Prospection » en `propose` ou `en_cours`
**Quand** Paul propose une nouvelle prospection
**Alors** la carte cible l'action existante, et aucune nouvelle `ActionPlanItem` n'est créée

**Étant donné** cette action en `en_cours`
**Quand** le dirigeant clique « Lancer »
**Alors** il est renvoyé vers l'exécution en cours (motif `already_running`)

**Étant donné** une action Jean-Claude terminée
**Quand** Paul propose une nouvelle prospection
**Alors** une nouvelle action est créée

**Notes techniques :**
- `createChatPlanItem` (`src/lib/agents/plan-items.ts`) cherche d'abord une action `propose` ou `en_cours` de même `agent` et même `theme` et la renvoie (AD-16). Le faire dans une transaction pour éviter deux créations concurrentes.
- Test : deux appels successifs → une seule action.

## Epic 3: Paul fait corriger, sans vous noyer

Le dirigeant fait corriger une production en une phrase, reçoit des productions datées et signées de son nom, en quantité maîtrisée.

### Story 3.1: Date du jour et nom du dirigeant pour tous les agents

En tant que dirigeant,
je veux que les agents connaissent la date et mon nom,
afin de recevoir des propositions à jour et signées de mon nom.

**Critères d'acceptation :**

**Étant donné** l'onboarding
**Quand** le dirigeant le remplit
**Alors** il saisit son prénom et son nom (facultatif), modifiable ensuite dans Entreprise et enregistrable par Paul (type `update_profile`, champ `ownerName`)

**Étant donné** `ownerName = "Samuel Morel"`
**Quand** Jean-Claude produit un modèle d'email
**Alors** il est signé « Samuel Morel », jamais « Paul » ni un autre agent

**Étant donné** aucun nom renseigné
**Quand** un email est produit
**Alors** la signature est « [Votre prénom et nom] »

**Étant donné** la date du 22 octobre 2026
**Quand** Jean-Claude propose des pistes d'événements
**Alors** aucune n'a une date de fin antérieure au 22 octobre 2026

**Étant donné** la question « Le salon commence le 30 octobre, c'est dans combien de jours ? »
**Quand** Paul répond
**Alors** il répond 8 jours sans réserve

**Notes techniques :**
- Migration : `Company.ownerName String?`.
- `runtimeContextLines(company, now)` dans `src/lib/agents/personas.ts` (date au format français, fuseau Europe/Paris, nom du dirigeant). Elle est injectée hors du bloc système mis en cache : bloc dynamique pour le plan et les agents, contexte du dernier message pour le chat (AD-13).
- `propose_growth_lead` reçoit un `eventEndDate` facultatif ; l'outil refuse une date passée.
- Test unitaire de `runtimeContextLines` avec une date fixée.

### Story 3.2: Des exécutions plafonnées

En tant que dirigeant,
je veux recevoir peu de productions à chaque passage d'un agent,
afin de décider vite.

**Critères d'acceptation :**

**Étant donné** les plafonds `RUN_CAPS` (5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats, validés par les PF)
**Quand** un agent tente d'écrire au-delà pour une exécution
**Alors** l'outil n'écrit pas et répond au modèle que le plafond est atteint

**Étant donné** le scénario Atelier Lumen (deux messages à Paul, lancements confirmés)
**Quand** il est rejoué
**Alors** au plus 12 décisions sont en attente (SM-2)

**Notes techniques :**
- `src/lib/agents/run-caps.ts` : `RUN_CAPS` par `kind` et un compteur par `agentRunId` (requête `count` sur `AgentProposal` / `AuditFinding` du run).
- Appliquer le plafond dans chaque outil d'écriture de `marketing.ts`, `contenu.ts` et `demarchage.ts`. Rappeler les plafonds dans les prompts.
- Tests : l'outil refuse la 6e écriture de prospect pour un run.

### Story 3.3: Faire réviser une production par Paul

En tant que dirigeant,
je veux demander une correction en une phrase,
afin d'obtenir une version corrigée de la même production sans tout relancer.

**Critères d'acceptation :**

**Étant donné** un email de Jean-Claude en attente, version 1, ouvert avec « Échanger avec Paul »
**Quand** le dirigeant écrit « Retire l'avertissement du corps du mail »
**Alors** Paul affiche une carte « Demander à Jean-Claude une version 2 avec cette consigne · Confirmer / Annuler »

**Étant donné** la confirmation
**Quand** l'exécution de révision se termine
**Alors** la même production passe en version 2 avec le contenu corrigé
**Et** aucune nouvelle production n'est créée
**Et** « Voir la version précédente » affiche la version 1 (UX-DR3)

**Étant donné** une production approuvée, rejetée ou exécutée
**Quand** le dirigeant demande une révision
**Alors** Paul explique qu'elle ne peut plus être révisée et ne propose pas de carte

**Étant donné** une révision en cours sur cette production
**Quand** une seconde révision est confirmée
**Alors** le motif est `already_running`

**Étant donné** une révision
**Quand** elle est lancée
**Alors** elle compte dans le quota et le budget comme une exécution

**Notes techniques :**
- Migration : modèle `ProposalRevision` (`id`, `proposalId`, `fromVersion`, `previousContent`, `instruction`, `agentRunId`, `createdAt`).
- Payload d'`AgentRun` `{ kind: "revision", proposalId, fromVersion, instruction }`, clé active `revision:{proposalId}`. Ajouter la branche dans `processAgentRun` et une fonction `enqueueRevisionRun` dans `src/lib/agent-runs.ts`.
- Chaque agent reçoit un outil `revise_proposal({ content })` dans un mode révision : prompt court avec le contenu actuel et la consigne. L'écriture vérifie `version === fromVersion`, enregistre `ProposalRevision`, puis passe à `version + 1`.
- Intention de Paul `revise_proposal` (`proposalId`, `instruction`).
- Affichage de la version précédente dans la vue de la production (`src/lib/validation-queue.ts` et composant de relecture).

### Story 3.4: Recette du scénario Atelier Lumen

En tant que pères fondateurs,
nous voulons rejouer automatiquement le scénario du test du 22 octobre,
afin de vérifier que Paul reste fiable à chaque livraison.

**Critères d'acceptation :**

**Étant donné** une entreprise de test Atelier Lumen
**Quand** `tests/paul-fiable.spec.ts` appelle directement les outils de Paul et les routes de confirmation, sans modèle
**Alors** il vérifie : objectif enregistré après confirmation (SM-1), aucune action en double, motifs d'échec corrects, au plus 12 décisions (SM-2), aucune exécution sans clic (SM-3)

**Étant donné** la recette manuelle décrite dans `docs/bmad/implementation/recette-paul-fiable.md`
**Quand** un PF la rejoue en local avec le vrai modèle
**Alors** Paul ne corrige aucun statut d'un message à l'autre

**Notes techniques :**
- Exposer les fabriques d'outils de Paul (`buildPaulTools(companyId)`) pour les appeler sans modèle.
- Ajouter le script `test:paul` dans `package.json` et à la CI.
- Rédiger la recette manuelle (pas à pas reprenant les messages du rapport de test).

## Validation finale

- Couverture : FR1 à FR15 couvertes (carte ci-dessus) ; UX-DR1 (2.1), UX-DR2 (1.2), UX-DR3 (3.3).
- Entités créées à la première story qui en a besoin : `failureReason` (1.2), `PaulPendingAction` (2.1), `ownerName` (3.1), `ProposalRevision` (3.3).
- Dépendances : chaque story ne s'appuie que sur les précédentes. 1.3 utilise le motif de 1.2 ; 2.3 et 2.4 utilisent 1.1 et 1.2 ; 3.1 étend `update_profile` de 2.2 ; 3.3 utilise les intentions de 2.1.
- Fichiers communs : `co-ceo.ts` est modifié par 1.1, 1.2, 2.1, 2.3 et 3.3. Le découpage en trois épopées est gardé quand même : chaque épopée est livrable seule et apporte un retour terrain avant la suivante.
