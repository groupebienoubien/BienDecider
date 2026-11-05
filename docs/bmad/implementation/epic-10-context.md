# Epic 10 Context : L'espace V5.2, Stratégie et Missions (vague 2 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner au dirigeant le cœur du parcours V5.2 sur le socle de l'epic 9 : une navigation en quatre pages, une Stratégie qui met en avant une seule décision utile, et des missions qu'il crée, cadre, lance, suspend, reprend, écarte et réoriente. L'atelier et les résultats existent comme pages, honnêtement vides, jusqu'aux vagues 3 et 4.

## Stories

- Story 10.1 : Naviguer en quatre pages (#278)
- Story 10.2 : Voir ma Stratégie (#283)
- Story 10.3 : Parcourir mes missions par statut (#285)
- Story 10.4 : Lancer, suspendre, reprendre et réorienter une mission (#286, #313)

Livrées ensemble dans une seule PR, une spec par story.

## Requirements & Constraints

- Cahier des charges FR-12 à FR-19, FR-24, FR-55 ; spécification §2, §3, §6, §13.1, §13.2, §13.7, §14, §15 ; charte V5.2 (section 8) ; addendum §1 et §9.
- Le serveur décide (epic 9) : les pages n'ajoutent aucune règle ; elles appellent `POST /api/missions/[id]/transition` et affichent le refus tel quel.
- Paul seul interlocuteur (D3) ; vocabulaire de la charte (section 4.3) ; « — » pour ce qui n'est pas mesuré (NFR-11).

## Technical Decisions

- **Bascule par entreprise** (addendum §1.7) : colonne `Company.workspaceV52`, faux par défaut, activée par un administrateur (`PATCH /api/admin/companies/[id]/workspace`, bouton dans l'administration). Sans drapeau, l'ancien parcours reste en service et les pages V5.2 renvoient vers `/dashboard`. Avec drapeau, la coque commune (`AppShell`) affiche la navigation V5.2 sur toutes les pages connectées, et `/dashboard`, `/cockpit`, `/equipe` mènent à `/strategie`, `/prospection` à `/missions`, `/rapport` à `/resultats`. Les autres anciennes adresses (`/studio`, `/diagnostic`, `/connexions`) restent jusqu'à ce que leur page cible existe (vagues 3 et suivantes).
- **Étape et prochain pas en fonctions pures** (`src/lib/missions/stage.ts`) : la spécification §3.1 à §3.3 est codée en entier, avec l'état du contenu principal en entrée. Tant que l'atelier (#289) ne fournit pas ce contenu, une mission en cours est à l'étape **« en préparation »** (temps « Préparer ») : cas que la spécification ne nommait pas, ajouté au §3. Le prochain pas la choisit après ce qui attend le dirigeant et après un lancement (règle 4 du §3.3).
- **Priorité** : la première mission ni écartée ni close dans l'ordre du plan, marquée « Priorité de Paul ». La priorité choisie avec Paul (`Company.priorityMissionId`, J-08) arrive avec ses propositions (#288).
- **Journal** (`JournalEntry`, spécification §15) : chaque création et transition écrit son code (J-01, J-09, J-10, J-11, J-12, J-17, J-18, J-29) dans la même transaction ; le texte est rendu à l'affichage. La consultation (« Décisions & traçabilité ») vient avec Résultats (#294) et #41.
- **Catalogue** : Partenariats et Réalisation sont fermés tant que la source de leur périmètre n'existe pas (agences #316, réalisations #317), comme Réactivation (#69). Sont proposés : Publication, Page du site vitrine, Sur mesure.
- **Paul** : la mission est un élément de contexte (`PaulElement` « mission ») : « Ajuster avec Paul », « Affiner avec Paul » et « Challenger avec Paul » ouvrent le panneau existant sur la mission. Les conversations par contexte (D12) restent à faire (#288).
- **Rafraîchissement** : après une transition, le dialogue se ferme avec l'affichage de l'état à jour (`useTransition`), pour qu'un geste suivant parte toujours de la bonne version.

## Bascule generale (2026-11-06)

- Decision des fondateurs : pleine refonte. Toutes les entreprises passent sur l'espace V5.2 (`workspaceV52` vrai par defaut et pour les comptes existants) ; le bouton de bascule de l'administration est retire. Le drapeau ne reste faux que dans les tests de l'ancien parcours, dont le code est retire au fil des US qui le remplacent.
- Donnees de l'ancien parcours effacees par la migration `20261106110000_bascule_v52` : prospects, productions (revisions et journaux d'execution en cascade), actions du plan. Conserves : comptes, site public publie, diagnostic, conversations, consommation, connexions.
- Reste incoherent jusqu'a #288 : Paul garde ses outils de l'ancien plan (propositions de lancement d'agents, revisions de productions), dont les resultats ne s'affichent plus. Le bouton « Preparer le plan » du diagnostic mene a la Strategie, sans plan.

## Cross-Story Dependencies

- 10.2 et 10.3 utilisent les vues de mission (`src/lib/missions/view.ts`) et les actions (`MissionActions`) de 10.4.
- Atelier (#289), diffusion (#315), bilan (#294) rempliront l'état du contenu principal : le prochain pas et le suivi en six temps avanceront sans autre changement.
