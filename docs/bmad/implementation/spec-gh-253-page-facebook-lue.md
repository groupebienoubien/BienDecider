---
title: 'Analyser la Page Facebook : Page proposée, confirmée, lue et couverture (#253)'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
baseline_commit: '7de2c4caa9974bf6aa4b6278e947b7dddeff34a5'
review_loop_iteration: 0
context: ['{project-root}/docs/oauth-setup.md', '{project-root}/docs/bmad/implementation/spec-gh-252-analyse-sources-lues.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Martine ne peut pas lire la Page Facebook d'une entreprise : Facebook ne montre qu'une page de connexion au web public, et rien n'indique au dirigeant si la Page analysée est la bonne.

**Approach:** Même logique que la fiche Google (#252). Une Page identifiée (lien déclaré, Page connectée ou lien trouvé par Martine) est proposée au dirigeant avec son lien ; une fois confirmée, son lien rejoint les informations de l'entreprise. Une Page connectée est lue en direct par l'API Meta, et la couverture du Diagnostic dit ce qui a été lu ou non, avec le motif.

## Boundaries & Constraints

**Always:** Lecture seule. Seul le lien de la Page est conservé (candidat, confirmé, refusé) ; le contenu Facebook est lu en direct et jamais stocké. Un lien n'est accepté que s'il est une Page : https, `facebook.com`, `www` ou `m`, un seul segment de chemin, sans paramètre ni fragment, hors profils, groupes, partages, événements et pages utilitaires ; il est enregistré sous forme canonique. Le lien confirmé doit être celui déjà proposé par le serveur. Un lien déjà déclaré dans « Compte Instagram ou Facebook » est utilisé sans fenêtre. Les constats synthétisent sans citer de publication ni nommer d'auteur ou de commentateur. Appels bornés (délai 10 s, champs explicites). Erreurs sans jeton ni corps de réponse. Une Page refusée n'est pas reproposée ; le dirigeant peut retirer la Page confirmée depuis Entreprise. Décision du 2026-10-25 : les publications de la Page ne sont lues que si `pages_read_user_content` figure déjà parmi les permissions accordées ; cette permission n'est pas ajoutée aux permissions demandées.

**Never:** Lire la Page d'un tiers ou d'un concurrent (accès Meta soumis à revue, #12). Lire Instagram ou TikTok (#254). Confirmer sans geste du dirigeant. Publier ou envoyer. Modifier l'autorisation Facebook existante ni ses permissions requises. Lire l'identité d'un utilisateur de Facebook.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page connectée, permission des publications absente | Connexion valide, `pages_read_user_content` non accordée | Infos de la Page lues (« lue ») ; publications « non lues : permission manquante » | Pas d'appel aux publications |
| Page connectée, publications autorisées | Permission accordée | Infos et dernières publications (texte, date, nombre de réactions et de commentaires) lues | N/A |
| Jeton refusé | Meta renvoie 190 ou 401 | « non lue : connexion à refaire » ; connexion marquée en erreur | Passage non bloqué |
| Page non connectée | Lien confirmé ou déclaré | « non lue : connexion Facebook requise » ; lecture publique tentée par le modèle, état déclaré par le constat | N/A |
| Page trouvée | Lien valide proposé par Martine ou par la connexion | Fenêtre avec le lien ; aucune lecture avant confirmation | Lien invalide : refusé, rien enregistré |
| Confirmation | Lien = candidat enregistré | Lien enregistré, visible et retirable dans Entreprise | Autre lien : refusé |
| Meta non configuré | Variables absentes | « non lue : non configurée » ; Page proposable | Pas d'échec |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- `Company` : lien confirmé, lien candidat, liens refusés ; migration additive.
- `src/lib/facebook-page-url.ts` (nouveau) -- validation et forme canonique d'un lien de Page, pure et testable.
- `src/lib/facebook-page.ts` (nouveau) -- candidat (déclaré, connecté, proposé), confirmation, refus, retrait, lecture de la Page connectée avant le modèle.
- `src/lib/oauth/meta.ts` -- ajouter la lecture des infos et publications d'une Page avec `withProof` ; `FACEBOOK_SCOPES` inchangé.
- `src/lib/google-place.ts` -- `recordSourceRead` doit accepter la source (aujourd'hui fixée à Google) ; `src/lib/source-coverage.ts` doit décrire la source Facebook.
- `src/lib/agents/marketing.ts`, `src/lib/facebook-audit-source.ts` -- lecture avant le modèle, outil `propose_facebook_page`, source préférant le lien confirmé.
- `src/app/api/facebook-page/route.ts` (nouveau) ; `src/components/facebook-page.tsx` (nouveau, sur le modèle de `google-place.tsx`) ; pages Diagnostic et Entreprise.
- `tests/sources.spec.ts`, `tests/user-journey.spec.ts`, `tests/security.spec.ts` ; `docs/oauth-setup.md`.
- À ne pas modifier : publication Facebook, scopes, flux OAuth.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- liens Facebook de l'entreprise
- [x] `src/lib/facebook-page-url.ts` -- validation stricte et forme canonique
- [x] `src/lib/oauth/meta.ts`, `src/lib/facebook-page.ts` -- lecture en direct, candidat, décisions du dirigeant
- [x] `src/lib/agents/marketing.ts` et enregistrement des lectures -- lecture avant le modèle, outil de proposition, couverture
- [x] route, fenêtre, ligne Entreprise -- confirmer, refuser, retirer
- [x] tests et docs -- chaque ligne de la matrice ; accès entre entreprises refusé

**Acceptance Criteria:**
- Given une Page identifiée, when le dirigeant ouvre le Diagnostic, then il voit son lien avant tout enregistrement.
- Given une confirmation, when il ouvre Entreprise, then le lien de la Page y figure et peut être retiré.
- Given un lien invalide ou différent du candidat, when il est proposé ou confirmé, then il est refusé sans rien enregistrer.
- Given une Page connectée, when le diagnostic s'exécute, then la couverture indique ce qui a été lu et pourquoi le reste ne l'a pas été.

## Implementation Notes

- `recordSourceRead` et les motifs de non-lecture sont déplacés dans `src/lib/source-reads.ts` (source en paramètre, libellés par source) ; `google-place.ts` garde ses libellés et son comportement. `SourceRead` n'a pas changé : le sujet `informations` ou `publications` distingue les deux lectures Facebook.
- Un champ Meta non vérifié est évité : seuls `id,name,link,category,followers_count,fan_count` sont demandés. Une erreur de Meta (hors jeton refusé) rend la lecture « non lue : Facebook n'a pas répondu » sans toucher à la connexion.
- La fenêtre Facebook ne s'ouvre qu'une fois la fiche Google décidée (une seule demande à la fois).
- Validation locale : `tsc`, `eslint`, `next build`, `test:sources` (40 tests), parcours #252/#253 et garde des routes, `test:facebook` et `test:delegation` sur base PGlite vierge ; la suite `test:engine` n'est pas concluante en local (PGlite coupe les connexions lors des tests de concurrence), la CI fait foi.

## Spec Change Log

## Review Triage Log

Trois relecteurs (adversarial, cas limites, conformité à la spec), 2026-10-25.

- Rejeté : « la fenêtre Facebook est cachée quand une fiche Google est proposée ». C'est l'ordre voulu (une seule fenêtre à la fois, Google d'abord) ; la fenêtre Facebook s'ouvre après la décision Google. Couvert par le test « the Google place is confirmed first ».
- Rejeté : « nombres Meta à coercer ». L'API Graph renvoie des entiers ; un type inattendu rend la lecture « non lue » sans risque.
- Rejeté : « une erreur d'enregistrement de lecture interrompt le passage ». Comportement identique à la lecture Google (#252) et voulu : une lecture non enregistrée ne doit pas passer pour faite.
- Rejeté : « un lien de profil à nom personnalisé passe la validation ». Un profil et une Page ne se distinguent pas par le lien ; le dirigeant confirme et rien n'est lu sans connexion de sa Page.
- Accepté en l'état : lien déclaré sans fenêtre, déjà couvert côté serveur par « a Page link already given by the owner is known and never proposed ».

## Design Notes

Comme pour Google, la lecture de la Page connectée est faite par le code avant le modèle et enregistrée dans `SourceRead` (source `facebook_page`) ; seul le lien proposé par Martine passe par un outil, validé côté serveur et jamais confirmé sans le dirigeant.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: aucun avertissement
- `npx prisma validate` -- expected: schéma valide
- `npm run test:sources`, `npm run test:facebook`, `npm run test:security` -- expected: succès (PostgreSQL requis, exécuté en CI)

**Manual checks (if no CLI):**
- Recette sur une Page de test connectée : infos lues, couverture affichée, aucun contenu stocké.
