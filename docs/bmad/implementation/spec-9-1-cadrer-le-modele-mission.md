---
title: 'Story 9.1 : Cadrer le modèle Mission'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: 'df55fab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Missions, Stratégie, Atelier, Résultats et Paul n'ont aucune base commune : l'ancien plan d'action ne porte ni statuts V5.2, ni canal, ni périmètre, ni règle d'arrêt (#277).

**Approach:** un modèle `Mission` propre et ses transitions, appliquées par le serveur, testées avant toute page. Les anciennes données du plan d'action ne sont pas reprises.

## Boundaries & Constraints

**Always:**
- Table `Mission` neuve (décision du 2026-11-05) : modèle d'action, canal (ou hors canal), titre, constat, résultat recherché et résultat d'origine, périmètre, règle d'arrêt, statut et statut précédent, ordre, confirmation des contacts, premier lancement, version validée, version de concurrence.
- Statuts : À décider, En cours, En pause, Arrêtée, Écartée. Transitions de la spécification §2.2 déjà possibles : lancer, reprendre, mettre en pause, écarter, remettre au plan, changer de canal, modifier le résultat recherché, enregistrer le périmètre, confirmer les contacts. Arrêter et poursuivre attendent le bilan (#52).
- Une transition, une transaction : contrôles, écriture et débit de crédits ensemble, ou rien. `expectedVersion` obligatoire : une version périmée renvoie M-02 (409), sans rien écrire.
- Refus codés `{ code, error }` avec le texte de la spécification §14 (422), jamais composés par un composant.
- `POST /api/missions/[id]/transition` : session, origine contrôlée, mission de l'entreprise de la session seulement (404 sinon).
- Lancer une mission déjà en cours ne change rien et ne débite pas.

**Never:**
- Pas de migration des anciennes actions du plan ; pas de modification d'`ActionPlanItem` ni du parcours actuel.
- Pas de règle de transition dans un composant, une route ou une carte de Paul.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Premier lancement | À décider, périmètre et canal valides | En cours, 3 crédits débités avec leur mouvement | M-15 si crédits insuffisants, rien d'écrit |
| Reprise | En pause | En cours, 0 crédit | — |
| Lancement répété | déjà En cours | aucun effet | — |
| Mission arrêtée ou écartée | statut Arrêtée ou Écartée | refusé | M-40, M-21 |
| Version périmée | `expectedVersion` ≠ version | refusé | M-02, 409 |
| Deux lancements simultanés | même version | un seul réussit, un seul débit | M-02 pour l'autre |
| Écarter en cours | statut En cours | refusé | M-22 |
| Canal après validation | `hasValidatedVersion` vrai | refusé | M-19 |
| Mission d'une autre entreprise | identifiant étranger | introuvable | 404 |
| Corps illisible | action inconnue, version absente | refusé | 400 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration `20261106090000_missions_credits` (`Mission`) ; `src/lib/missions/rules.ts` (règles pures), `messages.ts`, `service.ts` ; `src/app/api/missions/[id]/transition/route.ts` ; `tests/delegation.spec.ts`, `tests/engine.spec.ts`, `tests/security.spec.ts`.

## Tasks & Acceptance

- [x] Décision consignée : table neuve, sans reprise des anciennes données (epic 9, addendum §2.1).
- [x] Schéma `Mission` et migration additive ; retour arrière écrit dans la migration.
- [x] Transitions pures et testées (statuts, verrous, messages) ; service transactionnel avec concurrence optimiste.
- [x] Route de transition, déclarée dans le test de sécurité ; isolation entre entreprises.
- [ ] Relecture croisée par Samir (décision de modèle, #277).
