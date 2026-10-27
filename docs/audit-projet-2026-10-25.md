# BienDecider : audit de maturité, positionnement et parcours

Date : 25 octobre 2026.

## Synthèse

BienDecider est un **MVP avancé, candidat à un pilote encadré**, mais pas encore un SaaS dont l'utilité récurrente et la viabilité commerciale sont démontrées.

Le principal enjeu n'est plus d'ajouter des agents : il est de prouver qu'un dirigeant comprend rapidement l'offre, réalise une action utile et revient la semaine suivante.

**Recommandation centrale : sécuriser l'ouverture, puis donner la priorité à l'observation de cinq dirigeants (#100) et au pilote de cinq entreprises (#18), devant l'élargissement fonctionnel.**

## 1. Périmètre et limites

L'audit croise le code, les dernières modifications de `main`, les Issues GitHub, les recettes documentées et les pages officielles de solutions concurrentes.

- Référence distante consultée : `main`, commit `604588c1372f490db3cfecfdc4ac7f666874d7bd`.
- La [CI de ce commit](https://github.com/groupebienoubien/BienDecider/actions/runs/40179791767) est terminée avec succès.
- La branche locale n'a pas été changée pendant l'audit. Certaines évolutions récentes ont été consultées directement sur `origin/main`.
- Aucune nouvelle session authentifiée ni action externe n'a été réalisée en production pour cet audit.
- La configuration de production, les secrets, les autorisations fournisseurs et l'exécution de la migration des anciens jetons OAuth n'ont pas été vérifiés.
- Les tests automatisés avec fournisseurs simulés ne prouvent ni le fonctionnement réel de chaque fournisseur ni l'impact commercial.
- L'absence de preuves clients dans les éléments consultés ne permet pas d'affirmer qu'aucune recherche commerciale n'existe ailleurs.

Ce document est un état des lieux, pas une certification de sécurité, une étude de marché exhaustive ou un test d'utilisabilité auprès de clients.

## 2. Maturité du projet

| Dimension | État actuel | Prochaine preuve nécessaire |
| --- | --- | --- |
| Socle technique | Authentification, isolation des entreprises, migrations, tests, orchestration et budgets substantiels | Restauration, alertes et gestion des incidents éprouvées |
| Fiabilité des agents | Nettement améliorée ; corrections #244 et OAuth #7/#8 livrées | Recettes réelles régulières, qualité des sources et exactitude des productions |
| Exécution | Site, publication Facebook et envoi Gmail présents dans le code | Parcours complet avec comptes externes et autorisations fournisseurs |
| Parcours | Objectif, diagnostic, plan, décisions et résultats structurés | Compréhension et activation mesurées auprès de dirigeants |
| Commercial | Offre encore à stabiliser | Segment précis, prix, engagements payants, rétention et marge |
| Impact métier | Traçabilité des actions et suivi déclaratif | Preuve que les actions aident à obtenir des contacts ou clients |

### Points solides

- Le produit dépasse une simple interface de conversation : il organise le passage de l'objectif au travail préparé, puis à la décision et à l'exécution.
- Les protections de validation, le versionnement des productions et les tests constituent un socle utile pour agir au nom d'une entreprise.
- Les capacités par canal sont explicitées dans un [référentiel unique](../src/lib/channel-capabilities.ts).
- Le [rapport](../src/app/rapport/page.tsx) distingue les diffusions confirmées par les canaux des résultats déclarés par le dirigeant. Il n'attribue pas artificiellement du chiffre d'affaires à une publication.
- Les anciens blocages de quota et les huit défauts d'orchestration ne doivent plus être présentés comme ouverts : les corrections correspondantes ont été livrées.

### Réserves prioritaires

1. **Administration ouverte par défaut.** Dans [le contrôle d'accès administrateur](../src/lib/admin.ts), l'absence de `ADMIN_EMAILS` suffit à considérer un utilisateur connecté comme administrateur. La configuration de production est inconnue. Le code doit néanmoins être fermé par défaut avant un pilote externe : US #63.
2. **Accès HTTPS à vérifier immédiatement.** Le navigateur utilisé pour l'audit a refusé les domaines avec et sans `www`, avec une erreur de certificat. Une vérification `curl` a également signalé un certificat expiré. Confirmer le problème depuis un environnement indépendant et vérifier certificat, DNS et réseau ; ces observations ne prouvent pas une indisponibilité universelle.
3. **Activation fragile documentée.** La recette du 24 octobre, seconde séance, consultée sur `origin/main`, signale encore un 503 sur « Préremplir mon profil ». La [route d'interprétation](../src/app/api/onboarding/interpret/route.ts) renvoie une erreur générique sans journaliser sa cause dans ce traitement. Reproduire sur la version déployée et diagnostiquer avant recrutement.
4. **Exploitation à prouver.** Une CI verte ne remplace pas une restauration testée, des erreurs exploitables et une recette réelle des autorisations, publications, envois et renouvellements de jetons.

## 3. Positionnement et différenciation

### Diagnostic concurrentiel

**La différenciation actuelle est insuffisamment démontrée, mais une direction crédible existe.**

Les pages officielles consultées présentent un recouvrement important :

| Solution | Périmètre annoncé pertinent pour la comparaison |
| --- | --- |
| [Localo](https://localo.com/) | Audit local, tâches recommandées et outils de gestion de visibilité Google |
| [Partoo](https://www.partoo.co/fr/) | Visibilité, avis et interactions clients ; cible notamment les réseaux d'établissements |
| [Buffer](https://buffer.com/ai-assistant) | Génération, adaptation et édition de contenus sociaux |
| [Wix](https://www.wix.com/) | Site, marketing et outils de gestion commerciale intégrés |

Il s'agit de promesses commerciales publiées par ces fournisseurs, pas d'un benchmark indépendant de qualité ou de performance. Les cibles et offres ne sont pas strictement identiques.

« Une équipe IA », « produire des posts » ou « créer un site » ne constituent donc pas, seuls, un avantage défendable.

### Positionnement à tester

> Pour les indépendants de services qui veulent davantage de demandes qualifiées sans gérer plusieurs outils, BienDecider prépare les prochaines actions commerciales pertinentes, vous laisse les décider et suit ce qu'elles ont donné.

Le potentiel distinctif réside dans la continuité : **contexte de l'entreprise → priorités justifiées → travail prêt à utiliser → décision → action → bilan**.

Cela implique quatre choix :

- Commencer par un segment homogène, par exemple des artisans de services locaux recherchant des devis, plutôt que toutes les TPE. Ce segment reste une hypothèse à confronter aux entretiens.
- Prioriser une à trois actions pertinentes, plutôt que maximiser le nombre de productions.
- Expliquer pourquoi une action convient à cette entreprise, avec sources, hypothèses et incertitudes.
- Vendre un accompagnement vers un résultat, sans garantir un nombre de clients ni se réduire à un générateur de posts Facebook.

La personnalisation, les refus mémorisés et les résultats suivis peuvent créer un avantage avec le temps. À ce stade, c'est une hypothèse produit, pas une barrière concurrentielle acquise.

## 4. Parcours utilisateur et clarté de l'offre

### Ce qui fonctionne déjà

L'[accueil](../src/app/page.tsx) nomme une cible, présente un exemple concret clairement fictif, montre le produit et explique le contrôle humain. Le référentiel des canaux distingue publication intégrée et utilisation manuelle.

L'[onboarding](../src/components/company-profile-form.tsx) prévoit une entrée en langage naturel et un formulaire. Il faut éprouver leur fiabilité, pas présumer que la saisie conversationnelle est plus simple pour tous.

### Ce qui doit devenir immédiatement compréhensible

« Vous décidez. Votre activité avance » est une signature, pas une offre complète. Avant de créer son compte, un visiteur devrait pouvoir expliquer :

- À qui le service s'adresse et pour quel problème concret.
- Ce qu'il recevra lors de la première session, puis chaque semaine.
- Ce que BienDecider exécute réellement et ce qui reste manuel.
- Le prix, les conditions d'accès et les limites d'usage.
- Le temps et les décisions qui lui seront demandés.
- Les résultats suivis, sans promesse de chiffre d'affaires garanti.

Le tarif reste ouvert dans #87. Son absence rend l'engagement demandé difficile à évaluer. Une offre pilote explicite suffit pour expérimenter ; il n'est pas nécessaire d'attendre une gamme complète.

### Parcours cible à tester

| Étape | Optimisation recommandée | Vérification |
| --- | --- | --- |
| Découverte | Résultat concret avant présentation détaillée de l'équipe ; périmètre et conditions visibles | Le visiteur reformule correctement l'offre |
| Inscription | Rappeler le premier bénéfice attendu et les conditions d'accès | Abandons et questions observés |
| Onboarding | Une phrase, correction du profil interprété et formulaire de secours fiable | Première valeur sans assistance |
| Diagnostic → plan | Montrer le constat qui justifie chaque priorité | Le dirigeant comprend pourquoi agir |
| Décision → diffusion | Conserver les protections ; rendre chaque confirmation informative | Distinction comprise entre approuvé, publié et envoyé |
| Retour hebdomadaire | Résumer les actions, les retours et la prochaine priorité | Retour sans relance personnelle systématique |

La validation humaine est un atout de confiance, mais sa charge reste à mesurer. L'optimisation consiste d'abord à réduire les décisions inutiles et les confirmations ambiguës, pas à supprimer les protections.

## 5. Prochaines étapes et priorités

| Priorité | Travail | Critère de sortie |
| --- | --- | --- |
| **P0 : avant pilote** | Fermer l'admin par défaut (#63), vérifier HTTPS, reproduire le 503, contrôler configuration et migration OAuth | Un compte externe suit le parcours sans exposition ni blocage critique |
| **P0 : avant pilote** | Recette réelle du canal retenu, restauration testée (#82), erreurs exploitables (#83), cadre juridique adapté (#2/#115) | Exécution vérifiable et procédure de reprise connue |
| **P1 : prochain cycle** | Choisir le segment et la promesse ; expliciter offre et prix (#55/#87) ; observer cinq dirigeants (#100) | Compréhension et première action utile sans guidage |
| **P1 : ensuite** | Pilote de cinq entreprises pendant quatre semaines (#18), avec conditions commerciales explicites | Usage récurrent et engagements payants observables |
| **P2** | Boucle hebdomadaire, impact et coût complet (#54/#49/#50/#76) | Décision argumentée sur valeur, prix et marge |
| **P3** | Nouveaux canaux et autonomie supplémentaire | Demande récurrente démontrée dans le pilote |

Ces priorités sont une recommandation d'audit : elles n'ont pas été appliquées aux labels ou aux Issues. Les travaux juridiques et commerciaux doivent être adaptés au cadre réel du pilote et de la commercialisation.

### Protocole minimal du pilote

Observer la première session sans guider, puis suivre pendant quatre semaines :

- Le délai jusqu'à la première action jugée utile par le dirigeant.
- Les incompréhensions, corrections et abandons.
- Les actions réellement réalisées, distinctes des productions seulement approuvées.
- Le retour hebdomadaire et le besoin de relance ou d'assistance.
- Les contacts obtenus, leur source et le caractère déclaré ou confirmé de chaque mesure.
- Le coût complet par entreprise, incluant les modèles, l'infrastructure et le temps d'assistance.
- Le consentement à payer, vérifié par un engagement commercial réel et pas seulement une intention.

Des règles initiales pourraient être : **4 dirigeants sur 5 comprennent l'offre, 4 réalisent une première action utile et 3 restent actifs à la quatrième semaine**. Ces seuils sont proposés pour structurer une décision ; ils ne sont ni une prévision ni une validation statistique du marché.

Un essai gratuit ne valide pas le consentement à payer. Un contact déclaré après une publication ne prouve pas, à lui seul, une attribution causale.

## Conclusion

BienDecider a suffisamment de matière pour tester sa valeur. Il lui manque surtout la preuve qu'il simplifie durablement le travail commercial d'un public précis.

Le prochain cap devrait être une **boucle complète, fiable et répétée par quelques vrais clients**, plutôt qu'un périmètre fonctionnel plus large. Les résultats de ce pilote doivent ensuite arbitrer les canaux, le niveau d'autonomie, le prix et les investissements techniques.