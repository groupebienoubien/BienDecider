---
title: 'Story 6.4 : Confirmer mon e-mail à l''inscription'
type: 'security'
created: '2026-11-05'
status: 'ready-for-dev'
baseline_commit: '7e7db51'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** avec une inscription ouverte, n'importe qui peut créer un compte avec l'adresse d'un tiers, puis consommer du budget de modèle et diffuser en son nom (#64, FR-11).

**Approach:** à la création du compte, un lien de confirmation est envoyé. Tant que l'adresse n'est pas confirmée, l'espace reste accessible (préparer, lire, régler) mais rien ne consomme de budget IA et rien ne part vers l'extérieur. Un bandeau le dit et permet de renvoyer le lien. Les comptes existants sont considérés comme confirmés.

## Boundaries & Constraints

**Always:**
- Colonne `Company.emailVerifiedAt` ; la migration marque tous les comptes existants comme confirmés (date de création), aucun pilote n'est bloqué.
- Table des jetons à usage unique : seul l'empreinte SHA-256 du jeton est stockée, jamais le jeton ; expiration 24 h `[ASSUMPTION]` ; un nouveau jeton annule les précédents non utilisés.
- Création du compte : un lien est envoyé (au mieux : un envoi impossible ne fait pas échouer l'inscription ni ne se voit côté réponse).
- Lien `/verifier-email?token=…` : la page demande un clic « Confirmer mon adresse » (un simple chargement de page, par exemple par un antivirus de messagerie, ne consomme pas le jeton) ; `POST /api/auth/verify-email` consomme le jeton de façon atomique et enregistre la confirmation ; lien invalide, expiré ou déjà utilisé : message unique, sans distinguer les cas.
- Renvoi : `POST /api/auth/resend-verification` (session, même origine) ; au plus un renvoi par minute et par compte ; envoi indisponible : message clair ; déjà confirmé : sans effet.
- Tant que non confirmée, côté serveur : refus des lancements d'agents, messages à Paul, « Préremplir mon profil », mise en ligne et republication du site, envoi Gmail et exécution d'une proposition (motif typé `email_not_verified`, message M-54 « Confirmez votre adresse e-mail avant toute diffusion. »).
- Bandeau dans la coque de l'application avec bouton de renvoi ; routes déclarées dans `tests/security.spec.ts`.

**Never:**
- Pas de blocage de la connexion ni de l'accès en lecture ; pas de jeton en clair en base ou dans les journaux ; pas de lien construit à partir de l'en-tête `Host`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription | adresse valide | compte non confirmé, lien envoyé, accès à l'espace | envoi indisponible : compte créé, bandeau |
| Confirmation | jeton valide | adresse confirmée, jeton consommé | N/A |
| Rejeu | même jeton | refusé | 400 « Lien invalide ou expiré » |
| Expiré | jeton de plus de 24 h | refusé | 400 |
| Non confirmée | lancement d'agent, message à Paul, envoi | refusé avant toute réservation de budget | 429 `email_not_verified` (lancements) ou 403 (envoi) |
| Renvoi trop rapproché | 2 demandes en 1 minute | la seconde refusée | 429 + `Retry-After` |
| Compte existant | créé avant la migration | confirmé d'office | N/A |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration ; `src/lib/email-tokens.ts` ; `src/app/api/auth/signup/route.ts` ; `src/app/api/auth/verify-email/route.ts`, `resend-verification/route.ts` ; `src/app/verifier-email/` ; `src/lib/agent-runs.ts` (`assertRunQuota`) et `src/lib/agents/agent-errors.ts` (motif) ; `src/app/api/gmail/send/route.ts`, `src/app/api/proposals/[id]/execute/route.ts` ; `src/lib/shell-data.ts`, `src/components/app-shell.tsx` (bandeau) ; `tests/security.spec.ts`.

## Tasks & Acceptance

- [ ] Schéma, migration, jetons.
- [ ] Envoi à l'inscription, confirmation, renvoi.
- [ ] Refus côté serveur des lancements, messages, mise en ligne, envois ; bandeau.
- [ ] Tests : jeton unique et expiré, empreinte seule en base, refus par motif, confirmation puis accès, renvoi limité.
