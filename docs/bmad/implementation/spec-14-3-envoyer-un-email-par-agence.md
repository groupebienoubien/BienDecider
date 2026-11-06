---
title: 'Story 14.3 : Envoyer un e-mail par agence depuis mon Gmail'
type: 'feature'
created: '2026-11-07'
status: 'review'
baseline_commit: 'origin/main'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-14-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le message validé doit partir à chaque agence séparément, depuis l'adresse du dirigeant, sans jamais être envoyé deux fois à la même agence (#316, §5.2).

**Approach:** la diffusion confirmée (ou programmée) d'un contenu Gmail envoie un message par agence et trace chaque envoi.

## Boundaries & Constraints

**Always:**
- Contrôles §5.1 inchangés (adresse vérifiée, délégation, mission En cours, Gmail actif et relié, version validée, au moins un destinataire M-49, case cochée).
- Un message par agence, depuis le compte Gmail relié, objet = titre de la version, texte = corps.
- Chaque envoi tracé (`PublicationRecipient`) : envoyé, échec ou incertain ; l'atelier affiche « À : … · envois séparés » et le résultat par agence.
- Accès refusé par Google : envois suivants non tentés, connexion en erreur, message en clair.
- Une agence déjà servie pour la version n'est jamais renvoyée ; « Ce n'est pas parti » ne touche pas les envois réussis.

**Never:**
- Une relance automatique ; un envoi groupé (une agence en copie d'une autre) ; un nouvel essai aveugle d'un envoi sans réponse.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deux agences, Gmail répond | 200, 200 | envoyée, J-22 « 2 destinataires » | — |
| Un envoi sans réponse | 200, 503 | incertaine ; périmètre verrouillé | M-81 |
| « Ce n'est pas parti », puis rediffusion | — | seule l'agence non servie reçoit | — |
| Accès refusé | 401 | échec, connexion en erreur | J-28 |
| Gmail non relié | — | refus | M-57 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (`PublicationRecipient`) ; `src/lib/oauth/gmail.ts` (`freshGmailAccessToken`, `GMAIL_SEND_URL`) ; `src/lib/contents/publish.ts` (`readDestination`, `sendEmails`, `resolveUncertainDiffusion`) ; `src/lib/contents/view.ts` ; `src/app/atelier/[id]/content-workbench.tsx` ; tests `engine`, `security`.

## Tasks & Acceptance

- [x] Un envoi par agence, tracé, sans doublon après vérification.
- [x] Aperçu destinataire et résultat par agence dans l'atelier.
- [ ] Bilan à 30 jours et décision de suite : #294 et #52.
