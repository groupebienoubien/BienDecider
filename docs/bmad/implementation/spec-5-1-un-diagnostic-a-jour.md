---
title: 'Story 5.1 — Un diagnostic à jour'
type: 'bugfix'
created: '2026-10-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** chaque audit de Martine ajoute ses constats sans retirer ceux de l'audit précédent ; après une actualisation, la page Diagnostic et les agents (Paul, Camille, Jean-Claude, la préparation du plan) mélangent des points réglés et des points actuels.

**Approach:** décision des PF : un « audit » est l'ensemble des constats d'une même exécution de Martine (`agentRunId`) ; seul compte le dernier audit terminé avec succès (les constats sans exécution, antérieurs, forment un audit ancien). La page Diagnostic liste, compte et date les constats de ce dernier audit ; un lien repliable « Diagnostic précédent du JJ/MM » montre ceux de l'audit d'avant. Pendant un nouvel audit, le dernier audit terminé reste affiché. Paul, Camille, Jean-Claude et la préparation du plan ne lisent que les constats du dernier audit. Rien n'est supprimé en base.

</frozen-after-approval>

## Implementation Notes

- `src/lib/audit-split.ts` (pur) : `splitAudits` regroupe les constats par exécution réussie, date chaque audit par la fin de son exécution, et classe l'audit ancien (sans exécution, ou exécution supprimée : `onDelete: SetNull`) après tout audit rattaché. Une exécution en cours ou échouée ne forme pas un audit, même si elle a écrit des constats.
- `src/lib/audit-findings.ts` : `getAuditFindingsView` (dernier, précédent, dates) et `getLatestAuditFindings` ; utilisés par la page Diagnostic, `/api/audit-findings` (réponse devenue `{ latest, latestAt, previous, previousAt }`), `buildCurrentStatus` et `runCoCeoPlanning` (`co-ceo.ts`), `findings-context.ts` (Camille, Jean-Claude).
- `src/app/diagnostic/diagnostic-client.tsx` : compte et date du dernier audit ; « Diagnostic précédent du JJ/MM à HH:MM » repliable ; après « Actualiser », attente de la fin de l'exécution (réponse 202) avant d'afficher « Diagnostic actualisé ».
- Hors périmètre : le compteur de l'accueil (`initialDiagnosticCount`) ne sert qu'à savoir si un diagnostic existe ; les références par identifiant (`page-context.ts`, `paul-references.ts`) restent possibles vers un ancien constat ouvert par le dirigeant.
- Tests : `tests/delegation.spec.ts` (regroupement), `tests/engine.spec.ts` (diagnostic, Paul, Camille), `tests/user-journey.spec.ts` (page). Tests base et parcours en CI seulement.

## Review Triage Log

| # | Constat | Verdict | Preuve | Route |
|---|---------|---------|--------|-------|
| 1 | « Diagnostic actualisé » affiché sur une réponse 202, avec l'ancien audit | medium | la route renvoie 202 tant que l'exécution tourne | patch |
| 2 | Constats d'une exécution supprimée versés dans l'audit ancien, qui peut passer devant | medium | `onDelete: SetNull` | patch |
| 3 | Tous les constats lus à chaque appel | low | quelques constats par audit (plafond de 4) ; pas de tort mesuré | rejet |
| 4 | Date du titre et date du précédent de sources différentes | low | `findings[0].createdAt` | patch (`latestAt`) |
| 5 | Deux audits le même jour indiscernables | low | JJ/MM seul | patch (heure) |
| 6 | Compteur de l'accueil compte tous les constats | false | ne sert qu'au test « un diagnostic existe » | rejet |
| 7 | Actions du plan issues de l'ancien audit | low | traité par la story 5.2 | rejet |
| 8 | Paul résout un ancien constat par identifiant | low | lien ouvert par le dirigeant lui-même | rejet |
| 9 | Tests manquants (202, planification, concurrence, forme de l'API) | low | logique commune testée ; écran en CI | rejet |
| 10 | Spec inachevée | false | voie courte, notes ajoutées | rejet |
| 11 | Une exécution échouée cache ses constats | low | choix consigné ci-dessus | rejet |
| 12 | Liens `#finding-` vers l'audit précédent | false | l'effet ouvre le `details` le plus proche, y compris le précédent | rejet |
