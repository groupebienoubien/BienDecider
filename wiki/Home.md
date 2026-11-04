# BienDecider : le wiki des pères fondateurs

BienDecider est un copilote pour indépendants et TPE : Paul prépare des missions de visibilité, de communication et de démarchage, et le dirigeant décide avant toute diffusion. Le prototype est en ligne sur https://www.biendecider.com ; la cible du produit est la V5.2 ([Cible produit](../docs/cible-produit.md)).

Ce wiki sert à s'y retrouver sans demander à personne. Il est **généré depuis le dépôt** à chaque fusion sur `main` : ce que tu lis correspond au code en ligne.

## Je veux…

| Je veux… | Où aller |
|---|---|
| Faire une modification et la mettre en ligne | [Aide-mémoire](Aide-memoire.md), puis [CI/CD](../docs/ci-cd.md) pour le détail |
| Savoir ce qui existe aujourd'hui dans le code : pages, routes, tables, commandes, variables | [État du dépôt](Etat-du-depot.md) |
| Comprendre comment les agents travaillent ensemble | [Architecture](../docs/architecture.md) |
| Choisir quoi faire ensuite, ou voir qui fait quoi | [Suivi des US](../docs/github-tracking.md), le [suivi du PoC](https://github.com/groupebienoubien/BienDecider/issues/272) et les [Issues](https://github.com/groupebienoubien/BienDecider/issues) |
| Savoir ce que le produit doit devenir et ce que les PF ont décidé | [Cible produit](../docs/cible-produit.md) |
| Retrouver un document remplacé (ancien backlog, domaines, spécifications V1 et V3) | [Archives](../docs/archives/README.md) |
| Réagir à un incident en production | [Aide-mémoire, section incident](Aide-memoire.md#un-problème-en-production) |
| Régler les niveaux de risque des actions | [Risques de délégation](../docs/delegation-risk-admin.md) |
| Brancher Google, Meta ou Gmail | [Configuration OAuth](../docs/oauth-setup.md) |
| Configurer le domaine ou la messagerie | [Domaine et email](../docs/domain-email-setup.md) |
| Installer le projet sur un nouveau poste | [Présentation](../README.md), section « Démarrer en local » |

## Les cinq règles à connaître

1. **Rien n'arrive sur `main` sans pull request** et sans le contrôle `Checks` au vert. Un push direct est refusé par GitHub.
2. **Une fusion sur `main` met en ligne** : Vercel déploie automatiquement, il n'y a pas d'environnement intermédiaire.
3. **Certains fichiers exigent l'approbation de l'autre fondateur** : base de données, CI, authentification, envois externes. La liste est dans [État du dépôt](Etat-du-depot.md#fichiers-à-relecture-obligatoire).
4. **Aucun secret dans le dépôt, les Issues ou ce wiki** : tout est public. Les valeurs vivent dans Vercel et dans le fichier `.env` local.
5. **Une action réelle (envoi, publication) passe toujours par une validation du dirigeant** : aucun mode autonome n'est actif.

## Où sont les choses

| Quoi | Où |
|---|---|
| Code et guides | [github.com/groupebienoubien/BienDecider](https://github.com/groupebienoubien/BienDecider) |
| Travail à faire et décisions | [Issues](https://github.com/groupebienoubien/BienDecider/issues) |
| Changements en cours de relecture | [Pull requests](https://github.com/groupebienoubien/BienDecider/pulls) |
| Résultat des contrôles automatiques | [Actions](https://github.com/groupebienoubien/BienDecider/actions) |
| Alertes de sécurité et de dépendances | [Security](https://github.com/groupebienoubien/BienDecider/security) |
| Mise en ligne, logs, variables, rollback | Projet Vercel `bien-decider` |
| Données | Base PostgreSQL du prototype, accessible depuis le projet Vercel |

## Corriger une page

Ne modifie pas le wiki directement : la prochaine fusion écraserait ta modification. Chaque page indique en tête le fichier dont elle vient. Modifie ce fichier dans une PR ; le wiki se met à jour à la fusion.

- Les guides viennent de [`docs/`](../docs).
- Cette page d'accueil, le menu et l'aide-mémoire viennent de [`wiki/`](../wiki).
- La page [État du dépôt](Etat-du-depot.md) est calculée par [`scripts/build-wiki.cjs`](../scripts/build-wiki.cjs) : elle se corrige en corrigeant le code.
