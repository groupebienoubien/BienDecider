# Onboarding : prouver la valeur avant de demander un compte

Audit du 12 novembre 2026, correctifs ciblés et cas d'usage de la refonte.

## Actualisation du 13 novembre : raccourcir le chemin vers les missions

Cette actualisation porte sur le parcours réellement livré. Les sections suivantes conservent l'audit historique et les cibles plus larges du 12 novembre.

### Incohérences constatées

| Priorité | Cause vérifiée | Correction |
| --- | --- | --- |
| P1 | Modifier le site ou choisir Google renvoyait à la découverte, puis obligeait à retrouver les réseaux dans la confirmation. | La relecture reste à l'étape 2, avec progression et rafraîchissement des candidats. |
| P1 | Le planificateur pouvait s'arrêter au premier levier. Ce n'était pas un plafond technique d'une mission : le schéma en accepte trois. | Le même appel examine tous les modèles disponibles et vise trois leviers complémentaires, ordonnés et justifiés. |
| P1 | Sources, constats, statut des réseaux, profil et synthèse se répétaient avant les décisions. Chaque mission affichait sept lignes de cadrage. | Confirmation centrée sur les liens et l'activité ; constats repliables ; résultat, indicateur et action du dirigeant visibles dans les missions. |
| P1 | Le compte promettait toujours trois missions, quel que soit le plan affiché. | Le texte reprend le nombre réel, y compris zéro ou une mission. |

### Parcours mis en place

1. **Entreprise** : uniquement le nom et la ville. La découverte ouvre immédiatement la confirmation, sans demander de prénom ni de site au départ.
2. **Découverte en popup** : sélectionner la fiche Google ou un site proposé déclenche immédiatement sa lecture en arrière-plan, sans bouton supplémentaire. La popup reste utilisable ; site, réseaux, activité, zone, clients et offres se complètent à l'arrivée des résultats, sans écraser les corrections, même un champ volontairement vidé. La confirmation du profil et des réseaux reste explicite. Facebook, Instagram et LinkedIn peuvent aussi être ajoutés manuellement ; ils restent des déclarations, sans source ni date de lecture inventées. L'activité et les autres précisions métier restent facultatives, dans un panneau repliable. Fermer la popup ne confirme rien et conserve les saisies à la réouverture.
3. **Objectif** : texte libre, reformulation et confirmation. Le jalon `sourcesReady` permet de continuer dès que les liens sont disponibles, même si l'interprétation du site tourne encore. Une modification de source attend la fin de la lecture précédente et reste dans la popup pour faire vérifier les nouveaux liens.
4. **Missions** : cartes aérées avec l'action, le résultat à tester, ce que Paul prépare (ou le test terrain mené par le dirigeant), « De votre côté », un signal principal et la date du bilan. Justification, mesure, effort, prérequis et preuves sont repliés ; les constats ne sont plus recopiés trois fois. La synthèse et les comparables restent secondaires.
5. **Compte puis stratégie** : prénom facultatif à cette étape, nombre exact de missions annoncé ; plan conservé et créé dans l'ordre à l'inscription, aucune mission exécutée automatiquement.

### Action et mesure

- Un chiffre de référence manquant ne déclenche plus systématiquement un diagnostic de quatorze jours. Le planificateur privilégie un test concret avec une mesure légère intégrée.
- Un diagnostic préalable reste pertinent si une inconnue empêche réellement une action faisable ou sûre ; il doit préciser la question décisive et la façon la plus courte d'y répondre.
- Un créneau de semaine non précisé n'interdit plus à lui seul une proposition. Le créneau et la capacité restent à confirmer avant lancement ; les interdictions explicites de capacité nulle ou de temps supplémentaire restent appliquées.
- Le prompt demande du texte brut, des phrases courtes, un angle précis et un signal principal, sans chaîne récitée « Objectif / Faits / Obstacle / Action / Signal / Bilan ». Il n'autorise ni prix, ni réduction, ni horaires, ni capacité inventés.
- Exemple La Tonnelle : choisir avec le dirigeant un service à tester, préparer un message sur une offre réellement confirmée, puis compter simplement les tables qui citent ce message. Ne pas prétendre connaître le service le plus creux ni promettre les 10 %.

### Enchaînement en arrière-plan

- La sélection envoie `update_sources`, distinct de `confirm_profile` : elle reste à l'étape 2 et n'enregistre pas les hypothèses du formulaire comme des déclarations. Un site proposé rattache sa fiche Google si aucune fiche n'a encore été choisie.
- Les changements de source sont désactivés pendant une lecture pour éviter les lancements concurrents. Les autres champs restent modifiables. Une erreur de lancement est affichée avec une relance explicite ; les quotas existants restent appliqués.
- La popup est actualisée au jalon des sources puis à la fin de l'interprétation, sans remontage du formulaire. Une nouvelle lecture n'hérite pas des validations sociales de la précédente ; les champs non corrigés suivent seulement les résultats de la source courante.
- Les liens sont persistés avant la fin de l'extraction. Les données non encore confirmées ne deviennent pas des déclarations du dirigeant lors de l'arrivée tardive du modèle.
- Si l'objectif est confirmé pendant l'analyse, l'écran des missions attend sa fin, puis poursuit par un POST `prepare_missions`. La recherche et la planification utilisent alors le dernier dossier complet, pas un instantané partiel.
- Les lectures de page restent sans effet serveur : le POST de continuation est contrôlé, plafonné et idempotent pour un dossier déjà préparé. Une erreur de lancement est visible et peut être réessayée.
- Les raccourcis vers le compte sont refusés pendant l'analyse, la recherche ou une préparation non encore démarrée. Les refus de quota et les échecs de recherche restent explicites, sans missions génériques de secours.
- Les plans déjà enregistrés ne sont pas réécrits au simple rechargement. Reconfirmer l'objectif passe le dossier à la version 2 et invalide l'ancien plan, même si le texte de l'objectif n'a pas changé ; la recherche suivante applique alors la nouvelle approche.

### Exploitation de l'analyse et limites

- La génération vise une priorité immédiate, un deuxième levier et un test exploratoire distincts. Les offres, la clientèle déclarée et les opportunités sourcées comptent aussi, pas seulement le premier défaut du site.
- Aucun appel IA ajouté au dossier : la continuation ne fait que différer la recherche déjà demandée à la confirmation de l'objectif. Trois missions peuvent nécessiter davantage de tokens de sortie dans l'appel existant.
- Trois missions ne sont pas garanties : les contraintes et preuves restent prioritaires. Le prompt exige d'expliquer pourquoi seules zéro, une ou deux actions sont justifiables. Les plans historiques restent lisibles.
- Un profil social confirmé n'est ni une connexion OAuth ni une analyse de ses publications. Cette passe n'ajoute aucun connecteur ni aucune couverture de Snapchat ou d'autres plateformes.
- Une correction de source peut encore nécessiter une nouvelle lecture, dans les quotas existants. Elle ne demande plus de revenir à la découverte ni de ressaisir les champs validés.

### Recette

