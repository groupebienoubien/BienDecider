---
title: 'GH-284 — Trois premières missions fondées sur le diagnostic et l’ambition'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
baseline_commit: '266fda2e6b173a3a67eb67660f7146700e85751a'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** l'étape 4 du parcours d'entrée affiche trois missions à ordre fixe, dont le constat recopie le profil déclaré : pas de rappel de l'entreprise, pas de « Ce que nous retenons », pas de périmètre ni de priorité. Une fois le compte créé, rien ne permet à Paul de proposer de nouvelles missions à partir du diagnostic courant.

**Approche :**
- **A, étape 4 (FR-8).** Un choix de modèles fondé sur le profil confirmé, l'analyse et l'ambition, avec pour chaque mission un constat d'origine, un résultat recherché, un périmètre proposé et la mention « À examiner en premier ». La priorité est reprise à l'inscription.
- **B, compte connecté.** Un clic « Préparer mes missions » sur Stratégie lance une exécution de Paul, comptée comme un lancement, qui crée au plus trois missions sourcées.

**Décisions de Samir (2026-11-08)**
- A et B dans la même US.
- « Ce que nous retenons » est rédigé par un appel de modèle anonyme.
  - Il est fait au clic « C'est bien ça » (confirmation de l'ambition), jamais au chargement de la page.
  - Il est gardé dans le brouillon (`ambition.retained`, coût dans `ambition.retainedCost`).
  - Quota IP dédié et repli sur des règles : le parcours n'est jamais bloqué.
  - Le coût passe au compte à l'inscription (`UsageEvent`, agent `onboarding_synthesis`).
- B crée directement des missions « À décider » (pas de cartes).
- L'agent responsable et le risque ou limite sont rédigés par Paul. Deux colonnes facultatives s'ajoutent à `Mission` : `responsibleAgent` (clé de `PERSONAS`) et `risk` (10 à 200 caractères, sans balise). À l'étape 4, ce sont des valeurs par défaut du modèle d'action.
- Gabarits du PoC : seul le catalogue ouvert compte. Réalisation arrive avec #317, Réactivation avec #69.

## Boundaries & Constraints

**Always :**
- Modèles pris dans `availableTemplates()` : un modèle sans canal actif n'est jamais proposé (#301, §6.1).
- Toute mission passe `validateNewMission`.
- Étape 4 :
  - Trois missions au plus, toutes de modèles différents.
  - La première est marquée « À examiner en premier ».
  - Le constat cite son origine : « Lu sur le site » pour une valeur `observed`, sinon « Vous nous avez dit ».
- « Ça m'intéresse » ne crée rien. L'inscription crée les missions « À décider », dans l'ordre, et règle `Company.priorityMissionId` sur la première, sans J-08 ni lancement.
- B :
  - Démarré seulement par un clic, avec un `requestId` par clic.
  - Passe par `persistRun` (quota `runs`, dédoublonnage actif, reprise après échec).
  - Chaque mission porte `sourceFindingId` (constat courant) et une `deduction` (la raison de Paul).
  - Résultat formulé comme une cible avec échéance, jamais comme une promesse.
