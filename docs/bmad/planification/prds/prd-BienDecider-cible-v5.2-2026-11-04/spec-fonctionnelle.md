---
title: "Spécification fonctionnelle : cible V5.2"
status: draft
created: 2026-11-04
updated: 2026-11-04
source: "maquette_v5.2/state.js (règles), views.js et app.js (écrans), paul.js (Paul)"
---

# Spécification fonctionnelle : cible V5.2

Ce document détaille les règles du [cahier des charges](prd.md) : états, transitions, bornes, messages, écrans. Il transpose la logique de la maquette (`maquette_v5.2/state.js`) en exigences de production, sans ses artifices de démo ([gap analysis §2](../../gap-analysis-maquette-v5.2-2026-11-04.md)). Chaque règle s'applique **côté serveur** (NFR-1) ; l'interface la reflète.

Les libellés entre guillemets sont les textes visibles cibles. Les identifiants techniques (`proposed`, `active`…) sont indicatifs ; l'[addendum](addendum.md) fixe le modèle.

`[DÉCISION Dn]` renvoie à une décision prise par les PF le 4 novembre 2026 (gap analysis §3) ; `[ASSUMPTION]` signale une valeur proposée, à confirmer.

## 1. Parcours d'entrée

### 1.1 Étapes

| # | Étape | Titre visible | Sortie |
| --- | --- | --- | --- |
| 1 | Découverte | « Votre entreprise. Notre point de départ. » | Analyse lancée, puis « Voir mes premiers constats » |
| 2 | Premiers constats | « Paul semble avoir compris votre entreprise. » | « Oui, c'est bien moi » |
| 3 | Ambition | « Qu'aimeriez-vous changer ? » | « C'est bien ça » (ambition confirmée, diagnostic prêt) |
| 4 | Mes premières missions | « Un cap. Trois premières pistes. » | « Ça m'intéresse » |
| 5 | Votre compte | « Retrouvez votre stratégie. » | Compte créé, arrivée sur Stratégie |

Colonne de gauche : les cinq étapes avec leur sous-titre (« Votre point de départ », « Les signes que Paul a compris », « Votre cap et vos limites », « Du concret à décider », « Retrouver votre stratégie »), l'étape courante marquée, les étapes passées cochées. En tête : « Retour » (étape précédente) ou « Revoir le concept » à l'étape 1, et « n sur 5 ».

### 1.2 Transitions

