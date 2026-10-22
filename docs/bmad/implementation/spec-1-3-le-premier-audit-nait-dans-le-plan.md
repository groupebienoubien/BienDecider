---
title: 'Story 1.3 — Le premier audit naît dans le plan'
type: 'bugfix'
created: '2026-10-22'
status: 'ready-for-dev'
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
- [ ] `src/app/api/companies/route.ts` -- première création : action d'audit + `enqueuePlanRun`, erreurs de lancement attrapées et journalisées -- audit dans le plan (AD-11)
- [ ] `src/components/company-profile-form.tsx` -- retirer le lancement détaché -- le client ne lance plus d'agent
- [ ] `tests/engine.spec.ts` -- un test par ligne de la matrice -- non-régression

**Acceptance Criteria:**
- Étant donné un nouveau compte qui valide l'onboarding, quand l'accueil s'affiche, alors l'action « Audit de présence en ligne et fiche Google » est `en_cours` avec son exécution.
- Étant donné un profil déjà créé, quand le dirigeant enregistre la page Entreprise, alors aucun audit n'est relancé.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
