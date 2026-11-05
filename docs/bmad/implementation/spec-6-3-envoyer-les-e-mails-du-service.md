---
title: 'Story 6.3 : Envoyer les e-mails du service'
type: 'feature'
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

**Problem:** le produit n'a aucun moyen d'écrire à ses utilisateurs : `contact@biendecider.com` n'est qu'un transfert en réception, et l'intégration Gmail envoie au nom du dirigeant, pas du service. Sans envoi, ni confirmation d'adresse (#64), ni récupération de mot de passe (#24), ni notifications (#92), ni bilan hebdomadaire (#17) ne sont possibles (#47).

**Approach:** une couche d'envoi du service, indépendante du fournisseur (SMTP configuré par variables d'environnement), qui envoie depuis le domaine biendecider.com. Le fournisseur est choisi plus tard par les fondateurs ; le code n'en dépend pas.

## Boundaries & Constraints

**Always:**
- Configuration par `SERVICE_SMTP_URL` (secret, jamais dans le dépôt ni les journaux), `SERVICE_MAIL_FROM` (expéditeur, ex. `BienDecider <noreply@biendecider.com>`) et `APP_BASE_URL` (adresse des liens ; repli `https://www.biendecider.com`, jamais déduite des en-têtes de la requête).
- `sendServiceEmail({ to, subject, text })` : destinataire et objet validés (une adresse, pas de saut de ligne), délais de connexion bornés, aucune exception qui révèle l'URL SMTP ; résultat `sent` ou `not_configured` ou `failed`.
- Non configuré : aucun envoi, un avertissement sans donnée personnelle dans le journal, l'appelant décide quoi dire à l'utilisateur.
- Modèles de messages purs et testables (vouvoiement, texte simple, lien court) : confirmation d'adresse et réinitialisation, réutilisés par #64 et #24.
- Test d'envoi réel contre un serveur SMTP de test local (aucun appel externe).
- Documentation : variables, étapes DNS (SPF, DKIM, DMARC du fournisseur) dans `docs/domain-email-setup.md`, sans valeur secrète.

**Never:**
- Pas de choix de fournisseur imposé ; pas de stockage des messages en base ; pas d'envoi d'un e-mail du service depuis le compte Gmail d'un dirigeant ; pas de suivi d'ouverture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi | SMTP configuré, adresse valide | message remis au serveur SMTP | N/A |
| Non configuré | variables absentes | rien d'envoyé, `not_configured` | N/A |
| Adresse invalide | `a@b.c\nBcc: x@y.z` | refusée avant tout envoi | `failed` |
| Serveur SMTP en panne | refus ou délai | `failed`, aucun secret dans le message d'erreur | N/A |
| Lien | `APP_BASE_URL` absente | liens vers `https://www.biendecider.com` | N/A |

</frozen-after-approval>

## Code Map

`src/lib/service-mail.ts` (envoi) ; `src/lib/service-mail-templates.ts` (messages) ; `tests/support/smtp-sink.ts` (serveur SMTP de test) ; `tests/security.spec.ts` (envoi réel vers le puits) ; `.github/workflows/ci.yml` (variables du serveur de test) ; `docs/domain-email-setup.md`.

## Tasks & Acceptance

- [ ] Envoi SMTP et modèles ; validation des entrées.
- [ ] Puits SMTP de test et test d'envoi (contenu, expéditeur, refus d'une adresse piégée).
- [ ] Variables de la CI ; documentation DNS.
- [ ] Déploiement : choisir le fournisseur, créer l'expéditeur, publier SPF/DKIM/DMARC, saisir `SERVICE_SMTP_URL`, `SERVICE_MAIL_FROM`, `APP_BASE_URL` dans Vercel, redéployer, envoyer un message de test et le contrôler (boîte de réception, pas les indésirables) ; notes dans #47.
