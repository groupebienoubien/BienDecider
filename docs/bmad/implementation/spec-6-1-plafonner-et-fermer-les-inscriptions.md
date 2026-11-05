---
title: 'Story 6.1 : Plafonner et pouvoir fermer les inscriptions'
type: 'feature'
created: '2026-11-05'
status: 'draft'
baseline_commit: '7bea9a2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** l'inscription est publique et limitée seulement par adresse IP (10 par heure). Pendant un PoC à inscription ouverte, un abus ou un pic de demandes peut créer des comptes en nombre, donc du coût (plafonds d'usage par entreprise) et des données à traiter, sans que les pères fondateurs puissent y mettre fin sans redéployer.

**Approach:** un réglage global, modifiable sans redéploiement par les seuls administrateurs explicites (`ADMIN_EMAILS`) : inscriptions ouvertes ou fermées, et plafond d'inscriptions par jour. La route d'inscription applique le réglage côté serveur, de façon atomique. La page d'inscription dit clairement quand elles sont fermées ou complètes. L'administration montre le compteur du jour et alerte à 80 % du plafond. La connexion des comptes existants ne change pas.

## Boundaries & Constraints

**Always:**
- Réglage persistant en base : une ligne globale (ouvert ou fermé, plafond journalier facultatif, dernier auteur, date) et un compteur par jour. Migration additive versionnée dans `prisma/migrations` ; sans ligne de réglage, comportement actuel : ouvert, sans plafond.
- Modification réservée à `isExplicitAdminEmail` (jamais l'ouverture par défaut de `isAdminEmail`), contrôle de l'origine comme les autres routes d'administration ; refus 403 sans session ou sans droit.
- `POST /api/auth/signup` : après validation du corps et avant toute création, refuse si fermé (403, « Les inscriptions sont fermées pour le moment. ») ou si le plafond du jour est atteint (429 avec `Retry-After` jusqu'à la fin de la fenêtre, « Inscriptions complètes aujourd'hui, revenez demain. ») ; aucun compte créé dans ces cas.
- Réservation d'un emplacement atomique (un seul `INSERT … ON CONFLICT DO UPDATE … WHERE count < plafond`) : deux inscriptions simultanées au dernier emplacement n'en acceptent qu'une. Un e-mail déjà inscrit (409) ou une création échouée ne consomme pas d'emplacement (libération).
- Fenêtre du jour : minuit à minuit, heure de Paris, comme `parisQuotaWindows` (décision du 2026-11-05 ; #274 disait UTC à tort).
- Page `/signup` : lit l'état côté serveur ; fermées ou complètes, elle affiche le message à la place du formulaire (labels, focus et contrastes de la charte), avec un lien vers la connexion.
- Administration : section « Inscriptions » (visible des seuls administrateurs explicites) avec interrupteur, plafond, compteur du jour sur plafond, et bandeau d'alerte à 80 % et plus (le lien avec #72 reste l'alerte de consommation, hors périmètre).
- Aucune donnée personnelle (e-mail, IP) dans les journaux ou réponses d'un refus.
- Route de réglage déclarée dans `tests/security.spec.ts` (accès refusé 403) ; migration rejouée par la CI sur base jetable ; description de PR avec impacts, tests et retour arrière.

**Never:**
- Pas de liste d'attente, pas de collecte d'e-mail des refusés, pas de code d'invitation.
- Pas de changement de la connexion, du mot de passe, du verrouillage ni de la limite par IP existante.
- Pas de réglage par variable d'environnement seule : un changement ne doit pas demander de redéploiement.
- Pas d'accès au réglage pour un administrateur « par défaut » (sans `ADMIN_EMAILS`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouvert, sans plafond | aucune ligne de réglage | inscription comme aujourd'hui (201) | N/A |
| Fermé | réglage fermé | refus, aucun compte, message sur la page et dans la réponse | 403 |
| Plafond atteint | compteur du jour = plafond | refus, aucun compte, « revenez demain » | 429 + `Retry-After` |
| Dernier emplacement | 2 inscriptions simultanées, 1 place | une 201, une 429 | N/A |
| E-mail déjà inscrit | emplacement disponible | 409, compteur inchangé | N/A |
| Création échouée | erreur après réservation | emplacement libéré, erreur propagée | 500 |
| Changement de jour | première inscription après minuit | compteur du nouveau jour à 1 | N/A |
| Réglage par non-admin | session simple ou absente | refus | 403 |
| Réglage invalide | plafond négatif, non entier ou énorme | refusé, rien modifié | 400 |
| Compte existant | connexion pendant fermeture | inchangée | N/A |
| Alerte | compteur ≥ 80 % du plafond | bandeau visible dans l'administration | N/A |

</frozen-after-approval>

## Code Map

À renseigner à l'implémentation : `prisma/schema.prisma` et nouvelle migration ; `src/lib/signup-control.ts` (lecture du réglage, réservation et libération d'un emplacement, fenêtre du jour, décision pure testable) ; `src/app/api/auth/signup/route.ts` ; `src/app/api/admin/signup-control/route.ts` ; `src/app/signup/page.tsx` (+ formulaire client) ; `src/app/admin/page.tsx` (+ composant du réglage) ; `tests/delegation.spec.ts` (fonctions pures) ; `tests/security.spec.ts` (route déclarée, refus, concurrence, fermeture, plafond) ; documentation `docs/ci-cd.md` si le déploiement change.

## Tasks & Acceptance

À détailler à l'approbation de l'intention ; critères d'acceptation = ceux de #274 et la matrice ci-dessus.

## Décisions du 2026-11-05

1. Fenêtre du jour : heure de Paris.
2. Valeur initiale : déploiement ouvert et sans plafond (comportement actuel) ; le plafond (10 par jour proposé) se règle ensuite depuis l'administration, au moment de l'ouverture décidée dans #273.
3. Prérequis de déploiement : `ADMIN_EMAILS` définie dans les variables Production de Vercel (adresses des deux fondateurs séparées par une virgule), puis redéploiement. Sans elle, personne ne peut modifier le réglage. Même prérequis pour la story 6.2.

Statut : `draft` jusqu'à relecture de l'intention par un fondateur.
