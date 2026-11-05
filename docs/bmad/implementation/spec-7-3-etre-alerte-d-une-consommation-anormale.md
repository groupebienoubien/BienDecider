---
title: 'Story 7.3 : Être alerté d''une consommation anormale'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: 'd411853'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** avec une inscription ouverte, la consommation du modèle peut s'emballer (abus, boucle, entreprise très active) et les fondateurs ne le sauraient qu'à la facture (#72).

**Approach:** des seuils réglables de consommation du jour (par entreprise et au total) évalués à chaque enregistrement d'usage. Au franchissement, une alerte est enregistrée, affichée dans l'administration et envoyée par e-mail aux administrateurs.

## Boundaries & Constraints

**Always:**
- Réglage global persistant (une ligne) : seuil par entreprise et seuil total, en dollars sur le jour de Paris (valeurs initiales 3 $ et 10 $, modifiables) ; `PATCH /api/admin/usage-alerts` réservé aux administrateurs, origine contrôlée, valeurs numériques de 0,01 à 100 000.
- Évaluation dans `recordUsage`, après l'écriture du coût : coût du jour de l'entreprise et coût du jour total comparés aux seuils (franchi = supérieur ou égal) ; l'échec de l'évaluation ou de l'envoi n'altère jamais l'enregistrement du coût ni le lancement.
- Une alerte par jour et par portée (`company:<id>` ou `total`) : enregistrement atomique unique ; l'e-mail aux administrateurs (adresses de `ADMIN_EMAILS`) n'est envoyé que par la requête qui crée l'alerte, donc au plus un par portée et par jour.
- L'e-mail dit l'entreprise (nom), le coût du jour, le seuil et le lien vers l'administration ; aucune donnée de production.
- Administration : formulaire des seuils, bandeau des alertes du jour (entreprise ou total, coût, seuil) et historique des dernières alertes.
- Sans configuration d'e-mail : l'alerte reste enregistrée et visible dans l'administration.

**Never:**
- Pas de nouveau cron ; pas de blocage automatique de l'entreprise (les plafonds techniques existants restent) ; pas d'alerte dupliquée dans la journée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sous les seuils | coût du jour inférieur | aucune alerte | N/A |
| Seuil entreprise franchi | coût du jour de l'entreprise supérieur ou égal | une alerte, un e-mail | N/A |
| Deuxième franchissement | même jour, même portée | aucune nouvelle alerte ni e-mail | N/A |
| Seuil total franchi | somme du jour supérieure ou égale | une alerte `total` | N/A |
| Nouveau jour | lendemain (heure de Paris) | nouvelle alerte possible | N/A |
| Envoi impossible | SMTP absent ou en panne | alerte enregistrée, visible dans l'administration | pas d'erreur côté appelant |
| Réglage invalide | seuil nul, négatif ou non numérique | refusé | 400 |
| Non-administrateur | session simple | refusé | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration (`UsageAlertSetting`, `UsageAlert`) ; `src/lib/usage-alerts.ts` (règle pure et évaluation) ; `src/lib/usage.ts` (`recordUsage`) ; `src/app/api/admin/usage-alerts/route.ts` ; `src/app/admin/usage-alerts-panel.tsx`, `page.tsx` ; `tests/delegation.spec.ts`, `tests/engine.spec.ts`, `tests/security.spec.ts`.

## Tasks & Acceptance

- [x] Règle pure du franchissement et tests (jour de Paris, égalité, une alerte par jour).
- [x] Évaluation à l'enregistrement de l'usage, alerte atomique, e-mail.
- [x] Route de réglage et panneau d'administration.
- [x] Tests : franchissement entreprise et total, un seul e-mail, nouveau jour, envoi impossible, réglage invalide, accès refusé.
