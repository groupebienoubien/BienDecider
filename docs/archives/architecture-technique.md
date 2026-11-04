> **Archivé le 2026-11-04** : ce document ne décrit plus la cible du produit. Voir la [cible produit](../cible-produit.md) et l'[index des archives](README.md).

# Architecture technique (V1) — rôle CTO

> **Document historique.** Décrit la décision CTO initiale (avant Postgres/Vercel, avant la réorganisation en 4 agents). Pour l'architecture actuelle, voir **[architecture.md](../architecture.md)**.

Référence : [spec-contextualisation.md](spec-contextualisation.md), [agents-roster.md](agents-roster.md), [process-build-agentique.md](../process-build-agentique.md).

## 1. Choix de la surface agentique

Trois façons de construire un système multi-agents avec l'API Claude, pour un même besoin ("plusieurs agents spécialisés proposent des actions, exécutées seulement après validation humaine, sur des intégrations externes type Google Business Profile / Instagram / email") :

| Option | Description | Pertinence pour Pepito |
|---|---|---|
| **Managed Agents (Anthropic)** | Anthropic héberge la boucle agent + un sandbox (bash/fichiers/exécution de code) par session. | Non retenu — pensé pour des agents qui manipulent un environnement de fichiers/bash. Nos agents n'ont pas besoin d'un sandbox : ils appellent des API métier (Google, Meta, email). |
| **Claude Agent SDK** | Claude Code packagé en librairie (outils fichiers/bash intégrés). | Non retenu — conçu pour des agents de type "codeur", pas pour un produit SaaS orienté métier. |
| **Claude API + Tool Runner** | On définit nos propres outils (ex: `draft_gbp_update`, `draft_social_post`, `draft_prospecting_email`), le SDK gère la boucle d'appel. | **Retenu.** Contrôle total sur l'exécution (on héberge nous-mêmes l'exécution réelle des actions, après validation), pas de dépendance à un sandbox qu'on n'utilise pas. |

**Décision : Claude API + Tool Runner (TypeScript), pas de Managed Agents, pas de Claude Agent SDK.**

Chaque agent du roster (Visibilité locale, Communication, Démarchage) = un prompt système + un sous-ensemble d'outils dédiés qui **proposent** une action (créent un brouillon en base) plutôt que d'exécuter directement. L'exécution réelle (appel API Google/Meta/email) est un code applicatif classique, déclenché uniquement après validation humaine dans le cockpit — jamais depuis l'intérieur de la boucle agent elle-même. Ce découpage strict proposition/exécution est le garde-fou technique qui matérialise la règle produit "validation humaine obligatoire".

### Choix du modèle Claude — à trancher par vous (CEO)

Par défaut, ce skill recommande `claude-opus-5-5` pour toute tâche agentique. Sur un produit à 15€/mois avec potentiellement plusieurs agents actifs par client, le coût d'inférence doit être arbitré consciemment plutôt que subi :

- **Opus 5.5** ($4/$20 par Mtok) : meilleure qualité de proposition (contenus, nuance), plus cher.
- **Sonnet 5.5** ($2/$10 par Mtok) : moitié moins cher, qualité suffisante probable pour des tâches cadrées (brouillon de post, réponse à avis) avec un prompt bien construit.

Je ne tranche pas ce choix à votre place : je recommande de **démarrer en pilote avec Sonnet 5.5** (coût maîtrisé, aligné avec le prix de 15€/mois) et de réserver Opus 5.5 aux tâches où la qualité perçue est critique (ex: réponse à un avis client négatif), à valider par un test qualité sur quelques dizaines de cas réels avant de verrouiller le choix définitif. Dites-moi si vous préférez trancher autrement.

## 2. Stack recommandée

- **Frontend + backend** : Next.js (TypeScript) — cockpit web, un seul framework pour UI + API routes, cohérent avec le SDK Anthropic TypeScript (Tool Runner).
- **Base de données** : PostgreSQL (ex: Supabase ou RDS managé) — entreprises, agents, propositions, décisions de validation, connexions de canaux.
- **File d'attente / jobs asynchrones** : nécessaire car les agents tournent en tâche de fond (pas en requête HTTP synchrone) — ex: queue légère (BullMQ sur Redis, ou équivalent managé) pour déclencher les cycles de proposition des agents (cron ou événement).
- **Secrets / tokens d'intégration** (Google, Meta, SMTP) : stockage chiffré dédié (ex: vault applicatif ou secret manager du cloud choisi), jamais en clair en base applicative.

## 3. Modèle de données (entités clés V1)

- `Company` — contexte collecté à l'onboarding (métier, zone, ton).
- `ChannelConnection` — connexion à un canal externe (Google Business Profile, Instagram, email), tokens d'accès chiffrés, statut.
- `AgentProposal` — une proposition générée par un agent : type (visibilité/communication/démarchage), contenu généré, statut (`en_attente`, `validée`, `modifiée`, `rejetée`, `exécutée`), horodatages.
- `ExecutionLog` — trace de chaque action réellement exécutée après validation (idempotence, audit, et base pour un futur assouplissement de l'autonomie).

## 4. Flux de validation humaine (cœur du garde-fou produit)

1. Un agent génère une `AgentProposal` (statut `en_attente`) — jamais d'appel direct à une API externe à cette étape.
2. Le cockpit affiche la proposition à l'utilisateur.
3. L'utilisateur valide (telle quelle ou modifiée) ou rejette.
4. Seule une proposition au statut `validée` déclenche le code d'exécution réelle (hors boucle agent), qui écrit un `ExecutionLog`.

Ce flux est volontairement linéaire et sans coordination inter-agents en V1 (cf. [agents-roster.md](agents-roster.md) — hors scope).

## 5. Intégrations externes — ordre de priorité suggéré

1. **Email** (le plus simple à intégrer techniquement — API d'un fournisseur d'envoi, pas de revue d'app tierce bloquante).
2. **Google Business Profile API** — nécessite une demande d'accès/vérification Google, à lancer tôt car le délai d'obtention peut être long.
3. **Instagram/Meta Graph API** — nécessite une app Meta en revue, également à lancer tôt pour ne pas bloquer le pilote.

**Action immédiate recommandée** : lancer les démarches d'accès API Google Business Profile et Meta dès maintenant (délais d'approbation externes hors de notre contrôle), même si l'implémentation technique vient après.

## 6. Risques techniques identifiés à surveiller

- **Coût d'inférence par client actif** non encore chiffré — à mesurer dès le pilote (cf. choix de modèle ci-dessus).
- **Dépendance à des délais d'approbation externes** (Google, Meta) qui ne sont pas sous notre contrôle — à lancer en parallèle du développement, pas après.
- **Sécurité des tokens d'intégration** (accès à la fiche Google, au compte Instagram, à la boîte email du client) — surface de risque sensible si fuite ; chiffrement au repos et accès minimal requis dès le pilote, pas en V2.

## Prochaine étape (Dev)

Scaffolding du projet Next.js + schéma de base de données initial (`Company`, `ChannelConnection`, `AgentProposal`, `ExecutionLog`) + premier agent "Visibilité locale" en mode proposition seule (sans exécution réelle), pour valider le flux de bout en bout sur le cockpit avant de brancher les vraies intégrations.
