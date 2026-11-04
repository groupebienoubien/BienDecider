---
title: "Gap analysis : de la maquette V5.2 à la production"
status: "décisions validées"
created: 2026-11-04
updated: 2026-11-04
cible: "maquette_v5.2 (commit a355e2f, #308), https://groupebienoubien.github.io/BienDecider/maquette_v5.2/#/decouvrir"
production: "branche main au commit bdde710 (2026-11-04)"
referentiel_us: "132 Issues ouvertes avant le tri ; tri appliqué le 2026-11-04 (§7), suivi du PoC #272 recadré sur la V5.2"
suite: "prds/prd-BienDecider-cible-v5.2-2026-11-04/ (cahier des charges, spécification fonctionnelle, addendum technique)"
---

# Gap analysis : de la maquette V5.2 à la production

## 0. Objet et méthode

Ce document compare la cible fonctionnelle, la maquette V5.2, à ce que fait la production le 4 novembre 2026. Il alimente trois documents rangés dans [prds/prd-BienDecider-cible-v5.2-2026-11-04/](prds/prd-BienDecider-cible-v5.2-2026-11-04/) :

- [prd.md](prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md) : le cahier des charges (exigences testables) ;
- [spec-fonctionnelle.md](prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md) : les règles, états et écrans détaillés ;
- [addendum.md](prds/prd-BienDecider-cible-v5.2-2026-11-04/addendum.md) : le modèle de données cible et la migration.

Les PF ont tranché les décisions D1 à D13 le 4 novembre 2026 (§3) ; les quatre documents les appliquent. Le tri des US qui en découle a été appliqué le 4 novembre 2026 (§7).

**Méthode.**

1. Inventaire de la maquette : règles métier (`state.js`, couvert par 42 tests), écrans et dialogues (`views.js`, `app.js`), Paul (`paul.js`).
2. Tri de chaque élément : **cible** (à reproduire), **artifice de démo** (à ne pas reproduire, §2), **à trancher** (§3), **incohérence** de la maquette (§4).
3. Comparaison avec la production (code, schéma Prisma, pages de `main`). Chaque exigence cible reçoit un statut :

| Statut | Sens |
| --- | --- |
| ✅ Conforme | La production fait déjà ce que demande la cible, au vocabulaire près. |
| 🟡 À adapter | Une brique existe : il faut la modifier, la déplacer ou la compléter. |
| 🔴 À créer | Rien n'existe en production. |
| ⚪ Hors cible | La production a une fonction absente de la maquette : à garder, masquer ou retirer (décision). |

## 1. Synthèse

**110 exigences cibles** : 106 relevées dans la maquette, 4 ajoutées par les décisions des PF (B-11, F-13, H-10, T-05). 17 sont conformes, 57 à adapter, 36 à créer. S'y ajoutent 9 fonctions de la production absentes de la maquette (§5.20) et 13 décisions, tranchées le 4 novembre 2026 (§3).

| Domaine | ✅ | 🟡 | 🔴 |
| --- | --- | --- | --- |
| Page de découverte | 2 | 3 | 1 |
| Première connexion, avant le compte | 0 | 7 | 4 |
| Compte et session | 3 | 0 | 2 |
| Coquille et navigation | 1 | 3 | 0 |
| Stratégie | 0 | 4 | 2 |
| Missions | 0 | 8 | 5 |
| Atelier | 3 | 7 | 2 |
| Diffusion et canaux | 2 | 6 | 2 |
| Délégation | 0 | 0 | 2 |
| Marque | 0 | 0 | 4 |
| Contacts (anciens prospects) | 0 | 0 | 5 |
| Prescripteurs (agences) | 0 | 2 | 0 |
| Réalisations | 0 | 0 | 2 |
| Résultats, bilan et décision | 0 | 3 | 3 |
| Entreprise | 0 | 4 | 0 |
| Mon compte | 3 | 1 | 0 |
| Paul | 2 | 6 | 0 |
| Journal | 0 | 0 | 1 |
| Transverses | 1 | 3 | 1 |
| **Total** | **17** | **57** | **36** |

Ce qu'il faut retenir :

