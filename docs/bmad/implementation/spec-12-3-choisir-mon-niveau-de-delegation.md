---
title: 'Story 12.3 : Choisir mon niveau de délégation'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: '3db6de2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant ne peut pas dire ce que BienDecider peut faire sans lui redemander (#36).

**Approach:** trois niveaux (§9) réglés dans Entreprise › Canaux & délégation, journalisés, rappelés là où l'on décide.

## Boundaries & Constraints

**Always:**
- « Préparer seulement », « Valider avant chaque action » (défaut, « conseillé pour démarrer »), « Déléguer dans un cadre précis ».
- Réglage sur la page des canaux (`/connexions#delegation`), jamais pendant l'inscription ; « Enregistrer les règles ».
- Passer en « Préparer seulement » : confirmation « Passer en préparation seule annule les programmations. », programmations annulées (J-23) ; chaque changement journalisé (J-26).
- Rappel : liste des missions, contrat de mission, cadre de diffusion de l'atelier.

**Never:**
- Une validation n'autorise jamais une diffusion ; aucun niveau ne diffuse sans confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Préparer seulement | une programmation | annulée, J-23, J-26 | — |
| Même niveau | inchangé | rien d'écrit | — |
| Niveau inconnu | « tout » | refusé | M-85 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (`Company.delegationLevel`) ; `src/lib/delegation-level.ts`, `src/lib/delegation-settings.ts` ; `src/app/api/delegation/route.ts` ; `src/app/connexions/delegation-panel.tsx` ; missions, atelier ; tests.

## Tasks & Acceptance

- [x] Niveau stocké, réglé, journalisé ; « Préparer seulement » annule les programmations.
- [x] Étape « à diffuser vous-même » et « Récupérer le texte » en « Préparer seulement ».
- [ ] « Déléguer dans un cadre précis » : préparation sans demande par Paul (#35, #288).
