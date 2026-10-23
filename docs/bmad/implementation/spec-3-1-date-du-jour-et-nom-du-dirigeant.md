---
title: 'Story 3.1 — Date du jour et nom du dirigeant pour tous les agents'
type: 'feature'
created: '2026-10-23'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** les agents ignorent la date du jour (Jean-Claude a proposé un salon déjà passé, Paul refusait de calculer « dans 8 jours ») et le nom du dirigeant (emails signés « Paul », puis du nom de l'atelier faute de mieux ; Paul ne peut pas enregistrer « Samuel Morel »).

**Approach:** un champ `Company.ownerName` saisi à l'onboarding, dans la page Entreprise ou via la carte de profil de Paul ; une fonction `runtimeContextLines(company, now)` donne à tous les agents la date du jour (Europe/Paris) et le nom du dirigeant, hors du bloc système mis en cache ; Jean-Claude ne peut plus enregistrer un événement terminé.

## Boundaries & Constraints

**Always:** `ownerName` facultatif, 120 caractères au plus, nettoyé comme les autres champs du profil (`src/lib/company-profile.ts`) ; libellé « Votre prénom et nom » ; la carte de profil de Paul accepte `ownerName` ; date au format « vendredi 23 octobre 2026 » ; les agents signent les emails avec `ownerName`, ou « [Votre prénom et nom] » sans nom, jamais avec le nom d'un agent ni seulement le nom de l'entreprise ; l'outil de piste de croissance de Jean-Claude reçoit une date de fin facultative (`AAAA-MM-JJ`) et refuse une date antérieure à aujourd'hui.

**Never:** la date et le nom ne vont pas dans un bloc système mis en cache ; pas de changement du ton ni des autres consignes des agents.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Contexte | `ownerName = "Samuel Morel"`, maintenant = 23/10/2026 14:00 Paris | `runtimeContextLines` contient « vendredi 23 octobre 2026 » et « Samuel Morel » | N/A |
| Sans nom | `ownerName` nul | ligne « Nom du dirigeant : non renseigné ; signe « [Votre prénom et nom] » » | N/A |
| Fuseau | maintenant = 23/10/2026 23:30 UTC | date du 24 octobre (Paris) | N/A |
| Carte de profil | outil de Paul avec `ownerName: "Samuel Morel"` | carte « Votre prénom et nom : Samuel Morel » ; écrit à la confirmation | N/A |
| Événement passé | piste avec `eventEndDate` = 2026-06-21 le 23/10/2026 | aucune écriture ; l'outil dit que l'événement est terminé | message au modèle |
| Événement à venir | `eventEndDate` = 2026-11-01 | piste enregistrée | N/A |
| Cache | prompt des agents | la date et le nom sont dans un bloc sans `cache_control` | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` (`Company`) -- `ownerName String?` + migration additive.
- `src/lib/company-profile.ts` -- limites, libellés et champs modifiables par Paul (`PAUL_EDITABLE…`) : ajouter `ownerName`.
- `src/app/api/companies/route.ts`, `src/components/company-profile-form.tsx` -- champ facultatif à l'onboarding et dans Entreprise.
- `src/lib/agents/pending-action-view.ts`, `pending-actions.ts` -- `update_profile` accepte `ownerName`.
- `src/lib/agents/personas.ts` -- `runtimeContextLines(company, now)` (fonction pure, `Intl.DateTimeFormat` fr-FR, `timeZone: "Europe/Paris"`).
- `src/lib/agents/co-ceo.ts` (prompt de Paul et `runCoCeoPlanning`), `marketing.ts:189`, `contenu.ts:98-108`, `demarchage.ts:163-195` -- ajouter un bloc système non mis en cache avec `runtimeContextLines` (Paul : bloc dynamique ou contexte du dernier message).
- `src/lib/agents/demarchage.ts:44` (`propose_growth_lead`) -- `eventEndDate` facultatif, refus d'une date passée ; consigne de signature dans `propose_prospecting_email`.
- `tests/delegation.spec.ts` (fonctions pures), `tests/engine.spec.ts` (outils capturés).

## Tasks & Acceptance

**Execution:**
- [ ] schéma + migration -- `ownerName` -- nom du dirigeant
- [ ] profil, route, formulaire, carte de Paul -- saisie du nom -- trois points d'entrée
- [ ] `personas.ts` + agents -- `runtimeContextLines` hors cache -- date et nom partout
- [ ] `demarchage.ts` -- date de fin et signature -- plus d'événement passé ni de signature d'agent
- [ ] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné `ownerName = "Samuel Morel"`, quand Jean-Claude rédige un modèle d'email, alors sa consigne lui demande de signer « Samuel Morel ».

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
