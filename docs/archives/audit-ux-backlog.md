> **Archivé le 2026-11-04** : ce document ne décrit plus la cible du produit. Voir la [cible produit](../cible-produit.md) et l'[index des archives](README.md).

# BienDecider : challenge de l'audit UX et backlog proposé

> Document de travail du 14 octobre 2026. Source : audit UX/UI version 0 du 13 octobre 2026, 30 pages, fourni par Rémi. Les 25 fiches ci-dessous sont des propositions à arbitrer, pas 25 nouveaux tickets à créer ni un engagement de livraison.

## 1. Décision recommandée

**Fiabiliser ce que le dirigeant confie, relit et autorise avant de réorganiser toute l'interface.** L'audit identifie correctement une rupture de confiance dans la chaîne de travail. Une refonte graphique ne corrigera ni un diagnostic périmé ni une publication différente de ce qui a été approuvé.

Le fil rouge reste celui du parcours de délégation (document pas encore versionné ; voir [#155](https://github.com/groupebienoubien/BienDecider/issues/155)) : le dirigeant confie une activité et décide des conséquences, sans devoir apprendre les modules ou configurer tous ses canaux.

Les trois premiers résultats à obtenir :

1. **Un contexte fiable** : savoir quel diagnostic est actuel et quelles informations restent à confirmer.
2. **Une décision précise** : enregistrer sans approuver, puis approuver une version identifiable dont les effets sont annoncés.
3. **Une réalisation vérifiable** : publier le livrable effectivement prévisualisé, ou proposer une action manuelle honnêtement présentée comme telle.

Les connecteurs restent en pause. Les corrections de textes, de revue, de navigation et de préparation ne doivent pas attendre une autorisation Google, Meta ou LinkedIn. L'autonomie persistante reste hors de ce premier chantier.

### Lecture rapide

- [Ce que l'audit permet vraiment de conclure](#2-challenge-de-laudit)
- [Correspondance des 20 constats](#3-couverture-des-20-constats)
- [Ordre de livraison](#4-priorités-et-lots)
- [25 US détaillées](#5-us-détaillées)
- [Recette et décisions à prendre](#6-recette-transverse-et-arbitrages)

## 2. Challenge de l'audit

### Niveau de preuve

Le PDF rapporte des observations en lecture seule sur un compte, à une date donnée. Ses constats visuels sont exploitables ; ses hypothèses de conversion, d'erreur utilisateur ou de confiance ne sont pas des mesures d'usage. Les fichiers HTML et JSON de mesures cités par le PDF n'ont pas été fournis comme fichiers exploitables ici : les contrastes sont des mesures rapportées, non recalculées pour ce document.

La confrontation au dépôt est ciblée : documentation de délégation, traitement des décisions et publication de site dans la référence locale `origin/main`. Elle ne constitue ni une nouvelle recette navigateur ni une revue complète de sécurité. Les titres et statuts des Issues ainsi que l'état de la PR mobile ont été consultés sur GitHub le 14 octobre. Les rapprochements par titre restent à confirmer par lecture des critères de chaque Issue avant implémentation.

### Recommandations conservées, corrigées ou différées

| Sujet | Position | Conséquence sur le backlog |
|---|---|---|
| F01, diagnostic courant | Conserver, mais ne pas assimiler tout ancien constat à un constat faux. Une modification de téléphone n'invalide pas nécessairement une analyse de marché. | Versionner le contexte pertinent ; marquer les analyses affectées comme à réexaminer, puis les remplacer explicitement. Ne pas effacer l'historique. |
| F02, obligation de lire | Montrer le contenu et la conséquence est nécessaire. Une ouverture de panneau ou un défilement forcé ne prouve pas la lecture. | Revue accessible et rapide ; pas de minuterie ni de case artificielle « j'ai tout lu ». Tester la compréhension réelle. |
| F03, sauvegarde | Conserver et traiter côté serveur, pas seulement renommer le bouton. | Un brouillon ne doit ni compter comme décision ni faire avancer un prospect ou terminer une action. |
| F04, publication incomplète | Renforcer. Le problème dépasse les placeholders : le HTML final est généré après validation du brief. | Préparer une version privée, la vérifier, puis publier exactement cette version. Une nouvelle génération annule l'approbation précédente pour le nouveau contenu. |
| F04, dérogation de complétude | Refuser un bouton universel « publier quand même ». Prix et photo ne sont pas obligatoires pour tous les métiers ; une certification non étayée ne devient pas vraie après un clic. | Règles par type de livrable ; omission ou alternative légitime pour un champ facultatif, blocage des anomalies critiques. |
| F05, ancres | Conserver comme anomalie à reproduire. La cause iframe/base URL reste une hypothèse. | Test sur la page réellement publiée ; ne pas supprimer la sandbox ni autoriser les scripts pour réparer la navigation. |
| F07, accessibilité | Conserver les objectifs de contraste et de lisibilité. 14 px et 44 px sont ici des choix de confort, pas des seuils WCAG universels. | Contrôler les fonds et états réels, les deux dimensions tactiles, le clavier, le zoom et les annonces. |
| F08/F12, capacités | Conserver ; la capture des connexions a déjà vieilli. Une Page Facebook connectée n'est pas une publication Facebook livrée. | Distinguer capacité produit, configuration de l'environnement et autorisation du compte. Aucun nouveau connecteur dans ce lot. |
| F09/F20, confiance | Remonter F20 en P1 : le texte sur les données participe au consentement éclairé. Ne pas retirer seulement le bandeau de brouillon juridique. | Corriger rapidement la promesse ; finaliser les textes avec les informations réelles et la personne compétente. |
| F10, état unique | Nuancer : une mission peut avoir un site publié et plusieurs posts à relire. Un seul état global masquerait ce travail. | Un état précis par objet, un résumé agrégé pour la mission ; séparer décision, exécution et résultat commercial. |
| F11, filtres | Le regroupement est utile ; trois filtres et une priorité sans règle fiable peuvent ajouter du travail. | D'abord action et statut ; canal si utile. Pas de priorité inventée, pas d'approbation en masse en V1. |
| F13, titre d'accueil | Montrer une preuve avant les agents est une hypothèse pertinente. Remplacer obligatoirement le nom du produit par un slogan n'est pas démontré. | Garder BienDecider visible, montrer un livrable et une offre littérale ; tester la compréhension avant une refonte d'identité. |
| F14, récupération de compte | Ce n'est pas un simple lien à ajouter. Le parcours exige jetons, protection contre l'énumération et email transactionnel. | Réutiliser l'US #24 ; ne pas utiliser la boîte Gmail d'un client pour les emails du service. |
| F15, mobile | La taille des boutons et la densité de l'écran sont deux problèmes distincts. | Préserver #99 livrée ; traiter la première tâche visible et compléter la recette, sans rouvrir l'ancien périmètre par défaut. |
| F16, conversation | Le rendu Markdown est petit ; contexte fiable, liens et préférences persistantes sont un chantier plus large. | Livrer par étapes ; ne pas confondre un résumé généré avec les états autoritatifs du produit. |
| F17, risque | Des points précis à vérifier aident davantage qu'un badge répété. Cela ne justifie pas d'abaisser le niveau de risque serveur. | Séparer exposition, informations incertaines et permissions d'exécution. |
| F18, chiffres | Aucun bug de calcul n'est démontré par 1 000 € actuels et 25 € visés. | Autoriser un objectif volontaire de baisse, préciser période et unité, distinguer zéro et non mesuré. |
| F19, navigation | Ajouter « À faire », « Mon plan » et « Productions » peut créer trois portes concurrentes. | Tester une entrée de travail claire avec liens contextuels avant de multiplier les rubriques ou de créer un objet « projet ». |
| Séquencement | Attendre le troisième lot pour mesurer empêcherait de comparer avant/après. | Instrumentation minimale et observation initiale dès le début, sans retarder les corrections de confiance évidentes. |

### Ce que le code et le suivi changent dans la lecture

- Le [traitement des décisions](../../src/app/api/proposals/[id]/route.ts) n'envoie ni ne publie automatiquement. Il accepte `validee`, `modifiee`, `rejetee`, inscrit une date de décision et fait évoluer les prospects concernés. Quand aucune proposition liée n'est `en_attente`, il termine l'action parent. **L'absence de sauvegarde neutre et la confusion « terminé » / « réalisé » ne sont donc pas seulement rédactionnelles.**
- La [publication du site](../../src/lib/site/publish.ts) exige un statut approuvé, puis appelle le modèle pour fabriquer le HTML et le publie. Son prompt demande des emplacements visibles pour les informations manquantes. **Approuver le brief ne revient pas à approuver le rendu final.** Ne pas extrapoler cette observation au parcours Gmail, qui est distinct.
- Les états vides ont fait l'objet de la [PR #161](https://github.com/groupebienoubien/BienDecider/pull/161), fusionnée ; [#98](https://github.com/groupebienoubien/BienDecider/issues/98) reste ouverte au relevé. Réutiliser la guidance et terminer la recette, pas reconstruire tous les états vides.
- [#99](https://github.com/groupebienoubien/BienDecider/issues/99) est fermée et la [PR #165](https://github.com/groupebienoubien/BienDecider/pull/165) est fusionnée depuis le 14 octobre à 09:10 UTC. Les changements documentés couvrent l'accès mobile « À valider » et des cibles agrandies. Cela ne démontre pas toute la hiérarchie mobile ni une décision réussie en trois touches dans chaque cas.
- La [PR #162](https://github.com/groupebienoubien/BienDecider/pull/162) a ajouté la connexion d'une Page Facebook vérifiée avec jetons chiffrés. Le constat « autorisation sans ressource vérifiée » ne doit plus être appliqué globalement à Facebook. Publication et recette fournisseur restent à distinguer.
- Le parcours de délégation (document pas encore versionné ; voir [#155](https://github.com/groupebienoubien/BienDecider/issues/155)) est une cible pertinente, mais sa photographie des connecteurs au 13 octobre doit être réconciliée avec les évolutions suivantes. Ce document ne remplace pas ce travail documentaire en attente.

## 3. Couverture des 20 constats

Les identifiants `UX-01` à `UX-25` sont locaux à ce document. Ils ne sont pas des numéros GitHub. « Extension » signifie périmètre complémentaire à discuter, jamais réouverture automatique d'une Issue terminée.

| Constat audit | Traitement proposé | Rapprochement existant |
|---|---|---|
| F01 | UX-01 diagnostic courant ; UX-02 correction et provenance | Extension de #28, fermée |
| F02 | UX-03 revue ; UX-04 version approuvée ; UX-05 rendu final | Extension de #21 ; lien #101 |
| F03 | UX-04 sauvegarde neutre | Extension de #21, fermée |
| F04 | UX-05 prévisualisation et complétude | #45 |
| F05 | UX-06 navigation du site publié | #45, anomalie ciblée |
| F06 | UX-07 formulaires identifiables | #95, #93 |
| F07 | UX-08 lisibilité et accessibilité | #95, #94 |
| F08 | UX-09 capacités honnêtes | #86, #97 ; acquis #34 |
| F09 | UX-10 confiance et cadre du pilote | #2, #115 |
| F10 | UX-12 progression ; UX-13 doublons | Extension #104 ; #78 |
| F11 | UX-14 file de revue groupée | Nouvelle tranche, lien #105 |
| F12 | UX-09 séparation client/opérateur | #74, #97 |
| F13 | UX-16 accueil concret | #86, #88 |
| F14 | UX-16 entrée ; UX-17 récupération | #24, #47, #93 ; acquis #90 |
| F15 | UX-15 hiérarchie mobile | Complément de #99 fermée |
| F16 | UX-18 conversation contextuelle | #102, #103, #106 ; acquis #27 |
| F17 | UX-19 vérifications concrètes | #39 |
| F18 | UX-20 prospection ; UX-21 métriques | #46, #16, #49, #53 |
| F19 | UX-22 mission ; UX-23 navigation | #155, #105, #106, #63 |
| F20 | UX-11 traitement des données | #115, #97 |
| Recette et mesure, pages 25/29 | UX-24 instrumentation ; UX-25 observation | #107, #100, #18, #81 |

## 4. Priorités et lots

**P1** : protéger la décision, la confiance ou l'accès avant élargissement du pilote. **P2** : réduire l'effort et améliorer la continuité. **P3** : optimisation à décider après observation. Aucun P0 sécurité n'est déduit de cet audit en lecture seule.

Tailles indicatives : **XS** texte/style isolé ; **S** comportement local ; **M** plusieurs surfaces ou contrat API ; **L** cycle de données et migration. Ce ne sont pas des durées. Les tailles incluent une recette ciblée, pas une validation juridique ni les délais fournisseur.

| Lot | US | Résultat de sortie |
|---|---|---|
| 0. Établir la base | UX-24 minimal, UX-25 observation initiale | Parcours de test et mesure de référence disponibles ; pas de données client dans les traces. |
| A. Corriger les ambiguïtés immédiates | UX-07, UX-08 ciblée, UX-09, UX-11, UX-06 ; lancer UX-10 | Champs lisibles, promesses exactes, défaut d'ancre reproduit puis corrigé. Le juridique suit une piste séparée. |
| B. Sécuriser une décision complète | UX-04, UX-03, UX-05, UX-19 | Un brouillon se retrouve ; la version relue est celle approuvée puis publiée ; blocages expliqués. |
| C. Fiabiliser contexte et progression | UX-01, UX-02, UX-12, UX-13 | Diagnostic courant traçable, effets d'une correction visibles, doubles lancements maîtrisés. |
| D. Rendre le travail fluide | UX-14, UX-15, UX-22 sans OAuth, UX-23 après essai | Une mission et sa prochaine décision sont retrouvables sans connaître l'agent. |
| E. Compléter les parcours | UX-16, UX-17, UX-18, UX-20, UX-21 | Acquisition honnête, récupération, accompagnement et résultats compréhensibles. |
| Continu. Vérifier | UX-08 étendue, UX-24, UX-25 | Recette et observations après chaque lot, révision des priorités. |

Les lots B et C peuvent avancer sur des branches distinctes seulement si leurs contrats de données sont coordonnés. Les changements de schéma, d'exécution et de tests partagés sont sérialisés. Aucun travail concurrent n'est assigné à Rémi ou Samir par ce document ; vérifier le responsable et les PR actives avant chaque démarrage.

**Première sélection recommandée pour Rémi :** UX-07, UX-09, UX-11 pour réduire les ambiguïtés rapidement ; UX-06 après reproduction ; puis UX-04 et UX-05 comme chantier de fond. UX-01 reste P1 et doit être cadrée en parallèle, sans repousser tous les correctifs derrière une migration globale.

## 5. US détaillées

### UX-01 : Identifier le diagnostic qui fonde mon plan

**P1 · L · F01 · Nouveau périmètre à rapprocher de [#28](https://github.com/groupebienoubien/BienDecider/issues/28), fermée.**

**Besoin.** En tant que dirigeant, je veux distinguer l'analyse actuelle des précédentes afin de décider sur le bon contexte.

**Périmètre.** Diagnostic, contexte entreprise utilisé, rattachement au plan et choix des constats transmis aux agents. Hors périmètre : réécrire automatiquement tout l'historique ou relancer des agents sans accord.

**Acceptation :**
1. Chaque analyse expose date, état et référence du contexte utilisé. Les anciennes données non rattachables portent « contexte non identifié », sans version fabriquée.
2. Un seul diagnostic est désigné comme courant pour un contexte donné ; les versions précédentes restent consultables.
3. Une modification pertinente de métier, offre ou cible signale l'analyse concernée comme à réexaminer. La règle d'invalidation est explicite et testée.
4. Le plan indique sa source. Un nouveau plan ne consomme pas silencieusement les constats remplacés ; une réutilisation historique éventuelle est explicite.
5. Un diagnostic échoué ou incomplet ne remplace pas silencieusement une version exploitable ; son périmètre incomplet est visible.

**Dépendances / risques.** Contrat de version du contexte, migration des données historiques, coordination avec UX-12. Les dates seules ne suffisent pas à reconstituer une provenance.

**Recette.** Entreprise fictive passant de peintre en bâtiment à artiste : analyse ancienne conservée, nouveau contexte distinct, plan traçable, échec de nouvelle analyse sans perte de l'ancienne.

### UX-02 : Corriger une information et comprendre son origine

**P1 · M · F01 · Complément de UX-01.**

**Besoin.** En tant que dirigeant, je veux corriger un constat erroné sans répéter mon contexte dans plusieurs écrans.

**Périmètre.** Provenance, correction contextualisée et effets sur le travail à venir. Hors périmètre : moteur universel de vérification des faits.

**Acceptation :**
1. Chaque constat distingue déclaration du dirigeant, information sourcée, hypothèse et recherche incomplète ; une URL seule ne vaut pas vérification.
2. Une source affiche son origine et sa date de consultation lorsqu'elles existent. Une source absente reste absente, pas reconstruite par l'IA.
3. « Corriger cette information » ouvre le champ ou un formulaire rattaché au constat, prérempli, avec retour au point de départ.
4. Après enregistrement, les éléments potentiellement affectés sont signalés ; aucune publication ni régénération payante ne démarre implicitement.
5. La correction, son auteur et sa date restent traçables ; une réponse ultérieure ne doit pas présenter le constat remplacé comme actuel.

**Dépendances / risques.** UX-01 ; provenance persistée plutôt qu'inférée du texte. Ne pas supprimer automatiquement une production déjà publiée.

**Recette.** Corriger un métier ambigu, contester une source et annuler une correction ; vérifier contexte conservé et absence d'effet externe.

### UX-03 : Examiner une production avant de décider

**P1 · M · F02 · Extension de [#21](https://github.com/groupebienoubien/BienDecider/issues/21), lien [#101](https://github.com/groupebienoubien/BienDecider/issues/101).**

**Besoin.** En tant que dirigeant, je veux voir ce que j'approuve et ce qui se passera ensuite.

**Périmètre.** Détail de revue des types existants. Hors périmètre : validation en masse et preuve artificielle de lecture.

**Acceptation :**
1. La liste propose « Examiner » ; le détail expose le contenu complet, l'action d'origine, la version, le canal et la destination connue ou manquante.
2. La conséquence est explicite : contenu approuvé mais non publié, prospect ajouté au suivi, contenu à copier ou action externe à confirmer séparément.
3. Approuver et rejeter sont accessibles au clavier et au tactile ; la lecture ne nécessite ni délai imposé ni défilement obligatoire.
4. Fermer le détail conserve filtres et position de liste, et restitue le focus au bon objet.
5. Une version devenue périmée pendant la revue ne peut pas être approuvée par l'ancien écran ; l'utilisateur voit les changements à revoir.

**Dépendances / risques.** UX-04 pour la version ; UX-09 pour les capacités. Adapter l'aperçu au type, sans promettre le rendu exact d'un réseau non intégré.

**Recette.** Post manuel, prospect et site ; ancien onglet ouvert pendant une modification ; explication de la conséquence par un utilisateur test.

### UX-04 : Sauvegarder sans approuver et approuver une version précise

**P1 · L · F02/F03 · Nouvelle extension de [#21](https://github.com/groupebienoubien/BienDecider/issues/21), fermée.**

**Besoin.** En tant que dirigeant, je veux corriger une production, la retrouver plus tard et ne l'approuver que lorsque je suis prêt.

**Périmètre.** Sauvegarde, révisions, approbation et conflits côté serveur. Hors périmètre : éditeur collaboratif temps réel ou annulation d'un email déjà envoyé.

**Acceptation :**
1. « Enregistrer le brouillon » conserve le contenu après rechargement sans approbation, date de décision, progression du prospect ni clôture de l'action.
2. « Approuver cette version » enregistre la référence exacte approuvée et la date ; l'autorisation d'exécution ne repose pas sur le seul libellé de statut.
3. Modifier le contenu ou la destination après approbation crée une version non approuvée. La version déjà publiée et sa preuve restent historiques.
4. Les écritures incluent la version attendue ; un conflit entre deux onglets ne remplace pas silencieusement le travail le plus récent.
5. Une confirmation d'exécution pour une ancienne version est refusée côté serveur, même si l'interface est contournée.
6. Une sauvegarde échouée conserve le texte dans l'éditeur et annonce l'échec ; aucune indication « Enregistré » trompeuse.

**Dépendances / risques.** Migration et adaptation des consommateurs des statuts, dont le calcul de fin d'action. Définir le traitement des anciennes approbations sans inventer leur version.

**Recette.** Sauvegarde/reprise, échec réseau, concurrence de deux onglets, modification après approbation et contrôle API inter-entreprises.

### UX-05 : Publier exactement le site que j'ai prévisualisé

**P1 · L · F04/F02 · Tranche de [#45](https://github.com/groupebienoubien/BienDecider/issues/45).**

**Besoin.** En tant que dirigeant, je veux vérifier le site final et ses informations avant qu'il soit accessible à mes clients.

**Périmètre.** Génération privée, contrôles de complétude, approbation et publication d'un artefact immuable. Hors périmètre : CMS complet, paiement en ligne, import de médias sans contrôle.

**Acceptation :**
1. La génération produit une version privée liée au brief et au contexte utilisés ; elle ne remplace pas le site public existant.
2. La prévisualisation requiert l'autorisation de l'entreprise ; une URL devinable ou `noindex` seul ne constitue pas une protection.
3. Les données manquantes et affirmations à confirmer sont listées. Les règles dépendent du type de site : prix facultatif possible avec « sur devis », mais pas de faux prix ni de fausse certification.
4. Les anomalies critiques bloquent la publication côté serveur. Pour une donnée facultative, l'utilisateur peut la compléter ou retirer proprement le bloc ; pas de dérogation globale.
5. La confirmation publie exactement l'artefact contrôlé et approuvé, sans nouvel appel génératif. Une régénération ou modification impose une nouvelle revue.
6. Un double clic ne produit ni seconde génération ni seconde publication logique. Une erreur laisse l'ancienne version publique intacte et indique le résultat connu ou incertain.
7. Une démonstration utilise des données fictives et porte une mention explicite ; elle ne doit pas exposer les données d'un compte test réel.

**Dépendances / risques.** UX-04, UX-19, sérialisation du changement d'exécution. Prévoir stockage des versions, contrôle concurrent à la publication, isolation et maintien des protections HTML. Découpage technique possible : préparation privée, revue, bascule publique atomique.

**Recette.** Site incomplet, site « sur devis », modification après aperçu, accès par une autre entreprise, double clic et échec ; comparer la version approuvée à la version servie publiquement.

### UX-06 : Utiliser les liens du site publié sans quitter le contenu

**P1 si reproduit · S/M · F05 · Anomalie liée à [#45](https://github.com/groupebienoubien/BienDecider/issues/45).**

**Besoin.** En tant que visiteur, je veux atteindre catalogue, FAQ ou contact depuis les liens de la vitrine.

**Périmètre.** Résolution des fragments et navigation du document intégré. Hors périmètre : suppression de l'isolation ou refonte d'hébergement sans preuve de nécessité.

**Acceptation :**
1. Un cas de test reproduit le défaut avec une vitrine fictive avant correction ; sinon l'anomalie reste « à reproduire », pas « corrigée ».
2. Un clic sur chaque ancre atteint la section correspondante sans recharger l'application dans l'iframe ni rester sur un chargement.
3. Accès direct avec fragment, retour navigateur et rechargement ont un comportement défini et testé.
4. Les liens externes et contacts restent utilisables dans la politique autorisée ; les scripts et navigations dangereuses restent interdits.

**Dépendances / risques.** Aucune dépendance à UX-05 pour reproduire. Conserver la sandbox ; vérifier l'URL de base et le document servi avant de choisir le correctif.

**Recette.** Chromium, Firefox et WebKit sur la matrice supportée ; clic et clavier à 320/390 px et sur ordinateur.

### UX-07 : Reconnaître chaque champ, même après saisie

**P1 · S · F06 · Tranche de [#95](https://github.com/groupebienoubien/BienDecider/issues/95), lien [#93](https://github.com/groupebienoubien/BienDecider/issues/93).**

**Besoin.** En tant qu'utilisateur, je veux savoir ce que représente chaque valeur et comment corriger une erreur.

**Périmètre.** Connexion, inscription, profil entreprise et brief. Hors périmètre : restructuration complète de l'onboarding.

**Acceptation :**
1. Chaque contrôle possède un label visible permanent et associé ; les placeholders restent des exemples, pas des labels.
2. Montants, périodes et unités sont indiqués sans ambiguïté, notamment chiffre d'affaires, objectif, valeur client et budget.
3. Aides et erreurs sont reliées au champ ; une erreur décrit la correction attendue et ne vide pas les autres valeurs.
4. Autocomplétion adaptée : `email`, `current-password` en connexion, `new-password` à l'inscription ; affichage du mot de passe activable avec nom accessible.
5. La saisie reste lisible à 320 px et au zoom ; ordre de tabulation cohérent et annonce des erreurs.

**Dépendances / risques.** Aucun connecteur. Réutiliser les contrôles existants et préserver leurs validations serveur.

**Recette.** Formulaires vides puis remplis, recherche des champs par label, validation invalide, clavier et lecture assistée ciblée.

### UX-08 : Lire et utiliser les commandes sans obstacle évitable

**P1 ciblée puis P2 étendue · S/M · F07 et page 25 · [#95](https://github.com/groupebienoubien/BienDecider/issues/95), [#94](https://github.com/groupebienoubien/BienDecider/issues/94).**

**Besoin.** En tant qu'utilisateur, je veux lire les informations utiles et agir avec clavier, zoom ou écran tactile.

**Périmètre.** D'abord garanties et pied de page, puis composants de revue touchés. Hors périmètre : déclaration de conformité globale sur la base d'un outil automatique.

**Acceptation :**
1. Les textes courants visés atteignent 4,5:1 sur leurs fonds réels ; les autres catégories suivent leur seuil applicable. Survol et focus sont contrôlés.
2. Les informations utiles du périmètre utilisent au moins 14 px selon le choix produit ; les badges ne reposent jamais sur la couleur seule.
3. Les commandes fréquentes visent 44 × 44 px ; les autres cibles sont contrôlées selon WCAG 2.2 et ses exceptions, sans déduire la conformité de la hauteur seule.
4. Focus visible et non masqué, fermeture Échap et restitution du focus sont préservés dans les panneaux.
5. Les pages touchées restent utilisables à 200 % de zoom et en reflow à 320 px CSS ; les statuts asynchrones sont annoncés sans déplacement injustifié du focus.

**Dépendances / risques.** Préserver les acquis #99 et du dialogue diagnostic. Les couleurs de l'audit sont un point de départ, pas une palette à appliquer aveuglément.

**Recette.** Mesures de contraste, automatisation ciblée, parcours clavier et contrôle manuel avec lecteur d'écran ; consigner les limites non testées.

### UX-09 : Savoir qui fait quoi sur chaque canal

**P1 · S/M · F08/F12 · [#86](https://github.com/groupebienoubien/BienDecider/issues/86), [#97](https://github.com/groupebienoubien/BienDecider/issues/97).**

**Besoin.** En tant que dirigeant, je veux comprendre ce qui sera préparé, publié par moi ou exécuté par BienDecider avant de confier le travail.

**Périmètre.** Textes et règles de présentation sur accueil, équipe, connexions et productions. Hors périmètre : activation d'un nouveau canal.

**Acceptation :**
1. Chaque type de production indique préparation, copie manuelle ou exécution disponible, et nomme l'acteur de la prochaine étape.
2. Capacité implémentée, configuration serveur et autorisation du compte sont distinguées ; un compte connecté n'affiche pas une publication inexistante.
3. La destination connue et la confirmation requise sont visibles avant toute action externe ; une destination absente n'est pas devinée.
4. Le client ne voit pas de consignes de variables d'environnement ou d'App Review ; l'opérateur les retrouve dans la documentation ou une vue autorisée, sans secret.
5. Une capacité indisponible propose une alternative réellement utilisable ; les mêmes termes sont utilisés sur les quatre surfaces.

**Dépendances / risques.** Vérifier les capacités réelles au démarrage, notamment Facebook après #162. Ne pas reprendre les captures anciennes comme matrice actuelle.

**Recette.** Canal manuel, Gmail autorisé/absent, site, réseau connecté sans publication ; aucune promesse d'exécution inaccessible.

### UX-10 : Identifier l'éditeur et les conditions effectives du pilote

**P1 avant élargissement · M + validation externe · F09 · [#2](https://github.com/groupebienoubien/BienDecider/issues/2), [#115](https://github.com/groupebienoubien/BienDecider/issues/115).**

**Besoin.** En tant que participant, je veux savoir qui fournit le service, dans quelles conditions et comment exercer mes droits.

**Périmètre.** Documents publics et résumé du pilote. Hors périmètre : inventer une société, un SIRET, une durée de conservation ou certifier juridiquement les textes.

**Acceptation :**
1. Identité réelle de l'éditeur, contact, hébergement et responsabilités sont renseignés selon la situation effective, avec validation compétente.
2. Gratuité éventuelle, durée, limites et fin du pilote sont explicites ; aucun tarif ou engagement non décidé n'est inventé.
3. Les textes approuvés portent date/version et ne contiennent plus de champs de travail ; le bandeau de brouillon n'est retiré qu'après validation.
4. Les pages sont consultables sans session et depuis l'inscription ; leurs résumés sont cohérents avec les capacités et flux réels.
5. Tant que l'identité ou les conditions restent non résolues, la tâche conserve son blocage et une décision explicite sur l'élargissement du pilote est requise.

**Dépendances / risques.** Informations fournies par les responsables, revue juridique ; l'immatriculation non prévue ne doit pas être remplacée par une identité fictive. #112 n'est une dépendance que si la structure retenue l'exige.

**Recette.** Relecture des informations factuelles, validation par le responsable désigné, accès déconnecté et absence de placeholders. Un test automatisé ne vaut pas avis juridique.

### UX-11 : Comprendre le traitement de mes données sans promesse absolue

**P1 · XS/S · F20 · [#115](https://github.com/groupebienoubien/BienDecider/issues/115), [#97](https://github.com/groupebienoubien/BienDecider/issues/97).**

**Besoin.** En tant que dirigeant, je veux distinguer les données utilisées pour préparer le travail de celles rendues publiques.

**Périmètre.** Texte du profil/brief et lien de confidentialité. Hors périmètre : changement de prestataire ou promesse non vérifiée de non-conservation.

**Acceptation :**
1. « Rien n'est partagé » disparaît du périmètre ; le texte distingue traitement par les prestataires et publication externe.
2. La formulation est confrontée aux flux effectifs avant livraison, y compris la réutilisation possible d'informations entreprise dans une production publique approuvée.
3. Le résumé renvoie à la section pertinente de la politique, accessible sans session.
4. Aucun texte ne garantit que toutes les données saisies ne seront jamais publiées si elles peuvent alimenter un site validé.

**Dépendances / risques.** Relecture du flux de données et coordination UX-10. La correction de la phrase trompeuse ne doit pas attendre la finalisation de tous les documents.

**Recette.** Recherche des formulations absolues, comparaison formulaire/politique et reformulation par un participant test.

### UX-12 : Distinguer le travail décidé, réalisé et mesuré

**P1 · M · F10 · Extension de [#104](https://github.com/groupebienoubien/BienDecider/issues/104), fermée ; lien [#41](https://github.com/groupebienoubien/BienDecider/issues/41).**

**Besoin.** En tant que dirigeant, je veux comprendre l'avancement sans croire qu'une validation équivaut à un résultat obtenu.

**Périmètre.** Synthèse mission/action, états de production et d'exécution. Hors périmètre : forcer tous les objets dans une seule machine à états.

**Acceptation :**
1. La mission présente des compteurs distincts : à relire, approuvé, à réaliser manuellement, exécuté, en échec ; un résultat commercial est séparé.
2. Toutes les productions rejetées ne donnent pas le message « mission réalisée » ; une production approuvée mais non publiée reste en attente de réalisation.
3. Une preuve passée peut coexister avec des validations courantes sans coche globale suggérant que tout est achevé.
4. Chaque production rejoint son action et chaque réalisation rejoint la version concernée ; les objets historiques sans lien sont identifiés.
5. Une exécution incertaine n'est ni un succès ni un simple échec automatiquement relançable.

**Dépendances / risques.** UX-04, contrat avec UX-01 ; revoir le calcul parent actuellement fondé sur l'absence de `en_attente`, pas seulement son affichage.

**Recette.** Mission mixte avec un site publié, deux posts à relire et un rejet ; cas tout rejeté, action manuelle et résultat incertain.

### UX-13 : Éviter les doubles demandes sans interdire une nouvelle version

**P1 technique / P2 rapprochement · M · F10 · [#78](https://github.com/groupebienoubien/BienDecider/issues/78).**

**Besoin.** En tant que dirigeant, je veux retrouver un travail déjà lancé et ne pas payer ou produire deux fois par erreur.

**Périmètre.** Soumission, lancement concurrent et rapprochement d'actions similaires. Hors périmètre : déduplication sémantique parfaite par IA.

**Acceptation :**
1. Double clic et renvoi de la même requête renvoient le travail existant via une protection serveur, pas seulement un bouton désactivé.
2. Deux lancements concurrents pour la même opération ne créent pas deux générations facturées.
3. Une action active potentiellement similaire est proposée avec son contexte ; un titre identique seul ne suffit pas à conclure au doublon.
4. L'utilisateur peut rejoindre l'action ou demander explicitement une nouvelle version avec un périmètre distinct.
5. Une opération au résultat externe incertain n'est pas rejouée automatiquement comme si rien ne s'était passé.

**Dépendances / risques.** Identité stable des opérations ; coordination #77 et UX-05. Différencier doublon technique et nouvelle intention légitime.

**Recette.** Double clic, deux onglets, retry après timeout et deux actions homonymes mais différentes.

### UX-14 : Traiter les productions d'une même action sans perdre le fil

**P2 · M · F11 · Nouvelle tranche liée à [#105](https://github.com/groupebienoubien/BienDecider/issues/105).**

**Besoin.** En tant que dirigeant, je veux retrouver et relire ensemble les livrables utiles à une action.

**Périmètre.** Regroupement, filtres minimaux, navigation entre détails. Hors périmètre : validation en masse et priorité automatique non justifiée.

**Acceptation :**
1. La file regroupe par action avec un titre parent et un compteur ; les productions non rattachées ont un groupe explicite.
2. Statut et, si pertinent, canal filtrent la file sans masquer le nombre restant ; le filtre survit au retour du détail.
3. Précédent/Suivant reste dans le groupe filtré et annonce la position ; le traitement du dernier élément a une sortie claire.
4. Un post lié à un catalogue explique sa dépendance. Un catalogue non publié ne fournit pas un faux lien prêt à diffuser.
5. Une file vide et un filtre sans résultat ont des états distincts ; aucune navigation ne lance de génération.

**Dépendances / risques.** UX-03 et UX-12 ; préserver les états vides #98.

**Recette.** Jeu de 16 productions réparties sur plusieurs actions, groupe sans parent, filtres combinés et dernier élément traité.

### UX-15 : Voir la première décision utile sur mobile

**P2 · S · F15 · Complément de [#99](https://github.com/groupebienoubien/BienDecider/issues/99), fermée.**

**Besoin.** En tant que dirigeant sur téléphone, je veux atteindre une décision sans traverser plusieurs rappels identiques.

**Périmètre.** Hiérarchie du tableau de bord et détail de revue. Hors périmètre : refaire les cibles déjà agrandies ou supprimer les confirmations nécessaires pour atteindre un score de clics.

**Acceptation :**
1. Dans « À valider », un seul résumé compact remplace les appels redondants à ouvrir cette même vue.
2. À 390 × 844 px, avec le jeu de référence, la première tâche et son bouton « Examiner » sont visibles sans faire défiler deux blocs de progression.
3. À 320 × 720 px, aucune commande ni information nécessaire n'est tronquée ; focus et clavier virtuel ne sont pas masqués.
4. Depuis une page connectée de référence, accéder à la file, examiner puis approuver demande au plus trois activations, hors lecture et défilement. L'exécution externe reste une décision séparée.
5. Le rejet, l'annulation et la reprise sont testés avec leurs vrais effets ; les critères ne se limitent pas à mesurer la hauteur des boutons.

**Dépendances / risques.** UX-03 et UX-12 ; préserver le lien mobile livré par #165.

**Recette.** Captures 320/390/768/1440 px, parcours d'approbation et de rejet, puis vérification sur un téléphone réel.

### UX-16 : Voir un exemple et choisir la bonne entrée

**P2 · S/M · F13/F14 · [#86](https://github.com/groupebienoubien/BienDecider/issues/86), [#88](https://github.com/groupebienoubien/BienDecider/issues/88), lien [#93](https://github.com/groupebienoubien/BienDecider/issues/93).**

**Besoin.** En tant que nouveau visiteur, je veux comprendre le travail reçu et commencer sans chercher la création de compte.

**Périmètre.** Accueil et transitions inscription/connexion/brief. Hors périmètre : refonte de marque et connexion sociale #156.

**Acceptation :**
1. La première vue identifie BienDecider, son offre et un exemple concret avec mention de démonstration, sans données client.
2. Le livrable et la décision attendue précèdent la longue présentation des agents ; la marque et les repères utiles sont conservés.
3. « Créer mon compte » et « Se connecter » ont des destinations explicites ; un utilisateur déjà connecté rejoint son travail sans compte en double.
4. Le CTA ne promet pas un plan immédiat s'il faut d'abord renseigner le brief. Conditions du pilote et liens de confiance sont accessibles avant inscription.
5. Un brief interrompu est récupérable après reconnexion dans le périmètre prévu ; aucune génération n'est déclenchée par une simple visite.

**Dépendances / risques.** UX-09, UX-10 ; reprendre l'acquis #90 sans le déclarer absent. La reprise de brief peut être livrée comme tranche séparée de #93.

**Recette.** Nouveau visiteur, compte existant, session active et brief interrompu ; test qualitatif de compréhension après dix secondes, pas promesse de conversion.

### UX-17 : Récupérer mon accès sans perdre mon entreprise

**P2, P1 avant pilote non accompagné · M · F14 · [#24](https://github.com/groupebienoubien/BienDecider/issues/24), dépendance [#47](https://github.com/groupebienoubien/BienDecider/issues/47).**

**Besoin.** En tant qu'utilisateur ayant oublié son mot de passe, je veux reprendre mon compte et mon travail en sécurité.

**Périmètre.** Récupération par email du service, erreurs et retour au travail. Hors périmètre : login social ou utilisation de Gmail client comme canal transactionnel.

**Acceptation :**
1. Un lien visible et un retour à la connexion existent ; la réponse à une demande ne révèle pas si l'email possède un compte.
2. Le jeton est limité dans le temps, à usage unique, stocké sous forme non réutilisable et consommé atomiquement ; demandes et essais sont limités.
3. Aucun jeton ni mot de passe n'apparaît dans les logs applicatifs ; l'URL de retour autorisée ne permet pas de redirection hostile.
4. La réinitialisation applique la politique de sessions définie, invalide les accès nécessaires et conserve l'entreprise et ses données.
5. Lien expiré, déjà utilisé et erreur d'envoi proposent une reprise ; les emails utilisent le fournisseur transactionnel du service.

**Dépendances / risques.** #47, politique de sessions et de limitation ; validation sécurité avant ouverture.

**Recette.** Boîte de test, jeton expiré/réutilisé, demandes répétées, compte inconnu et tentative inter-entreprises.

### UX-18 : Parler à Paul dans le contexte du travail en cours

**P2 · M · F16 · [#102](https://github.com/groupebienoubien/BienDecider/issues/102), [#103](https://github.com/groupebienoubien/BienDecider/issues/103), [#106](https://github.com/groupebienoubien/BienDecider/issues/106).**

**Besoin.** En tant que dirigeant, je veux demander de l'aide sur une action sans transformer accidentellement mon message en règle permanente.

**Périmètre.** Accès contextuel, rendu des messages, dates, liens et distinction message/préférence. Hors périmètre : nouvel agent ou mémoire illimitée.

**Acceptation :**
1. Un accès à Paul conserve la référence de l'action ou production et permet de revenir au travail sans perdre les saisies.
2. Les messages affichent une date et un Markdown rendu par une bibliothèque adaptée ; HTML arbitraire et URL dangereuses ne sont pas exécutés.
3. « Envoyer un message » et « Enregistrer une préférence » sont distincts ; rendre une consigne persistante nécessite un acte explicite et réversible.
4. Les liens vers les objets sont structurés, autorisés pour l'entreprise et issus de références réelles, pas d'URL inventées par le modèle.
5. Un résumé actuel utilise les états du produit ; les réponses anciennes restent datées et ne sont pas présentées comme l'état courant.

**Dépendances / risques.** UX-12 ; séparer une première tranche rendu/dates de l'accès global et du contexte serveur. Préserver la mémoire existante #27.

**Recette.** Message ponctuel, préférence, objet archivé, lien d'une autre entreprise, contenu Markdown hostile et navigation avec brouillon.

### UX-19 : Savoir précisément quoi vérifier avant diffusion

**P1 pour diffusion publique · M · F17 · [#39](https://github.com/groupebienoubien/BienDecider/issues/39).**

**Besoin.** En tant que dirigeant, je veux identifier les informations à confirmer et les effets de l'action sans subir une alerte générique répétée.

**Périmètre.** Points de contrôle liés à la version et explication du risque. Hors périmètre : certification automatique de vérité ou assouplissement des autorisations serveur.

**Acceptation :**
1. L'exposition publique, le destinataire et les données de tiers sont distingués de la fiabilité des prix, coordonnées, sources ou affirmations.
2. Chaque point renvoie à une information du contenu et à une correction ou justification attendue ; les inconnues restent visibles.
3. Une confirmation humaine est présentée comme telle, pas comme une vérification indépendante.
4. Un changement de version invalide les confirmations affectées ; les blocages critiques sont revérifiés côté serveur avant exécution.
5. Les alertes disposent de texte et d'un repère non exclusivement coloré ; l'explication détaillée du risque reste accessible.

**Dépendances / risques.** UX-04 ; règles partagées avec UX-05. Une checklist générée par le même modèle ne suffit pas comme contrôle de sécurité.

**Recette.** Certification non étayée, prix absent, coordonnées modifiées et source de prospect manquante ; vérifier que le simple clic « confirmé » ne contourne pas un blocage critique.

### UX-20 : Passer d'un prospect à un contact réellement suivi

**P2 · M · F18 · [#46](https://github.com/groupebienoubien/BienDecider/issues/46), liens [#51](https://github.com/groupebienoubien/BienDecider/issues/51) et [#69](https://github.com/groupebienoubien/BienDecider/issues/69).**

**Besoin.** En tant que dirigeant, je veux vérifier un prospect, préparer mon approche puis enregistrer ce qui s'est réellement passé.

**Périmètre.** Prochaine action, source, message préparé et suivi ; Gmail seulement via son parcours existant lorsque le rattachement sera prêt. Hors périmètre : prospection autonome et nouveau fournisseur.

**Acceptation :**
1. Le prochain prospect exploitable précède les options d'autonomie indisponibles ; source et informations à confirmer restent visibles.
2. Une préparation de message reprend le prospect sans ressaisie, mais ne le marque pas « contacté ».
3. Sans envoi intégré, copier le message ne vaut pas envoi ; la déclaration manuelle est explicite, datée et modifiable selon les règles du suivi.
4. Avec Gmail disponible et raccordé, expéditeur, destinataire et contenu sont revus avant confirmation ; succès, échec et incertitude restent distincts.
5. Un prospect sans contact vérifié n'obtient pas une adresse inventée ; l'utilisateur peut différer ou écarter avec une raison.

**Dépendances / risques.** UX-09, UX-03, règles #69. Livrer d'abord le parcours manuel sans reprendre le chantier connecteurs ; raccorder #46 dans une tranche séparée.

**Recette.** Préparation sans envoi, copie, contact déclaré, absence de coordonnées et envoi simulé en échec ; aucun contact réel pendant les tests automatisés.

### UX-21 : Lire des résultats comparables et un objectif plausible

**P2 · M · F18 · [#16](https://github.com/groupebienoubien/BienDecider/issues/16), [#49](https://github.com/groupebienoubien/BienDecider/issues/49), [#53](https://github.com/groupebienoubien/BienDecider/issues/53).**

**Besoin.** En tant que dirigeant, je veux distinguer ce qui a été produit, exécuté et obtenu commercialement.

**Périmètre.** Périodes, sources, unités, absence de mesure et plausibilité. Hors périmètre : intégration analytics ou preuve causale de retour sur investissement.

**Acceptation :**
1. Chaque indicateur expose sa période, son unité et sa source : déclaration, calcul sur événements ou mesure externe disponible.
2. « Non mesuré » est distinct de zéro ; une valeur manquante n'est pas transformée en zéro dans les comparaisons.
3. Une cible inférieure à l'actuel demande une clarification non bloquante ; un objectif de baisse volontaire reste autorisé.
4. Des périodes ou unités incompatibles ne sont pas comparées silencieusement ; le calcul est explicable.
5. Nombre de productions, envois, contacts et clients restent distincts ; une suggestion de prochaine action n'attribue pas des ventes à l'IA sans preuve.

**Dépendances / risques.** UX-07 et UX-12 ; vérifier les calculs existants avant d'ouvrir un ticket de bug.

**Recette.** Valeur nulle, inconnue, baisse volontaire, dates différentes et objectif non renseigné ; tests unitaires des règles retenues.

### UX-22 : Confier ou refuser une activité avec des conséquences claires

**P2, principe transverse dès P1 · M · F19 et fil rouge produit · [#155](https://github.com/groupebienoubien/BienDecider/issues/155).**

**Besoin.** En tant que dirigeant, je veux accepter ou refuser une mission concrète sans choisir moi-même les étapes techniques de chaque agent.

**Périmètre.** Mission, livrable, agent responsable, limites et suivi. Première tranche sans modification OAuth ; reprise après autorisation laissée au chantier #155 quand les connecteurs reprennent. Hors périmètre : autonomie persistante #35/#36/#38/#40/#42.

**Acceptation :**
1. Avant acceptation sont visibles résultat attendu, périmètre, travail demandé au dirigeant, capacité réelle et coût connu ou limite du pilote ; pas de coût estimé inventé.
2. Un clic accepte la préparation si les conséquences sont exposées ; un refus ne lance ni agent ni action externe et n'impose pas de justification.
3. Accepter la mission ne donne ni accès fournisseur ni autorisation de publier ; les trois décisions restent distinctes dans les données et l'interface.
4. L'agent prépare sans connecteur lorsque possible ; les informations manquantes sont demandées au moment où elles sont nécessaires.
5. La mission reste retrouvable après navigation, échec ou reconnexion ; annulation et résultat connu sont explicites.
6. La tranche OAuth future conserve mission et brouillon, valide la destination de retour côté serveur et ne publie jamais depuis le callback.

**Dépendances / risques.** UX-09, UX-12, UX-13 ; isolation entreprise et coûts. Le « clic unique » ne supprime pas un consentement fournisseur obligatoire.

**Recette.** Acceptation/refus, double clic, donnée manquante, session expirée, canal manuel. Tester retour OAuth seulement lors de la reprise de cette tranche, pas pour valider la V1 sans connecteur.

### UX-23 : Retrouver ma tâche sans connaître le nom d'un agent

**P2 pour accès direct / P3 pour refonte complète · S/M · F19 · [#105](https://github.com/groupebienoubien/BienDecider/issues/105), [#106](https://github.com/groupebienoubien/BienDecider/issues/106), lien [#63](https://github.com/groupebienoubien/BienDecider/issues/63).**

**Besoin.** En tant que dirigeant, je veux rejoindre mon plan, mes décisions et mes résultats à partir de mon objectif.

**Périmètre.** Entrées de navigation et liens contextuels. Hors périmètre : nouvel objet projet et renommage simultané de toutes les routes.

**Acceptation :**
1. Une entrée de travail principale et un accès direct aux décisions sont identifiables ; les destinations proches n'ont pas de périmètres ambigus.
2. Chaque action permet de retrouver ses productions, son diagnostic source et ses résultats sans détour par la page d'un agent.
3. Entreprise et connexions peuvent être regroupées en réglages après essai utilisateur, en préservant les liens existants.
4. Les comptes sans rôle opérateur ne voient pas une entrée administrative inutile ; les API restent protégées indépendamment de la visibilité du menu.
5. Le choix final entre navigation actuelle simplifiée et proposition de l'audit s'appuie sur les tâches UX-25, pas sur une préférence graphique seule.

**Dépendances / risques.** UX-12, UX-22 ; tester les rôles sans déduire une faille de la capture administrateur.

**Recette.** Retrouver une production, corriger le contexte, gérer un accès et lire un résultat avec comptes client/opérateur ; vérifier les liens profonds après changement.

### UX-24 : Mesurer les frictions sans collecter les contenus métier

**P2, démarrage au lot 0 · S/M · Page 29 · [#107](https://github.com/groupebienoubien/BienDecider/issues/107).**

**Besoin.** En tant que responsable produit, je veux repérer les étapes abandonnées et les erreurs pour prioriser sur des faits.

**Périmètre.** Événements minimaux et définition des métriques. Hors périmètre : enregistrement de sessions, copie des prompts ou outil de tracking publicitaire.

**Acceptation :**
1. Événements définis : brief commencé/confirmé, mission acceptée/refusée, production ouverte, brouillon enregistré, version approuvée, exécution réussie/échouée/incertaine et action manuelle déclarée.
2. Les événements de succès proviennent d'opérations confirmées, pas du seul clic ; les retries sont dédupliqués.
3. Aucun contenu de message, email, jeton ou URL sensible n'est collecté ; identifiants minimisés, accès et durée de conservation définis.
4. Première valeur signifie ici première production utile ouverte, à valider qualitativement ; son délai est mesuré depuis le brief confirmé. Exécution et résultat commercial restent des métriques séparées.
5. Comptes internes/test sont exclus des indicateurs pilote ; une base avant changement est conservée, ou son absence est explicitement indiquée.

**Dépendances / risques.** Politique de données UX-10/11, choix du stockage ; absence d'instrumentation ne doit pas bloquer un correctif évident.

**Recette.** Parcours simulé avec retry et échec ; vérifier une seule occurrence logique, l'absence de contenu sensible et les définitions de calcul.

### UX-25 : Vérifier le parcours avec cinq dirigeants

**P2, préparation au lot 0 · M de recherche · Pages 25/29 · [#100](https://github.com/groupebienoubien/BienDecider/issues/100), [#18](https://github.com/groupebienoubien/BienDecider/issues/18).**

**Besoin.** En tant que responsable produit, je veux vérifier que la cible comprend et réussit les décisions essentielles sans assistance.

**Périmètre.** Premier cycle qualitatif, synthèse anonymisée et re-test des obstacles. Hors périmètre : déduction d'un taux de conversion représentatif avec cinq personnes.

**Acceptation :**
1. Cinq participants de la cible sont recrutés avec information sur les données observées ; ne pas supposer qu'ils connaissent les agents ou le vocabulaire du produit.
2. Le protocole couvre promesse, premier brief, correction métier, mission acceptée/refusée, revue, brouillon, approbation et recherche du résultat.
3. Avant de confirmer, le participant explique ce qui sera publié ou envoyé, par qui et où ; une confusion sur une conséquence externe est un obstacle critique.
4. Réussite sans aide, hésitations, erreurs et abandons sont consignés avec contexte ; aucun objectif chiffré de performance n'est inventé après observation.
5. Chaque obstacle critique reçoit un responsable, une décision et un re-test ; les retours esthétiques sont distingués des blocages de tâche.

**Dépendances / risques.** Environnement et base de test dédiés [#81](https://github.com/groupebienoubien/BienDecider/issues/81), jeu de données fictif, disponibilité des participants. Une première session peut porter sur l'existant ou un prototype avant tous les développements.

**Recette.** Compte rendu anonymisé, traçabilité aux US et comparaison des mêmes tâches après livraison ; jamais d'envoi à un vrai prospect ni de publication client pour les besoins de l'étude.

## 6. Recette transverse et arbitrages

### Définition commune de terminé

- Critères de la fiche vérifiés, périmètre hors scope respecté et limites restantes écrites dans la PR.
- Tests ciblés dans les suites existantes ; contrôle serveur des transitions, de l'isolation entreprise et des effets externes, pas uniquement captures de boutons.
- Tests navigateur sur base jetable/dédiée ; aucun test de mutation sur Production. Fournisseurs simulés sauf recette externe explicitement autorisée.
- Pour les surfaces touchées : 320, 390, 768 et 1440 px, clavier, focus, labels, erreurs, chargement, état vide et reprise ; téléphone réel pour le lot mobile.
- Tout changement de données a sa migration versionnée et son traitement des données historiques ; aucune modification manuelle de Production pour la recette.
- Textes de capacités, aide et documentation associés mis à jour. Conserver les garde-fous et les composants accessibles déjà livrés.
- Checks obligatoires et revue selon les règles du dépôt. Une CI verte n'est pas la preuve d'une recette fournisseur ou d'une validation juridique.

### Scénarios transverses prioritaires

| Situation | Attendu |
|---|---|
| Métier ambigu corrigé après un diagnostic | Provenance visible, éléments affectés signalés, historique préservé. |
| Modification sauvegardée puis session expirée | Brouillon retrouvé après connexion, aucune approbation implicite. |
| Deux onglets sur une même production | Conflit explicite, pas d'approbation de version périmée. |
| Site avec informations manquantes | Aperçu privé, blocages précis, aucun remplacement du site public. |
| Site approuvé puis publication | Même artefact servi, preuve reliée à la version, pas de génération cachée. |
| Double clic ou timeout | Pas de doublon ; une incertitude est visible avant toute relance. |
| Réseau sans publication intégrée | Contenu utilisable manuellement ; copie distincte d'une publication déclarée. |
| Mission refusée | Aucun agent lancé, aucune action externe, possibilité de revenir à la proposition. |
| Une réalisation ancienne et de nouvelles validations | Synthèse mixte cohérente, pas de parcours global faussement terminé. |
| Utilisateur standard et opérateur | Navigation adaptée, protections serveur inchangées. |

### Décisions nécessaires avant engagement

| Décision | Recommandation | Responsable à confirmer |
|---|---|---|
| Sens de « déléguer » en V1 | Confier la préparation ; approbation et exécution explicites. Reporter l'autonomie persistante. | Produit |
| Objet approuvé pour le site | Artefact final immuable, pas seulement brief. | Produit + technique |
| Champs bloquants | Règles par livrable ; omission légitime pour le facultatif, pas de contournement global. | Produit + expertise métier |
| Changements invalidant le diagnostic | Métier/offre/cible d'abord ; tracer précisément le contexte pertinent. | Produit + technique |
| Éditeur et cadre du pilote | Données réelles et validation compétente avant élargissement ; ne pas inventer d'immatriculation. | Responsables du service |
| Navigation | Tester une version simplifiée avant d'ajouter toutes les entrées du PDF. | Produit + participants |
| Chantiers actifs | Lire les Issues/PR, réserver les fichiers partagés, choisir une tranche testable par PR. | Rémi et Samir |

### Ce que ce document ne déclenche pas

Aucune Issue n'est créée ou modifiée automatiquement. Les US existantes sont à enrichir en priorité après vérification de leur périmètre ; les compléments à une US fermée deviennent des extensions liées. Le document ne relance aucun connecteur, n'autorise aucune publication et ne constitue ni audit juridique, ni certification d'accessibilité, ni revue de sécurité exhaustive.