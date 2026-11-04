# Repartir le travail avec GitHub Issues

## Une source de verite

Le suivi courant est dans [les Issues BienDecider](https://github.com/groupebienoubien/BienDecider/issues), pas dans deux listes de cases a maintenir en parallele. La cible du produit et les decisions en vigueur sont dans [cible-produit.md](cible-produit.md) ; l'ancien backlog, fige au 18 octobre 2026, est archive ([archives/backlog.md](archives/backlog.md)). Les anciens elements livres ne sont pas recrees comme des US ouvertes.

Chaque US contient le besoin utilisateur, des criteres d'acceptation, les dependances, la verification et le perimetre. Une US = un resultat livrable ; si elle est trop grosse, la decouper avant de la prendre.

## Vues utiles sans outil supplementaire

- [US ouvertes](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Atype%3Aus).
- [Pretes a prendre](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Aready).
- [Mon travail](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20assignee%3A%40me).
- [A relire](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Areview).
- [Bloquees](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Ablocked).
- [P0](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Apriority%3Ap0).
- [Cible V5.2](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Acible-v5.2).
- [Suivi du PoC (#272)](https://github.com/groupebienoubien/BienDecider/issues/272) : perimetre, ordre de realisation, definition de fini.
- [Relectures differees, PR ouvertes ou fermees](https://github.com/groupebienoubien/BienDecider/pulls?q=is%3Apr%20label%3Areview-deferred).

Pas de GitHub Project obligatoire : les Issues et les filtres suffisent a deux. Un tableau Project pourra etre ajoute plus tard sans dupliquer les US.

## Statuts et priorites

| Label | Signification |
|---|---|
| `status:backlog` | A prioriser, preciser ou debloquer avant de commencer |
| `status:ready` | Criteres clairs, dependances levees, travail disponible |
| `status:in-progress` | Un responsable travaille dessus |
| `status:review` | PR ouverte pour validation |
| `status:blocked` | Attente explicite, avec raison et prochaine action dans un commentaire |
| Issue fermee | Livree ; la recette/deploiement est confirme ou l'Issue sera rouverte en cas d'echec |
| `priority:p0` | Bloquant avant ouverture externe, notamment securite/conformite |
| `priority:p1` | Prochain travail prioritaire |
| `priority:p2` | Plus tard, ne pas prendre avant les priorites convenues |
| `priority:p3` | Non planifie, garde pour memoire |
| `area:dev` / `area:external` | Code ou demarche console/fournisseur/CEO |
| `domaine:*` | Un des douze domaines fonctionnels (tableau ci-dessous) |
| `cible-v5.2` | US alignee sur la cible V5.2 ([cible-produit.md](cible-produit.md)) ; ses criteres renvoient aux FR du cahier des charges |
| `maquette-v3` | Ancienne cible, remplacee par `cible-v5.2` le 2026-11-04 ; ne plus l'utiliser |
| `type:suivi` | Issue de suivi (ordre, jalons, definition de fini), sans livrable propre |

Jalons : **PoC 1 - Prérequis d'ouverture**, **PoC 2 - Parcours cible V5.2**, **PoC 3 - Canaux réels**, **Après le PoC**. L'ordre de réalisation et la definition de fini du PoC sont tenus dans #272.

| Domaine | Perimetre |
|---|---|
| `domaine:dirigeant` | Compte, objectif, tableau de bord, validation |
| `domaine:moteur` | Paul et les agents, de comprendre a arbitrer |
| `domaine:delegation` | Niveaux, budget, autorisations, risque, transparence |
| `domaine:connecteurs` | Gmail, Google, Meta, LinkedIn, site : ce qui execute |
| `domaine:mesure` | Resultats, bilan, apprentissage |
| `domaine:monetisation` | Prix, credits, paiement, facturation |
| `domaine:securite` | Acces, sessions, donnees personnelles, legal |
| `domaine:admin` | Back-office, quotas, support, pilote |
| `domaine:plateforme` | Fiabilite, base de donnees, tests, documentation |
| `domaine:marque` | Landing, domaine, logo, tarifs |
| `domaine:ux` | Clarte du parcours, attente, mobile, accessibilite |
| `domaine:entreprise` | Demarches des PF : societe, banque, contrats |

La carte des domaines d'octobre, avec le focus delegation P1 et la premiere tranche de #39, est archivee dans [archives/domaines.md](archives/domaines.md).

Réglages admin dynamiques (P1) : procédure de rôle explicite, table et déploiement du schéma dans [delegation-risk-admin.md](delegation-risk-admin.md). Ce réglage global ne lève pas la validation humaine et ne remplace pas la décision fondatrice #35.

**Un seul label `status:*` par Issue ouverte.** Retirer l'ancien en changeant d'etape. Les priorites et le statut initial de l'import sont un point de depart, a ajuster ensemble. Une date d'eligibilite fournisseur ne doit pas etre inventee.

## Routine quotidienne a deux

1. Choisir ensemble les deux prochaines US, selon priorite et dependances. Mettre a jour les criteres si necessaire. Chacun commence par une seule US active.
2. Dans **Assignees**, assigner une personne responsable. Ne pas affecter silencieusement une US a l'autre ; confirmer qu'elle est disponible. Un second participant peut etre mentionne dans le corps.
3. Avant de coder, passer a `status:in-progress` et nommer la branche `feat/<numero>-description` ou `fix/<numero>-description`. Pour une demarche externe, le responsable suit la console et note la decision dans l'Issue.
4. Ouvrir la PR vers `main`, ajouter `Closes #numero` si elle livre tous les criteres, sinon `Refs #numero`. Passer l'US a `status:review` et demander la relecture. Appliquer la delegation de [ci-cd.md](ci-cd.md) apres 4 secondes sans reponse ou indisponibilite annoncee, hors zones sensibles de CODEOWNERS ou l'approbation de l'autre developpeur est obligatoire ; l'Issue ne vaut pas autorisation d'ignorer la CI. Documenter impacts, tests et retour arriere, puis demander une relecture differee.
5. Apres Checks vert et validation/delegation, fusionner. GitHub ferme automatiquement l'US liee par `Closes` lorsque la PR arrive sur `main`. L'auteur confirme Vercel et la recette dans l'Issue ; retirer le label de statut devenu inutile. Si le deploiement ou les criteres echouent, rouvrir et noter le probleme.
6. Si bloque, mettre `status:blocked`, expliquer le blocage, qui peut agir et la prochaine verification. Repasser a ready quand les dependances sont levees ; ce changement n'est pas automatise sur une simple fermeture d'Issue dependante.

Petit point de 10 minutes une fois par semaine : trier P0/P1, revoir les blocages, retirer les US obsoletes avec une raison et traiter les relectures `review-deferred`. Mettre a jour le contexte Markdown seulement quand une decision produit/architecture change.

## Import initial et nouvelles US

Le workflow [Backlog Issues](../.github/workflows/backlog.yml) lit [github-backlog.json](github-backlog.json). Le catalogue initial contenait 18 US de travail restant ; 103 US classees par domaine ont ete ajoutees le 2026-10-10 (voir [domaines.md](archives/domaines.md)) ; l'absence d'approbation fournisseur n'est pas marquee comme une fonctionnalite livree.

L'import s'execute sur `main` quand le catalogue, le script ou son workflow change ; il peut aussi etre relance via **Actions > Backlog Issues > Run workflow**. Il utilise le token natif GitHub Actions avec `issues: write`, aucun PAT ni secret externe. Les PR de branches ne creent pas d'Issues par ce workflow.

Le script recherche un identifiant stable `<!-- biendecider-us:... -->` dans les Issues ouvertes **et fermees**. S'il existe, il ne modifie ni titre, ni corps, ni statut, ni priorite, ni responsable. Conserver cet identifiant dans les US importees. Les dependances des nouvelles US sont liees aux numeros GitHub apres creation. Une interruption peut laisser certaines references sous forme d'identifiants : les completer manuellement sans recreer l'US.

**Pour une nouvelle US ordinaire :** GitHub > Issues > New issue > User story. Choisir le responsable et les labels apres discussion. Le champ Priorite du formulaire ne remplace pas le label `priority:*` : l'ajouter explicitement. Pas besoin de modifier le catalogue pour chaque changement de statut.

**Pour un lot de nouvelles US :** ajouter des entrees avec IDs uniques au catalogue dans une PR ; l'import ne cree que les absentes apres fusion. Ne pas attendre qu'une edition du catalogue synchronise une Issue deja creee : editer cette Issue directement. Les bugs peuvent utiliser une Issue libre avec un titre et des criteres de verification.

## Limites et droits

- Si le workflow n'a pas le droit de creer les Issues, un administrateur doit autoriser GitHub Actions et les permissions demandees, puis relancer. Les logs affichent les liens crees, jamais de secret.
- L'import ne devine pas le login du second developpeur et n'assigne personne automatiquement. Les deux collaborateurs choisissent leur responsable dans Assignees.
- Aucun statut ne prouve un resultat fournisseur : l'envoi Gmail accepte n'est pas une preuve de livraison, OAuth n'est pas une publication, et une PR fusionnee peut encore echouer au deploiement.
- Le depot est public : aucun secret, donnees client, adresse personnelle de destination ou identifiant de reviewer prive dans les Issues. Partager les acces via le gestionnaire de secrets, pas le ticket.

Tests de l'import sans reseau : `node --test scripts/sync-backlog.test.cjs`. Ces tests sont inclus dans Checks et dans le workflow d'import.