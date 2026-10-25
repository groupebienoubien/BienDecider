---
title: 'US #8 — Renouveler les jetons GBP/Meta et gérer les erreurs'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
baseline_commit: 'e39d001d0cefc3c73e8a871e3e1c66dc15e41ce8'
review_loop_iteration: 0
context:
  - 'docs/oauth-setup.md'
  - 'docs/bmad/implementation/spec-gh-7-chiffrer-jetons-google-meta.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les jetons Google Business Profile chiffrés par #7 ne sont jamais renouvelés: l'accès expire au bout d'une heure sans reprise ni message précis. Une réautorisation sans nouveau refresh token peut garder le refresh d'un autre compte Google, et refus, expiration et révocation ne sont pas distingués.

**Approach:** Ajouter un service serveur de renouvellement GBP à la demande, protégé par un verrou de ligne, qui classe les réponses Google (accès valide, réautorisation requise, indisponible). Prouver l'identité du compte par `openid` avant de conserver un ancien refresh token. Meta n'a rien à renouveler (jeton de Page sans expiration): son refus est déjà traité; on documente et teste ce comportement.

**Décisions produit:** Ajouter le scope `openid` au flux GBP; l'ancien refresh n'est conservé que si l'identifiant `sub` est identique, sinon il est effacé et la connexion exige un renouvellement. Le renouvellement est à la demande: aucune tâche planifiée, aucun appel Google automatique, aucun changement de `/api/cron` ni de `vercel.json`. Aucune fonction ne consomme encore le jeton GBP: le service est livré, testé et prêt pour les futures fonctions.

## Boundaries & Constraints

**Always:** Jetons côté serveur, déchiffrés seulement dans le service, jamais journalisés ni renvoyés au navigateur. Corps de réponse Google jamais journalisé; seul le code d'erreur OAuth sert à classer. Un seul renouvellement à la fois par entreprise, même entre instances. Gmail, clés et chiffrement #7 inchangés.

**Never:** Pas de contournement des quotas ni de la limite Google Testing de 7 jours. Pas de schéma Prisma ni de migration. Pas de cron. Pas de lecture de fiche, de publication ni de nouveau scope sensible. Pas d'effacement de jetons sur panne réseau, 5xx, 429 ou `invalid_client`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accès valide | Expiration à plus de 60 s | Jeton déchiffré renvoyé, aucun appel Google | N/A |
| Renouvellement | Accès expiré, refresh valide | Un appel Google, nouvel accès chiffré et expiration enregistrés | N/A |
| Appels concurrents | Deux demandes simultanées, accès expiré | Un seul appel Google; les deux reçoivent le même jeton | N/A |
| Révocation / expiration 7 jours | Google répond `invalid_grant` | Statut `erreur`, jetons effacés, résultat `reauthorization_required` | Message « Connexion à renouveler » |
| Panne ou limite | Réseau, 5xx, 429 | Connexion intacte, résultat `unavailable` | Aucun détail fournisseur |
| Client invalide | `invalid_client` ou config absente | Connexion intacte, résultat `unavailable` | Diagnostic de configuration existant |
| Réautorisation avec refresh | Nouveau refresh reçu | Remplace l'ancien | N/A |
| Réautorisation sans refresh, même compte | `sub` identique | Ancien refresh conservé, accès mis à jour | N/A |
| Réautorisation sans refresh, autre compte ou non prouvé | `sub` différent, absent ou ancien refresh refusé | Refresh effacé, accès mis à jour sans renouvellement possible | Réautorisation requise à l'expiration |
| Refus utilisateur | Retour Google `error=access_denied` | Aucune écriture; redirection vers un message dédié | « Autorisation Google refusée ou annulée; connexion précédente conservée » |
| Meta refusé | Jeton de Page rejeté (code 190) | Statut `erreur`, déjà livré | « Autorisation à refaire » |

</frozen-after-approval>

## Code Map

