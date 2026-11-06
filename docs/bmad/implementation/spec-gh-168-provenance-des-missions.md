---
title: 'Chaque mission montre le constat qui la fonde et la déduction de Paul (#168)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '2ed02bd64c4b01cb003d1e3f85eb4e273b495220'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans Stratégie, « Vos missions regroupées » ne dit pas d'où vient une mission. Une mission de Paul affiche « Observé » sans source et « — » pour la déduction ; rien ne relie la mission au constat du diagnostic (FR-15, E-05). Le dirigeant ne peut pas juger la solidité du plan.

**Approach:** Relier une mission à son constat d'origine, donner un niveau de certitude aux constats et enregistrer la déduction de Paul. Chaque ligne de mission montre alors le constat (titre, origine, certitude, note, « Voir la source »), la déduction de Paul, puis la mission.

**Décisions (2026-11-06) :**
- Périmètre : seulement les critères V5.2. Les critères d'octobre (versions de contexte, « contexte non identifié », réexamen quand le métier change) sont reportés dans deferred-work. Deux d'entre eux sont déjà tenus : un diagnostic échoué ne remplace pas le précédent (`splitAudits`), et les diagnostics précédents restent consultables.
- La certitude est enregistrée en base, sur `AuditFinding.certainty`.
- La déduction de Paul est enregistrée sur `Mission.deduction`. Paul la donne en proposant la mission.
- La spec est gardée entière malgré sa taille (environ 2 300 tokens).

## Boundaries & Constraints

**Always:**
- Niveaux et libellés (prd :101) :
  - `observe` → « Observé » ;
  - `piste` → « Piste à qualifier » ;
  - `a_verifier` → « À vérifier » ;
  - « Déclaré par vous » vaut pour les missions créées par le dirigeant.
- Un constat n'est « Observé » que si sa source a été consultée (`sourceStatus` = « consultée » et `sourceUrl` présente). Le code ramène toute autre combinaison à « À vérifier », quoi qu'en dise l'agent.
- Les constats existants reçoivent un niveau par la migration : « Observé » si la source a été consultée, « À vérifier » sinon. Aucune autre donnée n'est réécrite.
- `Mission.sourceFindingId` (clé étrangère, `SetNull`) et `Mission.deduction` (10 à 300 caractères, texte nettoyé comme `finding`) sont tous les deux facultatifs.
- `propose_mission` accepte `findingId` et `deduction`. Un `findingId` doit appartenir à l'entreprise et au diagnostic courant (`splitAudits().latest`), sinon l'outil refuse et l'explique à Paul. `get_current_status` expose les constats courants (id, titre, catégorie, certitude).
- Ligne de mission, colonne 1 :

  | Cas | Titre | Origine | Certitude | Note |
  |-----|-------|---------|-----------|------|
  | Constat relié | `finding.title` | catégorie, plus le domaine de la source s'il y en a une | certitude du constat | `mission.finding` |
  | Mission de Paul sans constat | « Constat relevé par Paul » | « Conversation avec Paul » | « À vérifier » | `mission.finding` |
  | Mission créée par le dirigeant | « Votre constat » | « Déclaré à la création de la mission » | « Déclaré par vous » | `mission.finding` |

  Seul le constat relié a « Voir la source ».
- Colonne 2 :
  - `mission.deduction` ;
  - « Vous avez choisi de le tester. » pour une mission créée par le dirigeant ;
  - « — » quand il n'y en a pas.
- « Voir la source » ouvre une fenêtre (`Modal`) : titre, type (catégorie), contenu, origine, date de lecture (Europe/Paris), incertitude, lien vers la source seulement en http(s). L'action « Questionner ce constat » ouvre Paul dans le contexte « sources », avec le constat comme élément.
- La charte s'applique : vocabulaire figé, de 320 à 1440 px sans défilement horizontal, NFR-8.

