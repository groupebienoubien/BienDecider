---
title: 'Story 8.1 : Suivre les erreurs en production'
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

**Problem:** une erreur serveur en production n'est connue qu'au retour d'un entrepreneur, ou jamais (#83).

**Approach:** chaque erreur serveur est tracée sans secret et les administrateurs sont prévenus par e-mail ; les erreurs récentes se lisent dans l'administration.

## Boundaries & Constraints

**Always:**
- Collecte par `onRequestError` de Next (`src/instrumentation.ts`), runtime Node seulement ; aucun service externe.
- Message nettoyé par `redactSecrets` avant stockage et avant e-mail ; chemin de la requête sans paramètres ni fragment ; aucun en-tête, corps ni cookie conservé.
- Empreinte d'erreur (méthode, route, message sans nombres ni identifiants) : au plus un e-mail aux administrateurs (`ADMIN_EMAILS`) par empreinte et par heure ; chaque occurrence reste tracée.
- Le suivi ne lève jamais : une base ou un SMTP en panne n'aggrave pas l'erreur d'origine.
- Administration : nombre d'erreurs des dernières 24 heures et liste des 15 dernières (date, route, message, repère), texte affiché échappé.
- Purge des traces de plus de 30 jours.

**Never:**
- Pas de jeton, mot de passe, adresse de connexion ni contenu client dans une trace.
- Pas de service tiers, pas de cron.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Erreur serveur | exception dans une route ou une page | trace enregistrée, e-mail aux administrateurs | N/A |
| Même erreur dans l'heure | même empreinte | trace enregistrée, pas de nouvel e-mail | N/A |
| Même erreur une heure plus tard | même empreinte | trace et nouvel e-mail | N/A |
| Secret dans le message | `postgres://u:mdp@h`, `token=…`, clé `sk-…` | masqué dans la trace et l'e-mail | N/A |
| Paramètres dans l'adresse | `/api/x?token=…#f` | seul `/api/x` conservé | N/A |
| SMTP absent ou en panne | aucune configuration | trace enregistrée, pas d'erreur propagée | journal serveur seulement |
| Base indisponible | écriture impossible | pas d'exception propagée | journal serveur seulement |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration (`ErrorEvent`) ; `src/lib/error-tracking-rules.ts` (règles pures) ; `src/lib/error-tracking.ts` ; `src/instrumentation.ts` ; `src/app/admin/errors-panel.tsx`, `page.tsx` ; `tests/delegation.spec.ts`, `tests/engine.spec.ts`, `tests/security.spec.ts`.

## Tasks & Acceptance

- [x] Règles pures (nettoyage, chemin, empreinte, e-mail) et tests.
- [x] Enregistrement, alerte une fois par heure, purge ; `onRequestError`.
- [x] Panneau d'administration.
- [x] Tests : aucun secret stocké ni envoyé, une alerte par heure, envoi impossible, affichage échappé.