- Refus (#22) : B ne repropose jamais à l'identique (`normalizeForComparison`) le titre d'une mission écartée, d'une carte `mission_create` refusée ou d'une proposition `rejetee`, ni d'une mission ouverte. Une régénération ne supprime ni ne modifie aucune mission existante.
- Une demande qu'aucun modèle ne couvre passe par `record_uncovered_request` (source `mission`).
- Vocabulaire et charte : une action principale par page, Paul seul, de 320 à 1440 px.

**Never :**
- Aucun appel de modèle au chargement d'une page.
- Aucun compte ni aucune mission créés avant l'étape 5.
- Aucune mission lancée par B.
- Ne pas toucher au flux `ActionPlanItem` (« Préparer le plan »).
- Hors périmètre : la trace des visites (#296), le chiffrage (#169) et la lecture du site en constats (#292).

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Attendu | Erreur |
|---|---|---|---|
| Étape 4 nominale | Profil confirmé, ambition confirmée, analyse `done` | Rappel (nom, localisation, activité, zone), cap, 2 ou 3 phrases « Ce que nous retenons », 3 missions, la 1ʳᵉ « À examiner en premier » | — |
| Analyse absente ou `limited` | Pas de site | Constats « Vous nous avez dit » ; réserve « Paul n'a pas pu lire votre site » | — |
| Synthèse sans modèle | Pas de clé, quota IP atteint, échec ou sortie invalide | Synthèse par les règles (Design Notes), même forme | Jamais bloquant |
| Retour avant l'étape 4 | Diagnostic plus prêt | `retained` effacé, recalculé à la prochaine confirmation | — |
| Ambition sans gain ou horizon | `terms` incomplets | Réserve : la cible reste à préciser | — |
| Inscription | Étape 5 valide | Missions `proposed` dans l'ordre de l'étape 4, priorité sur la 1ʳᵉ | Transaction annulée en bloc |
| B sans diagnostic | Aucun `AuditFinding` courant | Bouton remplacé par un renvoi vers le diagnostic ; route 409 | Message clair |
| B, double clic | Même `requestId` ou exécution active | Une seule exécution | 200/202 sur l'exécution existante |
| B, quota atteint | `AgentRunQuotaError` | Rien n'est créé | 429, message du quota |
| B, échec du modèle | Exception ou aucune mission | Exécution `failed`, nouveau clic possible | `no_result` |
| B, titre déjà refusé | Titre normalisé égal à un refus ou à une mission ouverte | Proposition refusée par l'outil, Paul en choisit une autre | Retour d'outil explicite |
| B, plafond | 10 missions ouvertes | Outil refusé | Message de `validateNewMission` |

</frozen-after-approval>

## Code Map

- `src/lib/onboarding/draft-rules.ts`
  - Contient `STARTER_TEMPLATE_ORDER`, `pickStarterTemplates`, `starterMission(s)` (L356-410) et `clip` : à remplacer par un choix fondé sur le brouillon.
  - `DraftState`, `DraftProfile` et `DraftAmbition` sont aux lignes 18-46. Le cas `interested` (L303) n'est pas à modifier.
- `src/lib/onboarding/analysis-rules.ts`
  - `Finding`/`Provenance` (L38), `AnalysisFindings` (L41) et `DraftAnalysis.rubrics` (`RUBRIC_KEYS`) servent aux réserves.
- `src/lib/ambition-rules.ts` : `capLabel`, `foundElements` et `ambitionQuestions` pour le cap et ses réserves.
- `src/app/bienvenue/missions/page.tsx` : la page de l'étape 4, à réécrire. Garder `requireDraftPage`, `WelcomeFrame step={4}` et `InterestButton`.
- `src/app/api/auth/signup/route.ts`
  - Ligne 114 : boucle `createMissionIn`. Passer `deduction` et régler `priorityMissionId` dans la même transaction.
- `src/lib/missions/templates.ts`
  - `MISSION_TEMPLATES`, `availableTemplates` et `enabledChannels`.
  - Un périmètre vide est accepté hors `custom` (`rules.ts` L48). `social_post` reçoit un `topic` tiré des offres.
- `src/lib/missions/service.ts` : `createMissionIn(tx, companyId, body, createdBy, ideaId, {sourceFindingId, deduction})`. Le cas `custom` y écrit déjà un `UncoveredRequest`.
- `src/lib/missions/rules.ts` : `validateNewMission`, `validateDeduction` et `MAX_OPEN_OWNER_MISSIONS`.
- `src/lib/missions/view.ts` / `stage.ts` : `priorityOf` et `priorityMissionId` pour la priorité calculée.
- `src/lib/agent-runs.ts`
  - Modèle à suivre : `enqueuePlanGeneration` (L242), `persistRun` (L73) et `executeRun` (L302).
  - Ajouter le type `mission_generation`, avec la clé `mission-generation:<uuid>` et la clé active `mission-generation`.
- `src/lib/agents/co-ceo.ts`
  - Modèles à suivre : `runCoCeoPlanningImpl` (L515-636) avec `runToolLoop`, `ensureAgentProduced`, `withAgentRunWrite` et `uncoveredRequestTool` (L48) ; `propose_mission` (L326-365) pour les contrôles de constat et de déduction.
- `src/lib/agents/rejection-context.ts` : `getRejectionContext`, `normalizeForComparison`.
- `src/lib/agents/pending-actions.ts` : L89 et L133 pour les cartes `mission_create` refusées.
- `src/lib/audit-findings.ts` : `getLatestAuditFindings`, `findCurrentFinding`.
- `src/app/api/co-ceo/plan/route.ts` : à recopier dans `src/app/api/co-ceo/missions/route.ts`.
- `src/app/strategie/page.tsx`
  - L43-46 : en-tête. L128-137 : état vide. C'est là que va le bouton.
  - `src/app/diagnostic/diagnostic-client.tsx` `preparePlan` (L69-99) est le modèle du client (`waitForAgentRun`).
- Tests
  - `tests/delegation.spec.ts` : L2164 (GH-279, ordre fixe), à remplacer.
  - `tests/engine.spec.ts` : `processWithScenario` (L3016), `captureSystemBlocks`, L1459 (double lancement).
  - `tests/user-journey.spec.ts` : L2688 (parcours, 3 éléments).
  - `tests/security.spec.ts` : L62 (gardes de route).

## Tasks & Acceptance

**Exécution :**
- [x] `src/lib/onboarding/draft-rules.ts`
  - Remplacer l'ordre fixe par `starterPlan(state, available?)`, fonction pure. Elle renvoie `{ recap, retained: string[2..3], missions: StarterMission[≤3] }`, où `retained` vaut `ambition.retained` ou, à défaut, `retainedFromRules`.
  - Chaque `StarterMission` ajoute `origin` (« Lu sur le site » | « Vous nous avez dit »), `scopeLabel` (§6.3), `deduction` et `first: boolean`.
  - Les règles de choix et de rang suivent les Design Notes.
- [x] `src/lib/onboarding/synthesis.ts` (nouveau)
  - `writeRetained(state, {model})` : outil forcé `write_retained` produisant 2 à 3 phrases de 20 à 240 caractères, sans balise. 400 jetons et 15 s au plus, `maxRetries` 0.
  - Repli `retainedFromRules(state)`, aussi utilisé si la sortie est invalide.
  - Garde anonyme sur le modèle de `anonymousAmbitionModel`, avec une nouvelle portée `synthesis` (10 par 24 h) dans `src/lib/auth-throttle.ts`.
- [x] `src/lib/onboarding/draft-rules.ts` et `src/app/api/bienvenue/route.ts`
  - À `confirm_ambition` réussi, la route calcule `retained` et l'enregistre avec son coût dans `ambition`. `readDraftState` relit ces champs de façon défensive.
  - Un retour avant l'étape 4 efface `retained`.
- [x] `prisma/schema.prisma` et `prisma/migrations/20261108100000_mission_agent_risque/migration.sql` : `Mission.responsibleAgent String?` et `Mission.risk String?`. Vérifier les horodatages sur `origin/main` avant de pousser.
- [x] `src/lib/missions/rules.ts`, `service.ts` et `src/lib/missions/templates.ts`
  - Ajouter `validateRisk` (10 à 200 caractères, sans balise) et un agent valide (clé de `PERSONAS`).
  - `createMissionIn` accepte `{responsibleAgent, risk}` facultatifs.
  - Chaque modèle reçoit `defaultAgent` et `defaultRisk`, utilisés à l'étape 4.
- [x] Missions de Stratégie et détail d'une mission : afficher l'agent et le risque quand ils sont présents.
- [x] `src/app/bienvenue/missions/page.tsx`
  - Afficher le rappel, le cap, « Ce que nous retenons » et les missions (constat et origine, résultat recherché, périmètre proposé, badge « À examiner en premier »).
  - Garder `InterestButton` comme seule action principale.
- [x] `src/app/api/auth/signup/route.ts`
  - Créer les missions de `starterPlan` avec `deduction`, `responsibleAgent` et `risk` par défaut.
  - Faire `company.update({ priorityMissionId })` sur la première.
  - Écrire l'`UsageEvent` `onboarding_synthesis` quand `retainedCost` n'est pas nul.
- [x] `src/lib/agent-runs.ts` et `src/app/api/co-ceo/missions/route.ts` : `enqueueMissionGeneration`, le type `mission_generation` et la route POST, avec les mêmes contrôles et codes que `plan/route.ts`. Ajouter un 409 `no_diagnostic`.
- [x] `src/lib/agents/co-ceo.ts`
  - `runCoCeoMissionsImpl` avec l'outil `propose_first_mission` : modèle, canal, titre, résultat avec échéance, constat (`findingId` courant), raison, périmètre, agent responsable, risque ou limite.
  - Ajouter `record_uncovered_request` (source `mission`). Au plus 3 missions, refus des doublons (Boundaries), création par `createMissionIn` (`createdBy: "paul"`).
- [x] `src/app/strategie/page.tsx` et `src/app/strategie/prepare-missions.tsx` : bouton « Préparer mes missions » (client, `requestId` par clic, attente, erreur et reprise). Sans diagnostic, un lien vers `/diagnostic` le remplace.
- [x] Tests
  - `tests/delegation.spec.ts` : choix, rang, réserves, origine, périmètres valides, modèle sans canal exclu.
  - `tests/engine.spec.ts` : scénario simulé (3 missions, doublon refusé, demande non couverte, `no_result`, double clic).
  - `tests/security.spec.ts` : route sans session, origine, 409 sans diagnostic.
  - `tests/user-journey.spec.ts` : étape 4 et priorité après l'inscription.

**Critères d'acceptation :**
- Étant donné un brouillon à l'étape 4, quand la page se charge, aucun appel de modèle n'a lieu et aucune ligne `Mission` ou `Company` n'existe.
- Étant donné l'inscription terminée, quand Stratégie s'ouvre, les missions de l'étape 4 sont « À décider » dans le même ordre, la première est la priorité, et rien n'est lancé.
- Étant donné un compte avec un diagnostic, quand le dirigeant clique « Préparer mes missions », au plus trois missions sourcées sont ajoutées, et les missions existantes restent inchangées.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Passe 1 : Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V).

| # | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|
| B1/E1/E15 | `PROMISE` ne reconnaît pas « assuré » ni « à coup sûr » | high | Le `\b` ASCII échoue à côté d'une lettre accentuée, donc la règle « jamais une promesse » n'est pas tenue | patch |
| B2/E2 | `DEADLINE` refuse « 1 an », « sept jours », « vingt jours » | medium | Les unités et les nombres manquent ; refus répétés jusqu'à `no_result` | patch |
| B3/E3 | Deux appels parallèles d'un même titre passent le contrôle de doublon | medium | `blocked.add` intervient après l'`await` de création | patch (sérialisation) |
| E4 | Plafond de 10 missions ouvertes dépassable en parallèle | medium | Chaque création compte dans sa propre transaction | patch (même sérialisation) |
| B4/E7 | Les cartes annulées comme orphelines comptent comme des refus | medium | `pending-actions.ts` L235 passe en `cancelled` sans `decidedAt` ; un refus du dirigeant écrit `decidedAt` (L270) | patch |
| B4b | Une mission arrêtée peut être reproposée | false | Les Boundaries visent les missions ouvertes, écartées et refusées, pas les arrêtées | rejet |
| B5/E8 | Avec 10 missions ouvertes, un clic consomme un lancement pour rien | medium | La route ne contrôle pas le plafond avant `enqueue` | patch |
| B6 | Message de succès perdu ou faux (« une mission » pour 0) | low | 0 mission donne `no_result`, pas un succès ; les missions apparaissent après le rafraîchissement | rejet (garde supplémentaire) |
| B7 | `validateRisk` et `validateResponsibleAgent` renvoient M-20 | low | Seul Paul fournit ces champs, et l'outil a son propre message | rejet |
| B8 | La synthèse du modèle n'est pas contrôlée contre les promesses | medium | `readRetained` ne vérifie que la forme | patch |
| E11 | Phrases en double : clés React en double | low | Correction directe (clé par rang) | patch |
| B9 | « Paul n'a pas pu lire votre site » s'affiche quand aucun site n'a été donné | medium | Contredit le constat « Vous n'avez pas indiqué de site » sur la même page | patch |
| B9b | Le rappel répète la ville (zone = localisation) | low | Correction directe | patch |
| B12 | `clip` garde `<` et `>`, et un sujet court invalide le périmètre : l'inscription échoue | high | `validateNewMission` refuse les balises et `textScope` impose 5 caractères au moins ; la transaction annule le compte | patch |
| E13 | Les modèles de l'étape 4 sont recalculés à l'inscription | low | Les canaux sont codés en dur ; un changement entre deux étapes est improbable | rejet |
| B11 | Libellés « Limite » et « Risque ou limite » | low | Correction directe | patch |
| B11b | Trois boutons dans l'en-tête de Stratégie | medium | La charte demande une seule action principale | patch (style secondaire) |
| E9 | « Lancer mon diagnostic » quand le diagnostic a tourné sans constat | low | Correction directe du libellé | patch |
| E10 | Moins de trois pistes affichées sous un intitulé « trois » | low | Avec les modèles ouverts, il y en a toujours 3 ; le titre de l'étape est figé par la spécification | rejet |
| E5/E14 | Constat devenu non courant pendant l'exécution : mission sans lien | low | Il faut un nouveau diagnostic pendant l'exécution, ce qui est rare ; `createMissionIn` documente ce comportement | rejet |
| E6 | Une exécution relancée peut créer plus de 3 missions | low | Seulement après la reprise d'une exécution bloquée ; doublons de titre refusés | rejet |
| B10a/E12 | Coût de la synthèse perdu si `saveDraft` renvoie 409 | low | Concurrence rare sur un brouillon anonyme | rejet |
| V1 | Aucun test ne vérifie `ambition.retained` enregistré | medium | Écart signalé, déjà vérifié | patch |
| V2/B10b | Aucun test de l'`UsageEvent` `onboarding_synthesis` | medium | Écart signalé, déjà vérifié | patch |
| V3/B10c | L'ordre des missions est comparé après tri | medium | Écart signalé, déjà vérifié | patch |
| V4 | Bouton de Stratégie, agent et risque jamais affichés en test | medium | Écart signalé, déjà vérifié | patch |
| V5 | `retryRunId` sans appelant | low | Suppression directe | patch |
| B10d | Pas de test « aucun appel de modèle au chargement de l'étape 4 » | low | La page n'importe pas `synthesis.ts` ; l'appel n'est fait que dans la route, sur `confirm_ambition` | rejet |

## Design Notes

**Choix à l'étape 4**, déterministe :
- Candidats : `availableTemplates()`, sans `agencies` (aucune liste d'agences avant le compte).
- Rang :
  1. `site_page` si l'analyse n'a pas lu de site ou si l'ambition vise des demandes ;
  2. `social_post` (sujet : la première offre, rognée de 5 à 120) ;
  3. `google_profile`/`review_reply` si leur canal s'ouvre ;
  4. `custom` en dernier recours (description tirée de l'ambition).
- Le premier est « À examiner en premier ». Sa `deduction` dit pourquoi, par exemple : « Votre site ne présente pas encore {offre} : c'est le premier point d'entrée de vos clients. »

**« Ce que nous retenons »**
- Consigne du modèle : deux ou trois phrases sur ce que Paul retient, avec ses réserves, à partir du profil, de l'analyse et du cap. Rien d'inventé, aucune promesse.
- Repli `retainedFromRules`, phrase par phrase :
- Phrase 1 : activité et zone.
- Phrase 2 : le cap (`capLabel`).
- Phrase 3 : les réserves, c'est-à-dire les rubriques non lues, les valeurs « À confirmer » et les éléments d'ambition manquants, plus « C'est une cible, pas une promesse de résultat. ».

## Verification

**Commandes :**
- `npm run lint` -- attendu : aucune erreur
- `npx tsc --noEmit` -- attendu : aucune erreur
- `npx prisma validate` -- attendu : schéma valide
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- attendu : tous verts
- `npm run build` -- attendu : succès

**Vérification manuelle :** `npx next dev --port 3310`, puis le parcours `/bienvenue` jusqu'à l'étape 4, à 320 et à 1440 px.
