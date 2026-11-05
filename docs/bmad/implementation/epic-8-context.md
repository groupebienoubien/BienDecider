# Epic 8 Context : Exploiter le PoC en sécurité (sauvegarde, erreurs, crédit)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Savoir, avant les entrepreneurs, quand quelque chose casse ou va manquer : erreurs serveur tracées et alertées, crédit du fournisseur du modèle visible avant la panne, restauration de la base éprouvée (jalon « PoC 1 - Prérequis d'ouverture », vague 0 du suivi #272). Aucune nouvelle fonction pour le dirigeant.

## Stories

- Story 8.1 : Suivre les erreurs en production (#83)
- Story 8.2 : Visualiser le crédit du modèle (#62)
- Story 8.3 : Tester la sauvegarde et la restauration (#82)

Ordre de réalisation : 8.1, 8.2 (code, dans l'administration), 8.3 (procédure, exécutée par les fondateurs). Livrées dans une seule PR, un commit et une spec par US.

## Requirements & Constraints

- Cible : `docs/cible-produit.md` ; suivi : #272. Zone CODEOWNERS touchée : `prisma/` (deux tables additives).
- Aucun secret, jeton, mot de passe ni adresse de connexion dans une trace, un e-mail, une Issue ou une page : tout message d'erreur passe par `redactSecrets` avant d'être stocké.
- Les routes d'administration refusent un non-administrateur côté serveur, avec contrôle d'origine pour les écritures ; toute nouvelle route API est déclarée dans `tests/security.spec.ts`.

## Technical Decisions

- Erreurs : `src/instrumentation.ts` exporte `onRequestError` (convention Next), qui enregistre l'erreur dans la table `ErrorEvent` (runtime Node) ; pas de service externe (décision du 2026-11-05). Alerte e-mail aux administrateurs, une fois par empreinte d'erreur et par heure ; purge au-delà de 30 jours.
- Crédit : le fournisseur du modèle n'expose pas de solde. Les fondateurs saisissent le solde constaté dans sa console ; le restant est ce solde moins le coût mesuré depuis (`UsageEvent`), les jours restants se calculent au rythme des 7 derniers jours. Alerte sous un seuil réglable, enregistrée comme les alertes de consommation (`UsageAlert`, portée `credit-llm`, une par jour).
- Sauvegarde : procédure `docs/sauvegarde-restauration.md` ; la vérification chez l'hébergeur et la restauration d'essai se font dans sa console, par les fondateurs.

## Cross-Story Dependencies

- 8.1 et 8.2 modifient la page d'administration, après les panneaux de l'epic 7.
- 8.2 réutilise l'évaluation déclenchée par `recordUsage` (7.3) et la table `UsageAlert`.
