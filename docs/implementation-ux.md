# Intégration UX et identité BienDecider

18 octobre 2026. Direction visuelle issue de la [maquette validée](maquette/README.md).

## Identité

- Slogan : **Vous décidez. Votre activité avance.**
- Symbole : monogramme `b.` blanc sur vert, point clair distinctif. Variante inversée pour fond sombre.
- Assets locaux dans `public/brand/` : symboles SVG, icône Apple PNG, capture du tableau de bord avec données fictives. Favicon ICO généré à partir du même symbole.
- Composant partagé `BrandLogo` sur accueil, navigation, connexion et inscription. Typographies DM Sans et Sora servies localement par `next/font`, sans requête Google Fonts dans le navigateur.
- Les tokens indigo et slate historiques sont remappés vers le vert et des neutres pour harmoniser les composants existants sans réécrire leurs comportements. Les alertes conservent leurs couleurs sémantiques.

## Écrans intégrés

| Entrée | Route | Rôle |
| --- | --- | --- |
| À décider | `/dashboard` | Synthèse des productions à examiner, des actions proposées et des productions exécutées ; prochaines décisions et historique récent. |
| Diagnostic | `/diagnostic` | Constats et actualisation existants. |
| Plan d'action | `/dashboard?view=plan` | Actions existantes, motifs visibles et domaine de l'agent ; lancement avec contrôle du profil et du budget. |
| Productions | `/dashboard?view=validation` | Sommaire et atelier de relecture ; contenu, destination, vérifications, modification et confirmation existantes. |
| Historique | `/dashboard?view=historique` | Productions traitées, refus, actions terminées et écartées. |
| Prospection | `/prospection` | Suivi commercial existant, sans transformer une publication en vente présumée. |
| Résultats | `/rapport` | Mesures et réalisations, distinctes du journal de décisions. |
| Mon entreprise | `/entreprise` | Rubriques Informations et Objectifs ; accès à Équipe et Connexions par navigation secondaire. |
| Mon compte | `/compte` | Accès, Budget IA et Confidentialité. |

Les anciennes routes Équipe et Connexions restent valides, notamment pour les retours OAuth. Les saisies du profil restent montées pendant le changement Informations/Objectifs ; les champs sont désactivés pendant le chargement initial pour éviter l'écrasement d'une saisie par la réponse API. Les champs invalides font revenir vers leur rubrique.

Paul reste disponible dans l'en-tête commun : dialogue, historique, streaming et voix conservés. Le bouton n'occupe plus le coin inférieur des pages connectées. Le composant autonome conserve son lanceur flottant par défaut.

## Compte et sécurité

- Page Compte protégée par la session ; coût et tokens agrégés uniquement pour l'entreprise de la session, depuis le début du mois UTC.
- Coût indiqué en USD, avec limites réelles de dépense et de lancements. Ce n'est ni une facture ni un solde de crédits ; aucun achat fictif n'est proposé.
- Suppression déplacée vers Compte / Confidentialité, en réutilisant les confirmations et la réauthentification existantes.
- Aucun changement aux API de génération, validation, publication, OAuth ou suppression. Aucune migration de données.

## Limites explicites

Cette livraison intègre l'interface dans les parcours réels, pas les fonctionnalités métier simulées de la maquette qui n'existaient pas encore :

- La publication du site génère toujours le HTML à partir du brief approuvé. L'interface conserve cet avertissement ; publier exactement un artefact prévisualisé reste le travail de #172.
- Pas de rollback universel ajouté : restauration de versions de site et retrait fournisseur nécessitent un historique d'artefacts et les capacités du canal. Les retours sur rejet déjà disponibles sont conservés. Aucun rappel de mail envoyé n'est promis.
- Pas de nouveau moteur d'apprentissage, de réordonnancement automatique ou de synchronisation Gmail/prospection. Les motifs, consignes, actualisations et signaux existants restent utilisés selon leurs contrats actuels.
- Le classement du plan reste celui fourni par le backend ; les rubriques Marketing/Contenus/Prospection sont les domaines des agents, pas une priorité recalculée par le frontend.
- L'administration conserve ses permissions existantes. La visibilité d'un lien ne remplace pas un contrôle d'accès serveur.

## Vérification

- TypeScript et ESLint ciblé sur les fichiers modifiés.
- Suite publique de marque : navigation, images, titres, contacts, contrastes et affichage à 320, 390 et 1440 px.
- Tests unitaires de chat/voix et de délégation.
- Recette navigateur isolée des composants réels : tableau de bord, plan, productions, historique, profil, conservation des onglets et accès Compte sans session ; largeurs 320, 390, 768 et 1440 px.
- Build de production dans l'installation temporaire de validation, avec URL PostgreSQL fictive et sans accès à une base distante.
- Scénarios DB de navigation, budget et sécurité ajoutés/adaptés pour la CI. Non exécutés contre la base distante du prototype.

La capture d'accueil est une image de présentation, pas une interface interactive. Le harness et les scripts de recette restent hors du dépôt. La mise en production demandée le 18 octobre suit le circuit PR, contrôles CI, puis déploiement de `main` décrit dans [le guide CI/CD](ci-cd.md).