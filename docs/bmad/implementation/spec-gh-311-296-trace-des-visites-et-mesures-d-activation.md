---
title: 'GH-311 et GH-296 — Trace anonyme des visites et mesures d''activation du PoC'
type: 'feature'
created: '2026-11-09'
status: 'review'
route: 'dispatch'
baseline_commit: '4bef05c'
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md'
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/addendum.md'
  - '{project-root}/docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md'
  - '{project-root}/docs/charte.md'
---

## Intent

**Problème :** le brouillon anonyme du parcours d'entrée est effacé après 24 heures ou à l'inscription sans rien laisser : les pères fondateurs ne savent ni jusqu'où vont les visiteurs, ni ce qu'ils cherchent (D2, FR-60). L'administration n'a qu'un entonnoir en quatre compteurs, sans date par entreprise, sans délai entre étapes ni cohorte (§7).

**Approche :** une trace par brouillon, construite par liste blanche et écrite par la transaction qui efface le brouillon (inscription ou purge), sans aucune clé vers le compte ; une page d'administration qui calcule côté serveur l'entonnoir en huit étapes, les cohortes d'inscription, les contre-mesures et la vue agrégée des traces, avec un export agrégé.

## Livré

### #311 — Trace anonyme des visites (PR « Closes #311 »)

