---
title: 'Story 11.3 : Savoir quoi vérifier avant de valider'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '45f5056'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-11-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** valider un texte préparé par une IA engage l'entreprise ; le dirigeant ne sait pas ce qu'il doit vérifier ni qui le verra (#179).

**Approach:** le dialogue de validation dit qui verra le texte, repère ce qui engage l'entreprise dans le texte, et présente la relecture humaine comme ce qu'elle est : la seule vérification.

## Boundaries & Constraints

**Always:**
- « Qui le verra » selon le canal (Page Facebook, destinataires Gmail, visiteurs du site, diffusion par vous-même…).
- Repérés dans l'accroche et le texte, avec leurs extraits : prix et montants, numéros de téléphone, adresses e-mail, liens, dates et délais, promesses (gratuit, garanti, offert, certifié…).
- Toujours : ce qui est dit de l'entreprise est exact ; les repères entre crochets sont complétés ou retirés.
- « Paul repère ces éléments pour vous aider, mais ne peut pas les vérifier : c'est votre relecture qui les engage. »
- Case « J'ai relu… » obligatoire ; « Aucun envoi ne sera effectué. »

**Never:**
- Présenter le repérage comme une vérification ; bloquer la validation sur un élément repéré.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prix et téléphone | « 49 € », « 06 12 34 56 78 » | deux points, avec leurs extraits | — |
| Rien de repéré | texte neutre | « Aucun prix, numéro, lien, date ni promesse repéré » | — |
| Case non cochée | validation | bouton inactif | M-77 si forcé |

</frozen-after-approval>

## Code Map

`src/lib/contents/rules.ts` (`reviewChecklist`, `exposureFor`) ; `src/lib/contents/view.ts` (`checklistFor`) ; `src/app/atelier/[id]/content-workbench.tsx` ; tests `delegation`, `user-journey`.

## Tasks & Acceptance

- [x] Repérage pur, testé, extraits dédoublonnés et limités.
- [x] Dialogue de validation : exposition, points à vérifier, relecture humaine, case obligatoire.
