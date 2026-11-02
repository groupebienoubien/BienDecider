# Maquette V4 · BienDecider

Maquette interactive du parcours dirigeant, issue de la v3 et de la table ronde du 2 novembre 2026. Elle sert de référence aux user stories de l'épopée 6 : tout ce qui y figure a été jugé utile au produit.

Données et exécutions simulées, aucun envoi réel. L'état est enregistré dans le navigateur (`biendecider-maquette-v4`).

## Ce qui change par rapport à la v3

| Sujet | V3 | V4 | Pourquoi |
| --- | --- | --- | --- |
| Décision de direction | Une recommandation et deux « autres chemins » en texte | « Votre décision de la semaine » : les pistes ouvertes comparées sur les mêmes critères (résultat attendu, votre temps, dépense, fiabilité du constat, point de vigilance), la recommandation de Paul signalée, choix par le dirigeant | Au plus une décision de direction par semaine, jamais fabriquée ; revoir son choix dans la semaine ne compte pas comme une nouvelle décision ; sans piste ouverte, Paul le dit |
| Décision et validation | Mélangées sous « À décider avec vous » | Séparées : la décision de la semaine d'un côté, « À valider par vous » (productions, programmations, marque, canaux) de l'autre | Valider une production n'est pas une décision de direction |
| Versions du Studio | Onglet Versions, comparaison, restauration | Socle minimal : numéro de version, et toute retouche annule la validation (le Studio le dit) | Arbitrage de Samir |
| Coût d'une mission | « Crédits de préparation » | Le temps du dirigeant (« 45 min sur 7 jours ») | Le dirigeant compte ses heures, pas des crédits |
| Fin de mission | Étape 5 sans action | « Décider la suite » après une première diffusion : poursuivre, adapter avec Paul ou arrêter ; une mission arrêtée est close | La règle d'arrêt du contrat de mission devient une décision |
| Programmation | Conservée | Conservée, et visible dans « À valider par vous » | Arbitrage de Samir |

Tout le reste de la v3 est conservé : premier contact en quatre étapes, contrat de mission, garde-fous de diffusion, diagnostic sourcé, kit de marque, canaux et délégation, bilan déclaratif, journal des décisions, Paul contextuel.

## Vérifier

```bash
node --test maquette_v4/state.test.cjs
```