- **Table `VisitTrace`** (migration additive `20261109140000_trace_visites`) : jour de début (date sans heure, heure de Paris), étape la plus avancée, étape d'abandon (sans compte), activité, département, site renseigné ou non, état de chaque rubrique lue, ambition interprétée (gain, horizon, budget média, recrutement), modèles des missions proposées à l'étape 4, compte créé ou non, coût du modèle avant compte. Identifiant aléatoire (`uuid`, pas `cuid` qui contient l'heure), aucune colonne d'heure, aucune clé vers `OnboardingDraft` ni `Company`.
- **`OnboardingDraft.furthestStep`** : étape la plus avancée atteinte ; un retour en arrière ne la baisse pas. Sans elle, « étape atteinte » et « étape d'abandon » seraient la même valeur.
- **Construction pure** (`src/lib/onboarding/visit-trace-rules.ts`, `buildVisitTrace`) : chaque champ est réduit à une valeur non identifiante. L'activité n'est gardée que si elle figure au catalogue (`src/lib/trades.ts`), sinon « Autre activité » ; le département vient d'un code postal, d'un code explicite (« (33) », « 2A ») ou du nom d'un département ou d'une ville principale, jamais la commune ; le coût est arrondi au cent.
- **Écriture** : dans la transaction d'inscription qui efface le brouillon, après la création des missions (`recordSignupTrace`, modèles = missions réellement créées) ; par la purge des brouillons expirés (`purgeExpiredDrafts`), qui efface chaque brouillon puis écrit sa trace dans la même transaction. Seul celui qui efface le brouillon l'écrit : une visite n'a jamais deux traces. La purge au fil de l'eau de `createDraft` (5 %) passe par la même fonction : plus aucun brouillon n'est effacé sans trace.
- **Conservation 25 mois** (`[ASSUMPTION]`) : le cron quotidien `/api/cron/drafts` efface les traces commencées avant le premier jour conservé (`retentionCutoff`).
- **Information** : l'étape 1 affiche « Nous gardons une trace anonyme de votre visite pour améliorer BienDecider. » avec un lien vers la section « Trace anonyme des visites » de la page de confidentialité, qui dit ce qui est gardé, ce qui ne l'est jamais, la durée et qui la consulte.
- **Vue agrégée** (`/admin/mesures`, administrateurs seulement) : par étape (atteinte, abandon sans compte), par activité, par département, par mois ; site renseigné, rubriques lues, modèles proposés, coût moyen d'une analyse sans compte. Filtre de période sur le jour de début.
- **Seuil d'affichage** : une activité ou un département de moins de 5 visites est fondu dans « Autres » ; si « Autres » reste sous le seuil, ses nombres sont remplacés par « moins de 5 ». Aucune vue ne croise activité et département.
- **Export agrégé** : `GET /api/admin/mesures/export?vue=visites` (CSV, mêmes tableaux, seuil compris, aucune ligne par visite).

### #296 — Mesures d'activation (PR « Refs #296 »)

- **Entonnoir en huit étapes**, calculé côté serveur (`src/lib/activation-rules.ts`, `src/lib/activation.ts`) avec la date de chaque étape par entreprise :

  | Étape | Source | Question de #100 |
  | --- | --- | --- |
  | Inscription | `Company.createdAt` | Activation |
  | E-mail confirmé | `Company.emailVerifiedAt` | Activation |
  | Espace créé | premier J-04, sinon `profileConfirmedAt` | Activation |
  | Première mission lancée | premier `Mission.firstLaunchedAt` | Activation |
  | Premier contenu validé | premier J-20, sinon `MissionContent.validatedAt` | Validation |
  | Première diffusion | première `Publication` envoyée, confirmée ou déclarée | Réalisation |
  | Premier bilan | premier `MissionReport` | Réalisation |
  | Retour à J+7 | première activité du dirigeant 7 jours ou plus après l'inscription (journal, message à Paul, signalement, dernière connexion) | Activation |

- **Temps médian** depuis l'étape précédente (en jours), **dernière étape atteinte** par entreprise, **filtre de période** sur le jour d'inscription.
- **Coût du modèle par entreprise** (somme des `UsageEvent`, analyse avant compte comprise) et **plafonds atteints** aujourd'hui ou ce mois-ci (lancements, messages, dépense), crédits épuisés, alertes de consommation reçues.
- **Cohortes d'inscription** (cible V5.2, §7) par mois : comptes, part qui lance une mission dans les 7 jours, missions lancées, puis diffusées, puis avec un bilan, puis avec une décision de suite ; répartition des missions lancées par modèle et par canal ; part des diffusions déclarées.
- **Visiteurs sans compte** comptés depuis la trace (#311) : part qui atteint « Un cap. Trois premières pistes. », étape d'abandon des autres, part de ceux-ci qui crée un compte.
- **Contre-mesures** : missions diffusées sans bilan après la règle d'arrêt, missions écartées dans l'heure qui suit leur lancement, coût moyen d'une analyse anonyme sans compte.
- **Aucun contenu** (versions, constats, messages, bilans), aucun nom de client final ni donnée de tiers (destinataires, prospects) n'est lu ni affiché ; la vue par entreprise montre son nom, ses dates, son coût et ses plafonds. Accès réservé aux administrateurs (page et export).
- **Export agrégé** : `GET /api/admin/mesures/export?vue=activation` (entonnoir, cohorte, répartitions, contre-mesures ; aucune ligne par entreprise).
- Lien « Voir les mesures d'activation » sous l'entonnoir existant de `/admin`.

## Reporté (à traiter avant `Closes #296`)

- **Nombre d'avis et note moyenne par page** (FR-54) : aucun avis n'est encore recueilli (`ProductFeedback`, addendum §4.11). Affiché « — ».
- **Oppositions au recontact** et **contenus signalés comme erronés après diffusion** : ces événements n'existent pas encore dans le produit. Affichés « — (non mesuré) ».
- **Recoupement avec #100** : chaque étape porte la question observée (activation, validation, réalisation) ; le rapprochement avec les séances reste à faire quand elles auront eu lieu.
- Vérification de la page `/admin/mesures` à 320, 390 et 1440 px dans un navigateur réel : les tableaux défilent dans leur cadre (`table-scroll`), comme le reste de l'administration.

## Décisions

- **Étape d'abandon** : l'étape courante du brouillon au moment de son effacement ; **étape atteinte** : la plus avancée (`furthestStep`). Les brouillons créés avant cette version ont `furthestStep = 1` : leur étape atteinte est alors l'étape courante.
- **Modèles proposés** : à l'inscription, ceux des missions réellement créées ; à la purge, recalculés par les mêmes règles que l'étape 4 (`rankStarterTemplates`), si le visiteur l'a atteinte avec une ambition confirmée.
- **Coût** : analyse publique et « Ce que nous retenons », arrondis au cent. L'interprétation de l'ambition n'est enregistrée nulle part et n'y figure pas. Un coût exact permettrait de rapprocher la trace du `UsageEvent` repris au compte.
- **Activité hors catalogue** : « Autre activité », car un texte libre peut contenir un nom propre.
- **Pas d'heure dans la trace** : ni `createdAt` ni identifiant horodaté. Une heure d'écriture identique à celle de l'inscription serait un lien de fait vers le compte.
- **Espace créé** : dans le parcours V5.2, l'entreprise et ses missions sont créées à l'inscription ; l'étape a donc la même date que l'inscription pour les nouveaux comptes. Elle reste dans l'entonnoir pour les comptes antérieurs et pour suivre la story.
- **Premier contenu validé** : le journal J-20 fait foi, car `validatedAt` peut être retiré par une nouvelle version (marque modifiée, #290). Le mot « production » est remplacé par « contenu » (charte §4.3).
- **Délai négatif** (e-mail confirmé après le lancement, par exemple) : compté comme nul dans la médiane.
- **Seuil de 5** et aucune vue croisée : réponse au risque de réidentification par activité et département signalé dans #311. L'export applique le même seuil.

## Vérification

- `npm run test:mesures` (nouvelle étape de CI) : construction de la trace champ par champ (liste blanche, aucune valeur identifiante, ni IP, jeton, e-mail ou lien), département, activité, coût, conservation de 25 mois, seuil d'affichage, vue agrégée, exports ; étapes, dernière étape, retour à J+7, médianes, cohortes, contre-mesures et plafonds sur des entreprises fictives.
- `tests/security.spec.ts` (CI, base jetable) : la trace écrite à l'inscription ne contient ni prénom, ni entreprise, ni site, ni commune, ni e-mail, ni identifiant du compte ou du brouillon ; la purge trace puis efface un brouillon expiré, une seule fois ; une trace de plus de 25 mois est effacée ; l'export et la page sont refusés aux non-administrateurs (403, « Accès réservé ») ; l'étape 1 et la page de confidentialité affichent la phrase de FR-60. `GET /api/admin/mesures/export` est déclarée dans `GUARDED_ROUTES`, `/admin/mesures` dans `GUARDED_PAGES`.
- `tsc`, ESLint et `next build` passent.

## Impacts et retour arrière

- Migration additive `20261109140000_trace_visites` (CODEOWNERS : approbation de l'autre développeur). Retour arrière : supprimer la table `VisitTrace` et la colonne `OnboardingDraft.furthestStep`, puis revenir à `deleteMany` dans `/api/cron/drafts` et `createDraft`.
- Données personnelles : la trace est conçue sans donnée directement identifiante, mais le jour de début, l'activité et le département restent des quasi-identifiants sur de petits effectifs. La qualification « anonyme » au sens du RGPD, la base légale et la durée de 25 mois restent à confirmer par l'avis RGPD (#69) et la page de confidentialité à faire valider (#2).
