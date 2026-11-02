# Maquette V5 · BienDecider

Maquette interactive du parcours dirigeant, issue de la v4 et de la synthèse de test du parcours complet. La v5 ajoute peu d'écrans : elle rend la boucle **canal → mission → atelier → validation → diffusion → bilan → décision** cohérente, contrainte et mesurable.

Données et envois simulés, aucun envoi réel. L'état est enregistré dans le navigateur (`biendecider-maquette-v5`). Ouvrir `index.html` directement.

## Une page de découverte, puis « C'est parti »

L'adresse `#/decouvrir` reprend le récit de l'accueil public de l'application (`src/app/page.tsx`) : promesse, équipe, exemple concret, « vous gardez la main », ce qui est réel et ce qui est simulé, puis le bouton **C'est parti** qui ouvre la première connexion. « Revoir le concept » reste accessible depuis la première connexion et « Mon espace ».

## Corrections et ajouts par rapport à la v4

| Axe | Ce que fait la v5 |
| --- | --- |
| 1. Incohérences | Après « Connecter Gmail » depuis la fenêtre d'envoi, retour à la confirmation de diffusion. Le journal distingue « retouchée par vous » et « préparée avec Paul », avec l'acteur de chaque ligne. Un seul agent par mission (Paul → Jean-Claude pour les agences et les prospects, Paul → Camille pour les réalisations). Une règle d'arrêt propre à chaque mission. Le prénom est demandé à l'étape 1. La zone `aria-live` (toast, Paul) est vidée après lecture. |
| 2. Garde-fous | Blocage du lancement quand le temps réservé dépasse les heures disponibles ; avertissement avec accord explicite quand les projets possibles dépassent la capacité. Temps réservé, temps consommé et projets affichés à l'accueil, dans Missions et à chaque lancement. Bilan rattaché à une mission, refusé si rendez-vous > demandes qualifiées, champs vides plutôt que 0. Une version diffusée est en lecture seule : toute modification crée une nouvelle version à valider. Le périmètre est figé après diffusion. |
| 3. Choix réels | 1 ou 2 agences parmi 6, jusqu'à 8 contacts parmi 27, réalisation parmi 4. Import CSV simulé avec contrôle d'ancienneté (24 mois) et de droit de recontact. Seules les adresses `.example` sont acceptées : pas de vraies données personnelles. Si de vraies données devaient être manipulées en test, le Data Privacy Officer doit valider le dispositif. Le parcours Facebook suit les mêmes règles que l'e-mail. La déconnexion d'un canal liste les programmations annulées. |
| 4. Paul | Réponses par intention (budget, temps, capacité, risque, résultats, canaux, délégation, prochain pas, comparaison, périmètre, pause, équipe), une conversation par contexte, « Explorer une idée » ouvre une conversation neuve. Hors cadre, Paul le dit et propose la suite. Ses propositions modifient l'état une fois confirmées (« réduis à 1 agence », « mets le budget à 100 », « mets la mission en pause »). |
| 5. Accueil et première connexion | L'accueil commence par le prochain pas (calculé depuis l'état) et le parcours de la mission. Les trois compteurs à zéro disparaissent ; le tableau des constats n'existe plus qu'une fois, dans Entreprise. Étape 2 : trois champs, le reste « à affiner », valeurs affichées en entier. Étape 3 : valeurs usuelles et plafonds. Réel et simulé distingués dès l'étape 1. Vocabulaire : Studio devient **Atelier**, « production » devient « contenu », « exécution » devient « envoi » ou « diffusion », « boussole » devient « repères », la capacité se compte en **projets clients**. |
| 6. Fluidité et accessibilité | Fondu de page de 0,12 s, rejoué seulement lors d'un changement de page (plus de zone blanche après une action). Progression de lecture à l'étape 1 sans attente obligatoire. Cibles d'au moins 44 px. Indice de défilement sur les onglets mobiles. Constats et résultats en cartes sous 640 px. Cartes de mission informatives (périmètre, temps, étape) à la place d'illustrations. Texte secondaire assombri (voir ci-dessous). |
| 7. Instrumentation | Question de retour à la fin des étapes clés, identifiant de session de test, export JSON du journal (décisions, temps par page, fenêtres abandonnées, retours). L'export ne contient ni contacts ni coordonnées. |

## Mesures d'accessibilité

Contraste (rapport WCAG, seuil 4,5 pour le texte courant) : le gris secondaire de la v4 (`#65716a`) tombait à 4,41 sur le fond des badges et 4,48 sur le vert pâle. Il passe à `#58635c` : 5,4 à 6,3 sur crème, blanc, badge, vert pâle et ambre pâle. Les autres associations de la charte (vert de marque, corail foncé, erreur) restent au-dessus de 5,2.

Cibles tactiles : mesurées à 390 px de large sur l'accueil, les missions, l'atelier, les résultats, le diagnostic et la page de découverte, aucun contrôle sous 44 px. Aucun débordement horizontal à cette largeur.

Reste à faire avant les sessions de test : navigation clavier complète avec un lecteur d'écran réel (les fenêtres natives `dialog`, le saut au contenu et les cibles de focus sont en place, mais non éprouvés avec NVDA ou VoiceOver).

## Vérifier

```bash
node --test maquette_v5/state.test.cjs
```

Les tests couvrent la logique (`state.js`) et les réponses de Paul (`paul.js`). L'interface (`views.js`, `app.js`) a été parcourue de bout en bout dans un navigateur : première connexion, lancement de deux missions, blocage de la troisième, validation, connexion de Gmail depuis l'envoi, diffusion, bilan incohérent refusé, bilan accepté, décision, import CSV, périmètre, programmation Facebook puis déconnexion.
