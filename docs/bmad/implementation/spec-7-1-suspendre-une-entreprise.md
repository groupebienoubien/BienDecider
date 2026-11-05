---
title: 'Story 7.1 : Suspendre une entreprise au lieu de la supprimer'
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

**Problem:** le seul moyen de bloquer un compte abusif ou coûteux est de le supprimer, ce qui détruit ses données (#73). Les fondateurs ne peuvent ni arrêter un incident sans perte, ni revenir en arrière.

**Approach:** une suspension réversible, posée et levée depuis l'administration. Une entreprise suspendue ne peut plus se connecter ni rien lancer ; ses données et son site public déjà publié sont conservés. La suppression définitive reste possible mais demande de saisir le nom de l'entreprise.

## Boundaries & Constraints

**Always:**
- Colonne `Company.suspendedAt` (null = active). Un compte suspendu est traité comme déconnecté partout : `getSessionEmail` renvoie null, donc pages et API le refusent ; ses sessions déjà ouvertes cessent de fonctionner sans attendre leur expiration.
- Connexion : un compte suspendu qui saisit son bon mot de passe reçoit « Ce compte est suspendu. Contactez contact@biendecider.com. » (403), sans cookie ; un mauvais mot de passe garde la réponse habituelle (pas de fuite d'information avant authentification).
- Aucun lancement d'agent ni réservation de budget pour une entreprise suspendue (garde-fou central) ; le bilan hebdomadaire ne la traite plus.
- Le site public déjà publié reste en ligne.
- `PATCH /api/admin/companies/[id]/suspension` `{ suspended: boolean }` : administrateurs (`isAdminEmail`), origine contrôlée ; un administrateur ne peut pas suspendre son propre compte ; idempotent.
- Suppression définitive : `DELETE /api/admin/companies/[id]` exige l'origine et `{ confirmName }` égal au nom de l'entreprise (à défaut de nom, son adresse e-mail) ; sinon 400, rien supprimé. L'interface demande de saisir ce nom.
- Administration : badge « Suspendue », boutons Suspendre / Réactiver, suppression à confirmation renforcée.

**Never:**
- Pas d'effacement ni d'anonymisation à la suspension ; pas de mise hors ligne du site public ; pas de message qui révèle l'existence d'un compte à un tiers non authentifié.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suspension | administrateur, entreprise active | `suspendedAt` posé, sessions refusées | N/A |
| Session ouverte | cookie valide d'une entreprise suspendue | traité comme déconnecté (401 ou page de connexion) | N/A |
| Connexion | bon mot de passe, compte suspendu | refusé, message de suspension, pas de cookie | 403 |
| Connexion | mauvais mot de passe, compte suspendu | réponse habituelle d'échec | 401 |
| Lancement | entreprise suspendue | refusé avant toute réservation de budget | erreur de lancement |
| Réactivation | administrateur | `suspendedAt` nul, la connexion refonctionne | N/A |
| Soi-même | administrateur sur son propre compte | refusé | 400 |
| Suppression sans nom | `confirmName` absent ou différent | rien supprimé | 400 |
| Suppression avec nom | nom exact | entreprise et données supprimées | N/A |
| Non-administrateur | session simple | refusé | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration ; `src/lib/session.ts` ; `src/app/api/auth/login/route.ts` ; `src/lib/agent-runs.ts` (`assertRunQuota`) ; `src/app/api/cron/weekly-review/route.ts` ; `src/app/api/admin/companies/[id]/route.ts`, `[id]/suspension/route.ts` ; `src/app/admin/page.tsx`, `delete-company-button.tsx`, `suspend-company-button.tsx` ; `tests/security.spec.ts`, `tests/engine.spec.ts`.

## Tasks & Acceptance

- [x] Colonne, migration, session et connexion.
- [x] Garde-fou des lancements et du bilan hebdomadaire.
- [x] Route de suspension et suppression à confirmation renforcée.
- [x] Interface d'administration.
- [x] Tests : suspension et réactivation, session coupée, connexion, lancement refusé, soi-même, suppression avec et sans nom, accès refusé.
