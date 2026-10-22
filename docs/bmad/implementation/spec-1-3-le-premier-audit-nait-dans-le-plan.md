---
title: 'Story 1.3 — Le premier audit naît dans le plan'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
baseline_commit: '3d5f2b55dfc1ab063537b9567dd5cd312a3e6fdd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** à la fin de l'onboarding, le navigateur lance Martine par un `fetch` détaché vers `/api/agents/marketing/run` : l'audit tourne hors du plan, l'accueil affiche « Je n'ai pas encore examiné votre présence en ligne », et Paul, qui ne le voit pas, relance un audit.

**Approach:** la première création de l'entreprise crée côté serveur, dans la même requête, une action de Martine au plan puis la lance par le chemin du plan ; le client ne lance plus aucun agent.

## Boundaries & Constraints

**Always:** seulement à la première création de l'entreprise (pas aux mises à jour du profil) ; action `marketing`, thème `Visibilité`, priorité 1, titre « Audit de présence en ligne et fiche Google », résultat attendu en une phrase pour le dirigeant ; lancement par `enqueuePlanRun` ; si le lancement est refusé (quota, budget, conflit), l'entreprise est créée quand même, l'action reste « à lancer » et la réponse HTTP reste 201 ; pas de seconde action d'audit si une action `marketing` existe déjà pour l'entreprise (double envoi du formulaire).

