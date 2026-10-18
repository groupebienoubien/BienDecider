# Maquette du parcours BienDecider

Proposition UX/UI du 18 octobre 2026, à discuter avant intégration. Ouvrir [la maquette](index.html) directement dans un navigateur. Aucun serveur, compte, secret ni base de données nécessaire.

Les données sont fictives. Les actions restent en mémoire dans cet onglet et sont effacées au rechargement. Les polices Google Fonts, icônes Lucide (version figée) et photo de démonstration Unsplash nécessitent Internet. Ne pas saisir d'informations personnelles réelles.

## Ce que je challenge dans les exemples

| Proposition initiale | Proposition retenue | Raison |
| --- | --- | --- |
| Tableau de bord entre les étapes du parcours | **À décider**, accueil transversal | L'accueil doit répondre à « que dois-je décider maintenant ? », pas doubler le plan ou le diagnostic. |
| Compteur de 18 productions à relire | Décisions ordonnées et reliées à l'action d'origine | Le volume de contenu n'est pas une mesure de progression. Une priorité doit rester explicable. |
| Navigation principale en bas de page | Navigation latérale sur ordinateur, compacte et défilante sur mobile | Le parcours est cyclique et non un assistant linéaire imposé. Les étapes restent accessibles. Une navigation mobile à quatre entrées et menu « Plus » reste à comparer en recette. |
| Grand panneau blanc sur fond sombre | Surface de travail claire, séparateurs sobres, vert pour les confirmations, ambre pour l'attention | Réserver le contraste aux décisions, limiter les panneaux imbriqués et faciliter la lecture prolongée. |
| Une carte unique en mode décision | File de productions + aperçu + contexte + actions | Conserver le travail en cours et permettre la comparaison sans perdre le lien avec le plan. Sur mobile, ces zones s'empilent. |
| « Approuver » comme commande principale | Valider l'action, approuver une version, confirmer la diffusion | Trois autorisations différentes. Chacune a un effet explicite et traçable. |
| Rollback global | Restauration du site, retrait conditionnel d'un post, pas de rappel de mail | Une interface ne doit pas promettre une réversibilité que le canal ne garantit pas. |
| Équipe dans les réglages uniquement | Configuration dans Entreprise, échange contextuel accessible partout | La conversation accompagne les décisions sans devenir une seconde file de validation. |

## Architecture de navigation

- **À décider** : priorités du jour, validations attendues, activité récente et point de Paul.
- **Diagnostic** : constats, source, niveau de certitude, date, version et retours retenus.
- **Plan d'action** : priorité, thème, justification, agent, canal et coût estimatif de préparation.
- **Productions** : versions, aperçu, corrections, rejet motivé, approbation, connexion et confirmation.
- **Prospection** : contacts, étape commerciale, événements du canal et déclarations manuelles.
- **Historique** : contenu conservé, génération, approbation, diffusion, échec, vérification et retour arrière.
- **Mon entreprise** : informations, objectif, équipe et connexions.
- **Mon compte** : crédits, limites, accès et confidentialité. Opérations de compte non actives ici.
- **Administration** : utilisateurs, coût par entreprise, agent et modèle, budgets. Vue illustrative accessible dans la maquette ; elle devra être filtrée et protégée côté serveur dans le produit.

Les thèmes « Visibilité », « Conversion » et « Prospection » décrivent le but de l'action. Facebook, Gmail et Site sont des canaux, pas des thèmes. « À relire » et « En ligne » sont des états, pas des catégories de travail.

## Parcours à essayer