| Transition | Condition (sinon message) | Effet |
| --- | --- | --- |
| Commencer (« C'est parti ») | Aucune session ouverte, sinon proposer « Retourner à mon espace » | Brouillon anonyme créé, étape 1 |
| Découvrir | Prénom, entreprise et localisation renseignés ; site vide ou en `http(s)://` (§14 M-01 à M-04) | Profil du brouillon mis à jour ; analyse lancée (§1.3) |
| Voir les constats | Analyse terminée (lue ou partiellement lue) | Étape 2 |
| Confirmer le profil | Activité, zone, clients et offres renseignés (§14 M-05) | Profil confirmé ; étape 3 |
| Interpréter l'ambition | Texte de 10 caractères au moins (§14 M-06) | Reformulation affichée, non enregistrée |
| Confirmer l'ambition | Étape ≥ 3, profil confirmé, texte non vide (§14 M-07) | Ambition enregistrée ; diagnostic prêt ; étape 4 |
| Ça m'intéresse | Diagnostic prêt et étape 4 (§14 M-08) | Étape 5 |
| Créer le compte | Prénom, entreprise, diagnostic prêt, étape 5, e-mail valide, mots de passe valides et identiques, adresse non utilisée (§14 M-09 à M-14) | Compte créé, trace de la visite écrite (§1.5), brouillon rattaché puis effacé, missions « À décider », journal J-04 |
| Revenir à l'étape n | n < étape courante | Étape n ; si n < 4, le diagnostic n'est plus prêt ; les saisies restent |
| Aller à l'étape n | n ≤ étape courante + 1 et étape précédente confirmée | Sinon retour à l'étape courante |

### 1.3 Analyse avant compte

- Quatre rubriques : « Site et offres », « Informations publiques », « Zone et clients », « Identité visuelle ». États : en cours, lue, non disponible (pas de site), non trouvée.
- Plafond : `[DÉCISION D2]` 3 analyses par adresse IP et par jour ; coût par analyse borné (plafond de tokens fixé dans l'addendum §6).
- Le brouillon est lié à un cookie de session anonyme, valable 24 heures. Après 24 heures, sa trace est écrite (§1.5), puis il est effacé ; revenir sur `/bienvenue` repart à l'étape 1.

### 1.4 Aiguillage des adresses

| Situation | Adresse demandée | Résultat |
| --- | --- | --- |
| Pas de brouillon, pas de session | toute page de l'espace ou d'entrée | Page de découverte |
| Brouillon en cours | toute page | Page de l'étape courante (1-3 : bienvenue, 4 : premières missions, 5 : inscription) |
| Session ouverte | page d'entrée | Stratégie |
| Session ouverte | page inconnue de l'espace | Stratégie |
| Toute situation | page de découverte | Page de découverte |

### 1.5 Trace des visites

`[DÉCISION D2]` (FR-60). Une trace par brouillon, écrite à la création du compte ou à l'expiration du brouillon, juste avant son effacement.

| Gardé | Jamais gardé |
| --- | --- |
| Date de début, étape atteinte, étape d'abandon (si pas de compte) | Prénom, nom de l'entreprise, adresse du site |
| Activité ; département tiré de la localisation | Localisation exacte, zone d'intervention en texte libre |
| Site renseigné ou non ; état de chaque rubrique lue (§1.3) | Contenu des constats |
| Ambition interprétée : gain, horizon, budget média, recrutement | Texte libre de l'ambition |
| Modèles des missions proposées à l'étape 4 | Titres et constats de ces missions |
| Compte créé : oui ou non | Lien vers le compte, e-mail |
| Coût de l'analyse | Adresse IP, cookie, jeton |

- Conservation : 25 mois `[ASSUMPTION]`, puis effacement par le même traitement que les brouillons.
- Administration : vue agrégée (étapes, abandons, activités, départements, période) et export ; aucune vue ligne à ligne filtrable par département et activité à la fois `[ASSUMPTION]`, pour éviter de reconnaître une entreprise.
- Texte à l'étape 1, sous le bouton : « Nous gardons une trace anonyme de votre visite pour améliorer BienDecider. » Même mention dans la page de confidentialité.

## 2. Mission : statuts et transitions

### 2.1 Statuts

| Code | Libellé | Sens |
| --- | --- | --- |
| `proposed` | À décider | Proposée par Paul ou créée par le dirigeant, jamais lancée |
| `active` | En cours | Lancée : la préparation est autorisée, pas la diffusion |
| `paused` | En pause | Suspendue ; aucune validation ni diffusion |
| `stopped` | Arrêtée | Close par la décision de suite ; définitive |
| `dismissed` | Écartée | Retirée du plan ; récupérable |

### 2.2 Transitions

| Transition | Depuis | Vers | Conditions (sinon message §14) | Effets |
| --- | --- | --- | --- | --- |
| Créer | — | À décider | Modèle du catalogue (§6.1) ; canal actif (M-67) et permis par le modèle (M-69), ou hors canal pour « Sur mesure » ; titre 5-80, résultat 5-120, constat 10-300, sans `<` ni `>` (M-20) ; plafond (§12) | Périmètre copié du modèle ; premier brouillon ; idée d'origine retirée ; J-01 |
| Lancer | À décider | En cours | Pas arrêtée (M-40), pas écartée (M-21) ; canal choisi (M-68) ; périmètre valide pour le modèle (§6.1) ; réactivation : ≥ 1 contact choisi (M-41) et confirmation des contacts (M-42) ; crédits ≥ 3 (M-15) | 3 crédits débités ; J-17 |
| Changer de canal | À décider, En cours, En pause | inchangé | Canal actif (M-67) et permis par le modèle (M-69) ; aucune version validée ni diffusée (M-19) | Nouvelle version du brouillon au format du canal ; J-29 |
| Reprendre | En pause | En cours | Mêmes conditions que Lancer, sans crédit | J-17 |
| Lancer une mission déjà en cours | En cours | En cours | — | Aucun effet (idempotent) |
| Mettre en pause | En cours | En pause | Statut En cours (M-43) | Programmations de ses contenus annulées ; J-18 |
| Écarter | À décider, En pause | Écartée | Pas En cours (M-22), pas Arrêtée (M-23) | Statut précédent mémorisé ; programmation annulée ; si c'était la priorité, priorité donnée à la première mission non écartée ; J-09 |
| Remettre au plan | Écartée | En pause si elle l'était, sinon À décider | Statut Écartée (M-24) | J-10 |
| Arrêter | En cours | Arrêtée | ≥ 1 diffusion (M-35) | Programmations annulées ; décision enregistrée ; J-14 |
| Poursuivre | En cours | En cours | ≥ 1 diffusion (M-35) ; bilan à jour (M-36) | Décision enregistrée ; J-14 |
| Modifier le résultat recherché | tout sauf Arrêtée | inchangé | 5-120 caractères (M-25) ; pas Arrêtée (M-26) | J-11 |
| Changer la priorité | tout sauf Écartée | inchangé | Pas Écartée (M-21) | J-08 ; aucune mission lancée |

Une mission « soldée » (Arrêter, Poursuivre) exige le statut En cours (M-34).

## 3. Étape d'une mission et prochain pas

### 3.1 Étape

Calculée dans cet ordre, à partir du contenu principal de la mission (pour une mission à plusieurs contenus, comme « Réponse aux avis », le premier contenu qui attend une action) :

1. Écartée → `écartée` ; Arrêtée → `close` ; pas En cours → `à lancer`.
2. Une diffusion est programmée → `programmée`.
3. La version courante a été diffusée (confirmée ou déclarée) :
   - bilan absent ou rattaché à un autre nombre de diffusions → `bilan` ;
   - décision absente ou rattachée à un autre nombre de diffusions → `décider` ;
   - sinon → `série suivante`.
4. La version courante est validée :
   - délégation « Préparer seulement », ou mission « Sur mesure » hors canal → `diffuser soi-même` ;
   - canal connecté → `diffuser` ; sinon → `connecter`.
5. Sinon → `valider`.

### 3.2 Suivi en six temps

Cadrer, Préparer, Valider, Diffuser, Faire le bilan, Décider. Temps courant selon l'étape : `à lancer` = Cadrer ; `valider` = Valider ; `connecter`, `diffuser`, `diffuser soi-même`, `programmée` = Diffuser ; `bilan` = Faire le bilan ; `décider` = Décider ; `série suivante` = tout fait. Les temps précédents sont cochés.

### 3.3 Prochain pas

1. Ordre des missions : la priorité, puis les autres dans l'ordre du plan.
2. Première mission dont l'étape attend le dirigeant : `valider`, `connecter`, `diffuser`, `diffuser soi-même`, `bilan`, `décider`.
3. À défaut, première mission `à lancer`.
4. À défaut, première mission ni close ni écartée.
5. À défaut, état « Aucune mission en cours ».

| Étape | Titre | Détail | Bouton |
| --- | --- | --- | --- |
| à lancer | Examiner « {mission} » | {résultat recherché}. | Examiner cette mission → détail |
| valider | Relire et valider le contenu | {mission} · V{n} attend votre accord. Valider n'envoie rien. | Ouvrir l'atelier |
| connecter | Connecter {canal} | Le contenu est validé. Il manque seulement le canal de diffusion (aucun envoi à cette étape). | Connecter {canal} |
| diffuser | Confirmer l'envoi / Confirmer la publication | {mission} · V{n} est validée et {canal} est connecté. Rien ne part sans votre confirmation. | Ouvrir l'atelier |
| diffuser soi-même | Diffuser vous-même | {mission} · V{n} est validée. Récupérez le texte, diffusez-le, puis déclarez-le. | Ouvrir l'atelier |
| programmée | Diffusion programmée | Rien à faire pour l'instant. Vous pouvez encore l'annuler dans l'atelier. | Voir la programmation |
| bilan | Renseigner le bilan | {mission} : notez les réponses reçues. Sans bilan, impossible de décider de la suite. | Renseigner mon bilan |
| décider | Décider de la suite | {mission} : poursuivre, adapter avec Paul ou arrêter, au regard de votre bilan. | Décider la suite |
| série suivante | Préparer la série suivante | Vous avez décidé de poursuivre : une nouvelle version du contenu démarre un nouveau cycle. | Ouvrir l'atelier |
| aucune | Aucune mission en cours | Toutes vos missions sont closes ou écartées. Explorez une nouvelle idée avec Paul pour lancer un prochain test. | Explorer une idée |

## 4. Contenus et versions

### 4.1 Définitions

- **Version courante** : la dernière créée.
- **Validée** : le contenu porte le numéro de la version validée ; elle est validée si ce numéro est celui de la version courante.
- **Diffusée** : il existe une diffusion (confirmée ou déclarée) pour ce contenu et ce numéro de version.
- Une version garde : titre ou objet, texte, accroche, composition, photo, logo, couleurs, ton, nom de l'entreprise, auteur (vous, Paul, système), note, date.

### 4.2 Lecture seule

Le formulaire de retouche est désactivé si : une ancienne version est affichée, une diffusion est programmée, la version courante est diffusée, ou la mission est arrêtée ou écartée.

### 4.3 Créer une version

| Règle | Message si refus |
| --- | --- |
| Mission ni arrêtée ni écartée | M-44 |
| Aucune programmation | M-45 |
| Version courante non diffusée, sauf « Créer V(n+1) à partir de Vn » | M-46 |
| Retouches non enregistrées : pas de nouvelle version par Paul tant qu'elles existent | M-60 |
| Par Paul : 1 crédit | M-15 |

Effets : nouvelle version ; validation retirée ; droits retirés ; « profil à relire » levé ; compteur de retouches du dirigeant incrémenté s'il en est l'auteur ; J-19.

Notes par défaut : « Retouche directe par vous », « Préparée avec Paul : {variante} », « Nouvelle version créée à partir de V{n}, déjà diffusée ».

### 4.4 Valider une version

Conditions, dans cet ordre :

| # | Condition | Message |
| --- | --- | --- |
| 1 | La version vue est la version courante | M-02 |
| 2 | Mission En cours | M-47 |
| 3 | Profil relu depuis son dernier changement | M-48 |
| 4 | E-mail : au moins un destinataire | M-49 |
| 5 | Réactivation : contacts confirmés | M-50 |
| 6 | Visuel : marque confirmée et droits cochés | M-51 |
| 7 | Contraintes du canal respectées (§5.6) | M-65, M-66 |
| 8 | Pas déjà programmée | M-52 |
| 9 | Pas déjà diffusée | M-53 |
| 10 | « J'ai relu » coché | (case obligatoire) |
| 11 | Aucune retouche non enregistrée | M-60 |

Effets : numéro validé = courant ; droits enregistrés ; compteur de validations ; J-20.

### 4.5 Effets transverses sur les contenus

| Déclencheur | Contenus touchés | Effet |
| --- | --- | --- |
| Profil modifié après l'inscription | tous | Nouvelle version « Profil corrigé : informations du contenu à vérifier » par le système ; validation et programmation annulées ; « profil à relire » ; J-02 |
| Marque modifiée | visuels | Refusé si un visuel est programmé (M-27) ; nouvelle version « Kit de marque actualisé » ; validation retirée ; J-05 |
| Logo ajouté ou retiré | visuels | Refusé si un visuel est programmé (M-28) ; nouvelle version « Logo ajouté par vous » ou « Logo retiré par vous » ; validation retirée ; J-06 |
| Agences ou contacts modifiés sur une mission En cours ou un contenu validé | contenu de la mission | Nouvelle version « Destinataires modifiés » ; validation et droits retirés |
| Réalisation changée | contenu de la mission | Si validé ou mission En cours : nouvelle version « Réalisation changée : {réalisation} », validation et droits retirés ; sinon mise à jour du brouillon |
| Liste de contacts importée | contenus de réactivation | Validation retirée ; sélection refaite (8 plus récents recontactables) ; confirmation retirée |

## 5. Diffusion

### 5.1 Contrôles, dans cet ordre

| # | Condition | Message |
| --- | --- | --- |
| 1 | La version vue est la version courante | M-02 |
| 2 | Adresse e-mail du compte vérifiée | M-54 |
| 3 | Délégation autre que « Préparer seulement » | M-55 |
| 4 | Mission En cours | M-56 |
| 5 | Canal actif (§5.6) et connecté | M-67, M-57 |
| 6 | Version courante validée | M-58 |
| 7 | Pas de programmation existante | M-59 |
| 8 | Version non diffusée | M-53 |
| 9 | E-mail : au moins un destinataire | M-49 |
| 10 | Programmation : date et heure futures | M-61 |
| 11 | Case « Je confirme cette version, cette destination et ce moment » cochée | (case obligatoire) |
| 12 | Aucune retouche non enregistrée | M-60 |

### 5.2 Effets

- **Maintenant** : diffusion envoyée au canal ; enregistrée avec date, canal, version, titre, nombre de destinataires, mode « confirmée » ; résultat succès, échec ou incertain (FR-38) ; J-22.
- **Programmer** : date (UTC) et fuseau enregistrés ; J-21. À l'heure prévue, l'ordonnanceur rejoue les contrôles 2 à 9 ; si l'un échoue, la programmation est annulée, journalisée (J-23) et signalée dans « À valider par vous ».
- E-mail : un envoi par destinataire.
- Site vitrine : la page est mise en ligne à son adresse publique ; une diffusion suivante la remplace, l'ancienne version reste dans l'historique.
- Réponse à un avis : la réponse est publiée sous l'avis ; la diffusion garde la référence de l'avis.
- Une diffusion réussie ou déclarée passe la version en lecture seule.

### 5.3 Annulations

| Déclencheur | Programmations annulées | Message préalable |
| --- | --- | --- |
| Annuler la programmation | celle du contenu | « Annuler cette programmation ? Le contenu restera validé. » |
| Mettre la mission en pause | celles de la mission | « Les programmations de cette mission seront annulées. » |
| Écarter la mission | celle du contenu | — |
| Arrêter la mission | celles de la mission | « Arrêter clôt la mission et annule ses programmations. » |
| Déconnecter un canal | celles du canal | Liste des contenus concernés |
| Passer en « Préparer seulement » | toutes | « Passer en préparation seule annule les programmations. » |
| Profil modifié | toutes | « Changer le nom ou une information crée de nouvelles versions à valider et annule les programmations existantes. » |

### 5.4 Diffusion déclarée (FR-37)

- Elle sert en « Préparer seulement », pour un canal que le dirigeant préfère ne pas connecter, et pour une mission « Sur mesure » menée hors canal (§6.1).
- Conditions : mission En cours ; version courante validée ; pas de programmation ; version non diffusée.
- Saisie : canal, date (passée ou présente), « Je confirme avoir diffusé cette version ».
- Effets : diffusion enregistrée en mode « déclarée » ; lecture seule ; J-24.

### 5.5 Résultat incertain

- Le canal n'a pas confirmé : état « Résultat incertain », la version n'est ni diffusée ni rediffusable.
- Le dirigeant vérifie sur le canal puis choisit « C'est bien parti » (diffusion enregistrée) ou « Ce n'est pas parti » (la version reste validée, une nouvelle diffusion est possible) ; J-25.

### 5.6 Canaux

`[DÉCISION D4]` Tous les canaux sont conservés, et BienDecider diffuse sur chacun après confirmation. Les connecteurs de tous les canaux sont un **prérequis de l'ouverture**. Si l'ouverture est décidée avant, un canal dont le connecteur n'est pas développé est **désactivé**.

| Canal | Choisi à la connexion | Connecteur au 4 novembre 2026 | Contraintes contrôlées à la validation |
| --- | --- | --- | --- |
| Facebook | Page | Livré ; comptes testeurs tant que l'application n'est pas approuvée (#302) | Texte ; visuel facultatif |
| Instagram | Compte professionnel | À développer ; accès en attente (#300) | Visuel obligatoire (M-65) ; légende de 2 200 caractères au plus (M-66) `[ASSUMPTION]` |
| LinkedIn | Profil ou Page | À développer ; accès en attente (#149, #152) | Texte de 3 000 caractères au plus (M-66) `[ASSUMPTION]` |
| Fiche Google | Établissement | À développer ; accès en attente (#13 à #15) | Post de 1 500 caractères au plus (M-66) `[ASSUMPTION]` ; réponse rattachée à un avis |
| Gmail | Compte d'envoi | Livré ; comptes testeurs tant que l'application n'est pas vérifiée (#302) | Au moins un destinataire (M-49) ; objet de 100 caractères au plus |
| Site vitrine | Adresse publique de l'entreprise sur BienDecider | Livré | Page complète (titre, textes, photos dont les droits sont confirmés) |

**Canal désactivé.** L'activation de chaque canal vient d'une source unique (`channel-capabilities.ts`) ; un canal devient actif quand son connecteur est livré, jamais avant. Un canal désactivé :
- n'apparaît pas dans Entreprise › Canaux & délégation et ne se connecte pas ;
- n'est pas proposé au choix du canal d'une mission (M-67), ni par Paul ;
- retire du catalogue un modèle dont aucun autre canal n'est actif (§6.1).

Un canal désactivé alors qu'une mission l'utilise encore (connecteur retiré, autorisation perdue) : ses programmations sont annulées (J-23) et ses contenus restent ; le dirigeant peut diffuser lui-même et le déclarer (§5.4) `[ASSUMPTION]`.

- Les limites marquées `[ASSUMPTION]` sont vérifiées auprès du fournisseur dans la story du connecteur.
- Le site de l'entreprise n'est pas un canal : il est lu pour l'analyse (§1.3).

## 6. Périmètre et contacts

### 6.1 Catalogue et périmètre par modèle

`[DÉCISION D9]` Le catalogue est ouvert : tout type d'action que la production sait exécuter y a son modèle. Les trois premiers viennent de la maquette ; les règles des suivants sont proposées.

| Modèle | Canal | Contenu | Périmètre (bornes) | Règle d'arrêt | Message |
| --- | --- | --- | --- | --- | --- |
| Partenariats | Gmail | E-mail individuel, sans relance automatique | 1 ou 2 agences de la liste, sans doublon | Refus clair ou 30 jours sans réponse | M-30 |
| Réactivation `[DÉCISION D5]` | Gmail | E-mail individuel qui propose de ne plus être recontacté | 1 à 8 contacts recontactables, sans doublon | 30 jours | M-31 |
| Réalisation | Facebook, Instagram ou LinkedIn | Publication avec visuel | Exactement 1 réalisation de la liste | Bilan à J+7 ; pas de deuxième réalisation sans ce bilan | M-32 |
| Publication | Facebook, Instagram ou LinkedIn | Publication (actualité, offre, conseil) | 1 sujet, 5 à 120 caractères | Bilan à J+7 `[ASSUMPTION]` | M-17 |
| Fiche Google à jour | Fiche Google | Informations de la fiche ou post Google | L'établissement de l'entreprise | Bilan à J+30 `[ASSUMPTION]` | — |
| Réponse aux avis | Fiche Google | Une réponse par avis (un contenu par avis) | 1 à 5 avis sans réponse, lus sur la fiche ou collés par le dirigeant `[ASSUMPTION]` | Toutes les réponses diffusées, puis bilan à J+30 `[ASSUMPTION]` | M-64 |
| Page du site vitrine | Site vitrine | Page (titre, textes, photos) | 1 page | Bilan à J+30 `[ASSUMPTION]` | — |
| Sur mesure | Un canal actif, ou hors canal (action menée par le dirigeant : salon, appel, prospectus…), en diffusion déclarée | Texte, visuel facultatif | Décrit au cadrage, 10 à 300 caractères | Fixée au cadrage, 7 à 90 jours | M-18 |

- « Sur mesure » reçoit toute demande qu'aucun autre modèle ne couvre (confirmé par les PF le 4 novembre 2026).
- Une mission vise un seul canal `[ASSUMPTION]`, choisi parmi les canaux **actifs** de son modèle (M-67, M-68, M-69) ; il est figé dès qu'une version est validée (M-19).
- Un modèle dont aucun canal n'est actif n'est proposé ni à la création, ni par Paul (§5.6).
- Le lancement coûte 3 crédits pour tout modèle `[ASSUMPTION]` (§8).
- Un nouveau modèle s'ajoute avec ses règles et ses tests, sans changer les règles communes (statuts, versions, validation, diffusion, bilan).
- Modifier la sélection de contacts retire la confirmation des contacts.

### 6.2 Verrouillage

| Situation | Message |
| --- | --- |
| Mission écartée | « Mission écartée du plan : remettez-la d'abord au plan. » |
| Mission arrêtée | « Mission arrêtée : le périmètre est figé. » |
| Diffusion programmée | « Une diffusion est programmée : annulez-la avant de modifier le périmètre. » |
| Version courante diffusée | « Ce contenu a déjà été diffusé : le périmètre est figé. Créez une nouvelle version dans l'atelier pour repartir sur un autre périmètre. » |

### 6.3 Résumé de périmètre

- Partenariats : « {agence 1} et {agence 2} » ou « Aucune agence choisie ».
- Réactivation : « {n} contact(s) sur {total} importés (ou déclarés) ({m} recontactables) ».
- Réalisation : titre de la réalisation.
- Publication : le sujet.
- Fiche Google à jour : « Votre fiche Google ».
- Réponse aux avis : « {n} avis sans réponse » ou « Aucun avis choisi ».
- Page du site vitrine : titre de la page.
- Sur mesure : le périmètre décrit au cadrage.

### 6.4 Contacts

- **Recontactable** : accord « oui » et dernier échange de 24 mois au plus. Raisons affichées sinon : « S'est opposé au recontact », « Accord de recontact inconnu », « Dernier échange il y a {n} mois (limite 24) ».
- Tri des recontactables : du plus récent au plus ancien.
- **Import** : en-tête obligatoire `prenom;nom;email;mois_depuis_dernier_contact;recontact` (ou séparateur `,`) ; 200 lignes au plus ; e-mail valide ; nom nettoyé (sans caractère de contrôle ni `<` `>`, 60 caractères) ; ancienneté entière de 0 à 240 ; accord inconnu si la valeur n'est pas oui, non ou inconnu. Messages M-70 à M-74.
- L'import est refusé si une mission de réactivation a son périmètre verrouillé (§6.2).

## 7. Bilan et décision

### 7.1 Bilan

| Règle | Message |
| --- | --- |
| ≥ 1 diffusion de la mission | M-37 |
| Demandes qualifiées et rendez-vous renseignés | M-38 |
| Entiers de 0 à 100 000 000 | M-39 |
| Rendez-vous ≤ demandes | M-33 (affiché aussi en direct pendant la saisie) |
| CA signé facultatif, vide ≠ 0 | — |
| Note de 600 caractères au plus | — |

Le bilan enregistre le nombre de diffusions de la mission au moment de la saisie. Il est « à jour » tant que ce nombre n'a pas changé. Effet : J-15.

### 7.2 Décision de suite

- « Poursuivre » : désactivé sans bilan à jour, avec « Sans bilan, Paul ne peut pas comparer au résultat recherché : “Poursuivre” reste indisponible. » et un lien vers le bilan.
- « Adapter avec Paul » : ouvre la conversation de la mission ; aucune écriture.
- « Arrêter la mission » : statut Arrêtée.
- La décision enregistre le nombre de diffusions ; elle est « à jour » tant que ce nombre n'a pas changé.

### 7.3 Lecture du bilan (« Ce que Paul apprend »)

| Rubrique | Contenu |
| --- | --- |
| Observé | Les chiffres déclarés : demandes, rendez-vous, CA s'il est connu. |
| Ce que cela suggère | Comparaison au résultat recherché de la mission : atteint, partiellement atteint, non atteint, ou impossible à juger si le résultat recherché n'est pas mesurable (Paul le dit et propose de le préciser). |
| Ce que cela ne prouve pas | Toujours : l'attribution est déclarative ; la répétabilité n'est pas établie. |
| Impact sur le plan | Une proposition de Paul (poursuivre dans les mêmes limites, réduire, arrêter, tester une autre piste), jamais appliquée sans confirmation, jamais un élargissement du périmètre. |

## 8. Crédits

`[DÉCISION D1]`

| Événement | Crédits |
| --- | --- |
| Création du compte | +20 |
| Création d'une mission | 0 |
| Premier lancement d'une mission | −3 |
| Reprise après pause | 0 |
| Version préparée avec Paul | −1 |
| Retouche, validation, diffusion, bilan, décision | 0 |

- Le débit et la transition qui le provoque sont enregistrés ensemble, ou pas du tout.
- Historique : date, libellé (« Lancement de la mission « {mission} » », « Version préparée avec Paul »), variation.
- Crédits insuffisants : M-15, dialogue de lancement avec le bouton désactivé et « Recharger mes crédits » remplacé, pendant le PoC, par « Écrivez-nous » (adresse du support).

## 9. Délégation

| Niveau | Préparation | Validation | Diffusion |
| --- | --- | --- | --- |
| Préparer seulement | Paul prépare dans les missions en cours | Exigée | Par le dirigeant, déclarée (§5.4) ; « Récupérer le texte » remplace « Préparer l'envoi » |
| Valider avant chaque action (défaut, « Conseillé pour démarrer ») | Paul prépare dans les missions en cours | Exigée | Confirmée à chaque fois |
| Déléguer dans un cadre précis | Analyses et brouillons sans demande, dans les missions en cours | Exigée | Confirmée ; premiers contacts et dépenses aussi |

Changer de niveau : J-26 ; passer à « Préparer seulement » annule toutes les programmations.

## 10. Marque, logo, photo

| Élément | Règle |
| --- | --- |
| Couleurs | Principale et accent, couleurs hexadécimales |
| Ton | Clair, concret, rassurant · Chaleureux et accessible · Précis et expert |
| Confirmation | Case obligatoire pour enregistrer ; une marque non confirmée bloque la validation des visuels (M-51) |
| Logo | PNG, JPEG ou WebP ; 500 Ko au plus (M-29) |
| Photo d'un visuel | JPG, PNG ou WebP ; 1 Mo au plus |
| Compositions | « Photo & signature », « Cadre éditorial » |
| Accroche | Taille réduite jusqu'à tenir au-dessus de la signature, 12 px au moins |
| Origine affichée | Palette : site ou proposition sans source · Signature : proposition · Logo : importé par vous ou aucun · Photo : importée par vous ou réalisation |

## 11. Ambition

| Élément | Lecture | Bornes | Hors bornes |
| --- | --- | --- | --- |
| Texte | Conservé tel quel | 10 à 600 caractères | M-06 |
| Gain | Pourcentage de CA (ou doublement = 100 %) | 1 à 50 % | Gardé dans le texte, non converti ; note de Paul |
| Horizon | Mois, années, « cette année », semestre, trimestre | 3 à 36 mois | Gardé dans le texte ; note de Paul |
| Budget média | « sans budget » = 0 ; montant en € par mois | 0 à 2 000 €/mois | Ramené au maximum |
| Recrutement | « sans embaucher » = non ; « embaucher », « recruter » = possible | — | « Recrutement non précisé : aucune embauche supposée » |

- Paul affiche : « Voici ce que je comprends. {reformulation}. », la liste des éléments trouvés, ses notes, puis « Pour affiner, vous pouvez préciser : » avec une question par élément manquant (gain, horizon).
- « C'est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment. »
- Libellé court du cap : le texte ; à défaut « +{gain} % de chiffre d'affaires en {horizon} mois » ; à défaut « Cap à définir avec Paul ».
- En production, la reformulation est faite par l'IA ; les bornes ci-dessus sont vérifiées côté serveur avant enregistrement (M-16).

## 12. Saisies et plafonds

| Champ | Bornes |
| --- | --- |
| Prénom | 1 à 40 caractères |
| Nom de l'entreprise, localisation | 1 à 100 caractères |
| Activité, zone, clients, offres | 1 à 100 caractères |
| Site | facultatif ; `http://` ou `https://` |
| E-mail | 120 caractères ; format valide |
| Mot de passe | 8 à 128 caractères ; confirmation identique |
| Ambition | 10 à 600 caractères |
| Titre de mission | 5 à 80 caractères |
| Résultat recherché | 5 à 120 caractères |
| Constat d'une mission créée | 10 à 300 caractères |
| Sujet d'une publication | 5 à 120 caractères |
| Périmètre d'une mission sur mesure | 10 à 300 caractères ; règle d'arrêt de 7 à 90 jours |
| Idée | 1 à 200 caractères ; 10 idées au plus |
| Missions créées par le dirigeant | `[ASSUMPTION]` 10 non arrêtées à la fois |
| Accroche ou objet | 1 à 100 caractères |
| Texte d'un contenu | 1 à 3 000 caractères |
| Note de bilan | 600 caractères |
| Message à Paul | 1 200 caractères |
| Avis | note de 1 à 5 ; commentaire de 600 caractères |
| Contacts importés | 200 au plus par fichier |
| Conversation de Paul | 60 derniers messages conservés par contexte, 40 affichés |

Aucun champ libre n'accepte de balise HTML ; tout texte affiché est échappé.

## 13. Écrans

### 13.1 Stratégie

| Bloc | Contenu | Actions |
| --- | --- | --- |
| En-tête | « VOTRE STRATÉGIE AVEC PAUL », « Bonjour {prénom}. », « Votre stratégie relie votre ambition, les constats, les missions et les apprentissages. » | Challenger le plan · Créer une mission |
| Votre prochaine décision | §3.3 ; Pourquoi maintenant · Preuve utilisée · À vérifier ; mission et résultat recherché | Bouton du prochain pas · Challenger avec Paul |
| Ce que Paul apprend | §7.3, pour la mission du prochain pas si elle a un bilan | Voir le bilan |
| À valider par vous | Contenus prêts ou validés des missions en cours ; programmations ; marque à confirmer ; état des connexions | Examiner · Gérer · Confirmer ma marque · Gérer les connexions |
| Vos missions regroupées | En-têtes « 1 · Ce que nous avons observé », « 2 · Ce que Paul en déduit », « 3 · La mission qui en découle » ; une ligne par mission, puis les idées | Voir la source · Examiner et lancer · Affiner avec Paul · Modifier l'objectif · Écarter · Remettre au plan · Cadrer avec Paul · Retirer l'idée |

### 13.2 Missions

| Vue | Contenu | Actions |
| --- | --- | --- |
| Liste | « Des missions, pas une liste de tâches. » ; filtres FR-19 ; cartes (statut, priorité, titre, preuve, périmètre, étape, suivi en six temps, résultat) ; rappel de délégation et du budget ; idées à cadrer | Créer une mission avec Paul · Examiner et lancer · Affiner avec Paul · Modifier l'objectif · Écarter · Remettre au plan |
| Détail | Statut, « Paul coordonne », titre, résultat ; périmètre et étape ; suivi ; « Pourquoi cette mission ? » ; « Ce que vous choisissez » (§6) ; « Les actions de la mission » (5 actions, « n / 5 étapes ») ; « Notre contrat de mission » ; « Comment Paul vous accompagne » | Confirmer et lancer · Reprendre la mission · Mettre en pause · Ajuster avec Paul · Modifier l'objectif · Écarter du plan · Remettre au plan · Enregistrer le périmètre |
| Nouvelle mission | « Cadrons votre nouvelle mission. » ; constat, nom, modèle (tout le catalogue, §6.1), canal, résultat recherché ; « La création ne consomme aucun crédit et n'autorise aucun envoi. » | Créer la mission · En discuter avec Paul |

Les cinq actions d'une mission : 1 Confirmer le périmètre ; 2 Préparer une première proposition ; 3 Relire et valider la version ; 4 Diffuser sur le canal de la mission (publier, envoyer, mettre en ligne, ou diffuser soi-même et le déclarer) ; 5 Faire le bilan, puis décider la suite.

### 13.3 Atelier

| Zone | Contenu | Actions |
| --- | --- | --- |
| En-tête | « L'atelier », « Un contenu lié à une mission, une marque et une version précise. » | Retour à la mission |
| Barre | Sélecteur de contenu ; badge « V{n} · courante » ou « · archive » ; badge d'état | — |
| Aperçu | Canal et format, aperçu propre au canal (§5.6) ; bascule « Publication » / « Visuel seul » (visuel) ou « Aperçu destinataire » (e-mail) ; avis cité au-dessus d'une réponse | Copier le texte |
| Décision | Titre et texte selon l'état (mission non active, archive, diffusée, programmée, à valider, validée) | Valider cette version · Préparer la publication ou l'envoi · Récupérer le texte · J'ai diffusé moi-même · Annuler la programmation · Créer V(n+1) · Voir le suivi · Je ne veux pas de cette version |
| Historique | Versions de la plus récente à la plus ancienne : auteur, note, état | Voir |
| Colonne | « Une décision, une version. » ; consigne de création en une phrase ; « Texte & composition » (formulaire) ; « Cadre de diffusion » (canal, délégation, destinataires ou réalisation, marque) | Retravailler avec Paul · Importer une photo · Ma marque · Enregistrer une nouvelle version · Connecter · Modifier les destinataires · Changer de réalisation |

### 13.4 Résultats

| Bloc | Contenu | Actions |
| --- | --- | --- |
| En-tête | « L'activité n'est pas le résultat. » | Renseigner mon bilan |
| Indicateurs | Diffusions (et programmations en attente), demandes qualifiées, CA signé | — |
| Résultats par mission | Tableau FR-49 ; état vide « Aucune mission lancée. » | Renseigner le bilan · Décider la suite · Voir les missions |
| La diffusion et son suivi | Programmations et diffusions (canal, version, date, destinataires, confirmée ou déclarée) ; état vide « Rien n'a encore été diffusé. » | Gérer · Voir |
| Le point de Paul | Synthèse des bilans ; notes ; prochain point daté | Préparer le bilan avec Paul · Revoir les missions |
| Décisions & traçabilité | Journal (§15), 12 dernières entrées, puis « Tout le journal » | — |

### 13.5 Entreprise

| Onglet | Contenu | Actions |
| --- | --- | --- |
| Diagnostic & positionnement | FR-51 ; repères (ambition, localisation, zone, clients) ; consigne durable et retours retenus | Corriger mon profil · Voir les constats et les missions · Affiner avec Paul · Questionner avec Paul · Modifier avec Paul |
| Ma marque | Aperçu de marque, origine des éléments, règles à préserver, logo, kit | Ajouter, remplacer ou retirer le logo · Enregistrer ma marque · Voir le rendu dans l'atelier |
| Canaux & délégation | Canaux actifs (§5.6) : Facebook (Page), Instagram (compte), LinkedIn (profil ou Page), fiche Google (établissement), Gmail (compte d'envoi), site vitrine (adresse publique) ; pour chacun : état de connexion, programmations liées ; site de l'entreprise (lecture, pour l'analyse) ; niveaux de délégation | Connecter · Déconnecter · Voir mon site vitrine · Enregistrer les règles |

### 13.6 Mon compte

| Bloc | Contenu | Actions |
| --- | --- | --- |
| Crédits | Solde, barème (§8), historique des 8 derniers mouvements | (pas de recharge pendant le PoC) |
| Identité | Prénom, e-mail, entreprise | Corriger mon profil |
| Vos données | Où elles sont, comment les exporter et les effacer | Exporter mes données · Supprimer mon compte |
| Session | — | Se déconnecter |

### 13.7 Dialogues

| Titre | Contenu clé | Boutons |
| --- | --- | --- |
| Confirmer le cadre de la mission | Résultat, canal, périmètre, coût et solde, 0 € de dépense, règle d'arrêt ; case contacts (réactivation) | Confirmer le lancement |
| Mettre cette mission en pause ? | Programmations annulées, diffusions conservées | Garder en cours · Confirmer la pause |
| Écarter cette mission du plan ? | Rien n'est effacé ; elle reste sous « Écartées » | Garder au plan · Écarter |
| Modifier l'objectif de la mission | Résultat recherché ; objectif d'origine | Y revenir · Enregistrer l'objectif |
| Valider la version V{n} | Cette validation ne publie ni n'envoie rien ; droits (visuel) ou destinataires (e-mail) ; « J'ai relu » | Valider sans diffuser |
| Confirmer la diffusion / Confirmer l'envoi | Version, destination, Maintenant / Programmer, date | Confirmer |
| Le canal n'est pas encore connecté | La connexion et l'autorisation de diffusion sont séparées | Connecter {canal} |
| Connecter {canal} | Choix de la Page ou du compte, après l'autorisation du fournisseur | Confirmer la connexion |
| Déconnecter {canal} ? | Programmations annulées listées ; contenus et validations conservés | Annuler · Déconnecter |
| Annuler cette programmation ? | Le contenu reste validé | Conserver · Annuler la programmation |
| J'ai diffusé moi-même | Canal, date, confirmation | Déclarer la diffusion |
| Vérifier le résultat | Le canal n'a pas confirmé | C'est bien parti · Ce n'est pas parti |
| Je ne veux pas de cette version | Motif obligatoire | Refuser cette version |
| Votre bilan commercial | §7.1 | Enregistrer le bilan |
| Décider la suite de la mission | Résultat, bilan, règle d'arrêt | Poursuivre · Adapter avec Paul · Arrêter la mission |
| Importer un fichier de contacts | Colonnes attendues, règles de contrôle, cadre RGPD | Choisir un fichier · Télécharger le modèle |
| Contrôle du fichier | Compteurs §6.4 ; lignes ignorées | Annuler · Importer |
| {Titre de la source} | Type de constat, contenu, origine, date, incertitude | Questionner ce constat |
| Corriger mon entreprise | Profil complet ; effets sur les contenus | Enregistrer les corrections |
| Modifier mon ambition | §11 | Demander à Paul de comprendre · C'est bien ça |
| Retrouver mon compte | E-mail, mot de passe, lien de récupération | Se connecter |
| Laisser un avis | Note, commentaire, page d'origine ; sert aussi à « Dire ce qui ne va pas » (#275) | Envoyer mon avis |

Tout dialogue se ferme par Échap ou le bouton de fermeture ; une navigation le ferme.

## 14. Messages

| Code | Message |
| --- | --- |
| M-01 | Indiquez votre prénom. |
| M-02 | Cette version a changé. Réexaminez le contenu avant de confirmer. |
| M-03 | Renseignez le nom de votre entreprise. / Indiquez la localisation de votre entreprise. |
| M-04 | Utilisez une adresse commençant par https:// ou http://. |
| M-05 | Complétez chaque information avant de confirmer. |
| M-06 | Décrivez votre ambition en une ou deux phrases (10 caractères au moins). |
| M-07 | Confirmez votre profil et votre ambition avant le diagnostic. |
| M-08 | Consultez d'abord le résumé du diagnostic. |
| M-09 | Indiquez votre prénom pour que Paul puisse vous parler. |
| M-10 | Consultez le diagnostic, puis confirmez « Ça m'intéresse » avant de créer votre compte. |
| M-11 | Indiquez une adresse e-mail valide. |
| M-12 | Le mot de passe doit contenir au moins 8 caractères. |
| M-13 | Les deux mots de passe ne correspondent pas. |
| M-14 | Cette adresse a déjà un compte. Retrouvez-le avec la connexion. |
| M-15 | Crédits insuffisants : il en faut {n}, il vous en reste {m}. |
| M-16 | {Élément} doit être compris entre {min} et {max} {unité}. |
| M-17 | Précisez le sujet de la publication (5 à 120 caractères). |
| M-18 | Décrivez le périmètre (10 à 300 caractères) et fixez une règle d'arrêt entre 7 et 90 jours. |
| M-19 | Le canal est figé dès qu'une version est validée. Créez une nouvelle mission pour un autre canal. |
| M-20 | Précisez le titre (5 à 80 caractères), le résultat (5 à 120) et le constat (10 à 300), sans balise HTML. |
| M-21 | Cette mission est écartée : remettez-la d'abord au plan. |
| M-22 | Cette mission est en cours : mettez-la en pause avant de l'écarter. |
| M-23 | Cette mission est arrêtée : elle reste dans l'historique. |
| M-24 | Cette mission n'est pas écartée. |
| M-25 | Décrivez le résultat recherché en 5 à 120 caractères. |
| M-26 | Cette mission est arrêtée : son objectif est figé. |
| M-27 | Annulez la programmation avant de modifier la marque. |
| M-28 | Annulez la programmation avant de modifier le logo. |
| M-29 | Le logo doit être un PNG, un JPG ou un WebP de 500 Ko au plus. |
| M-30 | Choisissez 1 ou 2 agences. |
| M-31 | Choisissez de 1 à 8 contacts recontactables. |
| M-32 | Réalisation inconnue. |
| M-33 | Vous ne pouvez pas avoir plus de rendez-vous que de demandes qualifiées. Vérifiez vos chiffres. |
| M-34 | Seule une mission en cours peut être soldée. |
| M-35 | Faites d'abord une première diffusion : sans retour, il n'y a rien à juger. |
| M-36 | Renseignez d'abord le bilan de cette mission : poursuivre sans chiffres n'a pas de sens. |
| M-37 | Faites d'abord une première diffusion de cette mission : sans envoi, il n'y a rien à mesurer. |
| M-38 | Renseignez les demandes qualifiées et les rendez-vous (0 s'il n'y en a aucun). |
| M-39 | Utilisez des nombres entiers positifs, sans décimale. |
| M-40 | Cette mission est arrêtée. Proposez un nouveau test à Paul. |
| M-41 | Choisissez d'abord au moins un contact recontactable. |
| M-42 | Confirmez la pertinence et le droit de recontact des destinataires. |
| M-43 | Seule une mission en cours peut être mise en pause. |
| M-44 | La mission est arrêtée ou écartée. Son contenu reste en lecture seule. |
| M-45 | Annulez la programmation avant de retravailler cette version. |
| M-46 | V{n} a été diffusée : elle est en lecture seule. Créez une nouvelle version pour la modifier. |
| M-47 | Lancez ou reprenez la mission avant de valider son contenu. |
| M-48 | Le profil a changé. Relisez le texte et enregistrez une nouvelle version avant validation. |
| M-49 | Aucun destinataire dans le périmètre de cette mission. |
| M-50 | Confirmez d'abord la pertinence et le droit de recontact des contacts. |
| M-51 | Confirmez la marque et les droits du visuel avant validation. |
| M-52 | Cette version est déjà programmée. |
| M-53 | Cette version est déjà diffusée. |
| M-54 | Confirmez votre adresse e-mail avant toute diffusion. |
| M-55 | Votre règle autorise uniquement la préparation. Diffusez vous-même ou modifiez les règles. |
| M-56 | La mission doit être en cours. |
| M-57 | Connectez le canal de destination avant de poursuivre. |
| M-58 | Validez la version courante avant de poursuivre. |
| M-59 | Une programmation existe déjà pour cette version. |
| M-60 | Enregistrez vos retouches dans une nouvelle version avant cette décision. |
| M-61 | Choisissez une date et une heure futures. |
| M-62 | Décrivez votre idée en une phrase. |
| M-63 | 10 idées au maximum : retirez-en une avant d'en noter une autre. |
| M-64 | Choisissez de 1 à 5 avis sans réponse. |
| M-65 | Ajoutez un visuel : {canal} ne publie pas sans image. |
| M-66 | Ce texte dépasse {n} caractères, la limite de {canal}. Raccourcissez-le dans une nouvelle version. |
| M-67 | {Canal} n'est pas disponible pour le moment. Choisissez un autre canal. |
| M-68 | Choisissez le canal de la mission. |
| M-69 | Ce canal n'est pas proposé pour ce modèle de mission. |
| M-70 | Le fichier est vide ou ne contient que l'en-tête. |
| M-71 | 200 contacts au maximum par fichier. |
| M-72 | Colonnes attendues, dans cet ordre : prenom;nom;email;mois_depuis_dernier_contact;recontact. |
| M-73 | Ligne {n} ignorée : nom, e-mail ou ancienneté invalide. |
| M-74 | Aucune ligne exploitable dans ce fichier. |

## 15. Journal

| Code | Texte | Auteur |
| --- | --- | --- |
| J-01 | Mission créée avec Paul : {titre}. Périmètre et brouillon à vérifier avant lancement. | vous |
| J-02 | Profil corrigé. Les contenus doivent être relus et les programmations ont été annulées. | vous |
| J-03 | Cap mis à jour avec Paul : {cap}. | vous |
| J-04 | Profil et ambition confirmés. Aucune mission lancée. | vous |
| J-05 | Identité de marque confirmée. Le visuel doit être validé à nouveau. | vous |
| J-06 | Logo ajouté (ou retiré). Le visuel doit être validé à nouveau. | vous |
| J-07 | {Canal} connecté. / {Canal} déconnecté : {n} programmation(s) annulée(s). | vous |
| J-08 | Priorité confirmée avec Paul : {mission}. Aucune mission lancée automatiquement. | vous |
| J-09 | Mission écartée du plan : {mission}. | vous |
| J-10 | Mission remise au plan : {mission}. | vous |
| J-11 | Objectif modifié · {mission} : « {résultat} ». | vous |
| J-12 | Périmètre modifié · {mission} : {résumé}. [Validation à renouveler.] | vous |
| J-13 | Fichier de contacts importé : {n} contacts, {m} recontactables après contrôle de l'ancienneté et du droit de recontact. | vous |
| J-14 | Décision de fin de test · {mission} : arrêt, programmations annulées. / poursuite, mêmes limites. | vous |
| J-15 | Bilan déclaré · {mission} : {n} demande(s), {m} rendez-vous[, {x} € signés]. Attribution déclarative, non vérifiée. | vous |
| J-16 | Idée notée avec Paul : « {idée} ». À cadrer avant tout lancement. | vous |
| J-17 | Mission lancée (ou reprise) : {mission}. Paul prépare le premier contenu. | vous |
| J-18 | Mission suspendue : {mission}. Programmations annulées. | vous |
| J-19 | V{n} retouchée par vous. / V{n} préparée avec Paul. / V{n} créée à partir de V{m} déjà diffusée. Validation à renouveler. | vous ou Paul |
| J-20 | V{n} validée : {titre}. Aucun envoi effectué. | vous |
| J-21 | V{n} programmée sur {canal} le {date}. | vous |
| J-22 | V{n} envoyée (ou publiée) sur {canal} · {n} destinataire(s). Version désormais en lecture seule. | vous |
| J-23 | Programmation de V{n} annulée : {raison}. La version reste validée. | vous ou système |
| J-24 | V{n} diffusée par vous sur {canal}, déclarée le {date}. | vous |
| J-25 | Résultat de V{n} vérifié : {diffusée / non diffusée}. | vous |
| J-26 | Règle de collaboration mise à jour : {niveau}. [Programmations annulées.] | vous |
| J-27 | V{n} refusée : {motif}. | vous |
| J-28 | Échec de diffusion de V{n} sur {canal} : {motif en clair}. | système |
| J-29 | Canal de la mission changé · {mission} : {canal}. Nouvelle version du brouillon à relire. | vous |

## 16. Paul

### 16.1 Contextes

| Contexte | Ouvert depuis | Titre |
| --- | --- | --- |
| stratégie | Stratégie, barre du haut ailleurs par défaut | Votre stratégie |
| mission | détail d'une mission, cartes | Mission · {mission} |
| contenu | atelier | Atelier · {contenu} |
| résultats | Résultats | Bilan et prochaine décision |
| ambition | étape 3, Modifier mon ambition | Votre ambition |
| positionnement | Entreprise › Diagnostic | Votre positionnement |
| concurrence | Entreprise › Diagnostic | La concurrence locale |
| sources | dialogue d'une source | Fiabilité des sources |
| idée | « Explorer une idée », nouvelle mission | Nouvelle idée n°{n} |

Chaque conversation commence par une introduction de Paul propre au contexte. « Discuter avec Paul » ouvre le contexte de la page ; le sélecteur liste les conversations non vides.

### 16.2 Suggestions rapides

| Contexte | Suggestions |
| --- | --- |
| stratégie | Que faire maintenant ? · Combien ça coûte ? · Quelle mission écarter ? · Quel risque ? · Comparer les pistes |
| mission | Que faire maintenant ? · Quel risque ? · (partenariats) Réduis à 1 agence / (réactivation) Limite à 5 contacts / (réalisation) Pourquoi cette mission ? / (autres modèles) Quel canal choisir ? · Mets cette mission en pause · Écarte cette mission |
| contenu | Plus court · Plus humain · Un autre angle · Quel risque ? |
| résultats | Que faire maintenant ? · Comment mesurer ? · Comparer les pistes |
| ambition | Est-ce réaliste ? · Quel budget prévoir ? |
| idée | Combien ça coûte ? · Quel risque ? |
| positionnement, concurrence, sources | Que faut-il en retenir ? · Comparer les pistes |

### 16.3 Propositions

| Proposition | Bouton d'acceptation | Effet (mêmes contrôles qu'à la main) |
| --- | --- | --- |
| Priorité | Retenir cette priorité | Change la priorité ; ne lance ni ne suspend rien |
| Périmètre | Modifier le périmètre | §6 |
| Pause | Mettre en pause | §2.2 |
| Écarter | Écarter | §2.2 |
| Remettre au plan | Remettre au plan | §2.2 |
| Limite de l'ambition | Ajuster ma limite | §11 |
| Nouvelle version | Créer cette version | §4.3, 1 crédit |
| Idée | Noter l'idée | Idée ajoutée ; ouvre « Cadrons votre nouvelle mission » |
| Mission | Créer la mission | §2.2 Créer, pour tout modèle du catalogue (§6.1), y compris « Sur mesure » ; jamais lancée |
| Lancement | Lancer | Ouvre le dialogue de cadre (§13.7) ; jamais de lancement direct |

Refuser une proposition : « Garder le cap actuel » ; Paul répond « Nous gardons le cap actuel. Aucun changement appliqué. »

Paul dit une seule fois, au moment utile, qu'une variante n'est créée qu'à l'acceptation, et qu'un crédit sera débité.
