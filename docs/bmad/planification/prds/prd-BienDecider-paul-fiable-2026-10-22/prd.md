---
title: Paul fiable
status: final
created: 2026-10-22
updated: 2026-10-22
---

# PRD : Paul fiable

*Épopée de BienDecider. Brouillon à valider par les PF.*

## 0. Objet du document

Ce PRD s'adresse aux pères fondateurs (PF) et aux étapes BMAD suivantes : spine d'architecture de l'épopée, puis épopées et stories. Il part du test en production du 22 octobre 2026 ([BienDecider-test-entrepreneur-2026-10-22.md](../../../../../BienDecider-test-entrepreneur-2026-10-22.md)). Le vocabulaire suit le glossaire (§3). Les hypothèses sont balisées `[ASSUMPTION]` et reprises au §9. Il complète la [charte](../../../../charte.md) et le [spine du socle existant](../../architecture/architecture-BienDecider-2026-10-22/ARCHITECTURE-SPINE.md), sans les répéter.

## 1. Vision

Aujourd'hui, Paul répond bien mais n'agit pas sur ce qu'on lui dit. Il ne connaît pas l'état réel de l'équipe et il lance du travail sans demander. Le dirigeant finit par ne plus le croire.

Avec cette épopée, Paul devient fiable sur trois points :
- **ce que vous lui dites est retenu** : objectif, chiffres et profil sont enregistrés après votre confirmation ;
- **ce qu'il vous dit est vrai** : il lit l'état réel des actions et des exécutions, et nomme correctement un conflit, un quota ou une panne ;
- **il propose, vous lancez** : rien ne démarre sans votre clic.

Il sait aussi corriger une production à votre demande, il connaît la date du jour et votre nom, et il n'inonde pas votre file de décisions.

C'est la condition pour tenir la promesse « Vous décidez. Votre activité avance. » : on ne délègue pas à quelqu'un qu'il faut sans cesse vérifier.

## 2. Utilisateur cible

### 2.1 Jobs To Be Done

- Quand je dis quelque chose d'important à Paul (mon objectif, mes chiffres, mon Instagram), je veux qu'il le retienne une fois pour toutes, pour ne pas le répéter à chaque écran.
- Quand je demande où en est l'équipe, je veux une réponse vraie du premier coup, pour décider sans vérifier moi-même.
- Quand Paul veut faire travailler un agent, je veux donner mon accord avant, pour garder la main sur ce qui est engagé.
- Quand une production est presque bonne, je veux la faire corriger en une phrase, sans tout relancer.
- Quand j'ouvre mes décisions, je veux trouver peu de choses, sans doublon, pour décider vite.

### 2.2 Hors cible (cette épopée)

- Le dirigeant qui veut un agent totalement autonome : l'épopée renforce au contraire la décision humaine.

### 2.3 Parcours clés

- **UJ-1. Samuel donne son objectif à Paul et ne le répète plus.**
  - **Persona et contexte :** Samuel Morel, ébéniste à Nantes (Atelier Lumen), 6 cuisines par an, vise 200 000 € de chiffre d'affaires annuel.
  - **Entrée :** il vient de finir l'onboarding ; l'accueil affiche « Quel résultat voulez-vous atteindre ? ». Il clique « En parler avec Paul ».
  - **Parcours :** il écrit son objectif en une phrase. Paul répond par une carte de confirmation : « J'enregistre : CA visé 200 000 €/an (16 667 €/mois), CA actuel 140 000 €/an, valeur moyenne d'un client 18 000 €, 0,5 nouveau client/mois. Confirmer / Corriger ». Samuel confirme.
  - **Moment clé :** l'accueil affiche aussitôt son objectif et l'écart calculé. Paul cite le bon chiffre : environ 3 à 4 cuisines de plus par an.
  - **Fin :** l'objectif apparaît identique sur l'accueil, le plan, les résultats et la page Entreprise.
  - **Cas limite :** si Samuel écrit « 200 000 » sans dire mois ou an, Paul demande la période avant de proposer la carte.

