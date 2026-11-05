---
title: 'Story 8.2 : Visualiser le crédit du modèle'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: '324cdba'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** quand le crédit chez le fournisseur du modèle s'épuise, tous les agents s'arrêtent sans prévenir (#62).

**Approach:** l'administration affiche le crédit restant estimé, la dépense du jour et du mois et les jours restants au rythme actuel, et alerte sous un seuil réglable.

## Boundaries & Constraints

**Always:**
- Le fournisseur n'expose pas de solde : un administrateur saisit le solde constaté dans la console du fournisseur (et le seuil d'alerte) ; la date de saisie est enregistrée.
- Restant = solde saisi moins le coût mesuré (`UsageEvent`) depuis la saisie, jamais négatif ; jours restants = restant divisé par le rythme quotidien des 7 derniers jours (jamais avant la saisie), « — » sans consommation.
- Dépense du jour et du mois : sommes du coût mesuré, jour et mois de Paris, affichées même sans solde saisi.
- `PATCH /api/admin/llm-credit` : administrateurs seulement, origine contrôlée, montants de 0 à 1 000 000 $.
- Alerte quand le restant est inférieur ou égal au seuil : une par jour (`UsageAlert`, portée `credit-llm`), évaluée après chaque coût enregistré et après la saisie d'un solde ; bandeau dans l'administration et e-mail aux administrateurs envoyé seulement par la requête qui crée l'alerte.
- L'échec de l'évaluation n'altère jamais l'enregistrement du coût.

**Never:**
- Pas d'appel au fournisseur pour lire un solde ; pas de chiffre inventé : « — » tant qu'aucun solde n'est saisi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aucun solde saisi | état initial | dépenses affichées, crédit et jours « — », aucune alerte | N/A |
| Solde saisi | 100 $, 0,02 $ dépensés depuis | restant 99,98 $, jours restants calculés | N/A |
| Sans consommation | rien dépensé sur la fenêtre | jours restants « — » | N/A |
| Sous le seuil | restant inférieur ou égal au seuil | une alerte, un e-mail par administrateur | N/A |
| Même jour | nouvelle consommation sous le seuil | aucune nouvelle alerte ni e-mail | N/A |
| Recharge | nouveau solde saisi | restant recalculé depuis la saisie | N/A |
| Saisie invalide | négatif, texte, supérieur au plafond | refusé | 400 |
| Non-administrateur | session simple | refusé | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration (`LlmCreditSetting`) ; `src/lib/llm-credit-rules.ts` (calcul pur) ; `src/lib/llm-credit.ts` ; `src/lib/usage-alerts.ts` (appel de l'alerte) ; `src/app/api/admin/llm-credit/route.ts` ; `src/app/admin/llm-credit-panel.tsx`, `usage-alerts-panel.tsx`, `page.tsx` ; `tests/delegation.spec.ts`, `tests/engine.spec.ts`, `tests/security.spec.ts`.

## Tasks & Acceptance

- [x] Calcul pur du restant, des jours restants et de la saisie, avec tests.
- [x] Lecture, saisie et alerte quotidienne ; appel depuis l'évaluation de consommation.
- [x] Route de saisie et panneau d'administration.
- [x] Tests : restant et jours, alerte et e-mail une fois par jour, saisie invalide, accès refusé.
