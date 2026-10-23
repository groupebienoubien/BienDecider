---
title: 'Story 3.1 — Date du jour et nom du dirigeant pour tous les agents'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'f7d29118b81100bb94f119c2ce8de931d8b6cb78'
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
- [x] schéma + migration -- `ownerName` -- nom du dirigeant
- [x] profil, route, formulaire, carte de Paul -- saisie du nom -- trois points d'entrée
- [x] `personas.ts` + agents -- `runtimeContextLines` hors cache -- date et nom partout
- [x] `demarchage.ts` -- date de fin et signature -- plus d'événement passé ni de signature d'agent
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné `ownerName = "Samuel Morel"`, quand Jean-Claude rédige un modèle d'email, alors sa consigne lui demande de signer « Samuel Morel ».

## Implementation Notes

- Migration `20261023120000_company_owner_name` : `ALTER TABLE "Company" ADD COLUMN "ownerName" TEXT` (additive, écrite à la main).
- `company-profile.ts` : `ownerName` (120 caractères) ajouté aux limites, à `PAUL_PROFILE_FIELDS` (en tête, la ligne du nom vient en premier sur la carte) et aux libellés (« Votre prénom et nom »). `pending-action-view.ts` l'ajoute au schéma de l'outil et au payload `update_profile` ; `pending-actions.ts` n'a pas eu à changer (exécuteur et fusion génériques).
- `POST /api/companies` (et le `PATCH` des compléments) acceptent `ownerName`, nettoyé par `clearableText`. Le formulaire l'affiche à l'onboarding (mode guidé) comme dans Entreprise, sous la zone de chalandise.
- `personas.ts` : `runtimeContextLines(company, now)`, `formatParisDate`, `parisDateKey` (AAAA-MM-JJ à Paris) et `eventEndDateIssue` (fonctions pures). La ligne du nom interdit la signature d'un agent ou du seul nom de l'entreprise.
- Injection hors cache : Martine et Jean-Claude reçoivent un bloc système dédié après le bloc mis en cache ; Camille et Paul (plan) en tête de leur bloc dynamique ; Paul (chat) les reçoit avec son dernier message, au même endroit que le contexte de page, hors du système mis en cache : le cache de la conversation ne se réinitialise pas chaque jour. Sans nom enregistré, une règle de Paul propose la carte de profil `ownerName` quand un email ou une signature est en jeu.
- Jean-Claude : `propose_growth_lead` exige `isEvent` ; un événement sans `eventEndDate` est refusé ; date mal formée, antérieure à aujourd'hui (Paris) ou à plus de 24 mois = aucune écriture et message au modèle ; sinon la date de fin est ajoutée au contenu de la piste (le contrôle des doublons refusés compare le contenu sans cette ligne). Un seul `now` par exécution sert au prompt et au contrôle. `eventEndDateIssue` construit la date avec `setUTCFullYear` (années 0 à 99 exactes). La consigne de signature est dans la description du corps de `propose_prospecting_email` (générique, renvoie à « Nom du dirigeant » du contexte, pour ne pas mettre le nom dans les définitions d'outils mises en cache).
- Nettoyage du nom (`cleanOwnerName`, `cleanProfileText` dans `company-profile.ts`) : espaces, retours à la ligne, caractères de contrôle et « » ramenés à une espace, à l'enregistrement (POST, PATCH, carte de Paul) et dans `runtimeContextLines`.
- Brouillon de relance (`lead-followup.ts`) signé `ownerName` puis le nom de l'entreprise, ou « [Votre prénom et nom] » ; la demande de compléments avant un lancement de Jean-Claude inclut `ownerName` ; l'aide du champ est reliée par `aria-describedby`.
- Tests : 5 tests purs dans `tests/delegation.spec.ts` (contexte, sans nom, fuseau, date de fin, carte de profil) ; 3 tests base dans `tests/engine.spec.ts` (carte de profil confirmée, événement passé/à venir, date et nom hors bloc mis en cache pour Jean-Claude et Paul). Les dates du test moteur sont relatives au jour d'exécution.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Un événement terminé passe si le modèle omet la date de fin | high | `eventEndDate` facultatif, contrôle seulement s'il est fourni | patch |
| 2 | blind, edge | `ownerName` multi-ligne ou avec « » injecté tel quel dans les prompts | medium | seul `trim()` | patch |
| 3 | blind, edge | Date de fin sans borne haute (année erronée acceptée) | low | correctif direct (24 mois) | patch |
| 4 | edge | Années 0000-0099 mal interprétées par `Date.UTC` | low | correctif direct | patch |
| 5 | edge | Date du prompt et date du contrôle calculées à des moments différents | low | correctif direct (même `now`) | patch |
| 6 | blind, edge | Mémoire des rejets faussée par la ligne « Date de fin » ajoutée au contenu | low | comparaison sur le contenu enrichi | patch |
| 7 | edge | Les brouillons de relance (`buildOutreachDraft`) signent encore du nom de l'entreprise | medium | `lead-followup.ts:46` ne lit pas `ownerName` | patch |
| 8 | blind | Le contexte placé en bloc système invalide chaque jour le cache de toute la conversation de Paul | medium | la spec prévoyait aussi le contexte du dernier message, qui préserve le cache | patch |
| 9 | gap | `ownerName` jamais testé à travers `POST`/`PATCH /api/companies` | medium | aucun test de route avec ce champ | patch |
| 10 | gap | Placement du contexte non testé pour Martine, Camille et le plan | medium | seule la capture de Jean-Claude et du chat existe | patch |
| 11 | blind | Pas de test d'heure d'hiver ni du changement d'heure | low | correctif direct | patch |
| 12 | blind | Sans nom, aucun rappel au dirigeant de le renseigner | low | correctif direct (règle du prompt de Paul) | patch |
| 13 | blind | Le complément de profil de Jean-Claude ne demande pas le nom | low | correctif direct | patch |
| 14 | blind | Texte d'aide du champ non relié par `aria-describedby` | low | correctif direct | patch |
| 15 | blind | Une piste peut devenir périmée en attendant la décision | low | pas de colonne structurée | defer |
| 16 | edge | L'interprétation d'onboarding et la publication du site n'ont pas le contexte | low | ce ne sont pas des agents du plan | rejeté |

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
