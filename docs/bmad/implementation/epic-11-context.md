# Epic 11 Context : L'atelier, version par version (vague 3 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner à chaque mission son contenu : un premier brouillon préparé par Paul, que le dirigeant relit, retouche, fait retravailler, refuse avec un motif ou valide, version par version. Valider n'envoie rien : la diffusion (#315, #261, #295) vient ensuite, sur le même contenu.

## Stories

- Story 11.1 : Relire et faire évoluer un contenu, version par version (#289)
- Story 11.2 : Refuser une version avec un motif retenu par Paul (#22, FR-31)
- Story 11.3 : Savoir quoi vérifier avant de valider (#179)

Livrées ensemble dans une seule PR, une spec par story.

## Requirements & Constraints

- Cahier des charges FR-26 à FR-32 ; spécification §2.2 (la création produit un premier brouillon, 0 crédit), §4.1 à §4.5, §5.6 (contraintes par canal), §8 (1 crédit par version préparée avec Paul), §13.3, §14, §15 ; charte V5.2.
- Le serveur décide : chaque geste passe par `POST /api/contents/[id]` (une action, la version vue) ; les règles sont des fonctions pures (`src/lib/contents/rules.ts`) partagées par le serveur, l'interface et les tests.
- Une version n'est jamais modifiée après sa création, sauf son refus motivé ; toute retouche crée une version et retire la validation.

## Technical Decisions

- **Tables** `MissionContent` (un contenu par mission pour le PoC, `@@unique([missionId])`, numéro courant, numéro validé, proposition de Paul en attente, version optimiste) et `ContentVersion` (numéro, accroche ou objet ≤ 100, texte ≤ 3 000, auteur vous / Paul / système, note, refus et motif). Migration additive `20261106120000_mission_contents`.
- **Premier brouillon** : `prepareFirstDraft` (idempotent, deux demandes simultanées n'en créent qu'un) est lancé après la réponse (`after`) à la création et au lancement d'une mission, et à la demande (« Préparer le brouillon avec Paul ») si Paul a échoué. Sans clé de modèle (tests, poste local), aucun appel n'est fait en arrière-plan.
- **Paul écrit** (`src/lib/contents/writer.ts`) sous la réservation de budget de l'entreprise (`reserveUsageBudget`, usage `mission_content`), coût mesuré enregistré, réservation libérée si l'appel échoue. Le modèle refuse un outil imposé : la consigne système demande l'outil `write_content`, une réponse sans lui est un échec (M-79). Consignes : au nom de l'entreprise, rien d'inventé (prix, dates, chiffres, coordonnées), repères entre crochets à compléter, motifs de refus de la mission à respecter. L'écrivain est injectable : les tests passent un écrivain factice.
- **« Retravailler avec Paul »** : plus court, plus humain, un autre angle, ou une consigne (5 à 300 caractères). La proposition est gardée en attente sans crédit ; « Garder cette version » débite 1 crédit et crée la version dans la même transaction. Le solde est vérifié avant d'appeler Paul (M-15).
- **Changement de canal** avant validation (J-29) : le texte courant est repris dans une version « système » au format du nouveau canal.
- **Retouches non enregistrées** : gardées dans l'onglet (`sessionStorage`), signalées, et elles bloquent la validation et la demande à Paul (M-60), côté interface.
- **Étape des missions** : `view.ts` fournit l'état réel du contenu (version, validation, canal connecté) ; « à valider », « canal à connecter » et le prochain pas avancent sans autre changement. Programmation, diffusion et bilan restent à `false` jusqu'à #315, #261, #295 et #294.
- **Nouveaux messages** (§14) : M-77 case « J'ai relu » non cochée, M-78 façon de retravailler, M-79 Paul n'a pas pu écrire (503). M-16 sert aux bornes de l'accroche, du texte et du motif.

## Cross-Story Dependencies

- 11.2 et 11.3 s'appuient sur les versions et le dialogue de validation de 11.1.
- Restent hors de cet epic : profil relu (§4.4 condition 3, §4.5), visuels et marque (M-51, #290), destinataires e-mail réels (#316, #287), diffusion et programmation (#315, #261, #295).
