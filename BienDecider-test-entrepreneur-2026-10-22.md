# BienDecider : test en production comme entrepreneur

22 octobre 2026, nouveau compte en production. Persona fictif : Samuel Morel, Atelier Lumen, ébéniste à Nantes (cuisines et dressings sur mesure). Pas de site, un Instagram. Objectif : passer de 140 000 € à 200 000 € de chiffre d'affaires annuel, avec un panier moyen de 18 000 € et 6 cuisines par an aujourd'hui.

Parcours suivi : onboarding, conversation avec Paul, plan, décisions, rejet motivé, échange avec Paul sur une production, diagnostic, entreprise, résultats. Aucune connexion (Gmail, Facebook), rien d'envoyé. Le parcours a duré une vingtaine de minutes.

## Le diagnostic en une phrase

Paul parle bien mais n'agit pas sur ce qu'on lui dit. Il ne sait pas ce que font les autres agents. Il lance du travail sans demander. Le dirigeant se retrouve avec 22 décisions, des doublons, et un accueil qui lui redemande ce qu'il vient de dire.

## 1. Paul : ce qui casse la confiance

| # | Constat (ce que j'ai fait → ce qui s'est passé) | Pourquoi c'est grave | Piste |
| --- | --- | --- | --- |
| P1 | J'ai donné mon objectif à Paul (200 k€, panier 18 k€, 6 cuisines par an, Instagram), puis je le lui ai redemandé explicitement. **Rien n'a été enregistré.** L'accueil, le plan, les résultats et la page Entreprise demandent toujours « Quel résultat voulez-vous atteindre ? ». Paul répond : « Je n'ai aucun outil pour écrire dans votre objectif ou votre profil. » | C'est l'interaction la plus naturelle : le bouton « En parler avec Paul » de l'accueil invite justement à le faire. Le dirigeant a l'impression de parler dans le vide. | Ajouter à Paul un outil « mettre à jour l'objectif et le profil », avec une confirmation en un clic dans le chat (« J'enregistre : 200 000 €/an ? Oui / Corriger »). |
| P2 | Paul annonce un état des agents faux, trois fois de suite. Message 1 : « Jean-Claude : c'est lancé ; Martine : ÉCHEC ». Message 2 : « Correction : Martine n'a pas échoué… Jean-Claude n'était pas lancé ; Camille : ÉCHEC ». Message 3 : « Correction : l'audit de Martine et le contenu de Camille sont toujours au statut proposé, rien n'est lancé ». Or le diagnostic montre bien l'analyse de Martine terminée à 21:14. | Chaque message corrige le précédent : on ne peut croire aucun statut. | Voir la cause probable ci-dessous. Faire afficher l'état des exécutions par l'interface (carte « Martine travaille… / a terminé ») plutôt que de le faire dire par Paul. |
| P3 | Paul lance les agents de lui-même dès le premier message (prospection, audit, contenu). Aucune question du type « je propose de lancer X, d'accord ? ». | Contraire à la promesse « Vous décidez ». Le coût est engagé sans accord. | Les délégations depuis le chat créent l'action au plan en « proposée » ; le dirigeant la lance d'un clic dans le chat. |
| P4 | Paul ne peut pas corriger une production : « Je n'ai aucun outil pour modifier une proposition existante ». Il propose de relancer Jean-Claude (nouveau coût, nouveaux doublons) ou de corriger à la main. | Le dirigeant attend « corrige ça » → c'est corrigé. | Outil « réviser une proposition » (nouvelle version avec consigne), qui existe déjà côté serveur pour « Modifier ». |
| P5 | Erreur de raisonnement au premier message : « +60 000 € de CA, soit 3 à 4 cuisines de plus d'ici fin 2027… environ 1 à 2 par an ». Il traite le CA annuel comme un cumul. Corrigé seulement après que je l'ai signalé. | Le premier chiffre que voit le dirigeant est faux. | Faire passer le calcul par l'objectif structuré (P1) et rappeler dans la consigne que le CA est annuel sauf mention contraire. |
| P6 | Paul ne sait pas quel jour on est : « Je n'ai pas contrôlé que le début est bien dans 8 jours ». Jean-Claude propose un événement de juin 2026 (déjà passé). | Propositions périmées, prudence inutile. | Injecter la date du jour dans le contexte de Paul et de Jean-Claude, et filtrer les événements passés. |
| P7 | Paul invente parfois : « vos photos ne sont pas encore triées ». | Petites inventions, mais elles minent le ton « ne promet rien qu'il ne peut tenir ». | Rappel de consigne. |
| P8 | Une réponse met 30 à 60 s, avec seulement « Paul réfléchit… ». | Le dirigeant ne sait pas si ça a planté. | Afficher les étapes (« je lis votre plan », « je lance Jean-Claude »), ou du streaming. |

