---
title: "BienDecider : cible V5.2 (cahier des charges)"
status: draft
created: 2026-11-04
updated: 2026-11-04
---

# Cahier des charges : BienDecider, cible V5.2

*Brouillon. Les PF ont tranché les décisions D1 à D13 le 4 novembre 2026 ; reste à valider le document. Remplace la cible « maquette V3 » du suivi du PoC (#272).*

## 0. Objet du document

Ce cahier des charges décrit ce que la production doit faire pour atteindre la cible de la [maquette V5.2](https://groupebienoubien.github.io/BienDecider/maquette_v5.2/#/decouvrir). Il part de la [gap analysis du 4 novembre 2026](../../gap-analysis-maquette-v5.2-2026-11-04.md), qui liste les écarts, les artifices de démo écartés et les décisions D1 à D13, tranchées par les PF.

Il s'adresse aux PF et aux étapes BMAD suivantes : mise à jour du spine d'architecture, épopées et stories, puis tri des US. Les règles détaillées (états, transitions, bornes, messages) sont dans la [spécification fonctionnelle](spec-fonctionnelle.md) ; le modèle de données et la migration dans l'[addendum](addendum.md).

Conventions :
- `[DÉCISION Dn]` : exigence qui découle de la décision Dn de la gap analysis, prise par les PF le 4 novembre 2026.
- `[ASSUMPTION]` : lecture ou valeur proposée, qui attend encore une confirmation (§9).
- Les exigences portent des numéros stables (FR-n, NFR-n). Chaque conséquence est testable.
- Le vocabulaire suit le glossaire (§3) et la [charte](../../../../charte.md), à mettre à jour (#276).
- Ce document ne reprend pas les exigences de l'épopée « Paul fiable » ([PRD du 22 octobre](../prd-BienDecider-paul-fiable-2026-10-22/prd.md)) : elles restent valables.

## 1. Vision

**Vous décidez. Votre activité avance.**

Le dirigeant d'une petite entreprise dit à Paul où il veut aller. Paul lit l'entreprise, en tire des constats et propose des **missions** : des tests limités, chacun relié à un constat, avec un périmètre choisi par le dirigeant, un résultat recherché et une règle d'arrêt. Paul prépare les contenus ; le dirigeant les relit, les valide, puis confirme chaque diffusion. Après la diffusion, le dirigeant note ce qu'il a obtenu ; Paul en tire une lecture ; le dirigeant décide de poursuivre, d'adapter ou d'arrêter.

Une seule boucle, toujours la même : **constat → mission → contenu → validation → diffusion → bilan → décision**.

Trois engagements, visibles sur chaque écran :
- **vous fixez le cap** : l'ambition est la vôtre, en vos mots ;
- **vous relisez chaque contenu** : une version validée et diffusée ne bouge plus ;
- **rien ne part sans vous** : connecter un compte ou valider un contenu n'autorise aucune diffusion.

Paul est le seul interlocuteur. Il comprend, recommande, prépare et apprend avec le dirigeant. Le travail spécialisé reste en coulisses.

## 2. Utilisateur cible

### 2.1 Jobs To Be Done

- Quand je découvre l'outil, je veux voir ce qu'il comprend de mon entreprise avant de donner mon e-mail, pour juger s'il vaut mon temps.
- Quand j'ai une envie de croissance floue, je veux la dire avec mes mots et la voir reformulée, pour savoir que je suis compris.
- Quand Paul me propose quelque chose, je veux savoir sur quel constat il s'appuie, combien ça coûte et quand on s'arrête, pour décider en confiance.
- Quand un contenu est prêt, je veux le voir exactement comme il partira, le corriger si besoin, puis décider moi-même du moment.
- Quand une action a eu lieu, je veux noter ce qu'elle a donné et décider de la suite, sans qu'on me présente l'activité comme un résultat.

### 2.2 Hors cible

- Le dirigeant qui veut un agent qui publie et prospecte seul : la cible renforce la décision humaine.
- Les agences et les équipes marketing : un dirigeant, une entreprise.

### 2.3 Parcours clés

Les parcours suivent **Nadia**, dirigeante d'une entreprise de rénovation énergétique à Aix-en-Provence, qui veut 20 % de chiffre d'affaires en plus en un an, sans embaucher (cas inspiré de la maquette, fictif).

- **UJ-1. Nadia repart avec un cap et trois pistes, avant d'avoir créé son compte.**
  - **Entrée :** la page de découverte ; elle clique « C'est parti ».
  - **Parcours :** elle donne son prénom, le nom de l'entreprise, sa ville et son site. Paul lit le site, la fiche Google et la Page Facebook publique. Il affiche trois premiers constats, chacun avec sa source et son niveau de certitude, et le profil compris (activité, zone, clients, offres). Elle corrige la zone et confirme « Oui, c'est bien moi ». Elle écrit son ambition ; Paul la reformule (+20 % de CA, 12 mois, 0 € de budget média, sans recrutement) ; elle confirme.
  - **Moment clé :** « Un cap. Trois premières pistes. » : trois missions, chacune avec le résultat recherché et le périmètre proposé.
  - **Fin :** « Ça m'intéresse », puis e-mail et mot de passe. Elle arrive sur Stratégie ; rien n'est lancé.
  - **Cas limite :** si elle ferme l'onglet à l'étape 3, elle retrouve son étape en revenant dans les 24 heures ; ensuite, le brouillon est effacé et seule une trace anonyme de sa visite reste (FR-60).

- **UJ-2. Nadia lance sa première mission dans un cadre clair.**
  - **Entrée :** Stratégie, « Votre prochaine décision : examiner Partenariats agences ».
  - **Parcours :** elle ouvre la mission, lit pourquoi elle existe (6 agences repérées dans sa zone), choisit 2 agences, lit le contrat (résultat : un rendez-vous qualifié en 30 jours ; coût : 3 crédits ; dépense externe : 0 € ; arrêt dès un refus clair ou à 30 jours sans réponse).
  - **Moment clé :** « Confirmer le lancement » : la mission passe « En cours », 3 crédits sont débités, Paul prépare le premier e-mail.
  - **Cas limite :** avec 2 crédits, le bouton est inactif et le dialogue le dit.

- **UJ-3. Nadia valide un e-mail puis confirme son envoi.**
  - **Parcours :** dans l'atelier, elle voit l'e-mail tel que le recevront les deux agences, envois séparés. Elle retouche une phrase : une version 2 est créée. Elle coche « J'ai relu » et valide sans diffuser. Elle clique « Préparer l'envoi » : Gmail n'est pas connecté ; elle le connecte et revient directement à la confirmation. Elle confirme la version, les destinataires et « maintenant ».
  - **Moment clé :** la version 2 passe en lecture seule ; l'envoi apparaît dans Résultats.
  - **Cas limite :** si l'envoi n'a pas pu être confirmé par Gmail, l'état est « résultat incertain » et aucun nouvel envoi n'est proposé avant vérification.

- **UJ-4. Nadia publie une réalisation à ses couleurs.**
  - **Parcours :** la mission « Faire parler vos réalisations » attend la confirmation de sa marque. Elle ajuste la couleur principale, ajoute son logo, confirme. Elle choisit le chantier à mettre en avant, importe sa propre photo et confirme en avoir les droits. Elle valide le visuel et programme sa publication pour mardi 9 h.
  - **Moment clé :** la publication part à l'heure dite sur sa Page, une seule fois.
  - **Cas limite :** si elle déconnecte Facebook avant mardi, la programmation est annulée et le dialogue de déconnexion l'avait annoncé.

- **UJ-5. Nadia fait le bilan et décide.**
  - **Parcours :** 30 jours après l'envoi, Stratégie affiche « Renseigner le bilan ». Elle déclare 2 demandes qualifiées, 1 rendez-vous, CA signé inconnu (laissé vide).
  - **Moment clé :** « Ce que Paul apprend » : ce qui est observé, ce que cela suggère, ce que cela ne prouve pas. Elle choisit « Poursuivre » : même cadre, une nouvelle version de l'e-mail est ouverte.
  - **Cas limite :** sans bilan à jour, « Poursuivre » est indisponible ; « Arrêter » reste possible et clôt la mission.

- **UJ-6. Nadia réactive d'anciens prospects.** `[DÉCISION D5]`
  - **Parcours :** elle importe un fichier de 27 contacts. Le contrôle en écarte 13 (opposition, accord inconnu, dernier échange de plus de 24 mois). Elle garde les 8 plus récents, confirme leur pertinence et leur droit de recontact, puis lance la mission.
  - **Moment clé :** chaque e-mail part séparément et propose de ne plus être recontacté.

- **UJ-7. Nadia répond à ses avis Google.** `[DÉCISION D4]` `[DÉCISION D9]`
  - **Parcours :** Paul propose la mission « Répondre aux avis sans réponse » (modèle Réponse aux avis). Elle choisit 3 avis, lance la mission, relit et valide les trois réponses.
  - **Moment clé :** elle confirme la publication ; chaque réponse paraît sous son avis, sur sa fiche Google.
  - **Cas limite :** si le produit ouvre avant le connecteur de la fiche Google, ce canal est désactivé : Paul ne propose pas cette mission.

## 3. Glossaire

- **Dirigeant** : la personne connectée, propriétaire de l'entreprise ; Paul l'appelle par son prénom.
- **Localisation** : ville ou commune du siège. Distincte de la **zone d'intervention**, territoire où l'entreprise travaille.
- **Ambition** : ce que veut le dirigeant, en texte libre conservé tel quel, et son **interprétation** confirmée (gain, horizon, budget média, recrutement).
- **Constat** : fait relevé sur l'entreprise ou son marché, avec sa source, sa date et son **niveau de certitude** : Observé, Piste à qualifier, À vérifier, Déclaré par vous.
- **Diagnostic** : ensemble des constats d'une analyse, avec le positionnement proposé et la concurrence locale.
- **Modèle d'action** : type de mission du catalogue `[DÉCISION D9]`. Le catalogue n'est pas limité : il comprend les trois modèles de la maquette (**Partenariats**, **Réalisation**, **Réactivation**), un modèle par type d'action que la production sait exécuter (**Publication**, **Fiche Google à jour**, **Réponse aux avis**, **Page du site vitrine**) et **Sur mesure** (FR-61).
- **Mission** : test limité issu d'un constat : modèle d'action, canal, titre, résultat recherché, périmètre, règle d'arrêt, risque, statut. Statuts : **À décider**, **En cours**, **En pause**, **Arrêtée**, **Écartée**.
- **Périmètre** : ce sur quoi porte une mission, propre à son modèle : 1 ou 2 agences, 1 à 8 contacts, 1 réalisation, 1 à 5 avis, une page… (spécification §6.1).
- **Règle d'arrêt** : condition, fixée au lancement, à laquelle on juge et on arrête le test.
- **Contenu** : ce que Paul prépare pour une mission (e-mail, publication, mise à jour de fiche, réponse à un avis, page de site), avec ses **versions**.
- **Validation** : accord du dirigeant sur une version précise. Elle n'autorise aucune diffusion.
- **Diffusion** : publication ou envoi d'une version validée, confirmé explicitement, immédiat ou **programmé**.
- **Canal** : Facebook, Instagram, LinkedIn, fiche Google, Gmail ou site vitrine `[DÉCISION D4]`. Un canal n'est proposé que si son connecteur est actif (FR-59). Le site de l'entreprise est, lui, lu pour l'analyse. **Connexion** : autorisation donnée au canal ; elle n'autorise aucune diffusion.
- **Délégation** : règle choisie par le dirigeant : Préparer seulement, Valider avant chaque action, Déléguer dans un cadre précis.
- **Bilan** : déclaration du dirigeant sur ce qu'une mission a produit après une diffusion.
- **Décision de suite** : poursuivre, adapter avec Paul ou arrêter, après le bilan.
- **Prochain pas** : l'action unique que la Stratégie met en avant, calculée à partir des missions.
- **Idée** : demande notée avec Paul qui n'est pas encore une mission.
- **Crédit** : unité de consommation visible du dirigeant. `[DÉCISION D1]`
- **Journal** : liste horodatée des décisions et événements, avec leur auteur (vous, Paul ou le système).

## 4. Fonctionnalités

### 4.1 Découverte et entrée

#### FR-1 : Page de découverte

Un visiteur comprend la promesse et commence sans créer de compte.

**Conséquences :**
- La page présente la promesse, Paul comme copilote unique, un exemple concret (ambition, plan en trois missions, extrait de contenu), « Vous gardez la main » (trois engagements) et « Six étapes, une seule boucle ».
- Le bouton principal « C'est parti » ouvre la première connexion ; « Retrouver mon compte » est un accès secondaire.
- Avec une session ouverte, les boutons deviennent « Retourner à mon espace ».
- Aucune mention de démonstration ou de simulation.

#### FR-2 : Un parcours d'entrée qui ne se perd pas

Le parcours d'entrée garde l'étape atteinte et refuse les raccourcis.

**Conséquences :**
- Un parcours incomplet ramène à son étape, y compris après rechargement ou saisie d'une adresse.
- Une étape ne s'ouvre que si la précédente est confirmée ; le contrôle est fait côté serveur.
- Revenir avant l'ambition annule le diagnostic ; les saisies sont conservées.
- Le brouillon anonyme est conservé 24 heures, puis effacé ; une trace de la visite, sans donnée directement identifiante, est gardée (FR-60). `[DÉCISION D2]`
- « C'est parti » avec une session ouverte propose d'aller à son espace ; aucune donnée n'est remplacée.

### 4.2 Première connexion, avant le compte

#### FR-3 : Présenter son entreprise

Le dirigeant donne le minimum pour que Paul lise son entreprise.

**Conséquences :**
- Champs : prénom (obligatoire), nom de l'entreprise (obligatoire), localisation (obligatoire, ville ou commune), site (facultatif, adresse en `http` ou `https`).
- « Je n'ai pas de site » poursuit sans site ; la lecture du site est alors marquée « Non disponible ».
- Aucun e-mail, mot de passe ni accès à un compte n'est demandé à cette étape.

#### FR-4 : Une lecture réelle et bornée de l'entreprise

Paul lit les sources publiques de l'entreprise et montre sa progression.

**Conséquences :**
- Quatre rubriques suivies : site et offres, informations publiques, zone et clients, identité visuelle. Chacune finit « Lue », « Non disponible » ou « Non trouvée ».
- L'analyse anonyme est plafonnée par adresse IP et par jour ; au-delà, un message propose de revenir plus tard. `[DÉCISION D2]`
- Ce qui n'a pas pu être lu n'est jamais présenté comme observé.

#### FR-5 : Confirmer le profil compris

Le dirigeant voit et corrige ce que Paul a compris avant de continuer. `[DÉCISION D10]`

**Conséquences :**
- Activité, zone d'intervention, clients prioritaires et offres principales sont affichés sous les constats, modifiables sur place, chacun avec son origine (« lu sur le site », « à confirmer »).
- « Oui, c'est bien moi » enregistre le profil et ouvre l'ambition ; « Non, corriger mes informations » revient à la découverte.

#### FR-6 : Premiers constats sourcés

Les constats montrent d'où ils viennent et à quel point ils sont sûrs.

**Conséquences :**
- Trois constats au plus à cette étape, chacun avec un niveau de certitude, le fait relevé, sa conséquence possible, la source et la date de lecture.
- Un chiffre déclaré par le dirigeant n'est jamais présenté comme observé.

#### FR-7 : Dire son ambition avec ses mots

Le dirigeant écrit son ambition ; Paul la reformule ; le dirigeant confirme.

**Conséquences :**
- Texte libre de 10 à 600 caractères, conservé tel quel.
- Paul en tire un gain, un horizon, un budget média et une position sur le recrutement, dans les bornes de la spécification §11 ; hors bornes, l'ambition est gardée sans conversion et Paul le dit.
- Il pose une question pour chaque élément manquant (gain, horizon).
- « C'est bien ça » confirme ; modifier le texte après interprétation annule la confirmation.
- « C'est une cible, pas une promesse de résultat » est affiché avec la reformulation.

#### FR-8 : Un cap et trois premières pistes

Le dirigeant voit la synthèse de son diagnostic et les missions proposées, sans engagement.

**Conséquences :**
- Rappel de l'entreprise (nom, localisation, activité, zone) et de l'ambition.
- « Ce que nous retenons » : synthèse en deux ou trois phrases, avec ses réserves.
- Trois missions au plus, chacune avec le constat d'origine, le résultat recherché, le périmètre proposé et l'indication « À examiner en premier » pour la priorité.
- « Ça m'intéresse » mène à la création du compte ; aucun compte ni mission n'est créé à cette étape.

#### FR-9 : Créer son compte en dernier

Le compte est créé quand le dirigeant a vu ce que Paul a compris.

**Conséquences :**
- E-mail, mot de passe (8 à 128 caractères) et confirmation du mot de passe.
- Un rappel montre l'entreprise et l'ambition.
- À la création, le brouillon devient le profil de l'entreprise, le diagnostic, l'ambition et des missions « À décider » ; aucune mission n'est lancée ; le journal note « Profil et ambition confirmés. Aucune mission lancée. »
- Le dirigeant arrive sur Stratégie.
- Une adresse déjà utilisée renvoie vers « Retrouver mon compte », sans dire si le compte existe à un tiers.

#### FR-60 : Apprendre des visites, avec ou sans compte

`[DÉCISION D2]` Les visites du parcours d'entrée servent après coup à connaître les visiteurs et à améliorer le produit, sans garder qui ils sont.

**Conséquences :**
- Chaque brouillon laisse une trace avant d'être rattaché à un compte ou effacé : date, étape atteinte, étape d'abandon, activité, département de la localisation, présence d'un site, rubriques lues, ambition interprétée (gain, horizon, budget média, recrutement), modèles des missions proposées, compte créé ou non, coût de l'analyse.
- La trace ne garde ni prénom, ni nom d'entreprise, ni adresse du site, ni adresse IP, ni texte libre de l'ambition, ni lien vers le compte créé.
- L'administration consulte les traces en vue agrégée (par étape, activité, département, période) et les exporte ; elles alimentent les mesures d'activation (§7, #296).
- L'étape 1 et la page de confidentialité le disent : « Nous gardons une trace anonyme de votre visite pour améliorer BienDecider. » Conservation : 25 mois `[ASSUMPTION]`.
- Garder des données identifiantes d'un visiteur sans compte (nom de l'entreprise, site, moyen de le recontacter) n'est possible qu'après l'avis RGPD (#69) : base légale, information à l'étape 1, durée de conservation. `[ASSUMPTION]`

### 4.3 Accès

#### FR-10 : Se connecter, se déconnecter, récupérer son mot de passe

**Conséquences :**
- Connexion par e-mail et mot de passe ; arrivée sur Stratégie.
- Déconnexion depuis Mon compte ; retour à la page de découverte.
- Récupération du mot de passe par un lien envoyé par e-mail, valable une heure, à usage unique.
- Toute page de l'espace est inaccessible sans session.

#### FR-11 : Vérifier son adresse e-mail

**Conséquences :**
- Un lien de vérification est envoyé à la création du compte.
- Tant que l'adresse n'est pas vérifiée, aucune diffusion n'est possible ; un bandeau le dit et permet de renvoyer le lien.

### 4.4 Espace

#### FR-12 : Navigation et cap visible

**Conséquences :**
- Quatre pages de parcours : Stratégie, Missions (avec le nombre de missions en cours), Atelier, Résultats.
- Entreprise est ouverte depuis le bloc de l'entreprise en tête de navigation ; Mon compte en bas, avec le solde de crédits ; « Laisser un avis » dans le menu.
- Le bloc « Votre cap » rappelle l'ambition courte, l'horizon et la position sur le recrutement.
- La barre du haut porte le fil d'Ariane, la date du jour et « Discuter avec Paul », qui ouvre la conversation du contexte de la page.
- Sur téléphone, la navigation est un menu latéral repliable ; la page derrière est inerte quand il est ouvert.
- L'administration reste accessible aux seuls administrateurs, hors du parcours.

### 4.5 Stratégie

#### FR-13 : Votre prochaine décision

La Stratégie met en avant une seule action, la plus utile maintenant.

**Conséquences :**
- Le prochain pas est calculé selon la spécification §3 : d'abord la priorité de Paul, puis les autres missions ; une étape qui attend le dirigeant passe avant un lancement.
- Le bloc affiche le titre, le détail, « Pourquoi maintenant », « Preuve utilisée », « À vérifier », le résultat recherché, un seul bouton d'action et « Challenger avec Paul ».
- Sans mission en cours ni à décider : « Aucune mission en cours » et « Explorer une idée ».
- « Rien ne sera lancé ou diffusé sans votre accord » est affiché sous le bouton.

#### FR-14 : À valider par vous

**Conséquences :**
- Liste des contenus prêts ou validés des missions en cours, des programmations à venir, de la marque à confirmer, et l'état des connexions.
- Chaque ligne renvoie à l'endroit où l'on décide (atelier, marque, canaux).
- « Une validation de contenu n'est jamais une autorisation de diffusion. »

#### FR-15 : Les missions regroupées avec leurs constats

**Conséquences :**
- Chaque ligne relie, de gauche à droite : le constat (titre, origine, niveau de certitude, note, « Voir la source »), la déduction de Paul, la mission (statut, priorité, résultat recherché, périmètre, actions).
- Actions par mission : examiner ou voir, affiner avec Paul, modifier l'objectif, écarter ou remettre au plan, selon le statut.
- Les missions créées par le dirigeant s'y trouvent avec le constat « Déclaré par vous ».

#### FR-16 : Ce que Paul apprend

**Conséquences :**
- Après un bilan, un bloc pour la mission concernée : « Observé », « Ce que cela suggère », « Ce que cela ne prouve pas », « Impact sur le plan ».
- La lecture compare le bilan au résultat recherché de la mission (spécification §7) ; elle ne propose jamais d'élargir automatiquement.

#### FR-17 : Idées à cadrer

**Conséquences :**
- Une idée notée avec Paul (200 caractères) apparaît dans les missions regroupées avec « Cadrer avec Paul » et « Retirer l'idée ».
- 10 idées au plus ; au-delà, Paul demande d'en retirer une.
- Une idée se cadre en mission de n'importe quel modèle du catalogue, y compris « Sur mesure » (FR-61). `[DÉCISION D9]`
- Une demande qu'aucun modèle ne couvre est aussi transmise à l'administration, pour enrichir le catalogue.

### 4.6 Missions

#### FR-18 : La mission et son contrat

**Conséquences :**
- Une mission porte : modèle d'action, canal, titre, constat et preuve, niveau de certitude, résultat recherché, périmètre, règle d'arrêt, risque, délai, statut, priorité, coût de lancement.
- Le détail affiche « Pourquoi cette mission ? », « Ce que vous choisissez » (périmètre), « Les actions de la mission » (cinq actions et leur état) et « Notre contrat de mission » (résultat, coût, dépenses externes, règle d'arrêt, délégation, risque).
- Le suivi en six temps (Cadrer, Préparer, Valider, Diffuser, Faire le bilan, Décider) indique l'étape courante.

#### FR-19 : Parcourir les missions par statut

**Conséquences :**
- Filtres avec compteurs : Toutes, En cours, À décider, En pause, Arrêtées, Écartées.
- La priorité de Paul apparaît en premier.
- Un filtre vide affiche « Aucune mission dans cette vue » et un retour à Toutes.
- Le niveau de délégation et le budget média maximal sont rappelés sous la liste ; « aucune dépense engagée ».

#### FR-20 : Lancer une mission dans un cadre confirmé

**Conséquences :**
- Le lancement passe par un dialogue : résultat recherché, périmètre, coût en crédits et solde, dépenses externes (0 €), règle d'arrêt.
- Pour une réactivation, une case de confirmation des contacts est obligatoire (FR-44).
- Le premier lancement débite le coût de lancement ; crédits insuffisants : bouton inactif et lien vers Mon compte.
- Une mission écartée ou arrêtée ne se lance pas ; le bouton n'est pas affiché.
- Lancer autorise la préparation des contenus, jamais leur diffusion.

#### FR-21 : Mettre en pause, reprendre

**Conséquences :**
- Seule une mission en cours se met en pause, après confirmation ; ses programmations sont annulées ; ses diffusions passées restent.
- La reprise ne débite aucun crédit.
- Une mission en pause refuse validation et diffusion de ses contenus.

#### FR-22 : Écarter, remettre au plan

**Conséquences :**
- Une mission en cours ne s'écarte pas (il faut la mettre en pause) ; une mission arrêtée non plus.
- Écarter après confirmation : la mission quitte les recommandations, ses programmations sont annulées, rien n'est effacé.
- Remettre au plan rend le statut d'avant (« En pause » si elle l'était, sinon « À décider »).
- Si la mission écartée était la priorité, la priorité passe à une autre mission non écartée.

#### FR-23 : Choisir le périmètre

**Conséquences :**
- Partenariats : 1 ou 2 agences de la liste ; Réactivation : 1 à 8 contacts recontactables ; Réalisation : 1 réalisation ; autres modèles : spécification §6.1.
- Le périmètre est verrouillé, avec la raison affichée, si la mission est écartée ou arrêtée, si une diffusion est programmée ou si la version courante a été diffusée.
- Modifier le périmètre d'une mission en cours ou d'un contenu validé crée une version et retire la validation.

#### FR-24 : Modifier le résultat recherché

**Conséquences :**
- 5 à 120 caractères ; refusé si la mission est arrêtée.
- « Y revenir » rétablit l'objectif proposé à l'origine.
- Paul s'appuie sur cette phrase pour lire le bilan.

#### FR-25 : Créer une mission

**Conséquences :**
- Formulaire : constat de départ (10 à 300 caractères), titre (5 à 80), modèle d'action (tout le catalogue, FR-61), canal si le modèle en propose plusieurs, résultat recherché (5 à 120) ; pas de balise.
- Créée depuis une idée, elle reprend le texte de l'idée comme constat et retire l'idée.
- La création ne coûte aucun crédit et n'autorise aucune diffusion ; un premier brouillon est préparé, à vérifier avant lancement.

#### FR-61 : Un catalogue de modèles ouvert

`[DÉCISION D9]` Toute action que BienDecider sait préparer peut devenir une mission : le catalogue ne se limite pas aux trois modèles de la maquette.

**Conséquences :**
- Modèles : Partenariats, Réalisation, Réactivation (maquette) ; Publication, Fiche Google à jour, Réponse aux avis, Page du site vitrine (types d'action de la production) ; Sur mesure. Canal, contenu, périmètre et règle d'arrêt de chacun : spécification §6.1.
- Chaque modèle définit son ou ses canaux, son format de contenu, son périmètre, son résultat recherché par défaut et sa règle d'arrêt. Ajouter un modèle ne change pas les règles communes (statuts, versions, validation, diffusion, bilan, crédits).
- Paul peut proposer une mission de n'importe quel modèle ; le dirigeant peut en créer une (FR-25).
- Le canal est choisi au cadrage. Il peut changer tant qu'aucune version n'est validée ; ensuite, il est figé.
- **Sur mesure** : une demande qu'aucun modèle ne couvre devient une mission « Sur mesure », pas une simple note (confirmé par les PF le 4 novembre 2026). Le dirigeant fixe avec Paul le contenu attendu, le canal, le résultat recherché et la règle d'arrêt (7 à 90 jours). La mission vise un canal actif, ou se mène hors canal (salon, appel, prospectus…) : la diffusion est alors déclarée (FR-37). La demande est aussi transmise à l'administration, pour enrichir le catalogue.
- Un modèle dont aucun canal n'est actif n'est pas proposé (FR-59).
- Lancer une mission coûte 3 crédits, quel que soit son modèle `[ASSUMPTION]`.
- La réactivation reste soumise à l'avis RGPD (FR-43).

### 4.7 Atelier

#### FR-26 : Un contenu rattaché à une mission, vu tel qu'il partira

**Conséquences :**
- Chaque contenu appartient à une mission ; l'atelier permet de passer d'un contenu à l'autre.
- Aperçu fidèle, propre au canal : publication Facebook, Instagram ou LinkedIn (en-tête, texte, visuel) ou visuel seul ; post ou informations de la fiche Google ; réponse placée sous l'avis cité ; page du site vitrine ; e-mail (expéditeur, destinataires avec « envois séparés », objet, corps).
- Un état est toujours affiché : Brouillon, Validée, Programmée, Diffusée, Archive.
- Une mission qui n'est pas en cours bloque validation et diffusion, avec un lien vers la mission.

#### FR-27 : Versions et historique

**Conséquences :**
- Toute modification crée une version numérotée ; les anciennes sont conservées.
- L'historique montre pour chaque version son auteur (vous, Paul, le système), sa note et son état (Courante, Validée, Diffusée, Archive).
- Une ancienne version se consulte en lecture seule ; y revenir crée une nouvelle version à valider.
- Une version garde l'état de la marque au moment de sa création (couleurs, ton, logo).

#### FR-28 : Retoucher soi-même

**Conséquences :**
- Champs : accroche ou objet (100 caractères), texte (3 000 caractères), composition pour un visuel.
- Enregistrer crée une version et retire la validation.
- Des retouches non enregistrées sont conservées en changeant de page, signalées, et bloquent validation, diffusion et nouvelle version tant qu'elles ne sont pas enregistrées.

#### FR-29 : Faire retravailler par Paul

**Conséquences :**
- Depuis l'atelier, Paul propose une variante (plus court, plus humain, autre angle, ou consigne libre) ; elle n'est créée qu'à l'acceptation.
- Une version préparée avec Paul débite 1 crédit. `[DÉCISION D1]`
- Refusé si une diffusion est programmée ou si la mission est arrêtée ou écartée.

#### FR-30 : Valider une version

**Conséquences :**
- Dialogue « Valider la version Vn » ; « J'ai relu le contenu et vérifié les informations qui engagent mon entreprise » obligatoire.
- Visuel : marque confirmée et droits d'utilisation confirmés, sinon refus avec un lien vers la marque.
- E-mail : liste des destinataires ; refus sans destinataire ; réactivation : refus sans confirmation des contacts.
- Refus si le contenu ne respecte pas les contraintes de son canal (longueur, visuel obligatoire ; spécification §5.6).
- Refus si la mission n'est pas en cours, si le profil a changé sans relecture, si la version est programmée ou déjà diffusée.
- Le bouton dit « Valider sans diffuser » ; le journal note « Aucun envoi effectué ».

#### FR-31 : Refuser une version avec un motif

`[DÉCISION D11]`

**Conséquences :**
- Action secondaire « Je ne veux pas de cette version », avec un motif obligatoire.
- Le motif est retenu par Paul pour les versions suivantes de la mission.

#### FR-32 : Une version diffusée ne bouge plus

**Conséquences :**
- Après diffusion, la version est en lecture seule.
- « Créer V(n+1) à partir de Vn » ouvre une nouvelle série, à valider.

#### FR-33 : Les changements de profil, de marque et de périmètre se voient dans les contenus

**Conséquences :**
- Profil modifié après l'inscription : chaque contenu reçoit une version « Profil corrigé : informations à vérifier », sa validation et ses programmations sont annulées, et sa validation est refusée tant qu'une nouvelle version n'a pas été enregistrée.
- Marque ou logo modifiés : chaque visuel reçoit une version, sa validation est retirée ; refusé si un visuel est programmé.
- Réalisation changée : le contenu reçoit une version, validation et droits retirés.

### 4.8 Diffusion

#### FR-34 : Confirmer une diffusion

**Conséquences :**
- Dialogue : version, destination (Page ou destinataires, « envois séparés »), moment (maintenant ou programmer), case « Je confirme cette version, cette destination et ce moment ».
- Contrôles serveur, dans l'ordre de la spécification §5 ; chacun a son message.
- Une diffusion enregistre la date, le canal, la version et le nombre de destinataires ; la version passe en lecture seule.
- Une même version n'est jamais diffusée deux fois.

#### FR-35 : Programmer, annuler une programmation

**Conséquences :**
- Date et heure futures, dans le fuseau de l'appareil, enregistrées avec ce fuseau.
- La programmation est visible dans l'atelier, À valider par vous, Résultats et la ligne du canal.
- L'annuler, après confirmation, laisse la version validée.
- Mettre la mission en pause, l'écarter, l'arrêter, déconnecter le canal ou passer en « Préparer seulement » annule ses programmations ; le dirigeant est prévenu avant.

#### FR-36 : Connecter, déconnecter un canal

**Conséquences :**
- La connexion passe par l'autorisation du fournisseur ; le dirigeant choisit la Page, le compte, le profil ou l'établissement.
- Lancée depuis une confirmation de diffusion, la connexion revient directement à cette confirmation ; elle ne déclenche rien.
- La déconnexion est confirmée ; le dialogue liste les programmations qui seront annulées ; contenus et validations restent.
- Le site de l'entreprise n'est lu que pour l'analyse ; le site vitrine BienDecider est un canal de diffusion (FR-59).

#### FR-37 : Diffuser soi-même et le déclarer

Comble une limite de la maquette (gap analysis I-02).

**Conséquences :**
- En « Préparer seulement », pour un canal non connecté, ou pour une mission « Sur mesure » menée hors canal (FR-61), le dirigeant récupère le texte puis déclare « Je l'ai diffusé moi-même » (date, canal).
- Une diffusion déclarée compte pour le bilan et verrouille la version comme une diffusion confirmée ; elle est marquée « déclarée » partout.

#### FR-38 : Échec et résultat incertain

**Conséquences :**
- Un échec avant diffusion laisse la version validée et propose de réessayer.
- Un résultat incertain (le canal n'a pas confirmé) n'est jamais compté comme diffusé ni réessayé automatiquement ; le dirigeant vérifie sur le canal puis déclare « diffusé » ou « non diffusé ».

#### FR-59 : Tous les canaux, chacun avec ce qu'il permet vraiment

`[DÉCISION D4]` Le site vitrine, Instagram, LinkedIn et la fiche Google restent dans le parcours, à côté de Facebook et de Gmail.

**Conséquences :**
- Canaux : Facebook (Page), Instagram (compte professionnel), LinkedIn (profil ou Page), fiche Google (informations, posts, réponses aux avis), Gmail (envoi individuel), site vitrine (mise en ligne d'une page). Sur chacun, BienDecider diffuse après confirmation du dirigeant.
- Les connecteurs de tous ces canaux sont un **prérequis de l'ouverture** du produit. `[DÉCISION D4]`
- Si l'ouverture est décidée avant, chaque canal dont le connecteur n'est pas développé est **désactivé** : il n'est ni connectable, ni proposé au choix du canal, ni dans les propositions de Paul. Un modèle dont aucun canal n'est actif n'est pas proposé. `[DÉCISION D4]`
- L'activation de chaque canal vient d'une source unique ; un canal devient actif quand son connecteur est livré, jamais avant.
- Les contraintes du canal (longueur, visuel obligatoire, format) sont contrôlées avant la validation (spécification §5.6).
- Une mission vise un seul canal `[ASSUMPTION]` ; adapter un même contenu à plusieurs canaux (#299) vient après le PoC.
- Sur le site vitrine, une diffusion met la page en ligne à son adresse publique ; une version suivante, validée et confirmée, la remplace ; l'ancienne reste dans l'historique.
- Réponse aux avis : chaque réponse est une diffusion, rattachée à l'avis auquel elle répond.

### 4.9 Marque

#### FR-39 : Kit de marque

**Conséquences :**
- Couleur principale, accent, ton (Clair, concret, rassurant ; Chaleureux et accessible ; Précis et expert) ; « Je confirme ces éléments pour les prochaines créations » obligatoire.
- Proposition initiale tirée du site ; sans site, identité proposée et marquée « sans source ».
- L'origine de chaque élément est affichée (site, proposition, importé par vous).
- Les contenus respectent trois règles affichées : parole simple, faits vérifiables, aucun avis, label ou gain inventé.

#### FR-40 : Logo

**Conséquences :**
- PNG, JPEG ou WebP, 500 Ko au plus ; ajouter, remplacer, retirer.
- Effets de FR-33.

#### FR-41 : Photo et droits

**Conséquences :**
- Importer une photo dans un visuel : JPG, PNG ou WebP, 1 Mo au plus.
- Deux compositions : « Photo & signature » et « Cadre éditorial » ; l'accroche s'ajuste à la place disponible.
- Une photo nouvelle ou une réalisation changée retire la confirmation des droits.

### 4.10 Délégation

#### FR-42 : Trois niveaux de délégation

**Conséquences :**
- « Préparer seulement » : Paul prépare, le dirigeant récupère les contenus et diffuse lui-même (FR-37) ; aucune diffusion par BienDecider.
- « Valider avant chaque action » (conseillé, par défaut) : chaque version est validée, chaque diffusion confirmée.
- « Déléguer dans un cadre précis » : analyses et brouillons sans demande, dans les missions en cours ; diffusions, premiers contacts et dépenses restent confirmés.
- Réglage dans Entreprise › Canaux & délégation, jamais pendant l'inscription ; chaque changement est journalisé ; passer en « Préparer seulement » annule les programmations.
- Le niveau est rappelé dans le contrat de mission, le cadre de diffusion de l'atelier et la liste des missions.

### 4.11 Destinataires et réalisations

#### FR-43 : Importer et contrôler une liste de contacts

`[DÉCISION D5]` : disponible après validation de #69.

**Conséquences :**
- Fichier CSV, colonnes `prenom`, `nom`, `email`, `mois_depuis_dernier_contact`, `recontact` (oui, non, inconnu), séparateur `;` ou `,`.
- Aperçu avant import : contacts lus, recontactables, oppositions, accords inconnus, dernier échange de plus de 24 mois, lignes ignorées et pourquoi.
- Un contact est recontactable seulement avec un accord « oui » et un dernier échange de 24 mois au plus.
- L'import remplace la liste et retire la sélection et la confirmation ; refusé si une mission de réactivation a une diffusion programmée ou une version diffusée.
- « Choisir les 8 plus récents » sélectionne les 8 recontactables les plus récents.

#### FR-44 : Confirmer le droit de recontact

**Conséquences :**
- « Je confirme la pertinence des contacts choisis, leur droit de recontact et la possibilité de s'opposer » est exigé au lancement et avant validation.
- Toute modification de la liste ou de la sélection retire cette confirmation.
- Chaque message de réactivation propose de ne plus être recontacté.

#### FR-45 : Prescripteurs de la zone

`[DÉCISION D6]`

**Conséquences :**
- La liste d'agences vient de la recherche de prescripteurs (organisations, informations publiques et professionnelles), avec nom, secteur, e-mail professionnel et source.
- Aucune relance automatique ; un message par agence.

#### FR-46 : Réalisations à mettre en avant

**Conséquences :**
- Les réalisations repérées sur le site ou déclarées par le dirigeant forment une liste ; une seule est mise en avant par mission.
- « Droits photo à confirmer avant publication » est rappelé sur chaque réalisation.

### 4.12 Résultats

#### FR-47 : Renseigner le bilan d'une mission

**Conséquences :**
- Possible seulement pour une mission qui a au moins une diffusion (confirmée ou déclarée).
- Demandes qualifiées et rendez-vous obligatoires (0 accepté), entiers ; rendez-vous au plus égaux aux demandes ; CA signé facultatif, vide n'est pas zéro ; « Origine des demandes et contexte » (600 caractères).
- Changer de mission dans le formulaire recharge les chiffres de cette mission.
- Le bilan est rattaché au nombre de diffusions de la mission : une nouvelle diffusion le rend « à mettre à jour ».
- Le journal note « Attribution déclarative, non vérifiée ».

#### FR-48 : Décider la suite

**Conséquences :**
- Dialogue : résultat recherché, bilan déclaré, règle d'arrêt.
- « Poursuivre » exige un bilan à jour ; il garde le cadre et ouvre une nouvelle version dans l'atelier.
- « Adapter avec Paul » ouvre la conversation de la mission.
- « Arrêter la mission » la clôt et annule ses programmations ; elle reste dans l'historique.

#### FR-49 : Voir les résultats

**Conséquences :**
- Indicateurs : diffusions (et programmations en attente), demandes qualifiées, CA signé ; « — » tant que rien n'est déclaré.
- Tableau par mission : diffusions, bilan déclaré, résultat recherché, suite.
- « La diffusion et son suivi » : programmations et diffusions, chacune avec un lien vers la version diffusée.
- « Le point de Paul » et « Un envoi n'est ni une lecture, ni une vente ».
- Prochain point daté à partir de la règle d'arrêt de chaque mission.

#### FR-50 : Journal des décisions

**Conséquences :**
- Chaque événement de la spécification §15 est journalisé, avec son auteur et sa date ; le journal n'est pas modifiable.
- Il est affiché dans Résultats (« Décisions & traçabilité »).

### 4.13 Entreprise

#### FR-51 : Diagnostic et positionnement

**Conséquences :**
- Résumé chiffré (acteurs analysés, sources lues, réalisations repérées, positionnement proposé), date de l'analyse.
- Positionnement proposé, présenté comme une hypothèse à challenger, avec ce qui est observé, ce qui est supposé et ce qu'il faut éviter.
- Axes de positionnement (niveau, ce que font les concurrents, conseil).
- Concurrence locale : acteur, angle, ce qu'il montre, ce qu'il ne montre pas, fiabilité.
- « Ce qu'il faut retenir », « Ce que Paul en fait », « Ce qu'il nous manque ».
- La consigne durable et les retours retenus sont visibles et modifiables. (gap analysis Z-06)

#### FR-52 : Corriger son profil et son ambition

**Conséquences :**
- Profil : prénom, entreprise, localisation, activité, zone, clients, offres ; effets de FR-33.
- Ambition : même mécanique que FR-7 ; les missions en cours ne changent pas ; le journal note le nouveau cap.
- Chiffrage facultatif (CA actuel, valeur moyenne d'un client) pour le calcul de l'écart. `[DÉCISION D8]`

### 4.14 Compte

#### FR-53 : Crédits

`[DÉCISION D1]`

**Conséquences :**
- 20 crédits offerts à l'inscription ; lancer une mission coûte 3 crédits, une version préparée avec Paul 1 crédit ; création de mission, reprise, retouches, validations et diffusions sont gratuites.
- Mon compte affiche le solde, le barème et l'historique des mouvements.
- Crédits insuffisants : action refusée avec le besoin et le solde.
- Pas de recharge payante pendant le PoC ; les plafonds techniques de coût restent actifs.

#### FR-54 : Laisser un avis

`[DÉCISION D7]` Fonction permanente du produit, pendant le PoC et après : capitaliser sur les retours des utilisateurs est un atout.

**Conséquences :**
- Depuis le menu de chaque page : note de 1 à 5 et commentaire (600 caractères), avec la page d'origine ; « Dire ce qui ne va pas » (#275) passe par le même dialogue.
- L'administration consulte les avis, les filtre par page, note et période, et les exporte.
- L'avis ne contient pas de donnée de tiers. À la suppression du compte, il est détaché du compte et conservé sans identité `[ASSUMPTION]`.

### 4.15 Paul

#### FR-55 : Paul, seul interlocuteur

`[DÉCISION D3]`

**Conséquences :**
- Aucun écran ne présente d'autre personnage que Paul : ni avatar, ni nom, ni « via Martine ».
- Les auteurs affichés sont « vous », « Paul » ou « mise à jour automatique ».

#### FR-56 : Une conversation par contexte

`[DÉCISION D12]`

**Conséquences :**
- Contextes : stratégie, mission, contenu de l'atelier, résultats, ambition, positionnement, concurrence, sources, idée.
- Le panneau s'intitule « Paul à propos de… » et nomme le contexte ; un sélecteur ouvre les autres conversations.
- Le bouton « Discuter avec Paul » de chaque page ouvre la conversation de son contexte.

#### FR-57 : Propositions à confirmer

**Conséquences :**
- Paul peut proposer : changer la priorité, modifier un périmètre, mettre en pause, écarter, remettre au plan, ajuster l'ambition, créer une version, noter une idée, lancer une mission.
- Chaque proposition décrit son effet ; rien ne change avant « Accepter » ; « Garder le cap actuel » la retire et Paul le confirme.
- Une proposition acceptée suit les mêmes contrôles que l'action faite à la main.

#### FR-58 : Suggestions et liens d'action

**Conséquences :**
- Chaque contexte propose des questions rapides (voir la spécification §16).
- Les réponses de Paul portent des liens vers l'écran où l'on agit.

## 5. Exigences non fonctionnelles

- **NFR-1 Contrôle serveur.** Chaque transition de la spécification est vérifiée côté serveur, avec le même message que l'interface ; les tests contournent l'interface.
- **NFR-2 Isolation.** Aucune donnée d'une entreprise n'est lisible ni modifiable par une autre ; vérifié par test pour chaque nouvelle route.
- **NFR-3 Concurrence.** Une validation, une diffusion ou une retouche porte le numéro de version vu ; s'il a changé, l'action est refusée (« Cette version a changé. Réexaminez le contenu avant de confirmer. »).
- **NFR-4 Diffusion unique.** Une diffusion, immédiate ou programmée, part au plus une fois (clé d'idempotence par contenu et version) ; une programmation part dans les 5 minutes suivant l'heure prévue.
- **NFR-5 Données personnelles.** Contacts importés : base légale, information et durée de conservation fixées par #69 ; effacement avec le compte ; export des données du dirigeant (#70). Brouillon anonyme effacé après 24 heures ; trace des visites sans donnée directement identifiante (FR-60).
- **NFR-6 Coût.** Les plafonds par entreprise existants restent actifs ; l'analyse anonyme a son propre plafond (FR-4) ; une alerte prévient l'administration d'une consommation anormale (#72).
- **NFR-7 Jetons.** Les jetons des canaux sont chiffrés au repos et renouvelés (#7, #8).
- **NFR-8 Accessibilité.** Fenêtres de dialogue avec focus piégé et Échap ; lien d'évitement ; cibles de 44 px ; contraste de 4,5 au moins ; messages annoncés aux lecteurs d'écran ; clavier complet.
- **NFR-9 Affichage.** Sans défilement horizontal de 320 à 1440 px ; vérifié à 360, 390, 1024 et 1440 px.
- **NFR-10 Langue.** Vouvoiement, phrases courtes, aucun terme technique ni anglicisme visible ; charte mise à jour (#276).
- **NFR-11 Honnêteté.** Aucun chiffre inventé : « — » pour ce qui n'est pas mesuré ; « déclaré » et « observé » distingués ; aucune mention de démonstration.
- **NFR-12 Traçabilité.** Le journal est en ajout seul ; chaque entrée garde l'auteur, la date et l'objet concerné.

## 6. Hors périmètre

- Paiement, recharge de crédits, abonnement, facturation (#55 à #61).
- Diffusion sans confirmation, relance automatique, achat d'espace publicitaire (le budget média n'autorise aucune dépense).
- Entonnoir de prospection d'organisations et prise de contact automatique `[DÉCISION D6]`.
- Comparaison de deux versions côte à côte, adaptation d'un contenu à plusieurs canaux (#299), « tout arrêter d'un clic », retour arrière d'une diffusion.
- Tout ce que la gap analysis classe en artifice de démo (§2).

## 7. Mesure du succès

Mesures d'activation (#296), par cohorte d'inscription :
- part des visiteurs qui atteignent « Un cap. Trois premières pistes. », et étape d'abandon des autres (trace des visites, FR-60) ;
- part de ceux-ci qui créent un compte ;
- part des comptes qui lancent une mission dans les 7 jours ;
- part des missions lancées qui ont une diffusion, puis un bilan, puis une décision de suite ;
- répartition des missions lancées par modèle et par canal, et part des diffusions déclarées (FR-37, FR-61) ;
- nombre d'avis et note moyenne par page (FR-54).

Contre-mesures :
- diffusions sans bilan après la date de la règle d'arrêt ;
- missions écartées dans l'heure qui suit leur lancement ;
- coût moyen d'une analyse anonyme sans création de compte ;
- oppositions au recontact reçues ;
- contenus signalés comme erronés après diffusion.

## 8. Dépendances et prérequis

- Décisions D1 à D13 de la gap analysis, prises le 4 novembre 2026.
- Modèle Mission et migration (#277, [addendum](addendum.md) §2).
- Cadre RGPD du fichier de prospection (#69) avant FR-43 et FR-44, et avant de garder des données identifiantes des visiteurs sans compte (FR-60).
- Connecteurs de publication de tous les canaux, prérequis de l'ouverture (FR-59) : Instagram (#300), LinkedIn (#149, #152), fiche Google (#13 à #15), avec les accès des fournisseurs ; Facebook et Gmail approuvés au-delà des comptes testeurs (#302).
- E-mails du service (#47) avant FR-10 et FR-11.
- Comptes testeurs Meta et Google (#302) tant que les applications ne sont pas approuvées.
- Charte mise à jour (#276).

## 9. Hypothèses et questions ouvertes

Les décisions D1 à D13 sont prises. Deux précisions des PF du 4 novembre 2026 sont appliquées : la mission « Sur mesure » (FR-61) et l'ouverture conditionnée aux connecteurs, avec désactivation des canaux non développés en cas d'ouverture anticipée (FR-59). Restent à confirmer :

- `[ASSUMPTION]` Règles d'arrêt : celles de la maquette pour ses trois modèles (30 jours pour partenariats et réactivation, bilan à J+7 pour une réalisation) ; celles des autres modèles sont proposées dans la spécification §6.1.
- `[ASSUMPTION]` Une mission vise un seul canal ; les variantes par canal (#299) viennent après le PoC.
- `[ASSUMPTION]` Trace des visites conservée 25 mois, sans donnée directement identifiante (FR-60).
- `[ASSUMPTION]` Plafonds de production : 10 missions créées par le dirigeant actives à la fois, 10 idées, 200 contacts par import.
- `[ASSUMPTION]` Le prochain pas ne concerne qu'une mission à la fois ; les autres attentes restent dans « À valider par vous ».
- Question : faut-il notifier le dirigeant (e-mail) quand une programmation part ou échoue ? Proposé : oui pour l'échec et le résultat incertain seulement.
