---
title: 'Story 6.5 : Récupérer mon mot de passe'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: '7e7db51'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** un dirigeant qui oublie son mot de passe perd son compte, et avec une inscription ouverte cela devient du support (#24, FR-10). Le mot de passe minimum de 6 caractères est aussi inférieur à la cible (8 à 128).

**Approach:** une réinitialisation par e-mail : lien valable une heure, à usage unique, qui ferme toutes les sessions ouvertes. Le minimum passe à 8 caractères (maximum 128) pour tout nouveau mot de passe ; les mots de passe existants plus courts restent valables à la connexion.

## Boundaries & Constraints

**Always:**
- Page `/mot-de-passe-oublie` : saisie de l'adresse ; réponse toujours identique (« Si un compte existe pour cette adresse, un lien vient d'être envoyé. »), que le compte existe ou non et que l'envoi soit configuré ou non ; l'envoi se fait après la réponse pour ne pas révéler l'existence du compte par le temps de réponse.
- Limites : par adresse IP (cinq demandes par heure) et un seul lien par minute et par compte ; jeton de 256 bits, empreinte seule en base, valable une heure, à usage unique, un nouveau lien annule le précédent.
- Page `/reinitialiser?token=…` : nouveau mot de passe et confirmation ; `POST /api/auth/reset-password` valide le mot de passe **avant** de consommer le jeton (une faute de frappe ne le brûle pas), le consomme de façon atomique, remplace le mot de passe, incrémente la version de session (toutes les sessions sont fermées), remet à zéro les échecs et le verrouillage, et confirme l'adresse e-mail (le lien prouve l'accès à la boîte). Pas de connexion automatique : retour à la connexion avec message.
- Règle de mot de passe commune à l'inscription, au changement et à la réinitialisation : 8 à 128 caractères, message M-12 « Le mot de passe doit contenir au moins 8 caractères. » ; la connexion ne change pas.
- Lien « Mot de passe oublié ? » sur la page de connexion ; routes déclarées dans `tests/security.spec.ts`.

**Never:**
- Aucune révélation de l'existence d'un compte ; pas de jeton en clair en base ou dans les journaux ; pas de lien construit à partir de l'en-tête `Host` ; pas de connexion par le lien seul.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Demande, compte existant | adresse connue | lien envoyé, réponse générique | N/A |
| Demande, compte inconnu | adresse inconnue | même réponse, rien envoyé | N/A |
| Réinitialisation | jeton valide, mot de passe valide | mot de passe remplacé, sessions fermées, jeton consommé | N/A |
| Mot de passe trop court | 7 caractères | refusé, jeton intact | 400 M-12 |
| Rejeu | même jeton | refusé | 400 « Lien invalide ou expiré » |
| Expiré | jeton de plus d'une heure | refusé | 400 |
| Trop de demandes | 6e demande depuis la même IP en une heure | refusée | 429 + `Retry-After` |
| Compte verrouillé | 5 échecs avant | déverrouillé par la réinitialisation | N/A |
| Ancien mot de passe court | 6 ou 7 caractères existant | la connexion fonctionne | N/A |

</frozen-after-approval>

## Code Map

`src/lib/password-policy.ts` ; `src/lib/email-tokens.ts` (de 6.4) ; `src/lib/auth-throttle.ts` (portée « reset ») ; `src/app/api/auth/forgot-password/route.ts`, `reset-password/route.ts`, `signup/route.ts`, `password/route.ts` ; `src/app/mot-de-passe-oublie/`, `src/app/reinitialiser/`, `src/app/login/page.tsx`, `src/app/signup/signup-form.tsx` (textes) ; `tests/security.spec.ts`, `tests/delegation.spec.ts`.

## Tasks & Acceptance

- [x] Règle de mot de passe commune et textes alignés.
- [x] Demande et réinitialisation, limites, sessions fermées, réponse générique.
- [x] Pages et lien de connexion.
- [x] Tests : jeton unique et expiré, mot de passe invalide sans consommation, sessions fermées, réponse identique compte connu ou inconnu, limite IP, déverrouillage.