**Cause probable de P2 (lecture du code, non vérifiée en logs : accès Vercel refusé, 403).** Dans `src/lib/agents/co-ceo.ts`, `delegateThroughPlan` transforme toute exception en « ÉCHEC… est indisponible ». Pourtant `enqueuePlanRun` lève aussi `AgentRunConflictError` (« action déjà lancée ») et `AgentRunQuotaError` (« budget réservé par une exécution en cours », `src/lib/agent-runs.ts:384`). Le bouton « Valider et lancer mon audit » de l'onboarding a très probablement déjà lancé Martine. Quand Paul la relance, le conflit ou la réservation de budget est présenté comme une panne. Paul n'a ensuite que `get_current_status`, qui ne renvoie pas les exécutions en cours ou terminées : il déduit l'état à partir des statuts du plan.

## 2. Volume et doublons : le dirigeant est noyé

| # | Constat | Piste |
| --- | --- | --- |
| V1 | Après **deux messages** à Paul : 22 décisions en attente (le badge affiche 18, puis 21, puis 22, alors que la page affiche 16 puis 20 : les compteurs ne concordent pas). | Plafonner ce qu'un lancement produit (par exemple 5 prospects, 1 email). Un seul compteur, la même source partout. |
| V2 | Doublons créés par la chaîne elle-même : deux actions Jean-Claude au plan (« Prescripteurs locaux… » et « Pistes de prospection… »), deux fiches « Salon Habitat & Déco », quatre modèles d'emails proches. Paul finit par demander au dirigeant de faire le tri. | Dédoublonner à la création (même agent, même thème, action non terminée → reprendre plutôt que créer). |
| V3 | Les prospects de Jean-Claude apparaissent dans « Productions », mélangés aux emails et aux pistes, avec le vocabulaire des contenus : « Aperçu de la version à diffuser », « version 1 », « Risque modéré ». | Les prospects vont dans Prospection (fiches contact, retour F de la refonte), pas dans la file de relecture. |
| V4 | L'accueil affiche « Martine vous propose une action à valider : Audit… » alors que l'audit est déjà fait (« Martine a terminé : 4 éléments »). | Une action terminée ne doit plus être « à valider ». |

## 3. Qualité des productions

| # | Constat | Piste |
| --- | --- | --- |
| Q1 | Les emails de Jean-Claude sont **signés « Paul »** (le nom de l'agent pris pour celui du dirigeant). D'autres ont « [Votre prénom et nom] ». | Demander le prénom et le nom du dirigeant à l'onboarding et les transmettre aux agents. |
| Q2 | L'objet de l'email s'affiche deux fois (le titre interne en « Objet », puis le vrai objet). L'avertissement RGPD est collé dans le corps du mail. | Séparer métadonnées, corps et avertissement. |
| Q3 | Les emails sont génériques (« [Prénom] ») et ne sont pas reliés aux prospects trouvés juste à côté. | Un email prérempli par prospect, depuis sa fiche. |
| Q4 | Le diagnostic de Martine se résume à « vous n'avez rien déclaré » (pas de site, pas de réseau), alors que j'avais donné l'Instagram à Paul. Les constats sont recopiés deux fois par Paul (« Vous n'avez pas de site web : Aucun site web déclaré… »). | Lire le profil à jour (P1). Un seul libellé par constat. |
| Q5 | « Pourquoi cette action » est vide sur les pistes de Jean-Claude. | Remplir ou masquer. |