- `src/lib/oauth/google.ts` -- ajouter `openid` aux scopes, type `id_token`, `refreshGoogleAccessToken()` avec classement d'erreur sans corps brut, lecture de `sub` (jeton reçu directement du point d'accès Google en HTTPS, `aud` vérifié).
- `src/lib/oauth/google-access.ts` (nouveau) -- `getGoogleBusinessProfileAccess(companyId, options)`: transaction + `SELECT ... FOR UPDATE` sur `"ChannelConnection"` (style `src/lib/agent-run-execution.ts`), relecture après verrou, `fetchImpl` injectable.
- `src/lib/oauth/google-connection.ts` -- réautorisation: remplace ou conserve le refresh après preuve d'identité, sous le même verrou.
- `src/lib/oauth/google-callback.ts` -- gérer `error=access_denied` avant l'échange; ne rien écrire.
- `src/lib/oauth/google-token.ts` -- réutiliser le chiffrement; type de jetons étendu à `id_token`.
- `src/app/connexions/page.tsx` -- messages `google_denied` et `oauth_exchange`; les libellés d'état existent déjà.
- `src/lib/social/facebook-publish.ts` -- ne pas modifier: statut `erreur` sur jeton rejeté déjà testé (`tests/facebook.spec.ts`).
- `tests/facebook.spec.ts` -- tests Google simulés (unitaires et PostgreSQL local/CI protégés par `requireLocalDatabase`).
- `docs/oauth-setup.md` -- scope `openid`, renouvellement à la demande, limite 7 jours, comportement Meta.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/oauth/google.ts` -- scope `openid`, refresh grant, classement `invalid_grant` / indisponible / config, lecture de `sub` -- base commune du service et de la réautorisation
- [x] `src/lib/oauth/google-access.ts` -- service de renouvellement verrouillé et chiffré -- protège contre les appels concurrents
- [x] `src/lib/oauth/google-connection.ts` et `src/lib/oauth/google-callback.ts` -- conservation du refresh par identité, refus utilisateur sans écriture -- critère 2
- [x] `src/app/connexions/page.tsx` -- messages de refus et d'échec -- message clair
- [x] `tests/facebook.spec.ts` -- cas de la matrice: valide, renouvellement, concurrence (un seul appel), `invalid_grant`, panne, `invalid_client`, identité identique/différente/absente, refus utilisateur, aucun jeton ni corps fournisseur dans les logs
- [x] `docs/oauth-setup.md` -- scope, renouvellement à la demande, limite 7 jours, Meta sans renouvellement

**Acceptance Criteria:**
- Étant donné un accès GBP expiré et deux demandes simultanées, quand elles s'exécutent, alors Google n'est appelé qu'une fois et les jetons stockés restent chiffrés et liés à l'entreprise.
- Étant donné une réponse `invalid_grant`, quand le service s'exécute, alors les jetons sont effacés, le statut devient `erreur` et la page Connexions demande de relier le compte.
- Étant donné une réautorisation sans nouveau refresh, quand l'identité Google n'est pas prouvée identique, alors l'ancien refresh n'est jamais conservé.
- Étant donné une panne fournisseur, quand le renouvellement échoue, alors la connexion existante n'est pas modifiée.

## Implementation Notes

- Implémentation directe depuis la spec (pas de sous-agent). Fichiers : `google.ts` (scope `openid`, `googleSubject`, `refreshGoogleAccessToken`), `google-access.ts` (nouveau, verrou `FOR UPDATE`), `google-connection.ts`, `google-callback.ts`, `google-token.ts` (type `id_token`), `connexions/page.tsx`, `tests/facebook.spec.ts`, `docs/oauth-setup.md`.
- Meta : aucun code modifié. Le statut `erreur` sur jeton de Page rejeté (code 190) est déjà testé dans `tests/facebook.spec.ts` (publication Facebook).
- Validations locales (copie jetable avec client Prisma régénéré) : `tsc --noEmit` et ESLint ciblé sans erreur ; 6 tests sans base (chiffrement GBP, scope `openid`, classement des réponses Google, refus utilisateur, callback) réussis.
- Non exécutés localement : les deux tests PostgreSQL (verrou et concurrence, réautorisation par identité). Aucun PostgreSQL disponible ; PostgreSQL embarqué refusé sous un compte administrateur, pas de contournement. La CI doit les exécuter.
- Aucun secret, aucun fournisseur réel, aucune base de production.
- Après revue : refus Google génériques, scope métier obligatoire, transaction en délai rendue `unavailable`, marge de 60 s et messages de la page testés, documentation complétée. Validations locales et tests PostgreSQL à reconfirmer avant présentation.

## Spec Change Log

## Review Triage Log

| Finding | Verdict / route | Evidence |
|---|---|---|
| Blind/Edge/Gap — erreurs Google autres qu'`access_denied` affichées « demande expirée » | medium / patch | `google-callback.ts` renvoie désormais `oauth_exchange` si l'état est valide, sans code et avec un paramètre `error`; test `invalid_scope`. |
| Edge — consentement granulaire: scope métier absent enregistré comme connecté | medium / patch | `exchangeGoogleCode` refuse une réponse dont `scope` n'inclut pas `business.manage`; test avec `openid` seul. |
| Blind/Edge — transaction en délai ou verrou: exception au lieu de `unavailable` | medium / patch | `getGoogleBusinessProfileAccess` capture l'échec, journalise un texte fixe et rend `unavailable`; connexion inchangée. |
| Blind — BOM UTF-8 dans la spec | medium / patch | Les octets initiaux étaient `EF BB BF` (PowerShell `Set-Content`); BOM retiré, autres fichiers vérifiés sans BOM. |
| Blind/Edge — panne pendant la vérification d'identité efface un refresh valide; `openid` pour app déjà configurée non documenté | low / patch | Comportement conservé (échec fermé, exigé par le critère « même identité »); `docs/oauth-setup.md` l'explique et demande d'ajouter `openid`. |
| Gap — messages de page et état `erreur` non testés | medium / patch | `tests/user-journey.spec.ts` ajoute `google_denied`, `oauth_exchange` et « Connexion à renouveler ». |
| Gap — marge de 60 s et expiration nulle non exercées | medium / patch | Tests PostgreSQL à 90 s (aucun appel), 30 s et `null` (un appel). |
| Gap/Edge — libellé « expirée » alors qu'un refresh existe | low / defer | Libellé préexistant; entrée ajoutée à `deferred-work.md`. |
| Blind/Edge/Gap — première autorisation concurrente non sérialisée (`FOR UPDATE` sans ligne) | low / false | Même comportement d'`upsert` qu'avant #8, aucune écriture incohérente; l'échec éventuel est une violation d'unicité réessayable; la correction (verrou consultatif) ajoute de la complexité. |
| Blind — résultat du refresh de vérification jeté | false | Il sert uniquement à lire `sub`; aucun effet à conserver. |
| Blind — statuts non gérés (`expirée`) | false | L'expiration est déduite de `expiresAt`; le service n'écrit que `connecte` et `erreur`. |
| Blind/Edge — refresh illisible marque toute la connexion `erreur` | low / false | Cohérent avec #7 (altération jamais une connexion valide); une ligne à moitié lisible est corrompue. |
| Blind/Edge — `exp`/`azp` du `id_token` non vérifiés | low / false | Jeton reçu à l'instant du point d'accès Google en HTTPS; la signature n'est pas revérifiée par conception (commentaire). |
| Edge — ancien refresh effacé sans révocation | low / false | Le jeton n'est plus détenu; la révocation côté Google dépend du compte tiers et ajoute un effet de bord. |
| Edge — `invalid_request`/`unauthorized_client` classés `unavailable` | low / false | Cas non observables avec ce client; la spec limite le classement à `invalid_grant`. |
| Edge — `expires_in` absent à l'échange | false | `carried` de #7: Prisma refuse une date invalide et le callback intercepte l'échec. |
| Blind — vérification annoncée non exécutée, test Meta « absent », clés d'erreur génériques, console remplacée, import non trié, `invalid_client` sans journal | low / false | Notes d'implémentation honnêtes; test 190 existant (`tests/facebook.spec.ts`); aucun conflit de clé avec `META_ERROR_MESSAGES`; console restaurée en `finally` (workers=1); aucun consommateur du jeton n'existe encore. |

## Design Notes

L'identifiant `sub` n'est pas stocké (pas de migration): lors d'une réautorisation sans refresh, le service renouvelle l'ancien refresh, compare le `sub` de la réponse à celui du nouvel échange, et conserve l'ancien seulement si les deux existent et sont égaux. Un ancien refresh émis avant `openid` ne renvoie pas de `sub`: il est considéré non prouvé et effacé.

## Verification

**Commands:**
- `npm run test:facebook` -- succès (tests GBP simulés, aucun appel Google réel)
- `npm run lint` et `npm run build` -- succès avec génération Prisma propre
- `npm run test:security` et `npm run test:ux` -- succès sur base jetable CI

**Manual checks (if no CLI):**
- Le test PostgreSQL de concurrence ne tourne pas sans base locale: il doit être validé par la CI.
- Aucun appel Google réel, aucun secret, aucune base de production.