- **UJ-2. Samuel demande où en est l'équipe et obtient la vérité.**
  - **Entrée :** une action de Martine est en cours, une de Jean-Claude est terminée, une de Camille a échoué faute de budget.
  - **Parcours :** il demande « Où en est l'équipe ? ».
  - **Moment clé :** Paul répond « Martine travaille sur l'audit depuis 40 s. Jean-Claude a terminé : 15 éléments à examiner. Camille n'a pas pu démarrer : le budget du jour est atteint, réessayez demain. »
  - **Fin :** aucune correction de Paul au message suivant. Ce qu'il dit correspond aux cartes d'exécution affichées par l'interface.

- **UJ-3. Paul propose de lancer Jean-Claude, Samuel décide.**
  - **Parcours :** Paul estime qu'il faut chercher des prescripteurs. Il ajoute l'action au plan en « à lancer » et affiche dans le chat « Lancer Jean-Claude : Prescripteurs nantais. Lancer / Plus tard ». Samuel clique « Lancer ».
  - **Moment clé :** la carte d'exécution apparaît. Paul dit qu'elle est lancée parce que l'interface a confirmé le lancement.
  - **Cas limite :** si une action équivalente est déjà au plan, Paul propose de lancer celle-là au lieu d'en créer une seconde.

- **UJ-4. Samuel fait corriger un email par Paul.**
  - **Parcours :** depuis l'email de Jean-Claude, il ouvre Paul et écrit « Signe avec mon nom, Samuel Morel, et retire l'avertissement du corps du mail ». Paul propose « Demander à Jean-Claude une version 2 avec cette consigne. Confirmer ».
  - **Moment clé :** la version 2 arrive sur la même production, avec un historique de versions. Aucune nouvelle production n'est créée à côté.

## 3. Glossaire

- **Dirigeant** : la personne connectée, propriétaire de l'entreprise. Il a un nom (`nom du dirigeant`).
- **Profil** : informations déclarées de l'entreprise, dont le nom du dirigeant et les comptes sociaux.
- **Objectif** : chiffre d'affaires visé, avec sa période d'expression (mois ou an), sa date cible et la situation actuelle. Stocké en valeurs mensuelles.
- **Carte de confirmation** : élément interactif affiché dans le chat par Paul, qui décrit une écriture ou un lancement et attend un clic du dirigeant (Confirmer / Corriger, ou Lancer / Plus tard). Rien n'est écrit ni lancé avant ce clic.
- **Action** : élément du plan (`ActionPlanItem`), confiée à un agent. Statuts : à lancer, en cours, à décider, terminée, écartée.
- **Exécution** : un passage d'un agent sur une action ou en direct (`AgentRun`). Statuts : en file, en cours, réussie, échouée.
- **Motif d'échec** : raison typée d'une exécution non lancée ou échouée : déjà en cours, quota atteint, budget atteint, rien produit, panne.
- **Production** : ce qu'un agent propose et que le dirigeant décide (`AgentProposal`), avec ses versions.
- **Révision** : nouvelle version d'une production, demandée par le dirigeant avec une consigne.
- **État de l'équipe** : vue unique des actions et des exécutions récentes, lue par Paul et par l'interface.

## 4. Fonctionnalités

### 4.1 Paul retient ce que le dirigeant lui dit

**Description :** quand le dirigeant donne à Paul un objectif, des chiffres ou une information de profil, Paul propose une carte de confirmation. Au clic, l'information est enregistrée et visible partout. Réalise UJ-1.

#### FR-1 : Enregistrer l'objectif depuis le chat

Le dirigeant peut faire enregistrer son objectif en le disant à Paul, après confirmation. Réalise UJ-1.

