# Epic 7 Context : Exploiter et soutenir le PoC (vague 0 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner aux fondateurs les outils pour exploiter un PoC à inscription ouverte : bloquer un compte sans le détruire, aider une entreprise qui signale un problème, être alerté avant la facture, et apprendre tout de suite ce qui ne va pas chez un entrepreneur (jalon « PoC 1 - Prérequis d'ouverture », vague 0 du suivi #272). Aucune nouvelle fonction pour le dirigeant, hormis le signalement.

## Stories

- Story 7.1 : Suspendre une entreprise au lieu de la supprimer (#73)
- Story 7.2 : Voir l'activité et les erreurs d'une entreprise (#74)
- Story 7.3 : Être alerté d'une consommation anormale (#72)
- Story 7.4 : Dire ce qui ne va pas depuis n'importe quelle page (#275)

Ordre de réalisation : 7.1, 7.2, 7.3, 7.4, livrées ensemble dans une seule PR (un commit et une spec par US). Hors lot : #276 (charte, documentation seule), #62 (crédit LLM, dépend de #50), #82 et #83 (sauvegarde, suivi d'erreurs : surtout des réglages d'hébergeur).

## Requirements & Constraints

- Cible : `docs/cible-produit.md` ; suivi et définition de fini : #272. Zones CODEOWNERS touchées : `prisma/`, `src/lib/admin.ts` n'est pas modifié ; l'authentification (`src/lib/session.ts`, `src/app/api/auth/login`) l'est par 7.1.
- Toutes les routes d'administration refusent un non-administrateur côté serveur, avec contrôle de l'origine pour les écritures ; toute nouvelle route API est déclarée dans `tests/security.spec.ts`.
- Aucun secret, jeton, mot de passe ni contenu client dans une Issue, un journal ou une trace affichée.

## Technical Decisions

- Administration : `src/app/admin/page.tsx` (vue d'ensemble), `src/app/api/admin/`, règle `isAdminEmail` (liste `ADMIN_EMAILS`, fermée par défaut depuis 6.2).
- Fenêtre du jour pour les seuils : heure de Paris (`src/lib/quota-windows.ts`).
- E-mails aux fondateurs : `src/lib/service-mail.ts` (6.3), destinataires = adresses de `ADMIN_EMAILS` ; un envoi impossible n'empêche jamais l'action.
- Consommation : `recordUsage` (`src/lib/usage.ts`) est le seul point d'écriture du coût ; l'alerte s'évalue à cet endroit, sans nouveau cron.
- Tests : `tests/delegation.spec.ts` (règles pures), `tests/security.spec.ts` (routes, accès refusés, isolation), `tests/engine.spec.ts` (base).

## Décisions du 2026-11-05 (bloc administration et support)

- Suspendue : connexion et sessions refusées, aucun lancement ni diffusion ; données et site public déjà publié conservés ; réactivation en un clic ; suppression définitive après saisie du nom de l'entreprise.
- Alerte de consommation : seuils réglables (par entreprise et total, en dollars sur le jour) ; bandeau dans l'administration et e-mail aux administrateurs au franchissement, au plus un e-mail par seuil et par jour.
- Signalement : e-mail aux administrateurs à chaque signalement, limite de débit par entreprise ; rien n'est jamais publié sur GitHub.

## Cross-Story Dependencies

- 7.1, 7.2, 7.3 et 7.4 modifient toutes la page d'administration : fusionner en une PR et ranger chaque ajout dans son composant.
- 7.4 notifie par l'e-mail du service (6.3) : sans configuration SMTP, le signalement reste visible dans l'administration.
