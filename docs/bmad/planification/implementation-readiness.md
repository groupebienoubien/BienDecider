# Prêt à développer : Paul fiable

22 octobre 2026. Contrôle fait avec `bmad-sprint-planning` (grille `readiness-gate.md`).

## Verdict : prêt (mise à jour du 2026-10-22)

Les PF ont validé le PRD, les spines et les stories, ainsi que les réserves 1 et 2 (hypothèses confirmées). Il reste la réserve 3 (`uv`), à lever avant la première story.

## Verdict initial : réserves mineures

Un développeur peut réaliser les 12 stories sans inventer de décision : chaque story renvoie à une FR du PRD et à une règle du spine d'épopée (AD-8 à AD-16), avec des notes techniques qui citent les fichiers. Deux décisions restent des hypothèses écrites. Elles ne bloquent pas le développement, mais les PF doivent les confirmer avant les stories concernées.

## Réserves

| # | Réserve | Où | Story concernée | À trancher par |
| --- | --- | --- | --- | --- |
| 1 | Une demande explicite (« lance Jean-Claude ») passe-t-elle aussi par la carte ? Hypothèse retenue : oui. | PRD §8 question 1, FR-7 | 2.3 | PF, avant 2.3 |
| 2 | Valeurs des plafonds par exécution (5 prospects, 2 pistes, 2 modèles d'email, 3 posts, 4 constats). | PRD FR-12, AD-14 | 3.2 | PF, avant 3.2 |
| 3 | `bmad-build` exige `uv` sur le poste, qui n'est pas installé. | installation BMAD | toutes | Samir, avant la première story |

## Traçabilité

- FR-1 à FR-15 → stories : voir la carte de couverture dans [epics.md](epics.md).
- AD-8 à AD-16 → au moins une story chacun : AD-8 (2.1), AD-9 (1.1), AD-10 (1.2), AD-11 (1.3), AD-12 (3.3), AD-13 (3.1), AD-14 (3.2), AD-15 (2.1), AD-16 (2.4).
- Aucune story orpheline.
- Aucun conflit entre le PRD et le spine. Une correction a été reportée dans le PRD (FR-9 : « version précédente consultable », la base n'ayant pas d'historique complet).
