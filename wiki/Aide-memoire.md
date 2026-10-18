# Aide-mémoire

Les gestes du quotidien, en version courte. Le détail et les raisons sont dans [CI/CD](../docs/ci-cd.md).

## Faire une modification

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/description-courte
```

Préfixes de branche : `feat/`, `fix/`, `docs/`. Si la modification répond à une US, mets son numéro : `feat/80-tests-securite`.

Avant de pousser :

```bash
npm run lint
npm run build
```

Puis :

```bash
git add <fichiers>
git commit -m "Description du changement"
git push -u origin feat/description-courte
```

Ouvre ensuite la pull request sur GitHub. Le modèle se remplit tout seul : indique l'US (`Closes #numéro` si elle est entièrement livrée, sinon `Refs #numéro`), ce qui change et comment c'est testé.

## Fusionner

1. Attends que **Checks** soit vert sur la PR. S'il est rouge, clique dessus, lis l'étape en échec, corrige et pousse sur la même branche.
2. Si GitHub demande une approbation, c'est que la PR touche un [fichier à relecture obligatoire](Etat-du-depot.md#fichiers-à-relecture-obligatoire) : l'autre fondateur doit approuver.
3. Si GitHub dit que la branche n'est pas à jour, clique **Update branch** et attends de nouveau Checks.
4. Clique **Squash and merge**. La branche est supprimée automatiquement.
5. La mise en ligne part toute seule. Vérifie dans [Actions](https://github.com/groupebienoubien/BienDecider/actions) que **Smoke test** passe, puis regarde le parcours touché sur le site.

## Les tests

| Commande | Ce qu'elle vérifie | Besoin |
|---|---|---|
| `npm run test:gmail` | Envoi Gmail : périmètre, chiffrement, format | Rien |
| `npm run test:delegation` | Règles de risque des actions | Rien |
| `npm run test:voice` | Dictée, lecture à voix haute et flux de réponse de Paul (fonctions pures) | Rien |
| `npm run test:session` | Jeton de session signé, expiration | Rien |
| `npm run test:database-url` | Résolution de l'URL de base de données | Rien |
| `npm run test:brand` | Pages publiques, de 320 à 1440 px | Serveur local démarré |
| `npm run test:ux` | Parcours connectés | Serveur local et base locale |
| `npm run test:engine` | Ce que Paul et les agents lisent et écrivent autour des appels au modèle | Base locale |
| `npm run test:facebook` | Connecteur Facebook : chiffrement, state, échange avec un faux Meta, routes | Serveur local et base locale, sauf les six premiers tests |
| `npm run test:security` | Cookies falsifiés, verrouillage, isolation entre entreprises | Serveur local et base locale |

La CI lance tout cela à chaque PR sur une base jetable. En local, les tests qui écrivent en base refusent toute base non locale, pour ne jamais toucher celle du prototype.

## Cas particuliers

**Changer la base de données.** Jamais de `prisma db push` sur la base du prototype. Modifie `prisma/schema.prisma`, puis génère la migration sur une base de développement :

```bash
npx prisma migrate dev --name description_courte
```

Commite le schéma et le dossier de migration dans la même PR. La procédure complète, retour arrière compris, est dans [CI/CD, section base](../docs/ci-cd.md#base-et-configuration--migrations-versionnées).

**Ajouter une route API.** Déclare-la dans [`tests/security.spec.ts`](../tests/security.spec.ts), comme protégée ou volontairement publique, sinon Checks échoue.

**Ajouter une variable d'environnement.** Donne son nom dans la PR, saisis sa valeur dans Vercel avant la fusion, puis redéploie. Jamais de valeur dans le dépôt.

**Mises à jour de dépendances.** Dependabot ouvre des PR chaque lundi. Checks vert : fusionne. Checks rouge : lis l'échec avant de décider.

## Un problème en production

| Symptôme | Quoi faire |
|---|---|
| Le site est cassé après une fusion | Vercel > projet `bien-decider` > Deployments > dernier déploiement sain > **Rollback**. Ensuite, PR de correction ou de revert. |
| Une Issue « Test de fumee en echec » s'est ouverte | Ouvre https://www.biendecider.com/api/health : la réponse doit contenir `"status":"ok"`. Sinon, rollback. |
| Le déploiement a échoué | Le site reste sur la version précédente. Lis les logs du build dans Vercel. |
| Une fusion n'a rien mis en ligne | Vérifie dans Vercel > Settings > Git que le dépôt connecté est bien `groupebienoubien/BienDecider`. |
| Un secret a fuité | Révoque-le chez le fournisseur d'abord, puis remplace-le dans Vercel. Le retirer du code ne suffit pas. |

Le rollback Vercel ne restaure que le code, jamais les données : pour la base, seule la sauvegarde de l'hébergeur compte.
