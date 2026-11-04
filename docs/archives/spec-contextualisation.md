> **Archivé le 2026-11-04** : ce document ne décrit plus la cible du produit. Voir la [cible produit](../cible-produit.md) et l'[index des archives](README.md).

# Spec fonctionnelle — Parcours de contextualisation

## Objectif

Permettre à un indépendant/TPE multi-métier de configurer son compte en un minimum de temps et d'effort, pour que les agents disposent du contexte nécessaire à leurs premières propositions. Contrainte centrale : la cible manque de temps ET de compétence marketing — chaque étape doit se justifier par une valeur immédiate, pas par de l'exhaustivité.

**Cible V1 (pilote) : 2-3 métiers** à choisir parmi kiné, plombier, installateur de panneaux solaires (à confirmer en V2 du cadrage), pour calibrer les premiers "packs de contexte" avant extension.

## Principe directeur

> Collecter le minimum vital pour la première proposition d'action utile, puis enrichir le contexte progressivement au fil de l'usage (l'agent apprend en continu, pas tout en un seul écran).

## Étapes du parcours

### 1. Identification du métier
- Sélection du métier dans une liste (packs de contexte disponibles) ou saisie libre si métier non couvert (→ fallback générique, à tracker pour prioriser les prochains packs).
- Détermine : vocabulaire, canaux pertinents par défaut, exemples de contenus pré-chargés pour les agents.

### 2. Informations essentielles de l'entreprise
- Nom commercial, zone de chalandise (ville/rayon km), ton de communication souhaité (3-4 choix type "pro/rassurant", "convivial/proximité", "technique/expert").
- Pas de formulaire long : questions fermées ou à choix, pas de champs libres non guidés.

### 3. Connexion des canaux existants (optionnelle à ce stade, mais mise en avant)
- Fiche Google Business Profile
- Compte Instagram / Facebook professionnel
- Boîte email professionnelle (pour les actions de démarchage)
- Chaque connexion est indépendante et peut être faite plus tard depuis le cockpit — ne pas bloquer l'onboarding si l'utilisateur n'a pas ses identifiants sous la main.

### 4. Calibrage rapide des agents (3-5 questions max)
- Exemples : "Avez-vous déjà une fiche Google à jour ?", "Publiez-vous déjà sur les réseaux sociaux ?", "Démarchez-vous déjà des prospects par email ?"
- Objectif : prioriser quelles premières propositions d'action seront les plus utiles (ne pas proposer de refaire une fiche Google déjà impeccable).

### 5. Écran de confirmation + première série de propositions
- Résumé du contexte collecté (modifiable).
- Génération immédiate de 2-3 premières propositions d'action par les agents concernés, en attente de validation — pour matérialiser la valeur dès la fin de l'onboarding.

## Durée cible

Moins de 5 minutes pour les étapes 1-2-4 (hors connexions de comptes tiers, qui peuvent être différées).

## Données collectées (V1)

| Donnée | Obligatoire | Usage |
|---|---|---|
| Métier | Oui | Sélection du pack de contexte |
| Nom commercial | Oui | Personnalisation des contenus générés |
| Zone de chalandise | Oui | Ciblage des propositions (local SEO, démarchage géolocalisé) |
| Ton de communication | Oui | Calibrage du style des contenus générés |
| Connexions canaux (Google/Insta/email) | Non (différable) | Permet l'exécution des actions proposées sur ces canaux |
| Réponses de calibrage (3-5 questions) | Oui | Priorisation des premières propositions |

## Points d'attention (à valider avant implémentation)

- **RGPD / démarchage par email** : la collecte et l'usage de données de prospects via l'agent "démarchage" relève potentiellement de règles spécifiques (consentement, opt-out, finalité). À faire valider par un Délégué à la Protection des Données / expert conformité avant d'industrialiser cette fonctionnalité — hors périmètre de cette spec produit.
- **Connexions de comptes tiers** (Google, Meta) : chaque plateforme a ses propres contraintes d'accès API et de revue d'application, à cartographier avant de promettre la fonctionnalité en onboarding.
- **Fallback métier non couvert** : définir l'expérience minimale (pack générique) pour ne pas bloquer l'inscription d'un métier non encore supporté.

## Hors scope V1

- Import automatique de données existantes (ex: scraping de la fiche Google pour pré-remplir).
- Onboarding multi-utilisateurs (équipe) — V1 = un compte = un indépendant.
- Personnalisation avancée du ton par canal (un seul ton global pour tous les agents en V1).
