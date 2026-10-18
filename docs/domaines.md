# Domaines BienDecider

Le backlog est réparti en douze domaines fonctionnels. Chaque US porte un label `domaine:*`, en plus de ses labels de type, de priorité, de statut et de zone décrits dans [github-tracking.md](github-tracking.md). Les Issues GitHub restent la source de vérité du suivi ; ce document donne la carte d'ensemble et la trajectoire qui la justifie.

## Carte des domaines

État des Issues `type:us` au 2026-10-18 : 143 US, dont 119 ouvertes et 24 fermées. Les colonnes P0 à P3 comptent les US ouvertes ; le catalogue initial [github-backlog.json](github-backlog.json) comptait 121 US au 2026-10-10, auxquelles se sont ajoutées celles de l'audit UX du 14 octobre et d'autres Issues libres.

| Domaine | Label | Périmètre | Ouvertes | P0 | P1 | P2 | P3 | Fermées |
|---|---|---|---|---|---|---|---|---|
| Dirigeant | `domaine:dirigeant` | Compte, objectif, tableau de bord, validation | 4 | 0 | 4 | 0 | 0 | 2 |
| Moteur et agents | `domaine:moteur` | Paul et les agents, de comprendre à arbitrer | 6 | 0 | 4 | 1 | 1 | 6 |
| Délégation et garde-fous | `domaine:delegation` | Niveaux, budget, autorisations, risque, transparence | 11 | 0 | 8 | 3 | 0 | 0 |
| Connecteurs | `domaine:connecteurs` | Gmail, Google, Meta, site : ce qui exécute | 11 | 0 | 7 | 4 | 0 | 0 |
| Mesure | `domaine:mesure` | Résultats, bilan, apprentissage | 6 | 0 | 2 | 4 | 0 | 0 |
| Monétisation | `domaine:monetisation` | Prix, crédits, paiement, facturation | 8 | 0 | 5 | 3 | 0 | 0 |
| Sécurité et conformité | `domaine:securite` | Accès, sessions, données personnelles, légal | 4 | 1 | 1 | 2 | 0 | 4 |
| Administration BienDecider | `domaine:admin` | Back-office, quotas, support, pilote | 5 | 0 | 2 | 3 | 0 | 1 |
| Plateforme technique | `domaine:plateforme` | Fiabilité, base de données, tests, documentation | 7 | 1 | 2 | 4 | 0 | 2 |
| Marque | `domaine:marque` | Landing, domaine, logo, tarifs | 4 | 0 | 0 | 4 | 0 | 0 |
| Expérience utilisateur | `domaine:ux` | Clarté du parcours, attente, mobile, accessibilité, cohérence visuelle | 22 | 0 | 7 | 13 | 2 | 7 |
| Entreprise | `domaine:entreprise` | Démarches des pères fondateurs : société BienOuBien, banque, contrats, assurances | 15 | 5 | 3 | 6 | 1 | 0 |
| Sans label de domaine | — | US du catalogue initial (#1 à #18) à classer par les responsables | 16 | 1 | 11 | 4 | 0 | 2 |

Vue par domaine : `https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Adomaine%3Amoteur` (remplacer `moteur` par le domaine voulu).

## Focus actuel : délégation P1

État vérifié dans les Issues ouvertes le **2026-10-18** : [8 US `domaine:delegation` en P1](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Adomaine%3Adelegation%20label%3Apriority%3Ap1) (les sept du 2026-10-10 et #179, issue de l'audit UX), 3 US en P2. Aucune n'est fermée ; #39 et #179 sont `status:in-progress`, les autres `status:backlog`. Les priorités sont déjà correctement étiquetées ; ne pas promouvoir automatiquement les P2.

**Attention au vocabulaire :** ce domaine concerne l'autonomie de BienDecider dans les actions des entreprises. Ce n'est pas la délégation de revue des PR aux développeurs après 4 secondes, documentée dans [ci-cd.md](ci-cd.md).

Ordre fondé sur les dépendances des US :

| Étape | Issue | Travail | État à suivre |
|---|---:|---|---|
| Décision des fondateurs | [#35](https://github.com/groupebienoubien/BienDecider/issues/35) `del-1` | Définir par type d'action ce qui peut partir sans validation, puis faire valider la politique par les deux fondateurs. | À prendre en premier (`status:ready`) ; bloque le code du domaine. |
| Garde-fous parallélisables après la décision | [#36](https://github.com/groupebienoubien/BienDecider/issues/36) `del-2`, [#38](https://github.com/groupebienoubien/BienDecider/issues/38) `del-4`, [#39](https://github.com/groupebienoubien/BienDecider/issues/39) `del-5` | Niveau par action, limites/budget, évaluation du risque fondée sur des règles. | Débloquer après #35 (`status:ready`). |
| Contrôle opérateur | [#41](https://github.com/groupebienoubien/BienDecider/issues/41) `del-7`, [#42](https://github.com/groupebienoubien/BienDecider/issues/42) `del-8` | Journal complet et pause immédiate avant toute action autonome. | Débloquer après #35 (`status:ready`), en priorité avant la première exécution autonome. |
| Agir dans le cadre | [#40](https://github.com/groupebienoubien/BienDecider/issues/40) `del-6` | Exécuter seulement si niveau, risque, autorisation et budget le permettent ; sinon demander validation. | Après #35, #36, #38 et #39 ; `status:blocked` jusque-là. |
| P2, volontairement hors focus immédiat | [#37](https://github.com/groupebienoubien/BienDecider/issues/37) `del-3`, [#43](https://github.com/groupebienoubien/BienDecider/issues/43) `del-9`, [#44](https://github.com/groupebienoubien/BienDecider/issues/44) `del-10` | Mode Conseiller, annulation/réversibilité, fusion du réglage de prospection. | Garder en P2 jusqu'à replanification. |

La validation humaine demeure le défaut tant que #35 n'est pas approuvée par les deux fondateurs et que les garde-fous P1 ne sont pas livrés et testés. La demande d'autonomie ne vaut pas autorisation de publier ou d'envoyer pendant cette phase.

### Tranche `del-5` livrée le 2026-10-10

- [x] Classification déterministe par `kind` de proposition, indépendante du contenu généré par le modèle ; justification visible sur la carte de proposition.
- [x] Facteurs explicites évalués : exposition publique, communication externe, données de tiers, dépense et irréversibilité ; un facteur risqué ne peut pas être neutralisé par le modèle.
- [x] Les administrateurs explicitement listés par `ADMIN_EMAILS` peuvent régler le niveau par type d'action dans Administration ; réglages globaux persistants et visibles sur les propositions, sans abaisser le plancher automatique.
- [x] Types inconnus classés à risque élevé par défaut ; les pistes de croissance et prospects sont modérés car ils contiennent des données d'organisations tierces. Aucun type livré n'est faible.
- [x] Publications, réponses publiques, prospection, contenu de site et email Gmail classés élevés.
- [x] Le formulaire Gmail signale le risque élevé et l'irréversibilité avant la confirmation d'envoi.
- [x] Le serveur exige le mode `Accompagner` et une confirmation humaine pour publier un site ou envoyer un Gmail ; l'interface rend les facteurs lisibles.
- [x] Tests du classificateur, des décisions de mode et vérification navigateur du badge/facteur sur une proposition à risque élevé.
- [ ] Compléter les règles métier (réversibilité, exposition publique, dépense, données de tiers) par action, avec validation des deux fondateurs dans #35.
- [ ] Persister les modes autorisés par entreprise et type d'action après #35 ; appliquer au serveur le seuil aux autres connecteurs/actions et aux contextes réels de dépense/réversibilité. Au-dessus du seuil, forcer la validation même si l'interface est contournée.

Implémentation : [src/lib/delegation-risk.ts](../src/lib/delegation-risk.ts), page admin `/admin/risques`, affichage : [ProposalCard](../src/components/proposal-card.tsx), gardeurs serveur : publication du site et Gmail, tests : [delegation.spec.ts](../tests/delegation.spec.ts). La politique est globale et n'abaisse pas le plancher déterministe. Aucun mode autonome n'est activé dans le prototype ; ce n'est pas encore le moteur complet d'autorisation de #39. Procédure DB/admin : [delegation-risk-admin.md](delegation-risk-admin.md).

## Trajectoire cible

Promesse : *vous fixez l'objectif, l'IA trouve comment agir, vous gardez le contrôle.* Le moteur enchaîne sept étapes. Le tableau situe le code du 2026-10-09 face à cette cible ; les lignes Comprendre et Exécuter ont été mises à jour le 2026-10-18.

| Étape | Aujourd'hui | Écart | Domaine |
|---|---|---|---|
| Comprendre | Formulaire d'onboarding ; une phrase libre préremplit le profil pour confirmation | Recette de #20 à faire | `dirigeant`, `ux` |
| Diagnostiquer | Martine, page Diagnostic | Couvert | `moteur` |
| Planifier | Plan de Paul | Ni coût estimé ni impact attendu par action | `moteur`, `monetisation` |
| Arbitrer | Rien | Une seule action proposée, pas d'options ni de critères | `moteur` |
| Déléguer | Tout est validé à la main | Un seul niveau sur trois ; pas de budget, d'autorisations ni d'évaluation du risque | `delegation` |
| Exécuter | Site, email Gmail manuel, publication sur la Page Facebook connectée | Fiche Google, Instagram et publication LinkedIn non disponibles ; publicité et administratif à cadrer | `connecteurs` |
| Mesurer | Suivi des prospects, objectif chiffré | Rien sur les posts, le site, la fiche Google | `mesure` |
| Adapter | Paul lit le suivi des prospects | Pas de proposition de réorientation | `mesure`, `moteur` |

Les trois niveaux de délégation visés sont Conseiller (je reçois des recommandations et je décide), Accompagner (je valide les actions importantes) et Déléguer (BienDecider agit dans mes limites). Le niveau Déléguer lève la règle historique de validation humaine obligatoire : l'US `del-1` acte cette décision, type d'action par type d'action, avant tout développement du domaine.

## Règles de classement

- **Une US, un domaine.** En cas de doute, choisir le domaine de la personne qui en bénéficie, pas celui du fichier modifié.
- **`ux`** couvre la façon dont le dirigeant vit le produit, quel que soit l'écran ; la fonction elle-même reste dans son domaine.
- **`securite`** prime sur `connecteurs` et `plateforme` quand l'enjeu est la protection des comptes ou des données.
- **`admin`** regroupe ce que voient les pères fondateurs dans le back-office ; **`entreprise`** regroupe leurs démarches hors du code (société, banque, contrats).
- **`priority:p3`** marque ce qui est gardé pour mémoire, sans date.

## Identifiants

Les US ajoutées le 2026-10-10 ont un identifiant de catalogue par domaine (`dir-1`, `mot-3`, `del-6`, `ent-5`...) ; les 18 premières gardent le leur (`legal`, `gmail-live`...). L'identifiant figure dans le marqueur en tête de chaque Issue et sert aux dépendances ; le numéro GitHub reste la référence au quotidien.

Origine des US ajoutées, rappelée dans chaque Issue : la trajectoire cible ci-dessus, l'audit du code du 2026-10-09, [backlog.md](backlog.md), ou une demande directe des pères fondateurs.

## Après le premier import

L'import crée les Issues manquantes sans modifier les existantes. Les 18 Issues déjà ouvertes ne reçoivent donc pas leur label de domaine automatiquement ; il se pose une fois à la main, d'après le champ `domain` du catalogue :

| Domaine | Issues |
|---|---|
| `domaine:plateforme` | 1 |
| `domaine:securite` | 2, 7 |
| `domaine:marque` | 3, 4 |
| `domaine:connecteurs` | 5, 6, 8 à 15 |
| `domaine:mesure` | 16, 17 |
| `domaine:admin` | 18 |
