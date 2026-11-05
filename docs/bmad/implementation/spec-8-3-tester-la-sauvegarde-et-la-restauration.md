---
title: 'Story 8.3 : Tester la sauvegarde et la restauration'
type: 'chore'
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

**Problem:** l'état des sauvegardes de la base de production n'est pas vérifié et aucune restauration n'a jamais été essayée (#82).

**Approach:** une procédure écrite, pas à pas, que les fondateurs exécutent une fois : vérifier la sauvegarde automatique chez l'hébergeur, faire une restauration complète d'essai, tracer le résultat dans l'Issue.

## Boundaries & Constraints

**Always:**
- Procédure dans `docs/sauvegarde-restauration.md` : vérification de la sauvegarde automatique, export complémentaire, restauration d'essai dans une base jetable, comparaison des volumes, restauration réelle après incident dans une nouvelle base.
- Aucun export ni adresse de connexion dans Git, une Issue ou une capture ; export supprimé après l'essai.
- La restauration d'essai ne vise jamais la base de production.

**Never:**
- Pas de script qui écrit en production ; pas d'automatisation de la restauration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sauvegarde automatique active | console de l'hébergeur | fréquence, conservation et dernière sauvegarde notées dans l'Issue | N/A |
| Sauvegarde absente ou courte | conservation de moins de 7 jours | signalé dans l'Issue, export complémentaire à planifier | N/A |
| Restauration d'essai | export restauré dans une base jetable | schéma à jour, volumes conformes, connexion d'un compte réussie | écart noté dans l'Issue |

</frozen-after-approval>

## Code Map

`docs/sauvegarde-restauration.md`.

## Tasks & Acceptance

- [x] Procédure écrite (vérification, export, restauration d'essai, restauration réelle, trace de la recette).
- [ ] Vérification de la sauvegarde automatique chez l'hébergeur (fondateurs).
- [ ] Restauration complète d'essai faite une fois et tracée dans l'Issue #82 (fondateurs).