**Conséquences (testables) :**
- Une phrase contenant un CA visé déclenche une carte de confirmation avec les valeurs extraites ; rien n'est écrit avant le clic.
- Après « Confirmer », `Company` contient les valeurs mensuelles. Un objectif annuel de 200 000 € est stocké 16 667 €/mois (arrondi à l'euro).
- Après confirmation, l'accueil, le plan, les résultats et la page Entreprise affichent le même objectif au prochain affichage de la page ; l'accueil ouvert derrière le panneau se met à jour sans action du dirigeant.
- Sans période explicite, Paul demande « par mois ou par an ? » et n'affiche pas de carte.
- « Corriger » rouvre la saisie dans le chat ; aucune écriture.

#### FR-2 : Enregistrer une information de profil depuis le chat

Le dirigeant peut faire enregistrer par Paul son site, ses comptes sociaux, son téléphone, ses horaires et sa description, après confirmation.

**Conséquences :**
- Même mécanique de carte de confirmation que FR-1.
- Après confirmation, le prochain passage de Martine lit la nouvelle valeur.

**Hors périmètre :** nom commercial, métier et zone de chalandise restent modifiables seulement dans Entreprise (champs structurants).

#### FR-3 : Paul calcule à partir des chiffres enregistrés

Paul cite l'écart et le nombre de clients nécessaires tels que calculés par le code, jamais calculés par lui.

**Conséquences :**
- Pour Atelier Lumen (140 k€ → 200 k€/an, 18 k€ par client), Paul cite « environ 3 à 4 clients de plus par an », ou l'équivalent mensuel du calcul déterministe.
- Si l'objectif n'est pas enregistré, Paul le dit et propose FR-1 au lieu d'estimer.

### 4.2 Paul dit l'état réel de l'équipe

**Description :** Paul et l'interface lisent la même source d'état, qui inclut les actions en cours et les exécutions récentes avec leur motif d'échec. Réalise UJ-2.

#### FR-4 : État de l'équipe complet

Paul a accès aux actions de tous les statuts actifs (à lancer, en cours, à décider) et aux exécutions des dernières 24 h avec leur statut, leur durée et leur motif d'échec.

**Conséquences :**
- Une action en cours est citée comme en cours ; Paul ne crée pas d'action équivalente pour le même agent.
- Une exécution terminée est citée avec son nombre d'éléments à examiner.
- Rejouer le scénario Atelier Lumen ne produit aucun message de Paul qui corrige un statut annoncé au message précédent.

#### FR-5 : Motifs d'échec distingués

Quand un lancement ne se fait pas ou échoue, le motif d'échec est typé et dit au dirigeant en clair.

**Conséquences :**
- « Déjà en cours » : Paul renvoie vers l'exécution existante ; pas de mot « échec ».
- « Quota atteint » ou « budget atteint » : Paul dit lequel et quand réessayer.
- « Rien produit » : Paul dit que l'agent n'a rien produit et propose de relancer.
- « Panne » : message générique, détail technique dans les logs seulement.
- Le mot « ÉCHEC » en majuscules n'apparaît jamais dans une réponse au dirigeant.

#### FR-6 : L'onboarding passe par le plan

Le premier audit lancé à la fin de l'onboarding est une action de Martine au plan, en cours, visible sur l'accueil dès l'arrivée.

**Conséquences :**
- Juste après « Valider et lancer mon audit », l'accueil affiche une carte d'exécution de Martine en cours, et non « Je n'ai pas encore examiné votre présence en ligne ».
- Paul voit cette action en cours (FR-4) et ne relance pas un audit.

#### FR-16 : Paul situe chaque état dans le temps

*Ajoutée le 2026-10-23 après le second test en production.* Paul distingue un changement survenu depuis son dernier message (annoncé comme une mise à jour) d'une erreur de sa part (corrigée explicitement).

**Conséquences :**
- Une exécution terminée depuis le message précédent est annoncée « depuis mon dernier message, X a terminé », jamais « c'était faux ».
- Paul lit l'heure de chaque exécution et l'heure de son message précédent.

#### FR-18 : Aucune fausse rectification

*Ajoutée le 2026-10-24 après le troisième test en production.* Un état qui a changé après l'un des messages de Paul, même s'il ne s'agit pas du dernier, est une mise à jour : Paul ne le présente jamais comme une erreur.

**Conséquences :**
- Paul sait, pour chaque exécution et chaque action, après lequel de ses messages elle a changé.
- « Je rectifie », « je dois corriger », « c'était faux » sont réservés aux états qui n'ont pas changé depuis le message qui les annonçait.

### 4.3 Paul propose, le dirigeant lance

**Description :** les délégations depuis le chat créent ou reprennent une action en « à lancer » et affichent une carte « Lancer / Plus tard ». Réalise UJ-3.

#### FR-7 : Lancement sur clic du dirigeant

Paul ne lance aucune exécution lui-même ; le lancement part du clic du dirigeant sur la carte.

**Conséquences :**
- Après un message du dirigeant qui ne demande pas explicitement un lancement, aucune nouvelle exécution n'existe en base.
- « Lancer » déclenche l'exécution par le même chemin que le bouton du plan ; un double clic ne crée qu'une exécution.
- « Plus tard » laisse l'action au plan en « à lancer ».
- Une demande explicite (« lance Jean-Claude ») affiche quand même la carte, déjà préremplie. (validé par les PF le 2026-10-22 : une règle unique.)

#### FR-8 : Pas d'action en double

Paul reprend une action existante équivalente (même agent, à lancer ou en cours) au lieu d'en créer une nouvelle.

**Conséquences :**
- Le scénario Atelier Lumen produit au plus une action par agent et par sujet.

### 4.4 Paul fait réviser une production

**Description :** le dirigeant demande une correction en une phrase ; Paul propose une révision ; l'agent produit une nouvelle version de la même production. Réalise UJ-4.

#### FR-9 : Demander une révision depuis le chat

Le dirigeant peut, depuis une production ou en la citant, demander à Paul une correction ; après confirmation, l'agent auteur produit une version suivante de cette production.

**Conséquences :**
- La production garde son identifiant ; sa version passe de N à N+1 ; la version précédente reste consultable depuis la production.
- Aucune nouvelle production n'est créée à côté.
- Une production déjà approuvée, rejetée ou exécutée ne peut pas être révisée ; Paul le dit.
- La révision compte comme une exécution (quota, budget, carte d'exécution).

**Hors périmètre :** la modification manuelle existante (« Modifier ») reste inchangée.

### 4.5 Contexte : date, nom du dirigeant

#### FR-10 : Date du jour connue des agents

Paul et les agents connaissent la date du jour (fuseau Europe/Paris).

**Conséquences :**
- Paul calcule « dans 8 jours » sans réserve.
- Jean-Claude ne propose aucun événement dont la date de fin est passée.

#### FR-11 : Nom du dirigeant

Le dirigeant renseigne son prénom et son nom (onboarding, modifiable dans Entreprise, enregistrable via FR-2) ; les agents l'utilisent pour signer.

**Conséquences :**
- Un email de prospection est signé du nom du dirigeant ; jamais « Paul » ni un autre agent.
- Sans nom renseigné, la signature est `[Votre prénom et nom]` et Paul propose de l'enregistrer.

### 4.6 Volume maîtrisé

#### FR-12 : Plafond par exécution

Chaque exécution produit au plus un nombre borné de productions par type. Plafonds validés par les PF le 2026-10-22 : 5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats par exécution.

**Conséquences :**
- Le scénario Atelier Lumen (deux messages à Paul) laisse au plus 12 décisions en attente.

#### FR-13 : Un seul compteur de décisions

Le badge Décisions, l'accueil et la page Décisions affichent le même nombre, issu d'une même fonction.

#### FR-14 : Statut d'action cohérent

Une action dont l'exécution est terminée n'est plus présentée comme « action à valider » ; elle renvoie vers ses productions.

#### FR-17 : Parler à Paul ne consomme pas les lancements

*Ajoutée le 2026-10-24 après le troisième test en production :* 7 messages, l'audit, une exécution et une révision épuisaient le quota de 10 lancements par jour.

**Conséquences :**
- Les messages à Paul et « Préremplir mon profil » ne réduisent pas les lancements d'agents disponibles : deux compteurs, 50 messages à Paul par jour et 500 par mois ; lancements 10 et 100 (question ouverte 4, tranchée).
- Le plafond de dépense reste la limite de coût.
- Le jour se compte en heure de Paris ; un message de limite dit quand réessayer, sans renvoyer vers l'administrateur.

### 4.7 Identité de Paul

#### FR-15 : Un seul titre

Paul est « Partenaire de croissance » partout, y compris l'en-tête du panneau et le prompt système.

## 5. Non-objectifs

- Paul ne devient pas autonome : aucune écriture ni aucun lancement sans clic.
- Paul n'édite pas lui-même le texte d'une production ; il fait réviser par l'agent auteur.
- Pas de nouvel agent, pas de nouveau canal.
- Pas de refonte de l'interface de Décisions (retour F de la refonte UX, traité ailleurs).

## 6. Périmètre

### 6.1 Inclus

FR-1 à FR-18.

### 6.2 Exclu de l'épopée

- Prospects déplacés de Productions vers Prospection (V3) : retour F de la refonte.
- Qualité rédactionnelle des agents : objet en double, avertissement RGPD dans le corps, constats recopiés (Q2 à Q5).
- Erreur 503 de « Préremplir mon profil » (O1) : bug à diagnostiquer avec les logs Vercel, traité hors épopée.
- Finitions d'interface I2 à I6.

## 7. Indicateurs de succès

**Principal**
- **SM-1** : sur le scénario Atelier Lumen rejoué, zéro correction de statut par Paul et zéro information redemandée après confirmation. Valide FR-1, FR-4, FR-5.

**Secondaires**
- **SM-2** : au plus 12 décisions en attente après le scénario, zéro doublon. Valide FR-8, FR-12.
- **SM-3** : 100 % des exécutions issues du chat ont un clic « Lancer » du dirigeant. Valide FR-7.
- **SM-4** : sur les productions corrigées par le dirigeant, au moins 70 % le sont par révision plutôt que par rejet suivi d'une relance (mesuré sur les 30 jours après mise en production). Valide FR-9.

**Contre-indicateurs**
- **SM-C1** : nombre de cartes de confirmation par conversation. Trop de cartes rend Paul pénible ; au-delà de 3 par message, regrouper. Contrebalance SM-3.
- **SM-C2** : coût modèle par conversation. La lecture de l'état et les révisions ne doivent pas doubler ce coût. Contrebalance FR-4 et FR-9.

## 8. Questions ouvertes

1. ~~Une demande explicite passe-t-elle par la carte ?~~ Tranché le 2026-10-22 par les PF : oui (FR-7).
2. ~~Valeurs des plafonds par exécution ?~~ Tranché le 2026-10-22 par les PF : 5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats (FR-12).
3. Faut-il que Paul puisse écarter une action ou rejeter une production en conversation ? Proposition : non dans cette épopée.
4. ~~Forme et valeurs du quota des messages à Paul (FR-17) ?~~ Tranché le 2026-10-24 par les PF : deux compteurs, 50 messages à Paul par jour et 500 par mois, « Préremplir » compris ; lancements inchangés (10 et 100) ; voir la [proposition de changement du 2026-10-24](../../sprint-change-proposal-2026-10-24.md).

## 9. Index des hypothèses

Toutes validées par les PF le 2026-10-22.

- §4.3 FR-7 : même une demande explicite passe par la carte de confirmation.
- §4.6 FR-12 : plafonds par exécution proposés (5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats).
- Glossaire : l'objectif est stocké en valeurs mensuelles ; la conversion depuis l'année est faite par le code.
- FR-11 : le nom du dirigeant est un nouveau champ du profil.
