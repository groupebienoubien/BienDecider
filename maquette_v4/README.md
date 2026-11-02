# Maquette V4 · BienDecider

Maquette interactive du parcours dirigeant, issue de la v3 et de la table ronde du 2 novembre 2026. Le pavé « décision de la semaine » essayé dans un premier temps a été abandonné au profit des constats. Elle sert de référence aux user stories de l'épopée 6 : tout ce qui y figure a été jugé utile au produit.

Données et exécutions simulées, aucun envoi réel. L'état est enregistré dans le navigateur (`biendecider-maquette-v4`).

## Ce qui change par rapport à la v3

| Sujet | V3 | V4 | Pourquoi |
| --- | --- | --- | --- |
| Accueil | Une recommandation et deux « autres chemins » en texte | « Des constats aux décisions » : le tableau du diagnostic (constat, niveau de certitude, ce que Paul en déduit, suite proposée) remonte sur l'accueil, à côté du prochain pas | Le dirigeant voit d'où vient chaque proposition, sources à l'appui, sans aller dans Entreprise |
| Décision et validation | Mélangées sous « À décider avec vous » | « À valider par vous » regroupe les productions, les programmations, la marque et les canaux | Valider une production n'est pas une décision de direction |
| Versions du Studio | Onglet Versions, comparaison, restauration | Socle minimal : numéro de version, et toute retouche annule la validation (le Studio le dit) | Arbitrage de Samir |
| Coût d'une mission | « Crédits de préparation » | Le temps du dirigeant (« 45 min sur 7 jours ») | Le dirigeant compte ses heures, pas des crédits |
| Fin de mission | Étape 5 sans action | « Décider la suite » après une première diffusion : poursuivre, adapter avec Paul ou arrêter ; une mission arrêtée est close | La règle d'arrêt du contrat de mission devient une décision |
| Programmation | Conservée | Conservée, et visible dans « À valider par vous » | Arbitrage de Samir |
| Charte graphique | Bleu, gris froid, Manrope | Charte de la prod (`docs/charte.md`) : fond crème, vert de marque, corail pour ce qui attend le dirigeant, couleur propre à chaque agent, Sora pour les titres et DM Sans pour le texte, logo « b. » | Même rendu que l'application |
| Première connexion | Accessible seulement depuis « Mon espace » | Lien « Revoir la première connexion » dans le menu, et adresse directe `#/bienvenue` | Un navigateur qui a déjà un espace ne revoyait plus l'onboarding |

Tout le reste de la v3 est conservé : premier contact en quatre étapes, contrat de mission, garde-fous de diffusion, diagnostic sourcé, kit de marque, canaux et délégation, bilan déclaratif, journal des décisions, Paul contextuel.

## Vérifier

```bash
node --test maquette_v4/state.test.cjs
```
