# BienDecider - Changelog V5.1

Cette version est un patch incrémental de la maquette V5. Elle conserve le moteur d'état, les parcours, les missions, l'Atelier, les validations, Paul contextuel et les règles existantes.

## Modifications

- Page Stratégie : ajout d'un bloc prioritaire « Votre prochaine décision ».
- Explication de la recommandation : pourquoi maintenant, preuve utilisée, point restant à vérifier.
- Séparation renforcée entre décision stratégique, validation de contenu et diffusion.
- Ajout d'une synthèse d'apprentissage après un bilan : observé, suggestion, limites, impact sur le plan.
- Page Résultats : les bilans remontent explicitement vers la stratégie.
- Paul : titre contextualisé « Paul à propos de... ».
- Atelier : paramètres de diffusion avancés repliés par défaut, sans suppression fonctionnelle.
- Responsive : nouveaux blocs adaptés au desktop, à la tablette et au mobile.

## Fichiers modifiés

- `views.js`
- `styles.css`

## Fichiers conservés sans changement

- `app.js`
- `state.js`
- `paul.js`
- `index.html`
- `lucide.min.js`
- `chantier.jpg`

## Installation

Remplacer `views.js` et `styles.css` dans le dossier V5 existant. Les autres fichiers restent inchangés.
