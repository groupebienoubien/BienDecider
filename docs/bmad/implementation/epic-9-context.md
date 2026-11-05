# Epic 9 Context : Socle des missions et des crédits (vague 1 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Poser, côté serveur, le modèle Mission, son catalogue et les crédits, sur lesquels se construisent les pages V5.2 (Stratégie, Missions, Atelier, Résultats) et Paul. Aucune nouvelle page de parcours : les règles existent et sont testées avant les écrans (jalon « PoC 2 - Parcours cible V5.2 », vague 1 du suivi #272).

## Stories

- Story 9.1 : Cadrer le modèle Mission (#277)
- Story 9.2 : Choisir un modèle d'action dans un catalogue ouvert, ou créer une mission sur mesure (#314)
- Story 9.3 : Voir mon solde de crédits et le coût de chaque action (#56)

Ordre de réalisation : 9.1, 9.2, 9.3, livrées ensemble dans une seule PR (une spec par US, un commit par US quand le code le permet). Hors lot : #41 (journal, dépend de la décision des fondateurs #35), #35 et #36 (délégation, décision des fondateurs).

## Requirements & Constraints

- Cible : `docs/cible-produit.md` ; cahier des charges FR-18, FR-25, FR-53, FR-59, FR-61 ; spécification §2, §6.1, §8, §12, §14 ; addendum §1 à §5.
- Le serveur décide : chaque transition est une fonction de service unique, appelée par l'interface, par Paul et plus tard par l'ordonnanceur (addendum §1). Une transition, une transaction ; concurrence optimiste (`expectedVersion`, M-02) ; refus codés `{ code, message }`.
- Toute route est déclarée dans `tests/security.spec.ts` ; l'entreprise vient toujours de la session, jamais du corps de la requête ; contrôle de l'origine pour les écritures. Zone CODEOWNERS touchée : `prisma/`.

## Technical Decisions

- **Table neuve `Mission`, sans reprise de l'ancien plan d'action** (décision des fondateurs du 2026-11-05, contraire à l'addendum §2.1 qui prévoyait d'évoluer `ActionPlanItem`) : modèle propre, sans colonnes historiques. `ActionPlanItem` et le parcours actuel restent en l'état jusqu'à la bascule vers les nouvelles pages (vague 7) ; aucune donnée ancienne n'est migrée (les actions du plan, leurs propositions et leurs exécutions restent dans leurs tables d'origine). La correspondance avec la maquette (addendum §3) et les autres objets (§4) sont livrés par la première US qui en a besoin.
- Catalogue en données (`src/lib/missions/templates.ts`) : clé, libellé, canaux permis, format, périmètre, règle d'arrêt, modèle ouvert ou non. « Réactivation » reste fermée tant que l'encadrement du fichier de prospection (#69) n'est pas fait. Un modèle n'est proposé que s'il a au moins un canal actif (D4) ; « Sur mesure » l'est toujours (hors canal possible).
- Canaux actifs : champ `enabled` de `src/lib/channel-capabilities.ts` (source unique), vrai seulement quand le connecteur est livré.
- Crédits : colonne `Company.creditBalance` (20 par défaut), registre `CreditLedger` en ajout seul ; les 20 crédits offerts sont écrits au registre à la première lecture, de façon atomique (`creditGrantedAt`). Débit par mise à jour conditionnelle dans la transaction de la transition (M-15 sinon).
- Hors lot, notés pour les US qui en ont besoin : journal J-xx (#41) écrit dans la transaction de chaque transition ; priorité de mission et prochain pas (#283) ; versions de contenu et validation (#289) qui posent `hasValidatedVersion` ; contrôle d'existence des agences, contacts et réalisations dans le périmètre (#316, #287, #317).
- Messages : spec §14 ; deux messages ajoutés pour les cas que la spec ne couvrait pas, M-75 (plafond de dix missions) et M-76 (modèle indisponible).

## Cross-Story Dependencies

- 9.2 et 9.3 s'appuient sur le modèle de 9.1 ; le lancement (9.1) débite les crédits (9.3).
- Les US d'interface de PoC 2 (#278, #283, #285, #286, #313) appellent ces services sans y ajouter de règle.
