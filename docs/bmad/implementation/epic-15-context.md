# Epic 15 Context : Bilan et décision de suite (vague 3 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Boucler le cycle d'une mission : après la diffusion, le dirigeant déclare ce qu'elle a produit, décide de poursuivre, d'adapter avec Paul ou d'arrêter, et voit ce que Paul en retient, sans jamais confondre activité et résultat.

## Stories

- Story 15.1 : Renseigner le bilan d'une mission et voir mes résultats (#294, FR-47, FR-49)
- Story 15.2 : Décider la suite d'une mission à partir de son bilan (#52, FR-48)
- Story 15.3 : Voir ce que Paul apprend du bilan (#53, FR-16)

Livrées ensemble dans une seule PR.

## Requirements & Constraints

- Spécification §2.2 (Arrêter, Poursuivre), §3 (étapes `bilan`, `décider`, `série suivante`), §7.1 à §7.3, §13.4 ; addendum §4.4 et §8.
- Chiffres déclaratifs, jamais vérifiés ; « — » tant que rien n'est déclaré ; CA vide ≠ 0.
- Paul ne conclut jamais avant l'échéance de la règle d'arrêt ; il ne propose jamais d'élargir ; rien n'est appliqué sans confirmation.

## Technical Decisions

- **Modèle** : `MissionReport` et `MissionDecision` (addendum §4.4), le dernier enregistrement fait foi ; chacun garde le nombre de diffusions (confirmées ou déclarées) au moment de la saisie : « à jour » tant que ce nombre n'a pas changé. Contrainte CHECK : rendez-vous ≤ demandes. Migration additive `20261107120000_mission_report_decision`.
- **Bilan** (`POST /api/missions/[id]/report`) : ≥ 1 diffusion (M-37), demandes et rendez-vous requis (M-38), entiers 0 à 100 000 000 (M-39), rendez-vous ≤ demandes (M-33, aussi en direct), note 600 caractères ; J-15 « Attribution déclarative, non vérifiée ».
- **Décision** (`POST /api/missions/[id]/decision`, version attendue) : mission En cours (M-34), ≥ 1 diffusion (M-35) ; « Poursuivre » exige un bilan à jour (M-36) et ouvre l'atelier pour la série suivante (étape `série suivante`, « Créer V(n+1) ») ; « Arrêter » clôt la mission, annule ses programmations (J-23) et rend la priorité ; J-14. « Adapter avec Paul » ouvre la conversation de la mission, sans écriture.
- **Règle d'arrêt** : échéance = première diffusion de la série en cours (après la dernière décision de poursuivre) + jours du modèle.
- **Lecture** (`readReport`, pure) : « Observé », « Ce que cela suggère » (atteint, partiellement, non atteint, ou impossible à juger si le résultat recherché n'est pas chiffré), « Ce que cela ne prouve pas », « Impact sur le plan » (attendre l'échéance, sinon proposition à confirmer : poursuivre, réduire, arrêter, tester une autre piste, préciser l'objectif). Le résultat recherché est lu en nombre et en unité (« Un rendez-vous », « Deux demandes de devis ») ; sans chiffre, Paul ne juge pas.
- **Pages** : Résultats (indicateurs, tableau par mission, formulaire de bilan qui suit `?mission=`, diffusions et programmations, « Le point de Paul » avec le prochain point daté) ; Stratégie (« Ce que Paul apprend »). Paul lit bilan, lecture, décision et règle d'arrêt dans `get_current_status`.