1. **La mission devient l'objet central.** La V5.2 organise tout autour d'une boucle « constat → mission → contenu → validation → diffusion → bilan → décision ». La production n'a pas d'objet Mission : elle a un plan d'actions confiées à des agents (`ActionPlanItem`). C'est l'écart structurant ; l'US #277 le cadre déjà.
2. **Le parcours d'entrée s'inverse.** La maquette fait découvrir l'entreprise, poser l'ambition et lire un premier diagnostic **avant** la création du compte. La production crée le compte d'abord. Il faut un état anonyme temporaire et un plafond de coût pour l'analyse faite avant inscription. Une trace des visites, sans donnée directement identifiante, est gardée pour connaître les visiteurs et améliorer le produit (D2).
3. **Paul est le seul interlocuteur visible.** La production et la charte présentent une équipe de personnages (Martine, Camille, Jean-Claude). La V5.2 les efface (D3). Le moteur de Paul en production (IA, état réel, cartes de confirmation) est plus avancé que celui de la maquette (règles et mots-clés) : on garde le moteur, on adopte le contrat d'interface.
4. **L'atelier existe à moitié.** Versions, révisions, validation séparée de la diffusion et résultats incertains sont en production. Manquent la marque (couleurs, ton, logo), le visuel composé, les droits photo, la programmation et plusieurs diffusions successives d'un même contenu.
5. **Les résultats deviennent un bilan par mission.** La production fait une synthèse hebdomadaire et un entonnoir de prospects. La cible demande un bilan déclaratif rattaché à une mission, puis une décision : poursuivre, adapter ou arrêter.
6. **Tous les canaux restent.** La V5.2 ne montre que Facebook (publication), Gmail (envoi) et le site en lecture. Les PF gardent aussi le site vitrine publié, LinkedIn, Instagram et la fiche Google (D4). Les connecteurs de tous ces canaux sont un prérequis de l'ouverture ; si l'on ouvre avant, les canaux dont le connecteur n'est pas développé sont désactivés.
7. **Le catalogue de missions est ouvert.** Il ne se limite pas aux trois modèles de la maquette : chaque type d'action que la production sait exécuter devient un modèle de mission, et une demande sans modèle devient une mission « Sur mesure » (D9).
8. **Quatre sujets portent un risque** : la délégation à trois niveaux, les crédits (D1), les contacts de personnes physiques, soumis au RGPD (D5, US #69), et les accès des fournisseurs (Meta, LinkedIn, Google), dont dépend désormais l'ouverture (D4).

## 2. Artifices de démo : ce qu'on ne reprend pas

Ces éléments servent la démonstration ou le test utilisateur de la maquette. Ils ne sont pas des exigences. La colonne de droite dit ce qui les remplace en production.

| # | Élément de la maquette | Où | Remplacé en production par |
| --- | --- | --- | --- |
| X-01 | Mentions « Maquette V5.2 », « Données d'exemple », « simulation », « démo », « Aucun envoi réel », « Vos choix restent dans ce navigateur », « Échange de démonstration », badges « Connecté · démo » | partout | Rien. Données réelles ou état vide honnête (définition de fini de #272). |
| X-02 | Section « Ce que vous jugez, ce qui est simulé » de la page de découverte | `landing()` | Rien. Les liens existants vers « Ce que fait chaque canal » et la confidentialité restent. |
| X-03 | Enregistrement dans le navigateur (`localStorage`), schéma et migration de l'état local | `state.js`, `app.js` | Base de données, droits, contrôles serveur. |
| X-04 | « Explorer l'espace de démonstration » (compte « Alex » prérempli, deux missions actives) | onboarding, action `demo` | Rien. |
| X-05 | « Recommencer la première connexion », « Recommencer la démonstration », effacement des données locales | Mon compte, action `reset` | Suppression du compte existante (`delete-account-section`). |
| X-06 | Session de test : identifiant (« T-014 »), badge « Session » dans la barre, export JSON du journal (temps par vue, dialogues abandonnés) | Mon compte, `exportSession()` | Mesure d'activation côté serveur (#296) ; export des données du dirigeant (#70), soumis à consentement. |
| X-07 | Questions d'avis contextuelles après chaque étape (`FEEDBACK_QUESTIONS`) | désactivées en V5.2 | Rien (voir D7 pour l'avis du menu). |
| X-08 | Entreprise, ville et données d'exemple : Dupont Rénovation, Aix-en-Provence, 6 agences et 27 contacts en `.example`, 4 réalisations, 5 concurrents, axes de positionnement, chiffres « 5 acteurs, 3 sources », « Relevé du 28 oct. 2026 », photo `chantier.jpg` | `state.js`, `views.js` | Résultats réels de l'analyse, avec source et date, ou état vide. |
| X-09 | Lecture de l'entreprise simulée (barre en 4 temps de 260 ms) | `discover` | Progression réelle de l'analyse (carte d'exécution existante). |
| X-10 | Paul par règles et mots-clés (`intents`), réponses scénarisées, variantes de texte écrites d'avance | `paul.js` | Paul IA de la production. Seul le contrat d'interface est repris (§5.17). |
| X-11 | Connexion de canal simulée (une seule option, une case à cocher) | `connectionDialog` | OAuth réel (Meta, Google) avec choix de la Page ou du compte. |
| X-12 | Import CSV limité aux adresses `.example` ; plafond « 200 contacts dans cette maquette » ; avertissement « le DPO devrait d'abord valider » | `parseContactsCsv`, `importDialog` | Import de vraies données, encadré par #69 (base légale, information, durée de conservation). |
| X-13 | Connexion par e-mail seul ; mot de passe « contrôlé, jamais enregistré » | `loginDialog`, `signup` | Authentification réelle : e-mail et mot de passe, récupération, vérification de l'e-mail. |
| X-14 | Recharge de crédits sans paiement (+10, +25, +50) ; « 20 crédits fictifs » | Mon compte | Voir D1. |
| X-15 | Plafonds « de la maquette » : 10 missions créées, 10 idées | `transition` | Plafonds de production à fixer (spécification fonctionnelle §12). |
| X-16 | Date du relevé, notes « photo actuelle illustrative », « Image illustrative · droits à confirmer pour un usage réel », « Adresses .example » | atelier, entreprise | Provenance réelle de chaque élément. |
| X-17 | Pied de page « Maquette interactive · Données et envois simulés » | coquille | Pied de page de la production (pages légales). |
| X-18 | Encadré « Dans le PoC, chaque constat réel affichera sa source, sa date et son niveau de confiance » | étape 2 | L'exigence elle-même (FR-6 du cahier des charges), sans l'encadré. |

## 3. Décisions

Points de la maquette qui n'étaient ni clairement des exigences, ni clairement de la démo. Les PF les ont tranchés le 4 novembre 2026 : neuf options validées telles quelles, deux validées et complétées (D2, D7), deux modifiées (D4, D9). Les documents appliquent ces décisions et les signalent par `[DÉCISION Dn]`. Seules les lectures ou valeurs qui demandent encore une confirmation restent marquées `[ASSUMPTION]`.

| # | Question | Option proposée | Raison | Décision des PF |
| --- | --- | --- | --- | --- |
| D1 | Les crédits sont-ils dans le PoC ? La V5.2 les affiche partout (solde, coût de lancement, historique), alors que #272 fixe un PoC gratuit, sans paiement. | Garder les crédits comme **unité de consommation visible**, offerts à l'inscription, sans recharge payante pendant le PoC. Les plafonds techniques (`dailySpendLimitUsd`, etc.) restent la protection réelle des coûts. | Le dirigeant comprend « 3 crédits » mieux qu'un quota d'exécutions ; le paiement reste après le PoC (#55, #57, #59). | **Validée.** Les crédits restent l'unité de consommation visible. |
| D2 | Que lit-on avant la création du compte, et que garde-t-on si la personne s'en va ? | Une analyse réelle mais bornée (site, fiche Google, Page Facebook publique), plafonnée par adresse IP et par jour ; brouillon anonyme conservé 24 heures puis effacé ; rattaché au compte à l'inscription. | L'inversion du parcours expose le coût de l'IA à des visiteurs anonymes (#274). | **Validée, avec un ajout** : les visites pourront être exploitées après coup pour connaître les visiteurs et améliorer le produit. Appliqué ainsi : le brouillon est toujours effacé après 24 heures, mais une trace de la visite sans donnée directement identifiante est gardée (FR-60). Garder davantage, comme le nom de l'entreprise ou son site, attend l'avis RGPD (#69). |
| D3 | Les personnages Martine, Camille et Jean-Claude disparaissent-ils de l'interface ? La maquette les efface mais en garde des traces (§4). | Oui : Paul seul visible partout (accueil public, productions, journal, page Équipe retirée). En interne, les agents restent séparés. La charte §3 est réécrite (#276). | Cohérence avec la V5.2 et un seul interlocuteur pour le dirigeant. | **Validée.** |
| D4 | Que deviennent le site vitrine publié, LinkedIn, Instagram et la fiche Google, absents de la V5.2 ? | Les **sortir du parcours** (masqués, code conservé), à réintroduire plus tard comme modèles d'action. Le site reste une **source lue** par l'analyse. | La V5.2 limite volontairement les canaux ; les canaux bloqués par les fournisseurs (#11, #13, #149, #300) n'empêchent plus le PoC. | **Modifiée : tous les canaux sont conservés.** Le site vitrine publié, LinkedIn, Instagram et la fiche Google restent dans le parcours, comme canaux des missions (FR-59). Précision des PF : les connecteurs sont un prérequis de l'ouverture ; si l'ouverture est décidée avant, les canaux dont le connecteur n'est pas développé sont désactivés. |
| D5 | La réactivation d'anciens prospects (personnes physiques, import de fichier) est-elle au PoC ? | Oui, mais **après** la validation de #69 (base légale, information des personnes, durée de conservation) ; sinon le modèle « prospects » reste masqué au lancement. | Seul modèle qui traite des données personnelles de tiers. | **Validée.** |
| D6 | L'entonnoir de prospection actuel (organisations, « prochain prospect », prise de contact automatique) est-il conservé ? | Il est **absorbé** par la mission « agences » : la recherche de prescripteurs de Jean-Claude alimente la liste d'agences. L'entonnoir et la prise de contact automatique sont retirés de l'interface. | La V5.2 ne montre ni entonnoir ni prise de contact automatique ; « Aucune relance automatique ». | **Validée.** |
| D7 | « Laisser un avis » (étoiles et commentaire, dans le menu) est-il un artifice de test ou une fonction ? | Fonction du PoC, fusionnée avec #275 « Dire ce qui ne va pas depuis n'importe quelle page », enregistrée côté serveur et visible dans l'administration. | Le PoC a besoin d'un canal de retour (#100). | **Validée et élargie** : fonction du PoC et au-delà. Capitaliser sur les retours des utilisateurs est un atout du produit (FR-54). |
| D8 | Comment s'exprime l'ambition : croissance en % (maquette) ou chiffre d'affaires visé en euros (production) ? | **Texte libre conservé tel quel** + interprétation (gain, horizon, budget média, recrutement) comme dans la maquette ; le chiffrage en euros de la production (CA actuel, valeur d'un client) reste facultatif dans Entreprise et nourrit le calcul déterministe. | La maquette évite les formulaires à l'entrée ; la production calcule déjà juste à partir des euros (épopée 2). | **Validée.** |
| D9 | Le catalogue se limite-t-il aux trois modèles d'action (agences, réalisation, prospects) ? Que deviennent les autres productions (réponse aux avis, mise à jour de fiche Google, contenu de site) ? | Trois modèles au lancement. Une demande hors catalogue devient une **idée** notée (et une `UncoveredRequest`). Les autres types de production sont masqués avec leurs canaux (D4). | Règle de la maquette : « une idée d'un autre type reste une note ». | **Modifiée : catalogue ouvert.** Tous les modèles d'action possibles sont autorisés, pas seulement les trois de la maquette (FR-61, spécification §6.1). Confirmé par les PF : une demande qu'aucun modèle ne couvre devient une mission « Sur mesure ». |
| D10 | L'étape « Premiers constats » doit-elle montrer le profil compris (activité, zone d'intervention, clients, offres) pour confirmation ? La V5.2 ne le montre pas et « Non, corriger » ramène à un écran qui ne permet pas de les corriger. | Oui : afficher le profil compris sous les constats, modifiable sur place ; « Oui, c'est bien moi » confirme les deux. | Sinon ces champs sont enregistrés sans avoir été vus (§4). | **Validée.** |
| D11 | Le rejet motivé d'une version (production : raison du rejet, retours retenus par Paul) est-il conservé alors que la maquette ne l'a pas ? | Oui, en action secondaire de l'atelier (« Je ne veux pas de cette version »), la raison alimentant Paul. | La maquette ne prévoit que retoucher ou écarter la mission ; la production apprend des refus (#22). | **Validée.** |
| D12 | Paul : une conversation par contexte (maquette) ou un fil unique qui reçoit le contexte de la page (charte §3, production) ? | **Une conversation par contexte**, comme la maquette, avec le sélecteur de conversations ; un seul panneau, un seul bouton. | La V5.2 en fait un principe (« Paul à propos de… ») ; la charte sera mise à jour (#276). | **Validée.** |
| D13 | Le bilan hebdomadaire envoyé par e-mail (cron `weekly-review`) est-il conservé ? | Garder le cron, mais remplacer son contenu par « ce qui attend votre décision » et les bilans à renseigner. | La V5.2 n'a pas de synthèse hebdomadaire ; elle demande un bilan après diffusion. | **Validée.** |

Hypothèse déjà actée par #272 et reprise telle quelle : le niveau « Déléguer dans un cadre précis » ne couvre que les analyses et les brouillons ; toute diffusion reste confirmée.

## 4. Incohérences de la maquette à ne pas reproduire

| # | Constat dans la maquette | Traitement dans la cible |
| --- | --- | --- |
| I-01 | Noms d'agents résiduels alors que Paul est seul visible : « Paul → Jean-Claude », « Le travail de Martine », « Paul confie la préparation à Jean-Claude », « Version préparée par Jean-Claude avec Paul » (historique des crédits), `owner` des modèles. | Supprimés partout (D3). |
| I-02 | En « Préparation seule », la diffusion est refusée mais rien ne permet de déclarer une diffusion faite soi-même : le bilan, qui exige une diffusion, devient impossible. | Ajout de la diffusion déclarée (FR-37, #295). |
| I-03 | Le bouton de lancement s'affiche sur une mission close ou écartée (refusé ensuite par la logique). | Bouton absent dans ces états. |
| I-04 | Réponses de Paul approximatives : la remise au plan annonce « à décider » pour une mission reprise en pause ; le périmètre d'une mission « agences » créée peut être appelé « contacts ». | Sans objet avec Paul IA, mais les tests de Paul couvrent ces deux cas. |
| I-05 | Le README décrit 7 écrans et une inscription « par e-mail seul » ; la V5.2 a 5 étapes et un mot de passe. | La spécification fonctionnelle fait foi. |
| I-06 | L'étape « Non, corriger mes informations » ramène à un écran sans activité, zone, clients ni offres, alors que ces champs sont préremplis. | Voir D10. |
| I-07 | Un changement de profil remplace le nom dans le texte des contenus par recherche et remplacement de chaîne. | Le contenu est marqué « à relire » et une nouvelle version est préparée ou demandée ; pas de remplacement aveugle. |
| I-08 | « Ce que Paul apprend » déduit « mérite un second test » dès qu'il y a un rendez-vous. | La lecture du bilan compare au résultat recherché de la mission (spécification §7). |
| I-09 | « Prochain point : 7 jours après la première diffusion » est un texte fixe. | Date calculée à partir de la règle d'arrêt de la mission. |
| I-10 | La connexion n'exige pas de mot de passe alors que l'inscription en demande un. | E-mail et mot de passe (X-13). |

## 5. Écarts par domaine

Les colonnes « Production » citent l'existant. Les numéros d'US renvoient aux Issues ouvertes concernées.

### 5.1 Page de découverte (`#/decouvrir`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| A-01 | Bouton principal « C'est parti » qui lance la première connexion sans compte ; accès secondaire « Retrouver mon compte ». | `src/app/page.tsx` : même promesse, mais « Créer mon compte » mène à l'inscription. | 🟡 | #279 |
| A-02 | Paul présenté comme copilote unique (« il comprend, recommande, prépare et apprend avec vous »). | L'équipe de personnages est présentée. | 🟡 | #276 |
| A-03 | Exemple concret : entreprise de rénovation, +20 % de CA en 12 mois, plan en trois missions, extrait de post. | Exemple d'un plombier, plan par agents. | 🟡 | #88 |
| A-04 | « Vous gardez la main » : vous fixez l'objectif, vous relisez chaque contenu, rien ne part sans vous. | Section équivalente. | ✅ | |
| A-05 | « Six étapes, une seule boucle » (présenter, choisir les missions, préparer, valider et confirmer, noter les résultats, décider). | Absent. | 🔴 | |
| A-06 | Session ouverte : « Retourner à mon espace ». | « Accéder à mon espace ». | ✅ | |

### 5.2 Première connexion, avant le compte (`#/bienvenue`, `#/diagnostic`, `#/inscription`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| B-01 | Ordre : découverte, premiers constats, ambition, premières missions, compte. Aucun compte ni mission avant la dernière étape. | Compte d'abord (`/signup`), puis `/onboarding` (une phrase interprétée en profil, puis audit). | 🔴 | #279 |
| B-02 | Découverte : prénom (obligatoire), entreprise, **localisation** (ville ou commune, distincte de la zone d'intervention), site facultatif, « Je n'ai pas de site ». | `Company` sans prénom distinct (`ownerName` facultatif) ni localisation (`servingArea` seulement). | 🟡 | #280 |
| B-03 | Lecture de l'entreprise en quatre rubriques (site et offres, informations publiques, zone et clients, identité visuelle) avec progression ; « Non disponible » sans site. | Audit de Martine après inscription (site, fiche Google, Page Facebook, avis), carte d'exécution. Pas d'identité visuelle. | 🟡 | #280, #252 |
| B-04 | Premiers constats typés (Observé, Piste à qualifier, À confirmer), avec fait et conséquence ; « Oui, c'est bien moi » ou « Non, corriger mes informations ». | `AuditFinding` (catégorie, ce qui va, à améliorer, source) sans niveau de certitude ; pas d'étape de confirmation. | 🟡 | #292, #168 |
| B-05 | Ambition en texte libre, reformulée par Paul (gain, horizon, budget média, recrutement), questions pour préciser, « C'est bien ça » ; le texte est conservé tel quel ; le modifier annule la confirmation. | Phrase interprétée (`/api/onboarding/interpret`) et objectif chiffré en euros confirmé par carte (épopée 2). | 🟡 | #282, #20 |
| B-06 | Diagnostic de synthèse : « Un cap. Trois premières pistes. », ce que nous retenons, trois missions (résultat recherché, périmètre proposé, priorité), « Ça m'intéresse ». | Diagnostic après inscription ; « Préparer le plan à partir du diagnostic » (3 à 5 actions). | 🟡 | #284 |
| B-07 | Compte : e-mail, mot de passe de 8 caractères au moins et confirmation ; rappel de l'entreprise et de l'ambition ; arrivée sur Stratégie, missions « À décider ». | `/signup` : e-mail et mot de passe de 6 caractères au moins, sans confirmation. | 🟡 | #64 |
| B-08 | Garde-fous : un parcours incomplet ramène à son étape (rechargement, URL saisie) ; pas de saut d'étape ; revenir avant l'étape 4 annule le diagnostic, les saisies restent. | Onboarding sur une seule page. | 🔴 | #279 |
| B-09 | « C'est parti » alors qu'une session est ouverte : proposer d'aller à son espace. | Lien « Accéder à mon espace ». | 🟡 | |
| B-10 | Colonne d'étapes (5), « n sur 5 », bouton Retour, lien « Revoir le concept ». | Absent. | 🔴 | #279 |
| B-11 | Trace de chaque visite du parcours d'entrée, sans donnée directement identifiante (étape atteinte, activité, département, site présent, sources lues, ambition interprétée, modèles proposés, compte créé ou non), pour connaître les visiteurs et améliorer le produit (D2). | `UsageEvent` trace le coût d'une exécution, pas le parcours. | 🔴 | #296 |

### 5.3 Compte et session

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| C-01 | Connexion par e-mail et mot de passe, arrivée sur Stratégie. | `/login`. | ✅ | |
| C-02 | Déconnexion depuis Mon compte, retour à la découverte. | Présent. | ✅ | |
| C-03 | Espace inaccessible sans session. | Redirection vers la connexion. | ✅ | |
| C-04 | Récupération du mot de passe. | Absent. | 🔴 | #24 |
| C-05 | Vérification de l'adresse e-mail. | Absent. | 🔴 | #64, #47 |

### 5.4 Coquille et navigation

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| D-01 | Navigation : Stratégie, Missions (compteur des missions en cours), Atelier, Résultats. Entreprise par le bloc de l'entreprise en tête ; Mon compte en bas avec le solde de crédits ; « Laisser un avis ». | Quatre temps Objectif, Plan, Décisions, Résultats et réglages (`src/lib/journey-nav.ts`). | 🟡 | #278 |
| D-02 | Bloc « Votre cap » dans la navigation (ambition courte, horizon, recrutement). | Objectif en tête de l'accueil (`objective-hero`). | 🟡 | #278 |
| D-03 | Barre du haut : fil d'Ariane « Votre espace › Page », date du jour, bouton « Discuter avec Paul » qui ouvre le contexte de la page. | Fil d'Ariane et bouton Paul (`workspace-breadcrumb`, `open-paul-button`). | ✅ | |
| D-04 | Mobile : menu latéral repliable, page derrière inerte. | Barre d'onglets en bas (`journey-tabbar`). | 🟡 | #278 |

### 5.5 Stratégie (`#/paul`, page d'accueil de l'espace)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| E-01 | « Bonjour {prénom}. » ; actions « Challenger le plan » et « Créer une mission ». | `/dashboard`. | 🟡 | #283 |
| E-02 | « Votre prochaine décision » : un seul prochain pas calculé, avec pourquoi maintenant, preuve utilisée, point à vérifier, résultat recherché, bouton d'action, « Rien ne sera lancé ou diffusé sans votre accord ». | « Vos prochaines décisions » : liste de productions à décider. | 🟡 | #283 |
| E-03 | « Ce que Paul apprend » après un bilan : observé, ce que cela suggère, ce que cela ne prouve pas, impact sur le plan. | Absent. | 🔴 | #53 |
| E-04 | « À valider par vous » : contenus prêts ou validés des missions en cours, programmations, marque à confirmer, état des connexions. « Une validation n'est jamais une autorisation de diffusion. » | File des productions (`?view=validation`). | 🟡 | #92 |
| E-05 | « Vos missions regroupées » : chaque ligne relie un constat (origine, certitude, note, « Voir la source »), la déduction de Paul et la mission (statut, priorité, résultat, périmètre, actions). | Diagnostic et plan sur deux pages ; « Ajouter au plan » depuis un constat. | 🟡 | #284, #168 |
| E-06 | Idées à cadrer dans la même liste (« Cadrer avec Paul », « Retirer l'idée »), 10 au plus. | `UncoveredRequest` visible seulement dans l'administration. | 🔴 | |

### 5.6 Missions (`#/missions`, `#/missions/:id`, `#/missions/nouvelle`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| F-01 | Objet Mission : modèle d'action, titre, constat et preuve, niveau de certitude, résultat recherché, périmètre, règle d'arrêt, risque, délai, statut. | `ActionPlanItem` (agent, titre, justification, résultat attendu, échéance, thème, priorité, statut). | 🔴 | #277 |
| F-02 | Liste filtrée par statut avec compteurs : Toutes, En cours, À décider, En pause, Arrêtées, Écartées ; priorité de Paul en tête ; état vide. | Plan à deux onglets « À faire » et « En cours et menées ». | 🟡 | #285 |
| F-03 | Carte de mission : statut, priorité, preuve, périmètre, étape, suivi en six temps (Cadrer, Préparer, Valider, Diffuser, Faire le bilan, Décider). | `journey-progress` existe pour un autre usage. | 🟡 | #285 |
| F-04 | Détail : pourquoi cette mission, ce que vous choisissez (périmètre), cinq actions avec leur état, « Notre contrat de mission » (résultat, coût, dépenses externes, règle d'arrêt, délégation, risque). | Absent. | 🔴 | #286 |
| F-05 | Lancement par un dialogue de cadre (résultat, périmètre, coût et solde, 0 € de dépense externe, règle d'arrêt, confirmation des contacts) ; 3 crédits débités à la première activation. | Lancement d'une action (`/api/action-plan/[id]/launch`) sans cadre ; quotas techniques. | 🟡 | #286 |
| F-06 | Pause (annule les programmations) et reprise sans frais. | Absent. | 🔴 | #286 |
| F-07 | Écarter (refusé si en cours, statut précédent mémorisé) et remettre au plan. | Écarter une action avec raison (`feedback`), sans remise au plan. | 🟡 | #286 |
| F-08 | Arrêter par la décision de suite ; une mission close ne se relance pas. | Statut `termine`. | 🟡 | #286 |
| F-09 | Modifier le résultat recherché (5 à 120 caractères), revenir à l'objectif d'origine ; refusé si la mission est arrêtée. | Absent. | 🔴 | |
| F-10 | Périmètre par modèle (1 ou 2 agences, 1 à 8 contacts recontactables, 1 réalisation), verrouillé si la mission est écartée ou arrêtée, si un envoi est programmé ou si la version a été diffusée ; le modifier sur une mission active crée une version et retire la validation. | Absent. | 🔴 | #286 |
| F-11 | Créer une mission (constat, titre, modèle, résultat recherché ; 0 crédit), y compris depuis une idée. | Paul propose une action au plan (`propose_plan_item`). | 🟡 | #284 |
| F-12 | Priorité de Paul, modifiable par une proposition de Paul confirmée. | `priority` numérique sur les actions. | 🟡 | #288 |
| F-13 | Catalogue de modèles ouvert (D9) : les trois modèles de la maquette, un modèle par type d'action que la production sait exécuter (publication sur les réseaux, fiche Google, réponse aux avis, page du site vitrine) et « Sur mesure ». | Types de production existants (`social_post`, `gbp_update`, `review_reply`, `site_web_content`, `prospecting_email`, `gmail_email`), rattachés à des agents, sans modèle de mission. | 🟡 | #277 |

### 5.7 Atelier (`#/atelier/:contenu`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| G-01 | Un contenu par mission ; sélecteur de contenu ; badges de version et d'état (Brouillon, Validée, Programmée, Diffusée, Archive). | Studio `/studio/[id]` par production ; file des productions. | 🟡 | #289 |
| G-02 | Aperçu fidèle : publication Facebook (en-tête, texte, visuel) ou visuel seul ; e-mail (De, À avec les destinataires et « envois séparés », Objet, corps). | `production-preview`. | 🟡 | #289 |
| G-03 | Visuel composé : photo, logo, accroche ajustée à la place disponible, signature, couleurs de la marque, deux compositions. | Absent. | 🔴 | #259 |
| G-04 | Retouche directe (accroche ou objet, texte, composition) : nouvelle version, validation retirée ; retouches non enregistrées conservées, signalées, et bloquant validation et diffusion. | « Modifier » crée une version (`ProposalRevision`, source `owner`) ; pas de protection du brouillon. | 🟡 | #298 |
| G-05 | « Retravailler avec Paul » : variante proposée, créée seulement sur acceptation, 1 crédit. | Révision sur consigne par Paul ou le Studio. | 🟡 | |
| G-06 | Historique des versions : auteur, note, état ; consultation d'une ancienne version en lecture seule ; revenir à une ancienne version crée une nouvelle version. | Versions et « Reprendre cette version ». | ✅ | |
| G-07 | Validation par un dialogue : « J'ai relu le contenu » obligatoire ; pour un visuel, marque confirmée et droits confirmés ; pour un e-mail, destinataires listés ; « Valider sans diffuser ». | Approbation de version (`approvedVersion`) sans case de droits ni lien de mission. | 🟡 | #179, #291 |
| G-08 | Version diffusée en lecture seule ; « Créer V(n+1) à partir de Vn » pour une nouvelle série. | Production `executee` finale ; pas de nouvelle série. | 🟡 | |
| G-09 | Copier le texte. | Copie pour les canaux où le dirigeant publie. | ✅ | |
| G-10 | Importer une photo dans un visuel (JPG, PNG ou WebP, 1 Mo). | Photos du site seulement (`SitePhoto`, Vercel Blob). | 🟡 | #291 |
| G-11 | Profil modifié : chaque contenu passe « à relire », nouvelle version, programmations annulées, validation bloquée jusqu'à relecture. | Absent. | 🔴 | #169 |
| G-12 | La confirmation porte sur la version affichée (refus si elle a changé entre-temps). | Contrôle de version à l'approbation et à l'exécution. | ✅ | |

### 5.8 Diffusion et canaux

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| H-01 | Canaux : Facebook (publication sur la Page), Gmail (envoi individuel), site (lecture seule, pour l'analyse). | Publication Facebook et envoi Gmail réels. | ✅ | #9, #5 |
| H-02 | Confirmation : version, destination, moment (maintenant ou programmer), « Je confirme cette version, cette destination et ce moment ». | Confirmation séparée de l'approbation, sans choix du moment. | 🟡 | |
| H-03 | Programmation : date future, fuseau, annulation (la version reste validée), liste des programmations. | Absent. | 🔴 | #261 |
| H-04 | Canal non connecté au moment de diffuser : connexion, puis retour direct à la confirmation. | OAuth Gmail et Meta existants ; retour à la production à vérifier. | 🟡 | #293 |
| H-05 | Déconnexion confirmée, avec la liste des programmations annulées ; contenus et validations conservés. | Déconnexion Facebook, Gmail, LinkedIn. | 🟡 | #10 |
| H-06 | Contrôles serveur avant diffusion : délégation autre que « préparation seule », mission en cours, canal connecté, version courante validée, ni programmée ni déjà diffusée, au moins un destinataire. | Version, approbation et confirmation contrôlées ; mission et délégation absentes. | 🟡 | |
| H-07 | Chaque diffusion est enregistrée (date, canal, version, nombre de destinataires) ; un contenu peut être diffusé plusieurs fois, une fois par version. | `ExecutionLog` unique par production. | 🟡 | |
| H-08 | Échec et résultat incertain distingués (la maquette ne les modélise pas). | États `envoi_incertain`, `publication_incertaine`, `ExecutionLog.result`. | ✅ | |
| H-09 | Diffusion faite soi-même, déclarée (mode préparation). | « J'ai déjà pris contact » côté prospection seulement. | 🔴 | #295 |
| H-10 | Canaux conservés (D4) : site vitrine (mise en ligne), Instagram, LinkedIn (profil et Page), fiche Google (informations, posts, réponses aux avis). BienDecider diffuse sur chacun après confirmation ; connecteurs prérequis de l'ouverture, canal non développé désactivé en cas d'ouverture anticipée. | Site vitrine publié ; LinkedIn connecté (profil) ; publication Instagram, LinkedIn et fiche Google indisponible (accès des fournisseurs en attente) ; source unique `channel-capabilities.ts`. | 🟡 | #13, #14, #15, #45, #148, #149, #151, #152, #172, #300 |

### 5.9 Délégation

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| I-01 | Trois niveaux : « Préparer seulement », « Valider avant chaque action » (conseillé, par défaut), « Déléguer dans un cadre précis » ; réglé dans Entreprise › Canaux & délégation ; journalisé ; passer en préparation seule annule les programmations. | Aucun niveau côté dirigeant ; risque par type d'action dans l'administration (`DelegationRiskSetting`) ; `autoOutreachEnabled`. | 🔴 | #36, #35 |
| I-02 | Niveau rappelé dans le contrat de mission, le cadre de diffusion de l'atelier et la liste des missions. | Absent. | 🔴 | #36 |

### 5.10 Marque

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| J-01 | Kit : couleur principale, accent, ton (trois choix), « Je confirme ces éléments » ; origine de chaque élément affichée. | Absent. | 🔴 | #290, #259 |
| J-02 | Logo PNG, JPEG ou WebP, 500 Ko au plus : ajouter, remplacer, retirer. | Absent. | 🔴 | #290 |
| J-03 | Changer la marque ou le logo crée une version de chaque visuel et retire sa validation ; refusé si un visuel est programmé. | Absent. | 🔴 | #290 |
| J-04 | Palette proposée à partir du site, à confirmer ; sans site, identité proposée et signalée comme telle. | Absent. | 🔴 | #290 |

### 5.11 Contacts : anciens prospects

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| K-01 | Contacts (personnes) : nom, e-mail, ancienneté du dernier échange, accord de recontact (oui, non, inconnu). | `Lead` = organisations uniquement (« jamais un particulier »). | 🔴 | #287, #69 |
| K-02 | Contrôle : opposition, accord inconnu ou dernier échange de plus de 24 mois rendent un contact non recontactable ; « Choisir les 8 plus récents ». | Absent. | 🔴 | #287 |
| K-03 | Import d'un fichier CSV (colonnes fixes, `;` ou `,`), aperçu de contrôle (lus, recontactables, oppositions, accords inconnus, trop anciens, lignes ignorées) ; l'import remplace la liste. | Absent. | 🔴 | #287 |
| K-04 | Confirmation de la pertinence, du droit de recontact et de la possibilité de s'opposer, avant lancement et validation ; toute modification de la liste la retire. | Absent. | 🔴 | #287 |
| K-05 | Le message de réactivation offre toujours de ne plus être recontacté. | Absent. | 🔴 | #287 |

### 5.12 Prescripteurs : agences

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| L-01 | Liste d'agences de la zone, avec secteur et e-mail professionnel, issue d'une source citée ; choisir 1 ou 2. | Jean-Claude identifie des organisations avec source et contact public (`Lead`, agent de démarchage). | 🟡 | #284 |
| L-02 | Message individuel, sans relance automatique ; règle d'arrêt (refus clair ou 30 jours sans réponse). | E-mail de prospection sans relance ; pas de règle d'arrêt. | 🟡 | |

### 5.13 Réalisations

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| M-01 | Réalisations visibles de l'entreprise ; en choisir une à mettre en avant ; droits photo à confirmer. | Les réalisations ne sont pas un objet. | 🔴 | |
| M-02 | Règle d'arrêt : bilan à J+7 après publication, pas de deuxième réalisation sans ce bilan. | Absent. | 🔴 | |

### 5.14 Résultats, bilan et décision (`#/resultats`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| N-01 | Indicateurs : diffusions et programmations, demandes qualifiées (déclarées), CA signé (déclaré) ; « — » tant que rien n'est renseigné. | `/rapport` : synthèse hebdomadaire, prospects par étape, site publié. | 🟡 | #294 |
| N-02 | Tableau par mission : diffusions, bilan déclaré, résultat recherché, suite (renseigner, décider, poursuivie, arrêtée). | Absent. | 🔴 | #294 |
| N-03 | Bilan : mission (parmi celles diffusées), demandes qualifiées et rendez-vous obligatoires (0 accepté), rendez-vous au plus égaux aux demandes, CA facultatif (vide n'est pas zéro), origine et contexte ; rattaché au nombre de diffusions. | Absent. | 🔴 | #294 |
| N-04 | Décider la suite : poursuivre (exige un bilan à jour), adapter avec Paul, arrêter (clôt, annule les programmations). | Absent. | 🔴 | #53, #52 |
| N-05 | « La diffusion et son suivi » : programmations et diffusions, avec lien vers la version diffusée. | Historique (`?view=historique`). | 🟡 | |
| N-06 | « Le point de Paul » sur les bilans ; « Un envoi n'est ni une lecture, ni une vente ». | Paul et synthèse hebdomadaire. | 🟡 | |

### 5.15 Entreprise (`#/entreprise/audit|marque|canaux`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| P-01 | « Diagnostic & positionnement » : résumé chiffré, date du relevé, positionnement proposé à challenger (observé, hypothèse, à éviter), axes de positionnement, concurrence locale (angle, ce qu'elle montre, ce qu'elle ne montre pas, fiabilité), ce qu'il faut retenir, ce qu'il manque. | `/diagnostic` : constats par catégorie, avis Google des concurrents, couverture des sources. Pas de positionnement. | 🟡 | #266, #292 |
| P-02 | Repères : ambition (« Modifier avec Paul »), localisation, zone, clients. | Page Entreprise (profil, objectifs). | 🟡 | |
| P-03 | « Corriger mon profil » avec ses effets sur les contenus (G-11). | Formulaire de profil sans effet sur les contenus. | 🟡 | #169 |
| P-04 | « Canaux & délégation » réunis : Facebook (Page), Gmail (compte d'envoi), site (lecture) et, avec D4, Instagram, LinkedIn, fiche Google et site vitrine (H-10) ; programmations liées à chaque canal. | `/connexions` et `/canaux` séparés de toute délégation. | 🟡 | #293 |

### 5.16 Mon compte (`#/compte`)

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| Q-01 | Crédits : solde, barème (lancement 3, version préparée avec Paul 1 ; retouches, validations et diffusions gratuites), historique des mouvements. | « Crédits & limites » : quotas techniques et budget consommé. | 🟡 | #56, #62, D1 |
| Q-02 | Identité : prénom, e-mail, entreprise, « Corriger mon profil ». | Présent en partie. | ✅ | |
| Q-03 | Vos données : où elles sont, comment les effacer. | Suppression du compte, page confidentialité. | ✅ | |
| Q-04 | Se déconnecter. | Présent. | ✅ | |

### 5.17 Paul

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| R-01 | Paul seul interlocuteur visible. | Personnages visibles (charte §3, `persona-avatar`, `/equipe`). | 🟡 | D3 |
| R-02 | Une conversation par contexte (stratégie, mission, contenu, résultats, ambition, positionnement, concurrence, sources, idée) ; titre « Paul à propos de… » ; sélecteur de conversations. | Fil unique ; contexte de page injecté (`src/lib/agents/page-context.ts`). | 🟡 | #288, D12 |
| R-03 | Propositions à confirmer (priorité, périmètre, pause, limite d'ambition, nouvelle version, idée, écarter, remettre au plan) ; « Garder le cap actuel » ; rien ne change avant acceptation. | Cartes de confirmation (objectif, profil, lancement, révision). | 🟡 | #288 |
| R-04 | Suggestions rapides propres à chaque contexte. | Demandes rapides dans le Studio. | 🟡 | |
| R-05 | Liens d'action dans les réponses (vers l'atelier, la mission, les résultats). | `src/lib/paul-references.ts`. | ✅ | |
| R-06 | Réponses fondées sur l'état réel (crédits, risques, budget, comparaison des pistes). | État de l'équipe partagé (épopées 1 à 4). | ✅ | |
| R-07 | Interprétation de l'ambition, avec bornes et questions (D8). | Interprétation par IA et carte d'objectif. | 🟡 | #282 |
| R-08 | Une idée notée avec Paul est visible du dirigeant et se cadre en mission de n'importe quel modèle, y compris « Sur mesure » (D9). | `UncoveredRequest`, visible de l'administration seulement. | 🟡 | |

### 5.18 Journal

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| S-01 | Journal des décisions (acteur : vous, Paul ou le système ; date) couvrant lancement, pause, écart, remise au plan, périmètre, objectif, version, validation, diffusion, programmation, annulation, bilan, décision, marque, logo, canal, délégation, profil, ambition, idée. Affiché dans Résultats, « Décisions & traçabilité ». | Historique des productions et exécutions ; pas de journal unifié. | 🔴 | #41 |

### 5.19 Transverses

| # | Cible | Production | Statut | US |
| --- | --- | --- | --- | --- |
| T-01 | Accessibilité : fenêtres de dialogue avec focus et Échap, lien d'évitement, cibles de 44 px, contraste de 4,5 au moins, annonces vocales des messages. | Exigences posées dans la définition de fini de #272 ; à vérifier écran par écran. | 🟡 | |
| T-02 | Affichage de 320 à 1440 px sans défilement horizontal. | Épopée 5.4 pour Paul sur téléphone ; reste à vérifier sur les nouveaux écrans. | 🟡 | #297 |
| T-03 | Chiffres honnêtes : « — » n'est pas zéro, déclaratif signalé, attribution non prouvée dite. | Principe acquis. | ✅ | |
| T-04 | Messages d'erreur en clair, qui disent quoi faire (liste dans la spécification §14). | Motifs d'échec typés pour les exécutions (épopée 1). | 🟡 | |
| T-05 | « Laisser un avis » depuis le menu (note, commentaire, page d'origine), fonction permanente du produit ; avis consultables et exportables dans l'administration (D7). | Absent. | 🔴 | #275, #100 |

### 5.20 Fonctions de la production absentes de la maquette

| # | Fonction | Où | Proposition |
| --- | --- | --- | --- |
| Z-01 | Administration : entreprises, quotas, risques par type d'action | `/admin` | Garder, hors parcours du dirigeant. |
| Z-02 | Site vitrine généré, publié et republié, photos du site | `/site/[slug]`, `src/lib/site/` | Garder (D4) : canal des missions « Page du site vitrine », réglé dans Entreprise › Canaux & délégation. |
| Z-03 | LinkedIn (profil), Instagram, fiche Google | `/connexions`, OAuth | Garder (D4) : canaux des missions ; connecteurs de publication à développer, prérequis de l'ouverture ; les démarches continuent. |
| Z-04 | Entonnoir de prospection d'organisations, « prochain prospect », prise de contact automatique | `/prospection`, `Lead`, `autoOutreachEnabled` | Absorbé par la mission agences (D6). |
| Z-05 | Personnages et page Équipe | `/equipe`, `persona-avatar` | Retirer de l'interface (D3). |
| Z-06 | Consigne durable (« Réorienter ») et retours retenus | Entreprise, `direction`, `retained-feedback` | Garder comme mémoire de Paul ; afficher dans Entreprise › Diagnostic & positionnement. |
| Z-07 | Commande vocale | `voice-controls` | Garder dans le panneau de Paul. |
| Z-08 | Synthèse hebdomadaire par e-mail | cron `weekly-review` | Adapter (D13). |
| Z-09 | Rejet motivé d'une version | `rejectionReason` | Garder en action secondaire (D11). |

## 6. Chemin critique proposé

| Vague | Contenu | Dépend de |
| --- | --- | --- |
| 0 | Validation des documents (décisions D1 à D13 prises le 4 novembre 2026) ; mise à jour de la charte (#276) ; relance des accès des fournisseurs pour Instagram, LinkedIn et la fiche Google (#13, #149, #300, D4) | — |
| 1 | Modèle Mission et migration (#277, addendum §2), avec le catalogue de modèles (D9) ; journal (#41) ; crédits (D1) ; délégation (#36) | 0 |
| 2 | Missions (liste, détail, cycle de vie, périmètre) ; Stratégie (prochain pas, missions regroupées) ; navigation (#278) ; « Laisser un avis » (#275, D7) | 1 |
| 3 | Atelier : rattachement aux missions, marque et logo, visuel composé, photo et droits, lecture seule après diffusion ; diffusion et programmation (#261) sur Facebook et Gmail ; diffusion déclarée (#295) | 2 |
| 4 | Bilan et décision de suite (#294) ; Résultats ; « Ce que Paul apprend » | 3 |
| 5 | Parcours d'entrée avant compte (#279 à #282, D2) et trace des visites (#296) ; vérification de l'e-mail et récupération du mot de passe (#64, #24) | 1, et 2 pour les premières missions |
| 6 | Contacts et réactivation (#287), après #69 ; modèles supplémentaires du catalogue (D9) et canaux conservés (D4) : site vitrine, Instagram, LinkedIn, fiche Google, chacun livré avec son connecteur de publication | 3 |
| 7 | Recette de bout en bout sur la V5.2 (#297) ; ouverture quand tous les connecteurs sont livrés, ou ouverture anticipée avec les canaux non développés désactivés | toutes |

La vague 5 peut avancer en parallèle des vagues 2 à 4 une fois le modèle Mission posé. Dans la vague 6, chaque modèle et chaque canal est une livraison indépendante.

## 7. Tri des US (appliqué le 4 novembre 2026)

Le suivi du PoC (#272) et les US marquées `maquette-v3` décrivaient la cible V3. La V5.2 renomme les pages (Avec Paul → Stratégie, Studio → Atelier), retire la limite de temps et de capacité de l'ambition, ajoute les crédits, la marque et le bilan par mission, et réduit les canaux ; les PF gardent pourtant tous les canaux (D4) et ouvrent le catalogue de missions (D9). Le tri a été appliqué sur GitHub le 4 novembre 2026, après validation des décisions. Chaque US touchée porte un commentaire « Tri du 2026-11-04 (cible V5.2, #272) » qui donne la raison.

**Repères.** Nouveau label `cible-v5.2` sur les 61 US alignées ; `maquette-v3` n'est plus porté par aucune US ouverte. Jalons : « PoC 1 - Prérequis d'ouverture », « PoC 2 - Parcours cible V5.2 » (renommé), « PoC 3 - Canaux réels », « Après le PoC ».

| Action | US |
| --- | --- |
| **Suivi réécrit** | #272 : objectif V5.2, décisions de cadrage, vagues 0 à 7 (§6), définition de fini et critères d'ouverture |
| **Créées** (PoC 2) | #310 découvrir BienDecider et commencer sans compte (FR-1) ; #311 trace anonyme des visites du parcours d'entrée (FR-60) ; #312 noter une idée avec Paul et la cadrer en mission (FR-17) ; #313 modifier le résultat recherché d'une mission (FR-24) ; #314 catalogue ouvert de modèles et mission « Sur mesure » (FR-25, FR-61) ; #315 diffusion confirmée, contrôlée côté serveur et enregistrée (FR-34, FR-38) ; #316 mission Partenariats, écrire à une ou deux agences (FR-45) ; #317 mission Réalisation, mettre en avant une réalisation (FR-46) |
| **Réécrites** (même besoin, contenu V5.2) | #276 charte ; #277 modèle Mission ; #278 navigation en quatre pages ; #279 première connexion en cinq étapes, compte en dernier ; #282 ambition dite avec ses mots ; #283 Stratégie ; #289 Atelier ; #293 canaux et délégation ; #294 bilan de mission et Résultats ; #297 recette de bout en bout ; #301 canaux réellement disponibles (FR-59) ; #52 décider la suite d'une mission ; #53 ce que Paul apprend du bilan ; #56 solde de crédits et coût de chaque action (D1) |
| **Gardées et précisées** (section « Cible V5.2 » ajoutée au corps) | #280, #281, #284, #285, #286, #287, #288, #290, #291, #292, #295, #296, #261, #36, #41, #24, #64, #168, #169, #179, #22 (D11), #275 (D7), #273 (D4), #54 (D13), #89 (D3), #10 |
| **Rattachées aux missions** (canaux conservés, D4) | #45, #48, #172 (site vitrine) ; #300 (Instagram) ; #148, #149, #150, #151, #152 (LinkedIn) ; #13, #14, #15 (fiche Google) |
| **Changées de jalon ou de priorité** | #52, #53, #56 : PoC 2, p2 → p1 ; #150, #151, #152 : PoC 3, p2 → p1 ; #46 : Après le PoC, p1 → p2 (D6) ; #299 : repoussée après le PoC (une mission vise un seul canal), sans `maquette-v3` |
| **Commentées, inchangées** | #35 (préalable de #36) ; #44 (après le PoC, D6) ; #20 (à recetter puis fermer ; la suite est #282) ; #92 (devient « À valider par vous » ; e-mail à trancher, cahier des charges §9) ; #259 (après le PoC ; le PoC passe par #290) ; #88 (après le PoC) ; #17 (après le PoC ; contenu fixé par #54) |
| **Fermées, non retenues** | #25 comparer plusieurs options ; #42 tout arrêter d'un clic (remplacé par la pause par mission, #286) ; #43 annuler une action réversible (seule l'annulation de programmation reste, #261) ; #298 comparer deux versions (protection des retouches dans l'Atelier, #289) ; #26 coût et résultat d'une action (couvert par #286 et #56) ; #58 crédits insuffisants (fusionnée dans #56) |
| **Hors produit, inchangées** | Démarches de société (#108 à #122), légal (#2, #69, #115), plateforme et exploitation (#63, #72 à #76, #79, #81 à #85), démarches fournisseurs (#4 à #6, #9 à #12, #147, #302) |

**Écarts avec le classement proposé avant validation.** #20 et #92 ne sont pas fusionnées : #20 attend sa recette, #92 attend la décision sur l'e-mail de notification. #259 reste après le PoC (recadrage du 30 octobre 2026). #52 et #53 sont réécrites plutôt que fusionnées : la décision de suite et l'apprentissage restent deux livrables. #62 n'est pas un crédit utilisateur et n'est pas touchée. #299 est repoussée plutôt que fermée. #150 rejoint les canaux réels (PoC 3) avec #151 et #152.