**Never:**
- Ne pas présenter comme « Observé » un constat déclaré ou dont la source n'a pas été lue (FR-6).
- Ne pas relancer d'agent, ne pas réécrire l'historique des missions : les missions existantes n'ont ni constat relié ni déduction.
- Ne pas toucher l'ancien plan (`ActionPlanItem`, « Ajouter au plan ») ni les versions de diagnostic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mission reliée | carte Paul acceptée avec findingId courant et une déduction | ligne : titre du constat, origine, certitude, note, « Voir la source », déduction | N/A |
| Constat étranger ou ancien | findingId d'une autre entreprise ou d'un diagnostic précédent | aucune carte, Paul reçoit un refus explicite | N/A |
| Constat supprimé | sourceFindingId remis à null | ligne « Constat relevé par Paul », sans « Voir la source » | N/A |
| Mission du dirigeant | formulaire | « Votre constat », « Déclaré par vous », « Vous avez choisi de le tester. » | N/A |
| Source non lue | agent : certainty observe, sourceStatus « accès limité » | constat enregistré « À vérifier » | N/A |
| Migration | constat consulté avec URL / sans statut | « Observé » / « À vérifier » | N/A |
| Mission ancienne de Paul | aucun lien, aucune déduction | « Constat relevé par Paul », « — » | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` :
  - `AuditFinding` (:309) : ajouter `certainty String @default("a_verifier")`.
  - `Mission` (:551) : ajouter `sourceFindingId String?` (relation `onDelete: SetNull`, index) et `deduction String?`.
- `prisma/migrations/<horodatage après 20261107130000>_provenance_missions/migration.sql` : colonnes, clé étrangère, index, puis UPDATE `certainty='observe'` quand `sourceStatus='consultée'` et `sourceUrl` non nul.
- `src/lib/agents/marketing.ts` :
  - outil `record_audit_finding` : schéma zod :52-86, `sourceStatus` :71, écriture :89-101 ;
  - règles du prompt :194-217.
  - Ajouter `certainty` (enum observe | piste | a_verifier) et le garde-fou qui la ramène à « À vérifier ».
- `src/lib/audit-split.ts` (`splitAudits`), `src/lib/audit-findings.ts:21` (`getLatestAuditFindings`) : le diagnostic courant.
- `src/components/finding-card.tsx` : `CATEGORY_LABELS` (:15, à exporter) et le contrôle `safeSource` (:41).
- `src/lib/missions/service.ts:66` : `createMissionIn(tx, companyId, body, createdBy, ideaId?)` reçoit `sourceFindingId` et `deduction`. `parseMissionBody` valide `deduction` comme `finding`.
- `src/lib/agents/co-ceo.ts` :
  - `propose_mission` (:317-342) : ajouter `findingId` et `deduction` ;
  - `buildCurrentStatus` (:78) : ajouter les constats courants ;
  - le prompt : relier quand un constat existe.
- `src/lib/agents/pending-action-view.ts:167` : `missionCreatePayloadSchema` (strict) reçoit `findingId?` et `deduction?`. `src/lib/agents/pending-actions.ts:89` : l'exécuteur `mission_create` les transmet.
- `src/lib/missions/view.ts:26-100` : `MissionView` reçoit `deduction` et `source` (constat relié : id, titre, catégorie, contenu, URL, statut, certitude, date). Charger la relation.
- `src/app/strategie/page.tsx:141-158` : la colonne 1 et la colonne 2 de la ligne. Le reste de la page ne bouge pas.
- `src/components/modal.tsx` (`Modal`) et `src/lib/paul-context.ts:48` (`openPaul(element, "sources")`) : à réutiliser dans un client `src/app/strategie/finding-source.tsx`.
- Tests :
  - `tests/user-journey.spec.ts:322` (« Déclaré par vous » sur Stratégie) ;
  - `tests/engine.spec.ts` (`capturePaulTools`, cartes `mission_create`) ;
  - `tests/delegation.spec.ts` (règles pures).

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- colonnes, relation, index, reprise de la certitude.
- [x] `src/lib/findings/certainty.ts` -- libellés, `normalizeCertainty(certainty, sourceStatus, sourceUrl)`, `findingOrigin(category, sourceUrl)` -- règles pures partagées.
- [x] `src/lib/agents/marketing.ts` -- `certainty` dans l'outil et le prompt, normalisée à l'écriture.
- [x] `src/lib/missions/service.ts` + `pending-action-view.ts` + `pending-actions.ts` + `co-ceo.ts` -- `findingId` et `deduction` de bout en bout. Le constat est vérifié (entreprise et diagnostic courant) au moment de la proposition et de nouveau à l'acceptation ; un constat devenu invalide à l'acceptation crée la mission sans lien.
- [x] `src/lib/missions/view.ts` + `src/app/strategie/page.tsx` + `src/app/strategie/finding-source.tsx` -- les colonnes 1 et 2 selon les trois cas, et la fenêtre « Voir la source » avec « Questionner ce constat ».
- [x] `tests/delegation.spec.ts` -- `normalizeCertainty`, `findingOrigin`, schéma `mission_create` avec findingId et deduction.
- [x] `tests/engine.spec.ts` -- propose_mission (constat courant accepté, étranger ou ancien refusé), l'acceptation enregistre le lien et la déduction, `SetNull` à la suppression, normalisation à l'écriture de Martine (outil appelé directement).
- [x] `tests/user-journey.spec.ts` -- une mission reliée : titre du constat, certitude, déduction, « Voir la source » ouvre la fenêtre avec l'origine et la date ; une mission du dirigeant inchangée ; largeur à 390 px.

**Acceptance Criteria:**
- Given une mission proposée par Paul à partir d'un constat, when le dirigeant ouvre Stratégie, then il voit le constat, sa certitude et la déduction de Paul, et peut ouvrir la source.
- Given une mission créée par le dirigeant, when il ouvre Stratégie, then le constat porte « Déclaré par vous ».

## Implementation Notes

- `parseMissionBody` n'existe pas : la déduction est validée par `validateDeduction` (`src/lib/missions/rules.ts`), avec les règles du constat (10 à 300 caractères, sans balise, M-20).
- `createMissionIn` reçoit un dernier argument `provenance` ({ sourceFindingId, deduction }) ; il revérifie le constat avec `findCurrentFinding` (`src/lib/audit-findings.ts`) dans la transaction et crée la mission sans lien s'il n'est plus courant. La déduction est gardée.
- `CATEGORY_LABELS` est défini dans le module pur (`FINDING_CATEGORY_LABELS`) et réexporté par `finding-card.tsx` : un composant serveur ne peut pas lire une constante d'un module client.
- La certitude est refaite à la lecture (vue, `get_current_status`) par `normalizeCertainty`, en plus de l'écriture.
- Le titre du constat est en `<strong>`, pas en titre, pour garder le titre de la mission comme seul titre de la ligne.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|--------|---------|---------|----------------|
| 1 | Blind | Le test « Trop court » a 10 caractères : accepté, donc le test échouerait | high | patch : valeur de 9 caractères |
| 2 | Blind + Edge + VG | Deux imports sur une ligne dans delegation.spec.ts | low | patch : retour à la ligne |
| 3 | Blind + Edge | La carte à accepter ne montre ni le constat ni la déduction | medium | patch : lignes sur la carte, test |
| 4 | Blind + Edge | Lien abandonné à l'acceptation sans signal, déduction gardée | low | rejeté : cas rare (nouveau diagnostic entre la proposition et l'acceptation), comportement voulu par la tâche |
| 5 | Blind | « Conversation avec Paul » affiché pour un constat supprimé | false | rejeté : la matrice figée impose cet affichage pour un constat supprimé |
| 6 | Blind | « Questionner ce constat » ne transmet ni la certitude ni la source à Paul | medium | patch : page-context enrichi |
| 7 | Blind + Edge | La reprise de la migration accepte une URL vide ou non http | low | patch : condition `~* '^https?://'` |
| 8 | Blind + Edge | « Observé » possible avec une URL ftp: ou javascript: | medium | patch : `safeSourceUrl` dans `normalizeCertainty` |
| 9 | Blind | Certitude obligatoire dans l'outil : un oubli fait perdre le constat | medium | patch : `.optional()` |
| 10 | Blind | « consultée par Paul » attribue la lecture au mauvais agent | false | rejeté : la charte présente Paul seul au dirigeant |
| 11 | Blind + Edge | « Lu le » utilise la date de création du constat | low | rejeté : le constat est écrit pendant la lecture, dans la même exécution |
| 12 | Blind | Largeur 320 px non testée ; une URL longue peut déborder dans la fenêtre | low | patch : `overflow-wrap` et contrôle à 320 px |
| 13 | Blind | `findCurrentFinding` charge tous les constats | low | rejeté : volumes faibles, l'optimisation ajouterait une requête dédiée |
| 14 | Blind | Pas d'issue de suivi pour les critères reportés | low | rejeté : deferred-work est le registre prévu |
| 15 | VG | La reprise de la migration n'est jamais testée sur des données existantes | medium | defer : pas d'outillage de test de migration ; à contrôler après déploiement |
| 16 | VG | « Preuve utilisée » (prochaine décision, détail de mission) contredit la ligne reliée | medium | defer : la spec laisse le reste de la page inchangé |
| 17 | Edge | Une déduction vide fait refuser toute la proposition | low | patch : déduction vide traitée comme absente |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run build` -- aucune erreur
- `npx prisma validate` -- schéma valide
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- tout passe
- Tests moteur, parcours et sécurité -- en CI
