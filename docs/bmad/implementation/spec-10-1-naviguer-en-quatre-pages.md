---
title: 'Story 10.1 : Naviguer en quatre pages'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '5ead4bd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-10-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** la navigation actuelle suit l'ancien parcours en quatre temps (Objectif, Plan, Décisions, Résultats) ; le dirigeant ne retrouve pas les quatre pages de la cible V5.2 ni son cap (#278).

**Approach:** une coque V5.2 (Stratégie, Missions, Atelier, Résultats ; Entreprise par le bloc de l'entreprise ; Mon compte avec le solde ; « Laisser un avis »), activée entreprise par entreprise pendant la bascule.

## Boundaries & Constraints

**Always:**
- Drapeau `workspaceV52` par entreprise, faux par défaut, basculé par un administrateur ; sans drapeau, rien ne change pour l'entreprise.
- Navigation : Stratégie, Missions (nombre de missions en cours), Atelier, Résultats ; bloc de l'entreprise vers `/entreprise` ; « Votre cap » (objectif saisi, horizon et recrutement « — » tant que l'ambition n'est pas interprétée) ; « Laisser un avis » (même dialogue que #275) ; Administration pour les seuls administrateurs ; Mon compte avec le solde de crédits.
- Barre du haut : « Votre espace › page », date du jour (heure de Paris), « Discuter avec Paul ».
- Téléphone : menu latéral repliable ; ouvert, la page derrière est inerte, le focus va au premier lien, Échap ou une navigation le ferme et rend le focus au bouton.
- Anciennes adresses avec drapeau : `/dashboard`, `/cockpit`, `/equipe` → `/strategie` ; `/prospection` → `/missions` ; `/rapport` → `/resultats`.
- Aucun autre personnage que Paul.

**Never:**
- Pas de bandeau ni de lien de démonstration ; pas de redirection d'une adresse dont la page cible n'existe pas encore.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sans drapeau | page V5.2 demandée | renvoi vers `/dashboard` | — |
| Sans session | page V5.2 demandée | renvoi vers `/login` | — |
| Avec drapeau | `/dashboard` | `/strategie` | — |
| Bascule par un non-administrateur | session simple | refusé | 403 |
| Bascule mal formée | `enabled` non booléen | refusé | 400 |
| Téléphone, menu ouvert | Échap | menu fermé, page de nouveau active | — |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` + migration `20261106100000_workspace_v52_journal` ; `src/lib/workspace.ts` ; `src/lib/shell-data.ts` ; `src/components/app-shell.tsx`, `workspace-nav.tsx`, `icon.tsx`, `feedback-dialog.tsx`, `paul-panel.tsx` ; `src/app/api/admin/companies/[id]/workspace/route.ts`, `src/app/admin/workspace-toggle.tsx` ; anciennes pages (`dashboard`, `equipe`, `prospection`, `rapport`) ; `src/app/maquette.css` ; tests `delegation`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Drapeau, bascule d'administration et redirections.
- [x] Coque V5.2 : quatre pages, compteur, cap, avis, compte et solde, fil d'Ariane daté, « Discuter avec Paul ».
- [x] Menu mobile accessible (inerte, focus, Échap) ; 360 et 390 px sans débordement.
- [ ] Redirections de `/studio`, `/diagnostic`, `/connexions` quand leurs pages cibles existeront (vague 3, Entreprise).
- [ ] « Discuter avec Paul » ouvre la conversation du contexte de la page (#288).