1. Depuis **À décider**, examiner le post Facebook. Cocher la vérification, approuver la version puis préparer la publication. La connexion est demandée. Après l'autorisation simulée, confirmer séparément la publication.
2. Modifier le post avant publication : la version augmente et son approbation est annulée. Rejeter une version avec un motif, puis la retravailler. Le retour retenu apparaît dans le diagnostic et les informations de l'entreprise.
3. Dans **Plan d'action**, valider l'action de prospection : un brouillon de mail est créé. L'approuver, connecter Gmail puis confirmer l'envoi. Le statut de Léa passe automatiquement à « Contacté », jamais à « Réponse reçue » ou « Gagné ».
4. Dans la confirmation, choisir **Échec avant diffusion** ou **Résultat inconnu**. En cas d'incertitude, aucune nouvelle diffusion n'est proposée avant un contrôle du canal.
5. Dans **Productions**, ouvrir le site publié puis restaurer la version précédente. La restauration crée une nouvelle version traçable. Pour Facebook, tester le retrait ; pour un mail envoyé, constater l'absence de rappel.
6. Dans **Prospection**, ajouter un contact ou déclarer une nouvelle étape. Actualiser le diagnostic puis consulter le plan : une prochaine action est proposée, sans écraser les décisions existantes. L'option d'actualisation automatique met à jour les constats après un nouvel événement ; elle n'autorise aucune publication.
7. Ouvrir Paul depuis un écran, puis poser une question. Le contexte est visible ; les réponses sont scénarisées et ne modifient pas les décisions. Le microphone n'est pas simulé dans cet artefact ; l'intégration réutilisera les contrôles vocaux existants.

## Contrats pour l'implémentation

```text
Diagnostic versionné -> action proposée -> validation de l'action
  -> génération suivie -> production versionnée -> relecture
  -> modification / rejet motivé -> nouvelle version à relire
  -> approbation de la version -> connexion éventuelle
  -> prévisualisation de cette même version -> confirmation explicite
  -> exécution -> preuve / échec / résultat incertain
  -> historique + signaux de prospection -> nouveau diagnostic
  -> propositions d'évolution du plan -> nouvelle décision
```

- Conserver séparément les états de l'action, de la production, de l'approbation et de l'exécution. Le JavaScript de la maquette utilise volontairement un état simplifié et ne constitue pas le modèle métier final.
- Lier une production à l'action et au diagnostic qui l'ont motivée. Une actualisation ne doit pas réécrire cette provenance.
- Publier **l'artefact effectivement prévisualisé et approuvé**, avec identifiant de version, contenu figé et empreinte. Le site actuel génère encore son HTML à la publication : cette évolution reste à implémenter (#172).
- Après OAuth, revenir à la production et à la version concernées, revérifier les droits et la destination, puis demander la confirmation. Une autorisation seule ne déclenche rien.
- Rendre l'exécution idempotente ; conserver l'identifiant externe et les preuves du canal. Une interruption réseau ne prouve ni succès ni échec. Le contrôle de résultat de la maquette est manuel et simulé, pas un appel fournisseur.
- Afficher le contenu publié archivé **et**, quand disponible, un lien externe vers le résultat réel. Les domaines `.example.test` de cet aperçu ne sont pas des sites publiés.
- Vérifier les capacités de restauration, modification et suppression par canal, sans garantir le retrait de copies externes. La restauration du site et le retrait du post sont simulés ici.
- Conserver les retours explicites avec leur portée : cette version, cette action ou les futures productions. Demander confirmation avant de généraliser une préférence. Il ne s'agit pas d'un réentraînement automatique du modèle.
- Distinguer la preuve technique d'envoi/publication, la réponse réellement observée et la déclaration commerciale. Ne pas déduire un chiffre d'affaires d'une publication.
- Déclencher les réévaluations par événements et/ou périodiquement, agréger les signaux, proposer un différentiel de plan explicable. Conserver les validations acquises ; toute nouvelle action consommatrice de budget attend son autorisation.
- Présenter les générations réelles en attente, en cours, terminées ou en échec via le suivi des agents existant. La génération de cette maquette est immédiate ; les nouvelles priorités sont scénarisées, sans moteur d'analyse.

## Périmètre de cette livraison

Maquette autonome, pas une route déployée. Aucun changement aux API, à l'authentification, au schéma de données ou aux pages de production. Les principaux parcours décisionnels sont interactifs ; les réglages de compte, l'administration, l'achat de crédits et la proposition de la prochaine boucle restent illustratifs.

Les décisions visuelles à valider avant intégration : le vocabulaire « À décider », la présence permanente du diagnostic dans la navigation, le classement par thème puis priorité, le niveau de détail de l'aperçu, et la séparation entre historique technique et résultats commerciaux.