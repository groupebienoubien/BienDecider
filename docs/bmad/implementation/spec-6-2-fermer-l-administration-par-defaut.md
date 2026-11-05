---
title: 'Story 6.2 : Fermer l''administration par défaut'
type: 'security'
created: '2026-11-05'
status: 'review'
baseline_commit: '7e7db51'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** sans variable `ADMIN_EMAILS`, tout utilisateur connecté est administrateur (`isAdminEmail`, ouverture historique du pilote). Avec une inscription ouverte, n'importe quel inscrit verrait les coûts de toutes les entreprises et pourrait en supprimer une (#63, prérequis d'ouverture du PoC).

**Approach:** une seule règle d'administration : être listé dans `ADMIN_EMAILS`. Sans liste, personne n'est administrateur. Le lien « Administration » n'apparaît que pour un administrateur.

## Boundaries & Constraints

**Always:**
- `isAdminEmail` ne renvoie vrai que pour une adresse de `ADMIN_EMAILS` (comparaison sans casse, espaces ignorés) ; sans variable ou liste vide : faux pour tous.
- Page `/admin` : un non-administrateur voit « Accès réservé », sans aucune donnée ; l'API de suppression d'entreprise répond 403.
- Le lien « Administration » du menu des réglages est masqué aux non-administrateurs (menu latéral et téléphone).
- Mise à jour du commentaire de `src/lib/admin.ts` et de la documentation qui décrit l'ouverture par défaut.

**Never:**
- Pas de nouvel accès « de secours » ; pas de rôle en base ; pas de changement de l'authentification.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sans liste | `ADMIN_EMAILS` absente | personne n'est administrateur | N/A |
| Liste vide | `ADMIN_EMAILS=" , "` | personne | N/A |
| Listé | e-mail listé (casse différente) | administrateur | N/A |
| Non listé | session simple sur `/admin` | « Accès réservé », aucune donnée | N/A |
| Suppression | non-administrateur, route d'administration | refus | 403 |
| Menu | non-administrateur | pas de lien « Administration » | N/A |

</frozen-after-approval>

## Code Map

`src/lib/admin.ts` ; `src/lib/shell-data.ts` (`isAdmin`) ; `src/components/app-shell.tsx`, `sidebar-nav.tsx` (lien filtré) ; `tests/delegation.spec.ts` (règle pure) ; `tests/security.spec.ts` (page refusée, lien absent).

## Tasks & Acceptance

- [x] Règle unique dans `admin.ts` ; test unitaire mis à jour.
- [x] Lien masqué ; test navigateur page refusée et lien absent.
- [x] Documentation : `ADMIN_EMAILS` obligatoire pour accéder à l'administration (README, `.env.example` s'il existe).

Prérequis de déploiement : `ADMIN_EMAILS` définie en Production avant de livrer, sinon plus personne n'accède à l'administration.
