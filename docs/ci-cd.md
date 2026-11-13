# CI/CD BienDecider : prototype à deux développeurs

## En une minute

**Une seule version partagée** : https://www.biendecider.com, hébergée par le projet Vercel `bien-decider`, avec sa base PostgreSQL actuelle. Vercel appelle cet environnement **Production**, même si le produit reste un prototype. Pas de staging, pas de branche `develop`. La CI teste sur une base jetable, recréée à chaque exécution.

**Le parcours de chaque changement :**

```text
main à jour → petite branche → travail local → pull request vers main
           → CI verte (lint, migrations, build, tests navigateur) + relecture
             (obligatoire sur les zones sensibles, délégation possible ailleurs)
           → Squash and merge → Vercel déploie main → test de fumée automatique
```

Les branches de travail ne sont pas déployées par Vercel : `vercel.json` désactive les déploiements Git de toutes les branches sauf `main`. Il reste possible de lancer manuellement un déploiement Vercel ; ne pas le faire pour une branche de travail dans ce processus.

## Ce qui est automatisé

| Quand | Qui | Actions |
|---|---|---|
| PR ouverte ou mise à jour vers `main` | GitHub Actions, workflow `CI`, job `Checks` | Node 24, `npm ci`, lint sans avertissement, tests sans réseau, migrations rejouées sur une base PostgreSQL jetable, build Next.js avec TypeScript, tests navigateur `test:brand` et `test:ux` |
| PR ouverte ou mise à jour, push sur `main`, chaque lundi | GitHub Actions, workflow `CodeQL` | Analyse statique de sécurité du code et des workflows |
| Fusion ou push sur `main` | GitHub Actions | Les mêmes contrôles, pour détecter une régression sur la branche partagée |
| Fusion ou push sur `main` | Intégration GitHub de Vercel | Installation, migrations si activées, build et publication sur le domaine du prototype |
| Déploiement Production réussi | GitHub Actions, workflow `Smoke test` | `/api/health` sert le commit déployé et la base répond, puis `test:brand` en lecture seule sur le domaine ; une Issue est ouverte en cas d'échec |
| Fusion ou push sur `main` | GitHub Actions, workflow `Wiki` | Régénère le [wiki](https://github.com/groupebienoubien/BienDecider/wiki) depuis `wiki/`, `docs/` et le code ; `Checks` vérifie avant fusion que les pages se construisent et que les liens relatifs des guides pointent vers des fichiers existants |
| Chaque lundi | Dependabot | Une PR groupée de mises à jour npm mineures et correctives, une pour les actions GitHub |
| Relance manuelle | GitHub > Actions > CI ou Smoke test > Run workflow | Contrôles seulement, aucun déploiement ni changement de base |

Workflows : [ci.yml](../.github/workflows/ci.yml), [codeql.yml](../.github/workflows/codeql.yml), [smoke.yml](../.github/workflows/smoke.yml). Mises à jour : [dependabot.yml](../.github/dependabot.yml). Déploiement : [../vercel.json](../vercel.json).

Un seul job CI obligatoire, cache du téléchargement npm et annulation des anciennes exécutions sur la même PR. Timeout de 15 minutes. Aucun appel IA ni secret GitHub à fournir.

La CI démarre un PostgreSQL de service, vide à chaque exécution, **jamais la base du prototype**. Elle y applique toutes les migrations de `prisma/migrations`, puis vérifie que `schema.prisma` ne contient aucun changement absent des migrations. Les valeurs `DATABASE_URL` et `SESSION_SECRET` du workflow sont factices et ne servent qu'à cette base.

Les tests `test:gmail`, `test:delegation` et ceux de l'import du backlog tournent sans réseau. L'application compilée est ensuite démarrée dans le job : `test:brand` vérifie les pages publiques, `test:ux` les parcours connectés, avec des entreprises fictives créées dans la base jetable et des appels agents simulés, `test:engine` ce que Paul et les agents lisent et écrivent autour des appels au modèle (sans appeler le modèle), et `test:security` le refus des cookies falsifiés sur chaque route, le verrouillage après cinq échecs et l'isolation entre deux entreprises. **Toute nouvelle route API doit être déclarée dans `tests/security.spec.ts`**, sinon `Checks` échoue. Le build inclut TypeScript : pas de second typecheck. **Les avertissements ESLint bloquent** (`--max-warnings 0`). En cas d'échec, captures et journal de l'application sont joints à l'exécution.
Les tests `test:gmail`, `test:delegation` et ceux de l'import du backlog tournent sans réseau. L'application compilée est ensuite démarrée dans le job : `test:brand` vérifie les pages publiques et `test:ux` les parcours connectés, avec des entreprises fictives créées dans la base jetable et des appels agents simulés. Le build inclut TypeScript : pas de second typecheck. **Les avertissements ESLint bloquent** (`--max-warnings 0`). En cas d'échec, captures et journal de l'application sont joints à l'exécution.

## Réglages à faire une seule fois

Ces réglages de comptes ne sont pas appliqués par les fichiers du dépôt. Un administrateur doit les confirmer.

### GitHub

1. Donner aux deux développeurs l'accès au dépôt `groupebienoubien/BienDecider` et vérifier que GitHub Actions est autorisé.
2. Importer le ruleset versionné [../.github/rulesets/main.json](../.github/rulesets/main.json) : **Settings > Rules > Rulesets > New ruleset > Import a ruleset**, ou en ligne de commande avec un compte administrateur :

   ```bash
   gh api -X POST repos/groupebienoubien/BienDecider/rulesets --input .github/rulesets/main.json
   ```

   Il impose sur `main` : pull request obligatoire, contrôle **`Checks`** requis sur une branche à jour, fusion par squash uniquement, force-push et suppression interdits, aucun bypass, y compris pour les administrateurs.
3. Le ruleset garde **0 approbation obligatoire** en général, mais exige l'approbation d'un propriétaire de code pour les chemins listés dans [../.github/CODEOWNERS](../.github/CODEOWNERS) : base de données, CI et déploiement, authentification et OAuth, actions externes. L'auteur ne peut pas approuver sa propre PR : sur ces chemins, c'est donc toujours l'autre développeur qui valide.
4. Dans **Settings > General**, n'autoriser que **Squash merging** et activer la suppression automatique des branches fusionnées.
5. Dans **Settings > Advanced Security**, activer **Secret scanning**, **Push protection** et les **alertes Dependabot** (gratuits sur un dépôt public).

Si les protections ne sont pas disponibles avec le forfait/visibilité du dépôt, la CI fonctionne, mais le blocage des fusions est seulement une règle d'équipe : décider d'un forfait compatible si un verrou technique est nécessaire.

**Important :** Vercel ne patiente pas pour le job CI lancé après un push sur `main`. Le garde-fou est la **CI obligatoire avant fusion**. Un push direct ou un bypass peut déployer du code non validé : c'est pourquoi il faut protéger `main`. Ne pas exiger le statut `Vercel` sur les PR, puisque leurs previews sont volontairement désactivées.

### Vercel

1. Conserver un seul projet `bien-decider`, connecté au dépôt, avec **Production Branch = main**. Selon l'interface, ce réglage se trouve dans **Settings > Environments > Production** ou dans la configuration Git.
2. Utiliser Node.js **24.x** comme dans la CI. La commande de build est fixée par `vercel.json` (`npm run vercel-build`) ; aucun appel à `prisma db push` dans les commandes Vercel.
3. Conserver le domaine et les variables actuelles dans **Production**. Aucun token Vercel ni credential PostgreSQL/Google/Anthropic n'est nécessaire dans GitHub Actions.
4. Vérifier que les commits des deux développeurs sont autorisés par Vercel : leur email Git doit être associé à leur compte GitHub. Selon le plan Vercel, un accès à l'équipe ou un plan compatible peut être requis pour le second auteur ; un accès GitHub seul ne le garantit pas.
5. Après la première fusion, vérifier qu'un déploiement de `main` se termine et que le domaine présente la nouvelle version. Aucun transfert de projet ou de domaine n'est nécessaire.

## Travail quotidien

### 1. Commencer depuis main à jour

Avec un arbre de travail propre :

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/description-courte
npm ci
npm run dev
```

Utiliser `feat/...`, `fix/...` ou `docs/...`. Petites PR, une intention claire. Se prévenir avant de modifier les mêmes fichiers ou le schéma Prisma. Ne pas changer de branche avec du travail non enregistré ; le commiter sur la bonne branche ou le mettre de côté explicitement.

Le fichier local `.env` reste ignoré par Git. Partager les accès par un gestionnaire de secrets, jamais par chat, PR ou commit. Ne pas copier les secrets de Vercel dans le workflow CI.

### 2. Contrôler puis pousser la branche

```sh
npm run lint
npm run test:gmail
npm run test:delegation
npm run build
git add <fichiers-du-changement>
git commit -m "Description du changement"
git push -u origin feat/description-courte
```

Ouvrir la PR vers `main`. Indiquer ce qui change, comment c'est testé et si un réglage Vercel ou une modification de base est nécessaire. Pour un changement UI, ajouter une capture desktop/mobile ; pour OAuth ou l'envoi email, préciser si les appels ont été simulés ou réellement effectués.

Lier l'US avec `Closes #numero` seulement si tous ses critères sont livrés, sinon `Refs #numero`. Répartition du travail, statuts et import : [github-tracking.md](github-tracking.md). Le modèle de PR est proposé automatiquement par GitHub.

Pour `test:brand`, lancer le serveur et Chromium comme indiqué dans [../README.md](../README.md). `test:ux` crée et supprime des entreprises de test dans la base pointée par `DATABASE_URL` : **ne pas le lancer automatiquement sur la base du prototype**. La suite refuse toute base non locale, sauf `UX_TEST_ALLOW_REMOTE_DB=1` réservé à une base de développement dédiée ; la CI la lance à chaque PR sur sa propre base jetable.

`test:brand` reste en lecture seule : pages publiques, formulaire de connexion non soumis et redirection de l'étape compte sans brouillon. Il ne soumet ni découverte d'entreprise, ni objectif, ni inscription ; aucun appel Google/IA ne doit être déclenché par cette suite. Les contrôles du formulaire d'inscription (libellés, autocomplétion et affichage du mot de passe) restent dans `test:ux`, avec un brouillon créé et supprimé sur la base jetable. Le parcours complet d'inscription y est également testé.

### 3. Relire et fusionner

L'autre développeur fait une relecture courte et approuve. Si la PR touche un chemin de [CODEOWNERS](../.github/CODEOWNERS), GitHub bloque la fusion tant qu'il n'a pas approuvé. Attendre **Checks vert** ; si `main` a évolué, mettre à jour la branche via GitHub, résoudre les conflits et attendre la nouvelle CI. Fusionner avec **Squash and merge**. Le développeur qui fusionne vérifie que le workflow **Smoke test** passe après le déploiement, puis le parcours touché sur le domaine. Le second repart de `main` à jour pour son prochain changement.

### 4. Délégation en cas d'indisponibilité

**Décision prototype du 2026-10-10, restreinte le même jour aux zones non sensibles :** délégation permanente et réciproque après **4 secondes** sans réponse à la demande de relecture, ou dès qu'une indisponibilité est annoncée, **pour tout changement qui ne touche aucun chemin de [CODEOWNERS](../.github/CODEOWNERS)**. Aucun bypass de CI ni push direct sur `main`. Sur ces changements, la relecture peut avoir lieu après la fusion.

| Situation | Qui valide/fusionne ? |
|---|---|
| L'autre développeur est disponible | Relecture courte par l'autre, puis fusion avec Checks vert. |
| Un remplaçant est désigné | Il relit la PR ; donner l'accès GitHub nécessaire, sans partager un compte. |
| Hors zones sensibles : indisponibilité annoncée, ou aucune réponse après 4 secondes | L'auteur peut fusionner avec les conditions ci-dessous. |
| Zones sensibles de CODEOWNERS : base de données, CI/protections/déploiement, authentification, OAuth/tokens, envoi externe, publication, cron | **Pas de délégation.** L'approbation de l'autre développeur est exigée par GitHub avant la fusion. En cas d'absence prolongée, désigner un remplaçant et l'ajouter à CODEOWNERS par une PR approuvée. |

**Risque accepté :** 4 secondes ne constituent pas une fenêtre de relecture réaliste. Une modification hors zones sensibles peut être mise en ligne avant qu'un autre développeur l'ait examinée. Une CI verte n'atteste pas de la sécurité ou de l'absence de perte de données. Cette délégation ne supprime ni les sauvegardes, ni la coordination des modifications de base, ni les confirmations utilisateur des envois externes.

Avant fusion autonome : PR petite, liée à son Issue, branche à jour, **Checks vert sur le dernier commit**, tests ciblés et plan de retour arrière. Ajouter le label `review-deferred`, mentionner l'autre développeur et laisser ce commentaire :

```text
Fusion par délégation prototype
Motif : indisponibilité annoncée / absence de réponse après 4 secondes.
Demande de relecture : <lien du commentaire, date et heure>.
Risque et impacts : <faible ou fort ; sécurité, données, envois, configuration concernés>.
Vérification : <tests, captures, lien CI>.
Retour arrière : <revert/rollback compatible>.
Relecture différée demandée à @<login> au prochain jour ouvré disponible.
```

Après fusion, l'auteur vérifie Vercel et le parcours touché ; l'autre développeur relit au prochain jour ouvré disponible et retire `review-deferred` après son commentaire. Une anomalie ouvre une Issue de correction. Un agent peut aider à la relecture, mais son avis n'est pas une approbation humaine GitHub.

**Limite assumée :** hors CODEOWNERS, avec 0 approbation obligatoire, GitHub ne bloque pas techniquement une fusion sans relecture. Le délai de 4 secondes est une convention documentée, pas une automatisation de fusion. Un fichier sensible oublié dans CODEOWNERS n'est pas protégé : l'y ajouter dès qu'il apparaît. Si cette règle ne convient plus, passer à 1 approbation obligatoire dans le ruleset ; ne pas accorder un bypass global qui contournerait aussi `Checks`.

Pas de push de branche après fusion pour republier : la fusion déclenche déjà le déploiement. Les commits de documentation sur `main` peuvent aussi déclencher un build Vercel ; c'est assumé pour conserver un processus uniforme.

## Base et configuration : migrations versionnées

Le prototype a une seule base partagée. Son schéma n'évolue plus que par des **migrations versionnées** dans `prisma/migrations`, relues dans la PR (chemin protégé par CODEOWNERS) et rejouées par la CI sur une base jetable. `prisma db push` n'est plus utilisé sur la base partagée.

**Changer le schéma :**

```sh
# Avec DATABASE_URL pointant vers une base de développement, jamais celle du prototype
npx prisma migrate dev --name description_courte
```

Commiter `schema.prisma` et le dossier de migration généré dans la même PR. La CI échoue si le schéma contient un changement sans migration.

- Ajouter un champ/table compatible avec le code actuel : une seule PR suffit.
- Supprimer/renommer un champ ou changer sa signification : prévoir deux changements compatibles (nouveau champ + bascule du code, suppression plus tard). Relire le SQL généré : une migration destructive n'est jamais appliquée sans sauvegarde vérifiée.
- Ajouter une variable : indiquer son **nom** dans la PR/doc, la saisir dans Vercel avant le déploiement qui en dépend, sans révéler sa valeur. Redéployer après une modification de variable.

**Retour arrière d'une migration.** Ne jamais modifier ni supprimer une migration déjà appliquée : corriger par une nouvelle migration, dans une PR. Si `migrate deploy` échoue en cours de route, le build s'arrête ; corriger la cause, puis marquer la migration avec `npx prisma migrate resolve --rolled-back <nom>` avant de relancer. Si des données ont été perdues, seule la restauration de la sauvegarde de l'hébergeur les ramène : le rollback Vercel ne restaure que le code.

**Application au déploiement.** Le build Vercel de production lance [scripts/migrate-on-deploy.cjs](../scripts/migrate-on-deploy.cjs), qui exécute `prisma migrate deploy` uniquement si la variable Vercel `MIGRATE_ON_DEPLOY` vaut `1`. Une migration en échec arrête le build : la version précédente reste servie.

**Activation, à faire une seule fois par le développeur désigné.** La base actuelle a été créée avec `db push` et ne connaît pas encore l'historique des migrations. Avec la `DATABASE_URL` de production dans le terminal, sans la partager :

1. Vérifier qu'une sauvegarde récente existe chez l'hébergeur de la base.
2. Vérifier que la base correspond au schéma versionné ; la commande doit afficher un diff vide :

   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   ```

3. Déclarer la migration initiale comme déjà appliquée ; cela crée seulement la table de suivi `_prisma_migrations`, sans toucher aux données :

   ```bash
   npx prisma migrate resolve --applied 0_init
   ```

4. Ajouter `MIGRATE_ON_DEPLOY=1` dans les variables **Production** de Vercel. Si `DATABASE_URL` passe par un pooler de connexions, vérifier que `migrate deploy` fonctionne au premier déploiement ; sinon fournir une URL directe pour les migrations.

Tant que l'étape 4 n'est pas faite, les déploiements se comportent comme avant et tout changement de schéma reste à appliquer manuellement par le développeur désigné, avec `npx prisma migrate deploy`.

## Si quelque chose échoue

| Incident | Action |
|---|---|
| CI rouge sur la PR | Ouvrir GitHub > Actions > CI > Checks, lire l'étape rouge, corriger et pousser sur la même branche. Ne pas fusionner malgré l'échec. |
| Conflit avec l'autre développeur | Mettre à jour avec `main`, résoudre ensemble si nécessaire et rejouer les contrôles. |
| Build Vercel échoué | Lire les logs du déploiement : version Node, variables, installation, migration et erreur de build. La dernière version publiée reste normalement servie. |
| Smoke test rouge, Issue « Test de fumee en echec » ouverte | Vérifier le domaine et `/api/health`. Si la version en ligne est cassée, rollback Vercel puis PR de correction. Fermer l'Issue une fois le test repassé. |
| CodeQL ou secret scanning signale un problème | Traiter l'alerte dans l'onglet **Security** ; un secret exposé doit être révoqué chez le fournisseur, pas seulement retiré du code. |
| Push non déployé | Vérifier la branche (`main` uniquement), les règles Vercel et l'autorisation de l'auteur du commit. |
| Bug déjà en ligne | Depuis Vercel, utiliser le rollback vers la dernière version saine si disponible. Ensuite créer une PR de correction ou de revert pour que Git corresponde à la version voulue. |
| Rollback avec changement de base | Le rollback Vercel ne restaure ni données ni schéma. Vérifier la compatibilité avant retour arrière ; une correction compatible peut être préférable. |

Une urgence ne doit pas devenir le chemin normal. Si un administrateur utilise exceptionnellement un bypass, prévenir l'autre développeur et vérifier immédiatement CI, déploiement et données.

## Checklist d'installation

- [x] Workflow CI versionné, un job obligatoire, sans secrets réels.
- [x] Base jetable, migrations rejouées, tests navigateur et lint strict dans `Checks`.
- [x] Déploiements Git limités à `main`, cron existant conservé.
- [x] CODEOWNERS, Dependabot, CodeQL et test de fumée versionnés.
- [x] Guide commun et lien depuis le README.
- [x] Première CI et déploiement de main réussis sur le commit `0c9d578` le 2026-10-10.
- [ ] Administrateur : importer le ruleset `main`, n'autoriser que le squash et activer la suppression automatique des branches.
- [ ] Administrateur : activer secret scanning, push protection et alertes Dependabot.
- [ ] Administrateur : vérifier Node 24, branche Production main et accès Vercel des deux auteurs.
- [ ] Développeur désigné : aligner la base sur la migration `0_init`, puis définir `MIGRATE_ON_DEPLOY=1` dans Vercel.

La configuration versionnée définit le processus ; les cases d'administration doivent être cochées après vérification dans les consoles, pas déduites d'un commit.
