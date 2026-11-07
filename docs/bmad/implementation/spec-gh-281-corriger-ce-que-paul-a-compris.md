---
title: 'Corriger ce que Paul a compris de mon entreprise (#281)'
type: 'feature'
created: '2026-11-07'
status: 'done'
baseline_commit: '2aee0d6ce8aa8d6779b6e77517f956d25a49abde'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'étape 2 de `/bienvenue` affiche déjà le profil prérempli par l'analyse (#280), mais pas sous la forme que demande FR-5.
- Les origines sont « Observé par Paul, à vérifier. » et « Hypothèse de Paul, à vérifier. » au lieu de « Lu sur le site » et « À confirmer ».
- Rien ne permet de revenir à la découverte.
- Les clients prioritaires et les offres principales confirmées ne servent à aucun agent.
- Le coût de l'analyse anonyme disparaît avec le brouillon.

**Approach:**
- **Étape 2.**
  - Chaque champ (activité, zone d'intervention, clients prioritaires, offres principales) affiche son origine : « Lu sur le site » (observé), « À confirmer » (hypothèse de Paul), « À renseigner par vous » (vide). Une valeur déjà saisie par le dirigeant n'a pas d'étiquette.
  - « Oui, c'est bien moi » reste l'action principale. « Non, corriger mes informations » revient à l'étape 1 sans rien effacer.
- **Agents.** La ligne « Entreprise » des consignes de Paul et des agents ajoute, quand ils sont renseignés, « Clients prioritaires : … » et « Offres principales : … ». Une fonction partagée la construit.
- **Inscription.** Le coût de l'analyse anonyme devient un `UsageEvent` du nouveau compte, dans la transaction d'inscription.

Décisions de Samir (2026-11-07) :
- Inclure les clients et les offres dans les consignes des agents, et le coût de l'analyse au compte.
- Transformer la lecture du site en constats (`AuditFinding`, `SourceRead`) relève de #292, pas de #281.
- Une valeur reformulée par le modèle reste « À confirmer », même quand elle vient du texte du site, comme l'a décidé #280 (FR-4). « Lu sur le site » est réservé aux valeurs relevées telles quelles, qui viendront avec #292. Aujourd'hui, un vrai visiteur ne voit donc que « À confirmer » ou « À renseigner par vous ».

## Boundaries & Constraints

**Always:**
- Une valeur lue par le modèle sans source n'est jamais étiquetée « Lu sur le site » : seule la provenance `observed` donne cette étiquette (FR-4).
- Le retour à la découverte garde les saisies et l'analyse ; il retire la confirmation du profil seulement si une donnée de découverte change (règle existante de `discover`).
- Le coût est repris une seule fois (le brouillon est effacé dans la même transaction). Il ne l'est que s'il est supérieur à 0, avec le modèle réellement utilisé.
- Les consignes échappent les valeurs comme les autres champs du profil : texte brut, déjà sans `<` ni `>`.

**Never:**
- Pas de palette ni d'aperçu de la source (#290), pas de concurrents ni de constats (#292), pas de correction après le compte (#169).
- Aucun témoignage, label, certification ni résultat commercial déduit du site : ne rien ajouter à l'extraction.
- Ne pas modifier une migration appliquée. Aucune migration n'est nécessaire (`analysis` est du JSON).

</frozen-after-approval>

## Code Map

- `src/app/bienvenue/step-forms.tsx` -- `ORIGIN_HINTS` (l. 180) et `ProfileForm` (l. 187) : libellés à remplacer ; ajouter le bouton secondaire qui envoie `{ action: "back", step: 1 }` avec `useDraftAction` (même modèle que les autres boutons).
- `src/app/bienvenue/page.tsx` -- l. 55 : introduction sur les hypothèses ; l. 77-83 : étape 2. Étiquettes des champs : « Vos clients » devient « Vos clients prioritaires », « Vos offres » devient « Vos offres principales ».
- `src/lib/onboarding/draft-rules.ts` -- `prefillProfile` (l. 436), `ProfileOrigin`, action `back` déjà permise de 2 vers 1.
- `src/lib/onboarding/analysis.ts` -- `addUsage` (l. 170) : ajouter `model` au coût enregistré.
- `src/lib/onboarding/analysis-rules.ts` -- `DraftAnalysis.cost` et son schéma zod : `model?: string` (au plus 100 caractères). Un brouillon ancien sans `model` reste lisible.
- `src/app/api/auth/signup/route.ts` -- transaction l. 77-110 : y créer le `UsageEvent` (`agent: "onboarding_analysis"`, `model`, jetons, `costUsd`). Ce coût compte dans le budget du jour du compte, ce qui est attendu (quelques centimes).
- `src/lib/company-profile.ts` -- ajouter `companyContextLine(company)`, qui produit « Entreprise : {nom} (métier : …), zone de chalandise : …. » suivi des clients et des offres s'ils sont renseignés.
- Lignes « Entreprise : » à remplacer par la fonction partagée : `src/lib/agents/co-ceo.ts:444` et `:589`, `contenu.ts:88`, `demarchage.ts:204`, `marketing.ts:204`, `revision.ts:161`. Vérifier que l'objet `company` transmis contient `targetClients` et `offers` ; le `select` le cas échéant.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/bienvenue/step-forms.tsx` et `page.tsx` -- libellés d'origine, étiquettes des champs, bouton « Non, corriger mes informations ».
- [x] `src/lib/onboarding/analysis-rules.ts` et `analysis.ts` -- modèle gardé dans le coût.
- [x] `src/app/api/auth/signup/route.ts` -- `UsageEvent` du coût de l'analyse dans la transaction.
- [x] `src/lib/company-profile.ts` et `src/lib/agents/*` -- `companyContextLine` utilisée partout.
- [x] Tests :
  - `tests/delegation.spec.ts` : `companyContextLine` avec et sans clients ni offres ; libellé d'origine pour chaque provenance ; coût lu avec et sans `model`.
  - `tests/user-journey.spec.ts` : « Non, corriger mes informations » ramène à l'étape 1 avec les saisies gardées ; les étiquettes « Lu sur le site » et « À confirmer » sont visibles.
  - `tests/security.spec.ts` ou le test d'inscription existant : un brouillon dont l'analyse a coûté écrit exactement un `UsageEvent`, et aucun si le coût est nul.

**Acceptance Criteria:**
- Given une analyse qui a lu les offres sur le site, when l'étape 2 s'affiche, then le champ « Vos offres principales » porte « Lu sur le site ».
- Given une valeur proposée par le modèle sans source, then elle porte « À confirmer », jamais « Lu sur le site ».
- Given l'étape 2, when le dirigeant choisit « Non, corriger mes informations », then l'étape 1 s'ouvre avec ses saisies, et « Voir mes premiers constats » ramène à l'étape 2 sans nouvelle analyse si rien n'a changé.
- Given un compte avec clients et offres, when Paul ou un agent prépare sa consigne, then elle contient « Clients prioritaires : … » et « Offres principales : … ».
- Given un brouillon dont l'analyse a coûté 0,02 $, when le compte est créé, then un `UsageEvent` de 0,02 $ existe pour ce compte.

## Implementation Notes

- L'étiquette d'origine disparaît dès que le dirigeant modifie le champ ; elle revient s'il remet la valeur proposée.
- Une zone reprise de la localisation déclarée est une proposition de Paul : « À confirmer ». Sans site, l'introduction de l'étape 2 devient donc « voici ce que Paul a compris de … » (règle `prefillFromPaul`).
- `companyFocusText` (clients prioritaires, offres principales) complète aussi les consignes de rédaction des contenus (`contents/writer.ts`), de génération du site (`site/publish.ts`) et de recherche d'agences (`agencies/finder.ts`).
- Le coût n'est repris que si l'analyse garde son modèle : un brouillon analysé avant le déploiement n'en écrit pas. Seule la dernière analyse d'un brouillon est reprise (report pour #311).
- « Non, corriger mes informations » ne garde pas les modifications de l'étape 2 non confirmées (rejeté au tri).
- Vérifié en local : lint, `tsc`, `prisma validate`, 157 tests de délégation, build. Les tests `engine`, `security` et `user-journey` ne tournent qu'en CI.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind | « Lu sur le site » n'apparaît jamais pour un vrai visiteur | medium | `runDraftAnalysis` marque activité, zone, clients et offres en `hypothesis` | intent_gap tranché par Samir (garder « À confirmer ») ; aucun changement de code |
| 2 | blind | L'étiquette d'origine reste affichée après que le dirigeant a modifié le champ | medium | `origin(key)` lit `prefill.origins` sans regarder la valeur courante ; la règle dit « saisi par le dirigeant : pas d'étiquette » | patch |
| 3 | blind / edge | « Non, corriger mes informations » perd les modifications de l'étape 2 non confirmées | low | Il faut avoir tapé à l'étape 2 puis choisir de corriger l'étape 1 ; la correction ajoute un enregistrement non confirmé et de nouvelles règles | rejeté |
| 4 | edge | Ancienne erreur de confirmation affichée à la place de l'erreur du retour | low | Deux échecs de suite sont rares ; correction de forme | rejeté |
| 5 | edge | `oneLine` laisse « Dépannage . » quand une espace précède le point | low | `.replace(/\.+$/, "")` après `trim` ne retire pas l'espace ; correction directe de l'expression | patch |
| 6 | edge / blind | Seul le coût de la dernière analyse est repris (`newAnalysis` remet le coût à 0) | medium | Comportement de #280 : chaque relance remplace l'analyse | defer |
| 7 | edge / blind | Brouillons d'avant le déploiement : coût non repris, faute de modèle | low | Concerne 24 h de brouillons et quelques centimes | rejeté |
| 8 | edge / blind | `contents/writer.ts`, `site/publish.ts` et `agencies/finder.ts` gardent leur propre ligne « Entreprise » sans clients ni offres | medium | Le contenu des missions et le site ignorent les offres confirmées ; la spec dit « utilisée partout » | patch |
| 9 | blind | Clients et offres non modifiables après le compte | low | L'intention exclut la correction après le compte (#169) | rejeté |
| 10 | blind | `companyContextLine` ne nettoie pas le nom, le métier ni la zone ; placée hors de `personas.ts` | low | Ces champs sont déjà nettoyés à l'enregistrement ; placement sans effet | rejeté |
| 11 | blind | Zone reprise de la localisation déclarée, sans étiquette | medium | Une localisation n'est pas une zone d'intervention : c'est une proposition de Paul, à marquer « À confirmer » | patch |
| 12 | blind | `UsageEvent` créé sans `recordUsage`, daté de l'inscription ; commentaire du schéma incomplet | low | Choix accepté par la spec (coût au budget du jour) | rejeté |
| 13 | blind | Cas de test manquants (brouillon sans modèle, inscription refusée, Anthropic en échec) | low | Ces branches renvoient null ou sortent avant l'écriture | rejeté |
| 14 | blind | `source_spec: none` dans le report ; statut de la spec | false | Le report a été écrit à l'étape 1, avant la spec, au format prévu ; la spec est bien `in-review` | rejeté |
| 15 | verification-gap | L'ajout des clients et des offres n'est vérifié que dans le texte source, pas dans la consigne réellement envoyée | medium | Écart pré-vérifié ; `tests/engine.spec.ts` capture déjà les consignes de Paul et de Martine | patch |
| 16 | verification-gap | L'introduction de l'étape 2 quand tous les champs viennent d'observations n'est pas testée | low | Écart pré-vérifié ; le test est direct (règle `guessed` à extraire et tester) | patch |

## Verification

**Commands:**
- `npm run lint` -- aucune alerte.
- `npx tsc --noEmit` -- aucune erreur.
- `npx prisma validate` -- schéma valide.
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- tout vert.
- `npm run build` -- succès.

**Manual checks:**
- Les tests `security` et `user-journey` ne tournent qu'en CI (pas de base locale).
