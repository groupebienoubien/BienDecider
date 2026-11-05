# Epic 6 Context : Ouvrir le PoC en sécurité (vague 0 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Poser les prérequis d'ouverture du PoC aux entrepreneurs (jalon « PoC 1 - Prérequis d'ouverture », vague 0 du suivi #272) : maîtriser qui peut s'inscrire et à quel rythme, fermer l'administration par défaut, confirmer l'adresse e-mail, récupérer un mot de passe, et mettre à jour la charte pour la cible V5.2. Aucune nouvelle fonction dirigeant : ce sont les conditions pour ouvrir sans exposer le coût, les données ni la plateforme.

## Stories

- Story 6.1 : Plafonner et pouvoir fermer les inscriptions (#274)
- Story 6.2 : Fermer l'administration par défaut (#63)
- Story 6.3 : Envoyer les e-mails du service (#47)
- Story 6.4 : Confirmer mon e-mail à l'inscription (#64)
- Story 6.5 : Récupérer mon mot de passe (#24)
- Story 6.6 : Mettre à jour la charte pour la cible V5.2 (#276)

Ordre de réalisation : 6.1, 6.2 (en parallèle, sans dépendance de fichiers), puis 6.3, puis 6.4 et 6.5, 6.6 à tout moment avant les écrans de la vague 2.

Hors epic mais dans la vague 0 : terminer #79 et #81 (déjà en relecture), puis #82, #83, #72, #73, #74 ; décisions et accès #273, #2, #69, #302 (pas de développement).

## Requirements & Constraints

- Cible : `docs/cible-produit.md` ; cahier des charges `docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md` ; définition de fini d'une US du PoC dans #272.
- Décision D1 : les plafonds techniques de coût restent actifs ; l'ouverture est gratuite et plafonnée pendant le PoC.
- Aucune action externe sans confirmation, contrôle toujours côté serveur (NFR-1, NFR-3, NFR-4).
- Aucun secret, donnée personnelle ou identité privée dans une Issue, un commentaire, un journal ou un test.

## Technical Decisions

- Authentification : `src/app/api/auth/*`, `src/lib/session.ts`, `src/lib/password.ts`, `src/lib/auth-throttle.ts` (limites par IP et verrouillage du compte).
- Administration : `src/lib/admin.ts` (`isAdminEmail`, `isExplicitAdminEmail`), `src/app/admin/`, `src/app/api/admin/`. Un réglage global ne s'appuie que sur `isExplicitAdminEmail`, jamais sur l'ouverture par défaut.
- Fenêtres de quota : `src/lib/quota-windows.ts` (heure de Paris, pas UTC).
- Zones CODEOWNERS touchées : `prisma/`, `src/app/api/auth/`, `src/lib/admin.ts` : approbation de l'autre développeur obligatoire.
- Tests : `tests/delegation.spec.ts` (fonctions pures, sans réseau), `tests/security.spec.ts` (routes déclarées, accès refusés, isolation), `tests/user-journey.spec.ts` (parcours navigateur). Toute nouvelle route API est déclarée dans `tests/security.spec.ts`.
- Déploiement : une PR par story, `Checks` vert, migrations versionnées (`MIGRATE_ON_DEPLOY=1` actif en production), vérification du parcours sur le déploiement Vercel, `Refs #n` ou `Closes #n` selon la livraison complète des critères.

## Cross-Story Dependencies

- 6.1 et 6.2 touchent toutes deux `src/lib/admin.ts` et la page d'administration : fusionner l'une, rebaser l'autre.
- 6.4 et 6.5 attendent 6.3 (aucun envoi d'e-mail avant que le prestataire d'envoi soit en place).
- 6.1 ne dépend pas du résultat de 6.2 : elle s'appuie sur `isExplicitAdminEmail`, déjà fermé par défaut.

## Prérequis de déploiement

- `ADMIN_EMAILS` doit être définie en Production (Vercel) avant de livrer 6.1 ou 6.2, puis redéployer ; sans elle, l'administration est inaccessible une fois 6.2 livrée.

## Décisions du 2026-11-05 (lot accès et e-mails : stories 6.2 à 6.5, livrées ensemble)

- Lot unique, un commit et une spec par US ; #63 reprise dans le lot (Samir prévenu sur l'Issue).
- Envoi : SMTP générique par variables d'environnement, fournisseur choisi plus tard (`contact@biendecider.com` est un transfert en réception, il n'envoie pas).
- Adresse non confirmée : espace accessible, mais ni budget IA ni diffusion (FR-11 et motif de #64) ; comptes existants confirmés d'office.
- Mot de passe : 8 à 128 caractères pour les nouveaux mots de passe (cahier des charges FR-10 et #24) ; les existants restent valables.
- Prérequis de déploiement : `ADMIN_EMAILS` (6.1, 6.2), puis `SERVICE_SMTP_URL`, `SERVICE_MAIL_FROM`, `APP_BASE_URL` et les enregistrements DNS du fournisseur (6.3 à 6.5).

## Validation locale du lot (2026-11-05)

- Lint strict, build et TypeScript ; 108 tests sans réseau (dont ceux de l'envoi, de la règle de mot de passe et de l'administration fermée) ; `test:security` (16, dont confirmation d'adresse et récupération de mot de passe de bout en bout contre un serveur SMTP de test) ; `test:brand` (8) ; `test:gmail` (3) ; `test:ux` (45, 2 ignorés d'origine) ; test moteur du refus des lancements pour adresse non confirmée.
- Base locale PGlite multiplexée : la CI rejoue le tout sur un vrai PostgreSQL.
- Reste à faire hors code : `ADMIN_EMAILS`, fournisseur SMTP et DNS (SPF, DKIM, DMARC), variables Vercel, puis recette sur le domaine et notes dans #47, #63, #64, #24.