- Règles : tests de qualité onboarding et de planification, conservation de trois missions distinctes, refus des preuves inventées, coût et absence de secours générique.
- Navigateur sur base locale jetable : cinq étapes jusqu'à l'inscription, retours et rechargements, cas sans site, provenance consultable, correction du site et confirmation du nouveau profil Instagram sans sortir de l'étape 2.
- Types et lint ciblé ; contrôle visuel desktop/mobile. Aucune base client modifiée. La qualité de trois recommandations générées avec un appel réel au modèle reste à mesurer ; les sorties des tests sont contrôlées.
- Bilan local : 25 tests passent dans la dernière exécution groupée ; le test avec appel réel au modèle est désactivé. Le parcours complet a réussi lors de la première recette, mais échoue dans les dernières passes à l'ouverture de la stratégie avec les erreurs de protocole de PGlite (`portal does not exist`, paramètres d'une requête préparée mélangés). Le démarrage de PostgreSQL natif est refusé depuis le terminal administrateur Windows : une recette finale sur PostgreSQL reste nécessaire, sans masquer cet échec ni modifier la stratégie pour contourner le banc de test.

### Recette de la refonte popup / action immédiate

La nouvelle passe utilise une base PGlite en mémoire isolée, avec plusieurs connexions autorisées, un pool applicatif de taille 1 et les services externes désactivés. Aucune base distante ni donnée client n'est modifiée.

```text
npx playwright test onboarding-quality.spec.ts mission-planning.spec.ts delegation.spec.ts user-journey.spec.ts --grep "onboarding quality|onboarding redesign|mission planning|GH-279: (each step|five)|GH-280: (the analysis fills|without a site|rubric states|step 2)|GH-281: (each field|step 2)|GH-292: step 2" --workers=1 --reporter=line
```

- Résultat : **36 réussis, 1 désactivé** (comparaison avec appel réel au modèle).
- `npm run test:public-sources` : **5 réussis**.
- `npx tsc --noEmit` : **réussi** ; ESLint ciblé sur les fichiers touchés : **réussi**, sans avertissement.
- Parcours complet jusqu'au compte et à la stratégie, retours, rechargements, prénom facultatif et validation des erreurs : réussis.
- Popup fermée avec Échap puis rouverte sans perte, liens déclarés et découverts conservés, objectif pendant l'analyse, continuation unique de la préparation : réussis.
- Contrôle à **320, 390 et 1 440 px** : pas de débordement horizontal, corps des actions d'au moins 16 px, détails repliés ; captures desktop/mobile relues.
- Reconfirmation du même objectif : l'ancienne version du plan est bien invalidée, contrairement au simple rechargement.
- Les textes des tests sont contrôlés. L'amélioration rédactionnelle sur une génération réelle de La Tonnelle n'a pas été mesurée ; elle demande une nouvelle confirmation de l'objectif avec le service IA configuré.

### Recette du remplissage automatique après sélection

Sur le même banc local isolé, services externes désactivés :

- Règles : `npx playwright test onboarding-quality.spec.ts delegation.spec.ts --grep "onboarding quality|GH-280|GH-281" --workers=1 --reporter=line` : **28 réussis**.
- Navigateur : `npx playwright test user-journey.spec.ts --grep "onboarding autofill|onboarding quality|onboarding redesign|GH-279: (each step|five)|GH-280: step 2|GH-281: (each field|step 2)|GH-292: step 2" --workers=1 --reporter=line` : **9 réussis**.
- `npm run test:public-sources` : **5 réussis** ; `npx tsc --noEmit` et ESLint ciblé : **réussis**.
- Vérification finale après mutualisation des choix Google : `npx playwright test onboarding-quality.spec.ts delegation.spec.ts user-journey.spec.ts --grep "onboarding quality|GH-280|GH-281|onboarding autofill" --workers=1 --reporter=line` : **35 réussis**, dont le cas sans site ; types et lint revérifiés.
- Sélection Google et site proposé : lancement automatique vérifié par le POST réel et l'analyse persistée. Le test simule ensuite deux arrivées différées pour vérifier le site, les nouveaux liens sociaux et les champs métier.
- Corrections avant et pendant la lecture, champs volontairement vides, fermeture/réouverture, confirmation des liens, absence d'écrasement par une autre source et reprise après erreur : vérifiés.
- Une attente explicite de la réponse de sélection a corrigé une course du test de site proposé ; la première passe comptait deux réussites et un échec de synchronisation du test.
- Aucun appel réel au modèle ni accès réel à Google dans cette recette ; les étapes différées sont contrôlées.

## 1. Décision et périmètre

**Le problème principal est confirmé : le parcours personnalise les mots davantage qu'il ne personnalise la décision.** Une mission crédible doit relier :

> Objectif du dirigeant → fait pertinent et sourcé → obstacle ou occasion → test concret → résultat à mesurer → prochaine décision.

Changer les titres ou rendre les textes plus enthousiastes ne résout pas ce problème.

Choix confirmés pour cette passe :

- Audit approfondi, correctifs ciblés et cas d'usage détaillés ; pas de remplacement complet du moteur dans cette livraison.
- Attendre la fin de l'analyse avant de montrer les missions, plutôt que présenter des missions provisoires qui changent sous les yeux du visiteur.
- Sources publiques accessibles seulement avant le compte. Connexions autorisées des comptes ensuite ; aucun contournement d'un accès limité.
- Capitaliser sur les agents et les mécanismes métier déjà présents.

**Distinction importante :** les correctifs attendent la fin de la recherche existante. Ils ne transforment pas cette recherche en audit approfondi multiréseau. En cas d'échec, de délai dépassé ou de quota atteint, le parcours reste utilisable avec un avertissement explicite et des pistes exploratoires. La politique cible pour ces situations est détaillée dans UC-08 ; elle reste à implémenter.

Méthode : lecture du parcours public, des règles, de la collecte, des agents, de l'inscription, des capacités de canal et des tests ; tests locaux sans base réelle ni appel externe. L'exemple La Tonnelle fourni est analysé comme un résultat produit insatisfaisant, **pas comme une description vérifiée de cette entreprise**. Aucun audit web réel de La Tonnelle n'a été exécuté ici.

## 2. Diagnostic : pourquoi les missions sont faibles