## 4. Onboarding

| # | Constat | Piste |
| --- | --- | --- |
| O1 | « Préremplir mon profil » échoue : `POST /api/onboarding/interpret` répond 503 « Interprétation indisponible ». Cause non vérifiée (logs inaccessibles). | Consulter les logs Vercel pour cette requête du 22/10 vers 21:12 (heure de Paris). |
| O2 | La phrase d'accueil contenait mon objectif. En remplissage manuel, il n'y a pas de champ objectif : l'information est perdue, puis redemandée sur l'accueil. | Champ objectif dans l'onboarding, ou conserver la phrase et la passer à Paul. |
| O3 | Le bouton dit « Valider et lancer mon audit », mais l'accueil affiche ensuite Martine : « Je n'ai pas encore examiné votre présence en ligne. Lancez le diagnostic. » | Montrer l'audit en cours dès l'arrivée sur l'accueil. |
| O4 | L'objectif est demandé en CA **mensuel** (« Objectif de ce mois ») : pour un ébéniste à 6 chantiers par an, l'unité naturelle est l'année. | Laisser choisir mois ou année. |

## 5. Interface autour de Paul

| # | Constat | Piste |
| --- | --- | --- |
| I1 | Paul s'appelle « Votre copilote » dans le panneau et « Partenaire de croissance » ailleurs. | Un seul titre (charte). |
| I2 | Ouvert depuis « En parler avec Paul » (objectif), le panneau propose « Où en est mon plan ? / Que dois-je décider ? », sans lien avec l'objectif. | Suggestions adaptées au point d'entrée. |
| I3 | Sur écran étroit, le panneau reste ouvert d'une page à l'autre et couvre la page : on clique dans le chat en croyant cliquer sur la production. | Replier le panneau au changement de page sur mobile. |
| I4 | Les liens vers les productions dans les messages de Paul répètent le titre (« « X » X »). | Rendu des liens. |
| I5 | Le rejet propose « Le ton ne me correspond pas » par défaut, même pour un prospect ou un événement. Après le rejet, aucun retour de l'agent. | Motifs selon le type ; accusé de réception de l'agent. Point positif : le motif est bien retenu et Paul s'en souvient. |
| I6 | La durée habituelle affichée est de 45 s, et « l'exécution dépasse la durée habituelle » apparaît dès 46 s. | Seuil plus large. |

## Ce qui marche bien

- Le contexte « À propos de : production… » quand on ouvre Paul depuis une production.
- Le rejet motivé est retenu, affiché dans « Ce que votre équipe retient » et cité par Paul.
- Le conseil de Paul sur le salon (y aller en visiteur, ne pas exposer à 8 jours) est concret et pertinent.
- Jean-Claude trouve de vrais prospects locaux, avec leurs sources.

## Priorités proposées

1. **Paul agit sur ce qu'on lui dit** : enregistrer l'objectif et le profil, réviser une proposition (P1, P4).
2. **Paul dit vrai sur l'état** : distinguer conflit, quota et panne, et lui donner les exécutions réelles (P2).
3. **Paul propose, le dirigeant lance** (P3).
4. **Moins et mieux** : plafond par lancement, dédoublonnage, prospects hors de Productions (V1 à V3).
5. **Date du jour et nom du dirigeant** dans le contexte de tous les agents (P6, Q1).

Le compte de test « Atelier Lumen » reste en production avec ses 22 décisions en attente.
