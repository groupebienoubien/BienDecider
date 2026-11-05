---
title: 'Story 7.4 : Dire ce qui ne va pas depuis n''importe quelle page'
type: 'feature'
created: '2026-11-05'
status: 'ready-for-dev'
baseline_commit: 'd411853'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** un entrepreneur du PoC qui rencontre un problème, une confusion ou une idée n'a aucun moyen simple de le dire sans quitter sa page ; l'équipe l'apprend trop tard, ou jamais (#275, D7 : « Laisser un avis » est une fonction permanente).

**Approach:** une action secondaire « Signaler un problème » accessible depuis toutes les pages connectées, qui ouvre une fenêtre (type et texte libre), enregistre le signalement côté serveur et prévient les fondateurs par e-mail. Les fondateurs les traitent depuis l'administration.

## Boundaries & Constraints

**Always:**
- Lien « Signaler un problème » dans le pied de page de la coque de l'application (toutes les pages connectées), action secondaire qui ne concurrence pas l'action principale ; fenêtre native `dialog` avec focus et Échap, champs libellés : type (problème, confusion, idée) et texte (1 à 1000 caractères).
- `POST /api/feedback` : session, origine contrôlée ; corps validé (type dans la liste, texte 1 à 1000 caractères après nettoyage des espaces, page = chemin de l'adresse seulement, sans paramètres ni fragment, 200 caractères au plus) ; la page courante est captée automatiquement par l'interface.
- Rattaché à l'entreprise de la session (jamais à un identifiant envoyé par le client) ; accusé de réception clair dans la fenêtre.
- Limite de débit par entreprise : 10 signalements par heure, au-delà 429 avec `Retry-After`.
- Aucune capture d'écran ni contenu de production joint ; aucune Issue publique créée.
- Notification : e-mail du service aux administrateurs (`ADMIN_EMAILS`) avec type, page, texte et nom de l'entreprise ; envoyé après la réponse ; un envoi impossible n'empêche pas l'enregistrement.
- Administration : liste (date, page, type, entreprise, texte, statut) réservée aux administrateurs, texte affiché échappé, bouton Traité / À traiter (`PATCH /api/admin/feedback/[id]`, origine contrôlée).
- La politique de confidentialité mentionne ces signalements (texte ajouté à la page de confidentialité, à valider avec #2).

**Never:**
- Pas de chat de support, pas de base de connaissances, pas de pièce jointe, pas de création d'Issue GitHub, pas de lecture des signalements d'une autre entreprise par un dirigeant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi | dirigeant connecté, type et texte valides | enregistré pour son entreprise, accusé, e-mail aux administrateurs | N/A |
| Sans session | aucun cookie | refusé | 401 |
| Texte vide ou trop long | 0 ou 1001 caractères | refusé | 400 |
| Type inconnu | `autre` | refusé | 400 |
| Page piégée | chemin avec paramètres ou fragment | seul le chemin est conservé | N/A |
| Rafale | 11e signalement en une heure | refusé | 429 + `Retry-After` |
| Autre entreprise | identifiant d'entreprise dans le corps | ignoré, rattaché à la session | N/A |
| Contenu hostile | `<script>…</script>` dans le texte | affiché comme texte dans l'administration | N/A |
| Envoi impossible | SMTP absent ou en panne | signalement enregistré et visible | pas d'erreur côté dirigeant |
| Non-administrateur | session simple | pas de liste, PATCH refusé | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration (`Feedback`) ; `src/lib/feedback.ts` (règles pures) ; `src/app/api/feedback/route.ts`, `src/app/api/admin/feedback/[id]/route.ts` ; `src/components/feedback-dialog.tsx`, `app-shell.tsx` ; `src/app/admin/feedback-list.tsx`, `page.tsx` ; `src/app/confidentialite/page.tsx` ; `tests/delegation.spec.ts`, `tests/security.spec.ts`, `tests/user-journey.spec.ts`.

## Tasks & Acceptance

- [ ] Règles pures (validation, nettoyage du chemin) et tests.
- [ ] Modèle, route d'envoi avec limite, e-mail aux administrateurs.
- [ ] Fenêtre dans la coque, accusé ; liste et traitement dans l'administration.
- [ ] Tests : validation, limite, isolation, échappement, e-mail reçu, parcours depuis une page et sur mobile.
