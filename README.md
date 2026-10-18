# BienDecider

Nom public : **BienDecider**. Domaine cible : **https://www.biendecider.com**. Contact public : **contact@biendecider.com** (redirection OVH vers le Gmail du propriétaire à activer et tester).

Le dépôt GitHub est `groupebienoubien/BienDecider` (auparavant `RemiJolivalt/pepito`, puis l'organisation `BienOuBien13` ; les anciens liens redirigent). Le projet Vercel est `bien-decider` (il remplace l'ancien projet `pepito`). Le nom du package et les cookies techniques restent inchangés. Pas de migration de données ; les anciens contenus et conversations ne sont pas réécrits. Le changement de domaine nécessite une nouvelle connexion (cookies limités à leur hôte).

Configuration du domaine, de la messagerie et recette : [docs/domain-email-setup.md](docs/domain-email-setup.md).

Développement à deux, CI et déploiement du prototype : **[docs/ci-cd.md](docs/ci-cd.md)**. PR courte vers `main`, contrôles GitHub obligatoires après configuration des protections, puis déploiement Vercel automatique. Un seul environnement partagé ; pas de previews de branches.

Répartition du travail et statuts des US : **[docs/github-tracking.md](docs/github-tracking.md)** et [GitHub Issues](https://github.com/groupebienoubien/BienDecider/issues). Délégation documentée après 4 secondes sans réponse ou indisponibilité annoncée, hors zones sensibles de `.github/CODEOWNERS` où l'approbation de l'autre développeur est obligatoire, sans contourner la PR ni la CI.

Réglages admin du risque et migration de base requise : **[docs/delegation-risk-admin.md](docs/delegation-risk-admin.md)**. Page `/admin/risques`, accessible aux seuls emails explicitement listés dans `ADMIN_EMAILS`.

Copilote IA agentique pour indépendants et TPE (kiné, plombier, installateur solaire, etc.) : des agents spécialisés proposent des actions pour accroître visibilité, communication et démarchage, validées par l'utilisateur avant exécution.

## Statut

4 agents (Paul, Martine, Camille, Jean-Claude), plan d'action piloté par Paul avec validation/réorientation par le dirigeant, discussion avec Paul depuis toutes les pages (réponse au fil de l'eau, dictée et lecture à voix haute), exécutions réelles après approbation et confirmation (site d'une page publié sur `/site/[slug]`, publication sur la Page Facebook connectée, email Gmail manuel), connexion du profil LinkedIn (sans publication), rapport, vue admin (coûts/usage, quotas par entreprise), suppression du compte, login par email + mot de passe. Fiche Google et Instagram : non connectés (démarches externes). Base de données : PostgreSQL (plus de SQLite). Voir [docs/backlog.md](docs/backlog.md) pour le détail à jour.

Parcours : `/` → `/login` → `/onboarding`, puis :

- `/diagnostic` : constats de Martine et recommandations à ajouter au plan.
- `/dashboard` (Aujourd'hui) : prochaine décision, plan à lancer, file unique de validation (`?view=validation`) et historique (`?view=historique`). Les productions du plan et les demandes ponctuelles suivent la même file. Une production approuvée n'est pas nécessairement exécutée ; les sites approuvés restent à publier dans la file.
- `/prospection` : suivi opérationnel des contacts et rendez-vous.
- `/rapport` (Résultats) : objectif chiffré, progression commerciale déclarée et réalisations effectives, sans duplication des analyses.
- `/equipe` : rôles et demandes ponctuelles ; aucun second point de validation.
- `/connexions`, `/onboarding`, `/admin` : configuration et administration.

## Démarrer en local

Prérequis : Node.js, une clé API Anthropic (https://console.anthropic.com/), une base PostgreSQL (ex: [Neon](https://neon.tech) ou [Vercel Postgres](https://vercel.com/storage/postgres), toutes deux ont un plan gratuit suffisant pour le dev/pilote).

1. Créer un fichier `.env` à la racine (non commité) avec :
   ```
   DATABASE_URL="postgres://..."
   ANTHROPIC_API_KEY="sk-ant-..."
   # Obligatoire — signe les cookies de session (générer une fois : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   SESSION_SECRET="..."

   # Optionnel — connexions OAuth (voir docs/oauth-setup.md pour la démarche d'enregistrement) :
   # GOOGLE_OAUTH_CLIENT_ID=""
   # GOOGLE_OAUTH_CLIENT_SECRET=""
   # META_APP_ID=""
   # META_APP_SECRET=""

   # Optionnel — referme la vue /admin à une liste d'emails (sinon ouverte à tout connecté) :
   # ADMIN_EMAILS="vous@exemple.com"
   ```
   `DATABASE_URL` est le nom recommandé. Pour les intégrations Prisma Postgres, le serveur accepte aussi `DATABASE_PRISMA_DATABASE_URL` puis `DATABASE_POSTGRES_URL`, dans cet ordre de repli. Si plusieurs sont définies, `DATABASE_URL` a priorité. Ne pas réutiliser une URL divulguée ; la renouveler chez le fournisseur.
2. Installer les dépendances : `npm install` (génère aussi le client Prisma via `postinstall`)
3. Créer les tables dans la base de développement : `npx prisma migrate deploy` (changement de schéma : `npx prisma migrate dev`, voir [docs/ci-cd.md](docs/ci-cd.md))
4. Lancer le serveur de dev : `npm run dev`
5. Ouvrir `http://localhost:3000` : se connecter (email + mot de passe — le compte est créé à la première connexion), remplir l'onboarding, puis sur `/dashboard` générer le plan de Paul, lancer les agents et valider leurs propositions.

## Tests du parcours

Gmail manuel : voir [docs/oauth-setup.md](docs/oauth-setup.md) pour `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` et `OAUTH_TOKEN_ENCRYPTION_KEY`. Callback `/api/oauth/gmail/callback`, scopes Gmail send + identité standard, aucun accès en lecture aux emails. Sans ces variables, la connexion reste désactivée. Tests locaux : `npm run test:gmail` (aucun réseau).

Test public de marque (aucune donnée créée ni appel agent) : `npm run test:brand`, avec un serveur local actif et Chromium installé. Vérifie les métadonnées, la langue, les liens de contact et les pages publiques de 320 à 1440 px. Tests unitaires de la voix et du flux de réponse de Paul (aucun réseau, aucune base) : `npm run test:voice`.

Avec le serveur local actif : `npx playwright install chromium`, puis `npm run test:ux`. Tests de sécurité (cookies falsifiés, verrouillage, isolation entre entreprises) : `npm run test:security`, avec `ADMIN_EMAILS` défini côté serveur ; toute nouvelle route API doit y être déclarée.
Les tests utilisent `DATABASE_URL` et `SESSION_SECRET` du fichier `.env`. Ils créent uniquement des entreprises fictives `ux-test-…@example.invalid`, supprimées en fin de test. Par sécurité, ils refusent toute base non locale ; `UX_TEST_ALLOW_REMOTE_DB=1` les autorise sur une base de développement distante dédiée, jamais sur celle du prototype. Les appels aux agents et la publication sont simulés ; les décisions et l'ajout au plan utilisent les vraies API. `UX_TEST_BASE_URL` permet de changer le port (défaut : `http://localhost:3000`). Captures desktop/mobile dans `test-results/` (ignoré par Git).

## Déploiement (Vercel)

1. Sur [vercel.com](https://vercel.com), importer le repo GitHub `groupebienoubien/BienDecider` — aucune clé API Vercel n'est nécessaire, la connexion se fait directement via l'intégration GitHub native (sécurisé, zéro secret à partager).
2. Onglet **Storage** du projet Vercel → créer/relier la base **Postgres**. Le nom canonique attendu est `DATABASE_URL`. Si l'intégration Prisma fournit seulement `DATABASE_PRISMA_DATABASE_URL` ou `DATABASE_POSTGRES_URL`, le serveur les accepte en repli ; préférer `DATABASE_URL` et ne pas stocker plusieurs URLs contradictoires.
3. Onglet **Settings → Environment Variables** → ajouter `ANTHROPIC_API_KEY` et `SESSION_SECRET` (même valeur qu'en local, sinon les sessions existantes deviennent invalides). Clés OAuth si prêtes. Laisser `ADMIN_EMAILS` non défini tant que l'admin doit rester ouvert à tous.
4. Premier déploiement : Vercel lance `npm install` (génère le client Prisma) puis `next build` automatiquement.
5. Schéma en prod : il évolue par les migrations versionnées de `prisma/migrations`, appliquées au déploiement une fois `MIGRATE_ON_DEPLOY=1` défini dans Vercel. L'activation initiale sur la base existante est décrite dans [docs/ci-cd.md](docs/ci-cd.md) ; ne plus utiliser `prisma db push` sur cette base.
6. Chaque fusion sur `main` redéploie automatiquement. Les autres branches ne sont pas déployées. Ne pas pousser directement sur `main` dans le processus d'équipe ; voir [docs/ci-cd.md](docs/ci-cd.md) pour les protections à activer.

Le panneau admin des niveaux de risque utilise une table Prisma ajoutée après la mise en place initiale. Avant de l'utiliser, appliquer la mise à jour additive de schéma à la base prototype selon [docs/delegation-risk-admin.md](docs/delegation-risk-admin.md). La CI et le déploiement ne font jamais de `db push` automatiquement.

## Décisions clés (V1)

- **Multi-métier** dès la conception, via un cœur générique + "packs de contexte" par métier.
- **Douleur cible** : manque de temps et manque de compétence marketing/communication des indépendants.
- **Validation humaine obligatoire** avant toute exécution d'action par un agent (email envoyé, post publié, réponse à un avis, etc.). Pas d'autonomie totale en V1.
- **Prix de travail** : 15€/mois (hypothèse à valider avec Finance avant verrouillage — risque de coût d'inférence par agent actif à chiffrer).
- **Build du produit en mode agentique** : rôles inspirés d'une organisation (BA, Architecte/CTO, Dev, Test, Comm') utilisés comme agents de construction, chacun produisant un livrable vérifiable. Voir [docs/process-build-agentique.md](docs/process-build-agentique.md).

## Documents

Pour s'y retrouver sans chercher : le **[wiki](https://github.com/groupebienoubien/BienDecider/wiki)**, généré depuis ce dépôt à chaque fusion sur `main` (accueil et aide-mémoire dans [wiki/](wiki), état du code calculé par [scripts/build-wiki.cjs](scripts/build-wiki.cjs)). Ne pas le modifier dans GitHub : corriger le fichier source dans une PR.

- **[docs/architecture.md](docs/architecture.md) — logique inter-agents et stack technique à jour (diagrammes)**
- [docs/spec-contextualisation.md](docs/spec-contextualisation.md) — parcours d'onboarding / contextualisation de l'entreprise
- [docs/agents-roster.md](docs/agents-roster.md) — rôles, responsabilités et garde-fous des agents produit
- [docs/process-build-agentique.md](docs/process-build-agentique.md) — organisation du build en rôles agentiques
- [docs/domaines.md](docs/domaines.md) — carte des douze domaines, trajectoire cible et répartition des US
- [docs/backlog.md](docs/backlog.md) — backlog MVP priorisé, avec décisions de scope actées
- [docs/oauth-setup.md](docs/oauth-setup.md) — démarches externes Google/Meta pour activer les connexions OAuth
