---
title: 'Story 15.2 : Décider la suite d''une mission à partir de son bilan'
type: 'feature'
created: '2026-11-07'
status: 'review'
baseline_commit: 'origin/main'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-15-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** une mission diffusée n'a pas de fin : le dirigeant ne peut ni la poursuivre en connaissance de cause, ni l'arrêter (#52).

**Approach:** « Décider la suite » : poursuivre (bilan à jour), adapter avec Paul (conversation de la mission), arrêter (définitif).

## Boundaries & Constraints

**Always:**
- Mission En cours (M-34) et au moins une diffusion (M-35) ; « Poursuivre » exige un bilan à jour (M-36), sinon il reste désactivé avec le message de la spécification et un lien vers le bilan.
- « Poursuivre » garde le cadre et ouvre l'atelier pour la série suivante ; « Arrêter » clôt la mission, annule ses programmations, la garde dans l'historique ; J-14 dans les deux cas.
- Paul ne conclut jamais avant l'échéance de la règle d'arrêt ; il propose de décider quand elle est atteinte.

**Never:**
- Relancer une mission arrêtée ; élargir le périmètre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Poursuivre sans bilan à jour | — | refus, bouton désactivé | M-36 |
| Poursuivre | bilan à jour | J-14, étape `série suivante`, atelier | — |
| Arrêter | programmation en cours | Arrêtée, programmation annulée (J-23), J-14 | — |
| Mission en pause ou arrêtée | — | refus | M-34 |
| Version périmée | — | refus | M-02 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (MissionDecision) ; `src/lib/missions/{report,results}.ts` ; `src/app/api/missions/[id]/decision/route.ts` ; `src/app/resultats/results-client.tsx` ; `src/lib/agents/co-ceo.ts` ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Décision de suite et ses règles, journalisées.
- [x] Règle d'arrêt lue par Paul (échéance, atteinte).