| Priorité | Constat vérifiable dans le code avant cette passe | Conséquence produit | Traitement |
| --- | --- | --- | --- |
| P0 | Le choix des missions suit une liste ordonnée de modèles, avec une condition « site lu / objectif de demandes ». | Deux entreprises très différentes reçoivent presque les mêmes actions. L'objectif est répété dans les textes, pas réellement traduit en arbitrage. | Refonte UC-06/07. |
| P0 | L'analyse initiale reçoit nom, ville et site, mais pas encore l'objectif ; la recherche de marché suivante ne reçoit pas les constats du site. | Les informations sont produites en silos ; un défaut observé ne détermine pas nécessairement la mission. | Refonte UC-03 à UC-07. |
| P0 | La recherche de marché visait un seul concurrent et une seule opportunité. Avant correction, elle n'incluait même pas le nom ni le site de l'entreprise. | Homonymes, entreprise retrouvée comme son propre concurrent, comparaisons trop générales. | #370 : candidats comparés sur des dimensions communes, sourcés, datés et soumis au choix du dirigeant. |
| P0 | L'analyse avant compte ne collecte pas de publications sociales. Son lecteur traite l'accueil et deux pages internes au plus. | Impossible d'affirmer avoir compris la communication Facebook, Instagram ou LinkedIn. | Limite désormais affichée ; collecte UC-04 à construire. |
| P0 | Le site trouvé via Google pouvait être lu sans remplir le profil. La page suivante raisonnait sur le champ vide. | Contradiction « j'ai lu votre site / vous n'avez pas de site » ; répétition après inscription. | Correctif livré pour les sites effectivement lus. |
| P0 | Un champ site vide devenait « vous n'avez pas encore de page ». | Recommandation de création sans avoir établi le besoin ; perte de confiance immédiate. | Assertion retirée avant et après compte. |
| P0 | Le fait concurrentiel était concaténé à la justification d'une publication, sans lien causal validé. | Une note TripAdvisor pouvait prétendument justifier un post sur un burger. | Concaténation retirée ; repère séparé, à vérifier. |
| P0 | Missions et bouton d'inscription visibles pendant la recherche. | Le visiteur pouvait accepter le plan générique avant le résultat ; le plan enregistré pouvait différer de celui vu. | Attente et contrôles serveur ajoutés ; instantané durable UC-09 encore nécessaire. |
| P1 | Des erreurs de recherche revenaient comme un succès sans faits ; les messages de limite/échec n'étaient pas montrés par le composant d'attente. | Le visiteur ne pouvait pas distinguer une analyse pauvre d'un service indisponible. | États d'échec et messages corrigés. |
| P1 | La synthèse « Ce que nous retenons » est rédigée avant la recherche de marché, à partir du profil et des états de lecture. | Elle reformule la saisie plutôt qu'expliquer un diagnostic et une priorité. | Refonte UC-05/07. |
| P1 | L'ambition libre est évaluée surtout au travers du gain en pourcentage et de l'horizon. | « Plus de clients en semaine » est un objectif valable, mais le parcours insiste sur des chiffres manquants plutôt que sur les jours/services à remplir. | Refonte UC-06 ; ne pas imposer un objectif de chiffre d'affaires. |
| P1 | Les canaux livrés réduisent le catalogue réel à quelques possibilités. | Le choix technique du connecteur devient de fait le choix stratégique, même si le public visé est ailleurs. | UC-07/10 : séparer pertinence et faisabilité, sans activer artificiellement un canal. |
| P1 | Le lien initial entre mission et constat se fait par catégorie, pas par preuve causale sélectionnée. | Une mission peut sembler « sourcée » parce qu'un constat du même sujet existe. | UC-07/09 : identifiants de preuves explicites, contrôlés. |
| P1 | Recherche : jusqu'à quatre appels de 30 secondes ; route annoncée à 60 secondes ; expiration logique après 90 secondes. | Le budget global n'est pas garanti par les seules limites de chaque appel. Une analyse plus profonde ne tient pas dans cette mécanique par simple augmentation de tokens. | UC-08 : orchestration durable et budget global. |

### Références techniques principales

- [Règles du parcours et des missions initiales](../src/lib/onboarding/draft-rules.ts) : `rankStarterTemplates`, `starterBody`, `starterPlan`, transitions et préremplissage.
- [Analyse initiale](../src/lib/onboarding/analysis.ts) : Google Places, extraction bornée à 700 tokens, texte total borné à 12 000 caractères, champs métier courts.
- [Lecteur du site](../src/lib/onboarding/site-reader.ts) : protections réseau, accueil et deux pages internes, texte borné par page.
- [Recherche de marché](../src/lib/onboarding/intelligence.ts) et [ses règles](../src/lib/onboarding/intelligence-rules.ts) : concurrent/opportunité, quotas, états.
- [Synthèse](../src/lib/onboarding/synthesis.ts) : profil, provenance, cap et réserves, sans dossier de preuves complet.
- [Déclenchement](../src/app/api/bienvenue/route.ts), [premiers constats](../src/app/bienvenue/page.tsx), [missions](../src/app/bienvenue/missions/page.tsx), [inscription](../src/app/api/auth/signup/route.ts).
- [Catalogue](../src/lib/missions/templates.ts), [capacités réellement livrées](../src/lib/channel-capabilities.ts), [certitude des constats](../src/lib/findings/certainty.ts).

## 3. Ce que cette passe corrige réellement