**Never:** pas de migration ; ne pas modifier la route `/api/agents/marketing/run` (la page Équipe l'utilise encore) ; pas de nouveau texte sur l'accueil : l'état vide « En cours : {titre} » existant suffit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Première création | aucun `Company` pour cet e-mail | `Company` créée ; une `ActionPlanItem` marketing liée à un `AgentRun` `queued` ; action `en_cours` | N/A |
| Mise à jour | `Company` existante | profil mis à jour ; aucune action ni aucun run créés | N/A |
| Quota atteint | première création, quota de l'entreprise à 0 | `Company` créée, action `propose`, aucun run ; 201 | erreur journalisée, pas renvoyée |
| Double envoi | deux POST de première création coup sur coup | une seule action d'audit, un seul run | N/A |
| Paul ensuite | action d'audit `en_cours` | `delegatePlanAction` marketing avec son `planItemId` → `already_running` | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/companies/route.ts:45-140` -- `POST` : validation puis `prisma.company.upsert` par `ownerEmail`. Détecter la première création (lecture avant l'upsert), puis créer l'action et appeler `enqueuePlanRun` en attrapant `AgentRunQuotaError` et `AgentRunConflictError`.
- `src/components/company-profile-form.tsx:139-143` -- `fetch("/api/agents/marketing/run")` détaché : à supprimer (et le commentaire associé).
- `src/lib/agents/plan-items.ts` -- `createChatPlanItem` ne convient pas (échéance « Demandé dans le chat ») : créer l'action directement avec une échéance « Dès l'inscription ».
- `src/lib/agent-runs.ts` -- `enqueuePlanRun({ companyId, item })` ; réclame `propose → en_cours` et déduplique.
- `src/app/dashboard/dashboard-client.tsx:372-375` -- l'état vide « En cours : {titre} » s'affiche déjà quand une action est `en_cours` ; rien à changer.
- `tests/engine.spec.ts` -- fixture `company` et tests de quotas (`:292`) à imiter ; la route se teste via `request` avec un cookie de session, comme les tests de lancement existants.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/companies/route.ts` -- première création : action d'audit + `enqueuePlanRun`, erreurs de lancement attrapées et journalisées -- audit dans le plan (AD-11)
- [x] `src/components/company-profile-form.tsx` -- retirer le lancement détaché -- le client ne lance plus d'agent
- [x] `tests/engine.spec.ts` -- un test par ligne de la matrice -- non-régression

**Acceptance Criteria:**
- Étant donné un nouveau compte qui valide l'onboarding, quand l'accueil s'affiche, alors l'action « Audit de présence en ligne et fiche Google » est `en_cours` avec son exécution.
- Étant donné un profil déjà créé, quand le dirigeant enregistre la page Entreprise, alors aucun audit n'est relancé.

## Implementation Notes

- « Première création » = profil encore vide (`!existing?.name`), pas « aucun `Company` » : l'inscription crée déjà la ligne avec `name: ""` et `getSessionEmail` exige cette ligne, la route ne voit donc jamais d'entreprise absente. Même règle que `isNew` côté formulaire.
- Logique dans `src/lib/agents/onboarding-audit.ts` (`startOnboardingAudit`) : création de l'action en transaction sérialisable (pas de seconde action `marketing` en cas de double envoi), puis `enqueuePlanRun`. La route attrape et journalise toute erreur de lancement et renvoie 201.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | La route attrape toutes les erreurs ; une erreur de base est journalisée comme `outage` et le repli « erreur inattendue » est mort | medium | `catch` nu et `classifyRunError(...) ?? ...` alors que seul un conflit renvoie `null` | patch |
| 2 | blind, edge | Un P2034 dû à une autre écriture renvoie `null` : plus jamais d'audit | medium | `catch` P2034 → `null` sans nouvel essai ; P2002 impossible (pas de contrainte unique) | patch |
| 3 | blind | Le garde-fou vérifie toute action `marketing`, pas l'audit d'inscription | low | correctif direct : filtrer sur l'échéance « Dès l'inscription » | patch |
| 4 | edge | Un run direct de Martine (page Diagnostic) avant le profil donne un second audit | low | parcours improbable (le diagnostic suit l'onboarding) ; correctif ajoute une requête | rejeté |
| 5 | blind | Aucun rattrapage si l'audit n'a pas été créé à la première création | low | ne reste possible qu'en cas de panne après les correctifs 1 et 2 | defer |
| 6 | blind, edge | Le test nominal accepte un run `failed` ; le run réel tourne en tâche de fond pendant la suppression | false | `after()` s'exécute après la réponse : en CI sans clé, le run échoue vite et l'action revient à `propose` ; l'état strict n'est pas observable depuis le test | rejeté |
| 7 | blind, edge, gap | Le test de double envoi ne force pas la concurrence | medium | les deux POST peuvent être traités l'un après l'autre ; le garde-fou sérialisable n'est pas exercé | patch |
| 8 | blind | Le test de quota ne vérifie ni la journalisation ni le budget | low | refus déjà couvert par `quota_runs` | rejeté |
| 9 | blind | Libellés recopiés dans les tests au lieu des constantes exportées | low | correctif direct | patch |
| 10 | blind | Commentaire du formulaire mal placé | low | correctif direct | patch |
| 11 | blind, edge | Pas de signal client quand l'audit n'a pas démarré | low | interdit par la spec (« pas de nouveau texte ») | rejeté |
| 12 | blind | Lecture supplémentaire à chaque enregistrement du profil | low | une requête indexée par e-mail | rejeté |
| 13 | edge | L'action renvoyée garde le statut `propose` | low | aucun appelant ne lit ce statut | rejeté |
| 14 | edge | La génération du plan ignore les actions `en_cours` et peut reproposer un audit | medium | `runCoCeoPlanning` lit `status in [propose, lance]` (même défaut que la story 1.1) | patch |
| 15 | edge | Paul déléguant sans `planItemId` peut créer un second audit | medium | dédoublonnage structurel prévu en story 2.4 (AD-16) | defer |
| 16 | edge | La page Diagnostic lance encore Martine hors plan | low | lancement voulu par le dirigeant ; la spec garde la route | defer |
| 17 | gap | Le parcours d'onboarding ne vérifie pas que le navigateur ne lance plus d'agent | medium | aucun compteur de requêtes `/api/agents/` dans les tests d'onboarding | patch |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
