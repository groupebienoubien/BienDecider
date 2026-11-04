> **Archivé le 2026-11-04** : ce document ne décrit plus la cible du produit. Voir la [cible produit](../cible-produit.md) et l'[index des archives](README.md).

# Roster des agents produit (V1)

Principe commun à tous les agents : **proposer, jamais exécuter sans validation humaine explicite.** Chaque agent produit des propositions d'action visibles dans le cockpit ; l'utilisateur valide, modifie ou rejette avant toute exécution réelle (envoi d'email, publication, mise à jour de fiche).

La personnification (nom, ton propre à chaque agent) est un choix UX à traiter en V2 une fois le fonctionnel validé — cette version se concentre sur les responsabilités et garde-fous.

## Orchestrateur

- Non visible comme "agent" pour l'utilisateur ; agrège les propositions des agents spécialisés et les priorise dans le cockpit.
- V1 : logique de priorisation simple (ex: actions à fort impact / faible effort de validation en premier), pas de négociation inter-agents complexe.

## Agent "Visibilité locale"

- **Inputs** : métier, zone de chalandise, état de la fiche Google Business Profile (si connectée), avis clients existants.
- **Propositions typiques** : mise à jour d'informations de fiche (horaires, description, photos), réponse suggérée à un nouvel avis client.
- **Garde-fou spécifique** : toute réponse à un avis négatif doit être systématiquement soumise à validation, jamais auto-publiée même en mode "autonomie étendue" futur.

## Agent "Communication / réseaux sociaux"

- **Inputs** : ton de communication défini à l'onboarding, métier, actualité simple déclarée par l'utilisateur (ex: nouvelle offre, événement).
- **Propositions typiques** : post Instagram/Facebook avec visuel suggéré et légende, calendrier de publication suggéré.
- **Garde-fou spécifique** : aucune publication sans validation visuelle ET textuelle complète par l'utilisateur (pas de validation "en bloc" d'un calendrier entier sans aperçu individuel).

## Agent "Démarchage / prospection"

- **Inputs** : zone de chalandise, métier, description du type de prospects visés (saisie libre par l'utilisateur — pas de vraie liste de contacts en V1).
- **Propositions typiques** : template d'email de prospection générique (placeholder `[Prénom]`), relance.
- **Garde-fou spécifique** : le plus sensible du roster (RGPD, image de marque). En V1, l'agent ne produit QUE des templates génériques, jamais de ciblage nominatif ni d'envoi réel — chaque proposition inclut un rappel explicite de vérifier le cadre RGPD avant tout envoi.
- **Note de décision (2026-10-04)** : le roster prévoyait initialement de sortir cet agent en dernier, après validation Conformité. Construit plus tôt à la demande du CEO ; le garde-fou "templates génériques uniquement, pas de liste réelle" compense l'absence de validation Conformité formelle à ce stade. Une vraie fonctionnalité de ciblage nominatif reste hors scope tant que cette validation n'a pas eu lieu.

## Agent "Audit" (ajouté 2026-10-04)

- Agent de diagnostic, pas d'action : ne produit aucune proposition à valider, seulement des constats affichés en tête du dashboard avant les agents d'optimisation.
- **Inputs** : site web déclaré (optionnel) et comptes réseaux sociaux déclarés.
- **Fonctionnement** : utilise l'outil serveur `web_fetch` d'Anthropic pour consulter le site déclaré. Si aucun site n'est déclaré ou s'il est inaccessible, l'agent enregistre ce fait comme un constat en soi (premier axe d'amélioration), jamais comme une erreur silencieuse.
- Déclenché automatiquement à la fin de l'onboarding, et re-déclenchable manuellement depuis le dashboard.

## Hors scope V1 (roadmap future)

- Agents supplémentaires par métier (ex: agent "prise de rendez-vous" pour les kinés).
- Autonomie étendue (exécution directe sans validation) sur des catégories d'actions à très faible risque, une fois la confiance installée avec les utilisateurs pilotes.
- Coordination inter-agents avancée (un agent qui déclenche une action chez un autre).