1. **Site trouvé et lu** : proposé automatiquement dans un champ modifiable des premiers constats, affiché avec sa date de lecture, puis enregistré dans le profil confirmé. Une correction utilisateur reste prioritaire.
2. **Cohérence des preuves** : confirmer le site découvert ne rend plus sa propre analyse obsolète. Changer vers un autre site invalide les anciennes preuves pour le plan, la proposition de marque et les constats transférés à l'inscription.
3. **Pas d'absence inventée** : site non saisi, non identifié et illisible ne sont plus confondus avec une absence démontrée.
4. **Attente réelle** : pas de cartes de missions ni de bouton « Ça m'intéresse » pendant la recherche ; refus serveur de ce bouton, du raccourci vers l'étape 5 et de l'inscription pendant une recherche active.
5. **Échec visible** : service indisponible, échec et absence de repères ne se présentent plus comme une analyse réussie et exhaustive ; les coupures réseau de la progression sont annoncées.
6. **Recherche contextualisée** : nom, localisation, site, objectif et date font partie de l'entrée. Un résultat d'une autre identité, d'une autre offre ou d'un autre objectif n'est pas réutilisé.
7. **Concurrent non décoratif** : son fait ne justifie plus mécaniquement une publication. Il apparaît séparément avec un lien lisible.
8. **Continuité minimale** : ce repère est transféré à l'inscription en constat de concurrence « À vérifier », sans prétendre qu'une URL produite par le modèle prouve à elle seule une lecture. Les contextes transmis aux agents conservent désormais certitude et source.
9. **Identité Google à confirmer (#367)** : jusqu'à trois fiches candidates affichent nom, adresse, activité et lien ; aucune n'est attribuée par son seul nom. Les détails et le site d'une fiche sont relus après son choix explicite. Le choix, y compris « aucune ne correspond », est gardé dans le brouillon et transféré à l'inscription ; sans résultat, l'interface indique « non identifiée », pas « absente ».
10. **Parcours du site (#368)** : l'accueil et jusqu'à quatre pages internes pertinentes du même hôte sont lus. Chaque page lue affiche son lien et sa date ; les PDF, pages dynamiques, autres hôtes, pages pertinentes non sélectionnées et erreurs de lecture sont présentés comme limites, jamais comme contenu observé.
11. **Liens sociaux candidats (#367)** : les liens de profils trouvés dans les pages lues affichent plateforme, provenance et date ; le dirigeant peut confirmer, corriger ou écarter chaque profil. Les posts ne sont pas lus et aucune présence sociale n'est déduite d'un lien de partage, d'une publication isolée ou d'une page de connexion.
12. **État préalable des publications (#369, partiel)** : Facebook, Instagram et LinkedIn affichent séparément si un profil candidat a été repéré dans les pages lues, tout en indiquant que les posts restent non lus et que l'accès n'a pas été vérifié. Ce statut ne distingue donc pas compte privé, connexion exigée ou refus API ; aucune publication ni activité n'est inférée.

13. **Sélection et rédaction des premières missions par Opus 5.5** : après la recherche, le modèle reçoit les faits et constats sourcés de l'analyse, les conséquences possibles distinguées des preuves, le profil confirmé, l'objectif, les contraintes et les limites de lecture. Il compare les alternatives, rédige une synthèse et zéro à trois tests concrets avec indicateur, collecte déclarée, effort, prérequis et action du dirigeant. Le catalogue actif reste imposé côté serveur ; les modèles nécessitant des identifiants de contacts ou d'avis absents du brouillon ne sont pas proposés.
14. **Plan conservé, preuves contrôlées** : les références du modèle doivent correspondre aux identifiants de preuves du dossier. Une page exige un constat observé du site ; une intervention sur Google exige un constat observé de la fiche. Périmètres, canaux, horizons et contraintes métier sont revalidés à la génération, à l'affichage et à l'inscription. Le plan et la synthèse sont gardés dans `intelligence`, sans migration de base ; les faits retenus et leurs sources sont affichés avant et après inscription. Le lien vers un constat de diagnostic n'est créé que si son identifiant est explicitement cité.
15. **Échec de génération sans faux secours** : un échec, un résultat invalide ou un quota atteint laisse les nouvelles missions vides avec un avertissement explicite. Les anciens brouillons conservent leur plan historique avec un message invitant à reconfirmer l'ambition ; les missions déjà enregistrées ne sont pas modifiées. Le coût Opus est transféré séparément de celui de la recherche. Recherche bornée à 60 secondes au total, planification à 120 secondes sans reprise automatique, route et expiration logique à 240 secondes. Les plafonds de test sont temporairement de 10 analyses et 10 recherches/préparations par IP et par 24 h ; les plafonds globaux restent inchangés.

**Non livré :** recherche générale d'un site ou de profils sociaux hors Google et des liens des pages lues ; résolution automatique des homonymes (la confirmation du dirigeant reste nécessaire) ; lecture de posts avant compte ; comparaison approfondie ; orchestrateur durable ; protocole de validation/versionnement complet des recommandations ; mesure de conversion ; remplacement du moteur de propositions après compte. La nouvelle planification améliore l'exploitation des faits disponibles, elle n'invente pas une collecte plus exhaustive.

Les anciens brouillons dont la recherche ne comporte pas l'identité complète ne sont plus considérés comme une recherche à jour. Le parcours le dit et permet de revenir à l'ambition pour la relancer ; il n'invente pas une compatibilité.

## 4. Réutiliser l'existant, pas créer une seconde équipe d'agents

| Brique existante | À conserver | Adaptation nécessaire |
| --- | --- | --- |
| [Martine / marketing](../src/lib/agents/marketing.ts) | Lecture du site, diagnostic, recherche concurrentielle, discipline des sources, accès limité explicite, corrections du dirigeant. | Extraire un service de collecte/analyse en lecture seule utilisable avec un brouillon ; ne pas lancer tel quel un agent qui écrit dans les tables d'une entreprise. |
| [Jean-Claude / démarchage](../src/lib/agents/demarchage.ts) | Recherche d'organisations, occasions locales, événements datés, refus de pistes inventées. | Chercher des occasions qui répondent au frein identifié ; qualifier cible, accessibilité et pertinence pour le cap, pas seulement la proximité. |
| [Paul / co-CEO](../src/lib/agents/co-ceo.ts) | Objectif, priorités, missions limitées, propositions à confirmer, état réel et résultats. | Partager un service de recommandation entre avant et après compte ; Paul arbitre à partir du même dossier de preuves. |
| [Camille / contenu](../src/lib/agents/contenu.ts) | Production à partir d'un brief et des constats. | Intervenir après le choix du test, pas décider de la stratégie parce qu'un modèle « publication » est disponible. |
| [Contextes de constats](../src/lib/agents/findings-context.ts) | Transmission du diagnostic entre spécialités. | Ajouter preuves pertinentes, niveau de confiance et inconnues utiles ; ne pas repasser un diagnostic complet inutilement à chaque appel. |
| [Missions](../src/lib/missions/templates.ts), [bilans](../src/lib/missions/report.ts), [journal](../src/lib/journal.ts) | Périmètres, validation, règles d'arrêt, résultat déclaré, historique. | Transporter le motif de sélection, les preuves, l'indicateur et les prérequis jusqu'au bilan. |
| Brouillon anonyme, coûts, quotas et inscription transactionnelle | Compte créé en dernier, pas d'exécution avant confirmation, reprise des coûts, expiration. | Sauvegarder un dossier et un plan versionnés, transférés sans recalcul lors de l'inscription. |

Le nom présent dans le code est **Jean-Claude**, pas Jean-Luc. La cible actuelle garde Paul comme seul interlocuteur visible ; conserver les autres spécialités en interne évite de rajouter une charge de compréhension au dirigeant.

Les connecteurs ne doivent pas être promis avant livraison : Facebook, Gmail et site sont activés ; Instagram, publication LinkedIn et fiche Google ne le sont pas. **Observer un compte public n'équivaut ni à l'avoir connecté, ni à avoir le droit de publier dessus.**

## 5. Parcours cible proposé

Conserver les cinq étapes, mais changer ce qu'elles garantissent :

1. **Découverte** : identité, localisation, liens facultatifs ; résolution de la bonne entreprise.
2. **Premiers constats** : lecture de la présence publique et du marché initial ; preuve de compréhension lisible, liens préremplis à confirmer, possibilités de correction. Ne pas demander de recopier ce qui a été trouvé.
3. **Objectif** : ambition libre, une à trois questions discriminantes seulement ; enrichissement ciblé si le cap révèle un besoin de nouvelles preuves.
4. **Mes premières missions** : attendre la fin de cet enrichissement ; montrer le diagnostic actualisé et une à trois missions qualifiées, pas trois cartes obligatoires.
5. **Compte** : retrouver exactement les preuves, les liens confirmés et le plan accepté ; aucune publication automatique.

Il faut distinguer **socle de présence**, possible avant l'objectif, et **analyse orientée objectif**, possible après. La concurrence du socle doit être visible dans les premiers constats ; l'étape 4 indique les éventuels éléments nouveaux, sans contradiction cachée.

### Format lisible des premiers constats

- **Ce que nous avons identifié** : établissement, ville, activité, site, comptes sociaux, statut « à confirmer » si ambigu.
- **Ce qui est observé** : trois à cinq constats synthétiques ; un détail ouvrable par site, réseau ou concurrent. Chaque fait a sa source, sa date et son périmètre.
- **Ce que cela peut signifier** : hypothèses séparées des faits ; formulation liée à l'objectif lorsque connu.
- **Ce qui manque** : source bloquée, période partielle, identité incertaine, information déclarée non vérifiée.
- **Vos corrections** : modifier un lien, retirer un homonyme, corriger une offre ; recalculer seulement ce qui dépend de la correction.

Pour un réseau, afficher par exemple « 4 publications accessibles, du [date] au [date] », jamais « vous publiez peu » si la lecture est partielle. Pour un site, distinguer « pas d'appel à réserver sur les pages lues » de « aucune réservation possible ».

## 6. Contrat de données à construire

Ce contrat est une cible, pas un schéma déjà livré. Réutiliser les objets existants quand ils portent le sens ; éviter une seconde collection de textes libres sans lien avec les missions.

| Objet | Minimum utile |
| --- | --- |
| Identité | Nom, établissement/localisation, activité, candidats, liens officiels candidats, confiance, confirmation/correction utilisateur. |
| Source | Identifiant stable, plateforme, URL canonique, lien de découverte, statut d'accès, date de consultation, période couverte, identité concernée. |
| Preuve | Identifiant, sourceId, fait synthétisé, repère vérifiable (page/publication et date), certitude, périmètre et limites de lecture. Pas de reproduction massive de contenus tiers. |
| Constat | Preuves associées, fait, conséquence possible, sujet métier, pertinence pour l'objectif, éventuelle contradiction et correction. |
| Objectif | Texte original, résultat voulu, segment, créneau/zone, horizon facultatif, limites de budget/temps/capacité, données manquantes. |
| Recommandation | Objectif et constats associés, levier, mécanisme attendu, livrable, action entrepreneur, agent interne, indicateur, horizon, effort, budget, prérequis, risque et règle d'arrêt. |
| Exécution d'analyse | Version, empreinte des entrées, phases et états, budgets/délai, coûts, erreurs explicites, couverture ; un résultat terminé ne change plus silencieusement. |

Points de vigilance :

- Un lien découvert est une proposition de profil, pas une connexion OAuth.
- Une URL citée par un modèle n'est pas une preuve suffisante : la consultation et l'identité doivent être établies.
- L'absence de preuve d'une page ou d'un post n'est pas une preuve d'absence.
- Les données corrigées par le dirigeant ne sont pas écrasées par une nouvelle lecture.
- Respecter les règles de conservation des fournisseurs, notamment Google ; ne pas persister indistinctement les avis, leurs auteurs et les réponses brutes.
- Les entrées publiques ne sont pas des instructions pour les agents ; conserver les protections réseau et les plafonds.

## 7. Cas d'usage détaillés

### UC-01 — Retrouver la bonne entreprise sans site renseigné — P0

**Besoin :** le dirigeant saisit nom et ville ; il ne doit pas faire le travail de recherche à la place du produit.

**Parcours :** chercher les candidats avec les outils existants, croiser nom, localisation et activité ; retrouver le site et les profils officiels. Si plusieurs établissements plausibles subsistent, demander une confirmation courte avec les informations distinctives.

**Recette :**

- Nom identique dans deux villes : aucune fusion de site ou de posts entre établissements.
- Le premier résultat Google n'est pas automatiquement une identité certaine.
- Un annuaire, un concurrent ou un lien de partage n'est pas enregistré comme site officiel.
- Un site trouvé et effectivement identifié préremplit le profil ; l'utilisateur peut le refuser.
- Pas de résultat : message « non identifié », jamais « vous n'existez pas en ligne ».

**Réutilisation :** Google Places, lecteur protégé, brouillon et confirmation de profil. **Dépendance :** aucune.

### UC-02 — Découvrir et confirmer les liens sociaux — P0

**Besoin :** retrouver Facebook, Instagram, LinkedIn et les autres réseaux pertinents sans obliger à les saisir.

**Parcours :** extraire les liens sortants du site identifié, compléter par recherche publique, vérifier l'identité, classer les liens par réseau. Les plateformes supplémentaires passent par un adaptateur de lecture explicitement supporté, pas par une promesse de couverture universelle.

**Recette :**

- Liens de profil distingués des boutons de partage, posts isolés, pages de connexion et profils de tiers.
- URL canonique, provenance et statut « trouvé / confirmé / accès limité » visibles et enregistrés.
- Aucun profil personnel LinkedIn attribué à l'entreprise par simple ressemblance de nom.
- Correction d'un lien conservée après retour arrière, rafraîchissement et inscription.
- Un réseau non trouvé ne devient pas une recommandation automatique de création.

**Réutilisation :** mécanisme de proposition de Page Facebook, profil entreprise et certitude. **Dépendance :** UC-01.

### UC-03 — Comprendre l'offre et le chemin vers l'achat — P0

**Besoin :** aller au-delà d'une liste de produits et d'une palette de couleurs.

**Parcours :** sélectionner les pages pertinentes pour le métier : offre/menu, tarifs lorsque publics, horaires, contact, réservation/devis, réalisations. Résumer promesse, clientèle, occasion d'achat et points de friction documentés.

**Recette :**

- Les pages lues et celles indisponibles sont énumérées ; le terme « site analysé » ne signifie pas « totalité du site auditée ».
- Une réservation visible n'est pas ignorée parce qu'elle se trouve hors de la page d'accueil.
- Une carte PDF, une page dynamique ou un sous-domaine non lisible est déclaré comme limite.
- Une baisse de fréquentation ou un faible taux de conversion n'est jamais déduit du texte d'une page.
- Les constats utiles gardent les preuves ; les hypothèses restent explicitement qualifiées.

**Réutilisation :** lecteur, extraction, constats de Martine. **Dépendance :** UC-01.

### UC-04 — Lire les publications publiques, pas seulement identifier le compte — P0

**Besoin :** comprendre ce que l'entreprise raconte, à qui et avec quel appel à agir.

**Parcours :** pour chaque profil confirmé, lire un échantillon borné de publications réellement accessibles. Extraire date, thème, offre, public visé, appel à agir et lien. Agréger sans recopier les posts.

**Recette :**

- Chaque observation renvoie à une publication précise et à sa date lorsque disponible.
- Couverture et fenêtre de lecture visibles ; absence d'accès ou de date explicitée.
- Aucun post, rythme, nombre d'abonnés, portée, engagement ou résultat commercial inventé.
- Mur de connexion : « publications non lisibles publiquement », pas « compte inactif ».
- Pas d'authentification imposée pendant ce parcours, pas de contournement d'accès.
- Facebook, Instagram et LinkedIn testés séparément ; succès sur l'un ne simule pas le succès sur les autres.

**Réutilisation :** discipline de lecture Facebook de Martine ; interfaces d'adaptateurs publiques nouvelles. **Dépendance :** UC-02.

### UC-05 — Comparer des concurrents réellement utiles — P0

**Besoin :** comprendre une différence actionnable, pas afficher un nom connu du même secteur.

**Parcours :** identifier quelques concurrents comparables, expliquer le choix, lire leurs offres et points d'entrée publics. Comparer les dimensions pertinentes : occasion d'achat, gamme, zone, horaires, offre de semaine, réservation ou différenciation.

**Recette :**

- L'entreprise elle-même et les homonymes sont exclus.
- Un concurrent direct est distingué d'une alternative indirecte.
- Une chaîne de restauration n'est pas considérée comparable sur le seul mot « restaurant ».
- Une note d'avis seule ne justifie ni remise, ni publication, ni refonte du site.
- Comparaison datée et sourcée des deux côtés ; pas de valeur absente présentée comme zéro.
- Le dirigeant peut exclure un concurrent ; cette exclusion est respectée aux lectures suivantes.

**Réutilisation :** recherche de Martine, lecture de concurrents, exclusions existantes ; Jean-Claude pour les occasions locales. **Dépendances :** UC-01, UC-03.

### UC-06 — Transformer l'ambition en objectif exploitable — P0

**Besoin :** comprendre « plus de clients en semaine » sans le remplacer par un objectif de CA arbitraire.

**Parcours :** conserver le texte, identifier le résultat commercial et poser les questions qui changent les actions. Pour un restaurant : quels jours/services, quelle capacité disponible, quelle cible souhaitée ; ne pas exiger d'emblée tous les chiffres.

**Recette :**

- Ambition non chiffrée acceptée ; préciser un indicateur reste utile sans forcer un pourcentage.
- Une à trois questions prioritaires, pas un questionnaire complet sur tous les champs possibles.
- « Sans remise », « pas de publicité payante », « pas de temps supplémentaire » sont des contraintes bloquantes pour les propositions incompatibles.
- Les réponses déjà obtenues ne sont pas redemandées.
- Modifier le cap invalide les recommandations, pas les preuves toujours valables sur l'identité.

**Réutilisation :** ambition signée/confirmée, capacité et contexte objectif. **Dépendance :** aucune pour la saisie ; UC-03/04/05 pour éviter les questions déjà résolues.

### UC-07 — Recommander un test à forte valeur, pas remplir trois cases — P0

**Besoin :** démontrer pourquoi cette action vaut la peine pour cette entreprise maintenant.

**Parcours :**

1. Rassembler objectif, contraintes, preuves, inconnues et moyens disponibles.
2. Générer des actions candidates depuis les leviers métier, puis les rattacher aux modèles exécutables.
3. Éliminer les candidats non étayés, incompatibles, redondants ou hors capacité.
4. Classer d'abord par contribution explicable au cap, puis par niveau de preuve, effort, coût, délai et faisabilité.
5. Garder une à trois missions distinctes ; expliquer la priorité et les alternatives écartées.

**Recette :**

- Chaque mission cite au moins un constat pertinent ou une déclaration du dirigeant, clairement qualifiée ; aucune preuve inventée pour satisfaire ce critère.
- Le constat explique la mission, pas seulement sa catégorie technique.
- Résultat métier, livrable et action attendue sont différents et tous compréhensibles.
- Un indicateur avec mode de collecte, une échéance et une règle d'arrêt existent.
- Une mission dit ce que Paul prépare et ce que le dirigeant doit faire.
- « Publier sur burger », « créer une page » et « une première action » ne passent pas seuls le contrôle de qualité.
- Une seule bonne piste reste une seule piste ; le moteur ne complète pas avec du texte vague.
- Si aucune piste n'est qualifiable, demander l'information décisive plutôt que promettre un plan.
- Pas de score d'impact chiffré sans méthode d'évaluation ; pas de garantie de clients.

**Réutilisation :** Paul, catalogue, périmètres, risques, validations et bilans. **Dépendances :** UC-03 à UC-06.

**Contrat de mesure partagé (#371) :** chaque mission créée porte la raison de son choix, un indicateur, sa méthode de saisie, l'effort, les prérequis et l'action à valider par le dirigeant. L'onboarding et Paul partagent le contrat, les règles d'admissibilité de l'objectif et le générateur des champs pratiques ; Paul applique les mêmes blocages d'objectif/créneau/capacité au moment de proposer. La raison comparative est conservée et affichée à l'onboarding, sur la mission et dans la carte de confirmation. Une mission créée manuellement reçoit des champs de mesure adaptés au modèle ; le texte dit honnêtement que les autres pistes n'ont pas été comparées dans ce formulaire. À l'onboarding, une page n'est candidate qu'après lecture du site et pour un objectif de demandes ; une publication exige aussi un objectif de demandes et s'appuie sur l'offre et la clientèle déclarées ; « Sur mesure » exige une occasion de marché sourcée. Un objectif commercial non précisé ne déclenche pas de publication générique. Une page ou réservation déclarée satisfaisante n'est pas proposée à refaire. La priorité explique pourquoi la piste retenue précède les alternatives écartées et les inconnues décisives. Une fiche ou un avis ne sont pas proposés sans constat précis qui les justifie. À l'inscription, les constats restent au diagnostic et ne sont pas rattachés aux missions par catégorie seule.

Un objectif libre confirmé n'est pas bloqué faute de pourcentage ou d'horizon chiffré. Si la cible concerne une plage de semaine sans nommer les jours, l'onboarding demande les créneaux et la capacité au lieu de choisir une mission à l'aveugle ; une capacité d'accueil pleine ou une contrainte explicite de temps supplémentaire bloque les pistes d'acquisition incompatibles.

### UC-08 — Attendre un résultat fiable sans attente infinie — P0

**Besoin :** une analyse approfondie peut être longue ; l'attente doit être honnête et récupérable.

**Parcours :** enregistrer un travail durable, afficher les étapes réelles, reprendre après rafraîchissement et imposer une échéance globale. Distinguer « complet selon le périmètre », « partiel », « bloqué », « quota atteint » et « échec ».

**Recette :**

- Aucune mission finale tant qu'une phase nécessaire à sa justification tourne.
- Jamais de faux pourcentage d'avancement ou de sources marquées lues avant consultation.
- La fin d'un appel HTTP ne perd pas le travail ; reprise avec le même identifiant et sans double facturation.
- Timeout : état terminal explicite, preuves déjà acquises conservées, possibilité de réessayer les seules phases échouées.
- Si l'utilisateur poursuit en mode partiel, choix explicite et rappel durable ; ce mode n'est pas présenté comme complet.
- Budget global de temps et de coût contrôlé, y compris les reprises ; budgets à fixer après mesure sur corpus, pas à inventer.
- Aucun traitement anonyme ne crée une entreprise ou ne déclenche une publication.

**Réutilisation :** états, runId, quotas et mécanismes de suivi existants ; adapter la mécanique de travaux au brouillon anonyme. **Dépendance :** contrat de sources et orchestration UC-01 à UC-07.

### UC-09 — Retrouver exactement le diagnostic accepté après inscription — P0

**Besoin :** le compte prolonge la démonstration ; il ne recommence pas le diagnostic à zéro.

**Recette :**

- Profil confirmé, liens sociaux, constats, concurrents et missions issus d'un même instantané versionné.
- Même ordre, même titre, même périmètre et mêmes preuves entre la page acceptée et la stratégie après inscription.
- Aucun recalcul du plan dans la transaction d'inscription ; vérification de la version acceptée.
- Double soumission : une seule création et aucun doublon de crédits, missions ou coûts.
- Les preuves conservent provenance et date ; les hypothèses ne deviennent pas des observations.
- Les corrections utilisateur et les concurrents exclus sont repris.
- Aucune action externe ne part à la création du compte.

**Réutilisation :** transaction d'inscription, `AuditFinding`, missions, journal, coûts. **Dépendances :** UC-02, UC-05, UC-07, UC-08.

### UC-10 — Préparer une action réalisable malgré un canal non connecté — P1

**Besoin :** ne pas choisir Facebook par défaut pour une cible professionnelle sur LinkedIn, ni promettre une publication indisponible.

**Recette :**

- Pertinence du canal distinguée de sa disponibilité et de sa connexion effective.
- Avant acceptation : prérequis, action manuelle éventuelle et coûts explicités.
- Canal non livré : aucune mission prétendant publier automatiquement ; alternative manuelle seulement si le produit la supporte explicitement, sinon piste non exécutable expliquée.
- Une publication sociale ne vaut pas une acquisition de clients ; prévoir l'appel à agir et le suivi.
- Le visiteur comprend ce qu'il obtiendra immédiatement après création du compte.

**Réutilisation :** capacités de canal, délégation, atelier et confirmations. **Dépendance :** UC-07.

### UC-11 — Donner une raison de revenir — P1

**Besoin :** la conversion ne s'arrête pas au compte ; le dirigeant revient pour une décision utile.

**Parcours :** le premier écran reprend la mission prioritaire et son prochain pas. Après préparation, Paul demande une validation précise ; à l'échéance, il demande le bilan et propose de continuer, ajuster ou arrêter.

**Recette :**

- Une prochaine action explicite, pas une page vide ni un deuxième audit imposé.
- Rappel lié à une décision, un contenu prêt ou un bilan dû ; pas « connectez-vous pour découvrir des idées » sans contenu nouveau.
- Mesure manuelle assumée si aucune attribution technique n'est possible.
- Refus motivé et résultats insuffisants influencent les propositions suivantes.
- Pas de réactivation automatisée de contacts ni d'envoi sans autorisation.

**Réutilisation :** stratégie, prochain pas, bilans et revue hebdomadaire existants. **Dépendances :** UC-09/10.

### UC-12 — Prouver la qualité du moteur avant ouverture — P0 transverse

**Besoin :** des tests de format JSON et de longueur ne prouvent pas la pertinence métier.

**Corpus minimum proposé :** restaurant avec créneaux creux, artisan visant des devis qualifiés, activité B2B visant des partenaires, entreprise sans site déclaré mais site existant, entreprise sans présence identifiable, homonyme, réseaux inaccessibles, objectif sans budget, objectif modifié, client disposant déjà de l'action proposée.

**Recette :**

- Jeux de preuves versionnés et fictifs/anonymisés ; tests déterministes des règles, puis évaluation séparée des sorties du modèle.
- Zéro source inventée, zéro confusion d'identité, zéro publication inaccessible décrite comme lue, zéro action annoncée comme déjà exécutée.
- Chaque mission passe les critères UC-07 et les contraintes de canal/validation existantes.
- Test de sensibilité : changer le cap ou le créneau change l'arbitrage lorsque cela doit changer ; changer seulement le prénom ne le change pas.
- Test contrefactuel : avec une page de réservation déjà satisfaisante, pas de recommandation automatique de la recréer.
- Évaluation métier humaine : lien au cap, spécificité, preuve, faisabilité, effort et mesure ; seuil d'acceptation fixé avant comparaison des versions.
- Mesurer latence médiane/P95, coût par analyse terminée, couverture par source et erreurs ; publier les résultats réellement observés.

**Dépendance :** accompagne chaque lot ; le corpus et les invariants commencent avant le nouveau moteur.

## 8. Cas fil rouge : La Tonnelle, « plus de clients en semaine »

### Ce que l'exemple fourni ne permet pas de conclure

- Une offre « burger » ne prouve pas qu'il s'agit du meilleur levier pour remplir les jours creux.
- « Familles » ne dit pas si la demande porte sur le déjeuner, le dîner, certains jours ou certains prix.
- Une note d'un Burger King voisin ne prouve ni concurrence directe ni occasion commerciale.
- Aucun site saisi ne signifie pas absence de site, de menu en ligne ou de réservation.
- Une publication ne garantit aucune fréquentation ; compter ses réactions n'est pas mesurer les clients supplémentaires.

### Questions qui changent vraiment le plan

1. Quels jours et services cherchez-vous à remplir ?
2. Quelle capacité supplémentaire souhaitez-vous accueillir, et avec quelles limites de budget/temps ?
3. Souhaitez-vous attirer une clientèle existante plus souvent, une clientèle nouvelle du quartier, ou les deux ?

Ne pas poser ces trois questions systématiquement si une réponse fiable existe déjà. « Je ne sais pas » reste acceptable et conduit à un petit test, pas à une fausse précision.

### Exemples de missions conditionnelles, pas recommandations déjà validées

| Si l'analyse établit… | Mission possible | Préparation et action | Mesure |
| --- | --- | --- | --- |
| Un service précis sous-rempli, une offre réellement disponible et une audience locale accessible | Tester pendant deux semaines un message centré sur ce service, avec une invitation à réserver et un moyen d'attribuer les demandes. | Paul prépare un contenu lié à l'offre réelle et au créneau ; le dirigeant valide le contenu, le canal et la capacité. Aucun prix/remise inventé. | Réservations attribuées au message et couverts sur ce service, comparés à un point de départ déclaré ; interprétation prudente. |
| Des organisations proches dont les besoins de déjeuner sont plausibles, avec des preuves de pertinence | Qualifier puis proposer un test de déjeuner à un petit nombre d'organisations choisies, sans démarchage automatique. | Jean-Claude trouve et qualifie les organisations ; Paul prépare une proposition ; le dirigeant décide qui contacter et comment. | Réponses pertinentes, essais effectivement réalisés, puis visites répétées si observables. |
| Une friction précise sur le trajet public vers la réservation du créneau choisi | Corriger cette friction et tester le chemin complet, plutôt que créer un nouveau site par défaut. | Martine documente le problème ; Camille prépare le changement ; modification sur le système existant seulement si possible, sinon procédure manuelle explicite. | Tests du parcours, demandes reçues et réservations confirmées ; pas de trafic inventé. |

Ces pistes ne deviennent pas automatiquement « les trois missions ». Certaines peuvent être inutiles ou impossibles. **Une mission fortement justifiée vaut mieux que trois hypothèses maquillées en certitudes.**

## 9. Lots de réalisation et dépendances

| Lot | Contenu | Condition de sortie |
| --- | --- | --- |
| 0 — Correctifs de confiance, cette passe | Cohérence du site, attente, erreurs visibles, identité de recherche, concurrence non décorative. | Tests ciblés, typage et lint ; limites restantes explicites. |
| 1 — Socle de preuves | UC-01/02/03/05, première version UC-08, corpus UC-12. | Bonne identité, liens confirmables, sources et couverture visibles ; reprise fiable. |
| 2 — Compréhension publique et ambition | UC-04/06, premiers constats consolidés. | Posts réellement lus ou accès limité honnête ; objectif exploitable sans questionnaire lourd. |
| 3 — Moteur de valeur | UC-07, sortie structurée, comparaison métier sur corpus. | Une à trois missions explicables et mesurables, sans remplissage artificiel. |
| 4 — Continuité et retour | UC-09/10/11 et évaluation de conversion UC-12. | Plan accepté retrouvé sans divergence ; prochain pas utile et bilan exploitable. |

Ne pas ouvrir le nouveau parcours en affirmant « analyse complète des réseaux » après le seul lot 1. Ne pas remplacer le moteur par un prompt plus long tant que les preuves et les critères de sélection n'existent pas.

Les durées et coûts de ces lots ne sont pas chiffrés ici : il manque une mesure des accès publics réels, du débit des services et du coût par dossier. La couverture des sources est le principal risque, pas la mise en page.

### User stories publiées sur GitHub

Les cas d'usage ci-dessus sont suivis par les US #367 à #375 :

- [#367 — Retrouver et faire confirmer les sources publiques officielles](https://github.com/groupebienoubien/BienDecider/issues/367)
- [#368 — Comprendre le parcours d'achat du site](https://github.com/groupebienoubien/BienDecider/issues/368)
- [#369 — Analyser les publications sociales publiques](https://github.com/groupebienoubien/BienDecider/issues/369)
- [#370 — Comparer des concurrents locaux comparables](https://github.com/groupebienoubien/BienDecider/issues/370)
- [#371 — Relier les missions à l'objectif et aux preuves](https://github.com/groupebienoubien/BienDecider/issues/371)
- [#372 — Suivre et reprendre une analyse approfondie](https://github.com/groupebienoubien/BienDecider/issues/372)
- [#373 — Retrouver les constats et missions après inscription](https://github.com/groupebienoubien/BienDecider/issues/373)
- [#374 — Vérifier la faisabilité d'un canal](https://github.com/groupebienoubien/BienDecider/issues/374)
- [#375 — Évaluer la pertinence métier et la fiabilité des sources](https://github.com/groupebienoubien/BienDecider/issues/375)

### Première tranche d'implémentation — #367 et #368

La découverte propose jusqu'à trois sites issus de fiches Google, en gardant le lien de provenance ; le dirigeant choisit, corrige ou écarte le site avant qu'une nouvelle lecture soit transférée. Les profils Facebook, Instagram et LinkedIn ne sont proposés que lorsqu'un lien de profil public est trouvé sur une page effectivement lue ; partage, post et connexion ne deviennent pas des profils. Chaque profil reste à confirmer séparément, et la décision est conservée à l'inscription.

La lecture du site couvre l'accueil et jusqu'à quatre pages internes retenues par type de contenu (contact, offre, tarifs, réservation, réalisations), avec les pages lues, leur date et les limites repérées (PDF, hôte distinct, page illisible ou probablement dynamique) affichés. Les lectures restent publiques, bornées et protégées contre les accès privés. La recherche générale de profils sociaux hors des liens du site, la lecture de publications et l'analyse approfondie restent hors de cette tranche (#369).

Les tickets complètent l'objectif libre déjà suivi dans #20, l'analyse du diagnostic dans #292, la lecture Facebook cadrée dans #253 et l'observation/activation dans #100 et #296. Ils restent au backlog ; le commentaire sur le suivi V5.2 (#272) indique l'ordre proposé et les dépendances.

## 10. Mesurer la valeur, pas seulement le nombre de comptes

Entonnoir à instrumenter : découverte commencée → identité confirmée → analyse terminée/partielle → constats consultés/corrigés → objectif confirmé → mission comprise/retenue → compte créé → première mission lancée → premier bilan → retour utile.

Mesures à séparer :

- **Qualité** : taux d'identités correctes, sources vérifiables, missions jugées pertinentes, causes de refus.
- **Service** : délai et coût par dossier, couverture publique par plateforme, abandons pendant l'attente.
- **Activation** : compte créé après lecture des missions, première décision et premier lancement.
- **Rétention utile** : retour pour une validation ou un bilan ; pas seulement session ouverte.
- **Résultat métier** : demandes/réservations/rendez-vous déclarés selon le cap, avec limites d'attribution.

Comparer les versions sur des cohortes comparables, sans promettre un taux de conversion avant mesure. Ne pas collecter davantage de données personnelles pour compenser une mauvaise recommandation.

## 11. Validation de cette passe

Commandes locales, sans connexion à une base réelle ni appel payant aux agents :

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:1/onboarding_unit'
npx playwright test delegation.spec.ts onboarding-quality.spec.ts --workers=1 --grep 'GH-279|GH-280|GH-281|GH-284|GH-292|US #36[123]|onboarding quality' --reporter=line
node --experimental-strip-types --test tests\onboarding-intelligence-rules.test.mjs tests\findings-rules.test.mjs
npx tsc --noEmit --incremental false
```

Résultats : **41 tests Playwright de règles/services et 14 tests Node réussis**, vérification TypeScript réussie, ESLint ciblé sur les 16 fichiers source/tests modifiés réussi. Ces tests Playwright ciblés ne nécessitent ni navigateur ni serveur.

Le corpus fictif US #371 v1 couvre neuf arbitrages déterministes : restaurant sans créneau de semaine précisé, artisan visant des devis, objectif B2B sans occasion trouvée puis avec partenariat sourcé, site existant mais illisible, site non déclaré et source sociale non confirmée, budget média nul, réservation déjà satisfaisante, capacité pleine et objectif de chiffre d'affaires sans levier testable. Il vérifie aussi la sensibilité au cap, l'invariance au prénom et l'état de capacité datée (confirmée ou à reconfirmer). Le test #370 voisin couvre les homonymes et les sources publiques invalides. La comparaison métier humaine reste à faire avant de considérer la recette UC-12 satisfaite.

Le serveur partagé indiqué au début de la session n'était pas joignable dans le navigateur. Les tests navigateur avec inscription réelle nécessitent un serveur et une base de développement dédiée ; ne pas autoriser une base distante partagée pour contourner cette limite.

Un scénario navigateur a été ajouté dans [les tests du parcours](../tests/user-journey.spec.ts) pour l'attente, le refus des raccourcis et l'affichage d'un échec. Il doit être exécuté sur cet environnement dédié :

```powershell
npx playwright test user-journey.spec.ts --workers=1 --grep 'onboarding quality'
```

Les tests de cette passe ne certifient ni l'accès réel aux réseaux sociaux, ni la pertinence du futur moteur. Cette certification relève du corpus et des critères UC-12.

## 12. US #370 — concurrents locaux comparables

La recherche reçoit l'identité confirmée, le métier, la zone, les offres, la clientèle et l'ambition. Chaque candidat retenu doit être classé direct ou indirect, justifié, sourcé et comparé sur au moins une dimension renseignée des deux côtés. Le côté entreprise vient du profil confirmé ; une valeur concurrente absente n'est pas transformée en zéro ni en désavantage. Les doublons, le nom exact de l'entreprise, les sources invalides et les candidats sans comparaison exploitable sont écartés. Le prompt demande aussi de vérifier la localisation et d'écarter les homonymes et acteurs non comparables.

Le parcours affiche la date de recherche, les faits et les valeurs comparées, puis permet de confirmer ou d'écarter chaque candidat. Les décisions sont conservées dans le brouillon ; une exclusion est transmise à la recherche suivante et transférée comme concurrent écarté à l'inscription, afin que les analyses du compte ne le reproposent pas. Martine peut lire ces constats ; Jean-Claude ne les reçoit que pour une prospection professionnelle ciblée et les concurrents écartés sont filtrés. Ces constats ne déclenchent pas à eux seuls une mission ni une recommandation de prix. Les repères et leurs sources restent à vérifier par le dirigeant ; cette recherche ne garantit pas la disponibilité permanente d'une source publique ni l'exactitude de toute donnée de tiers.
