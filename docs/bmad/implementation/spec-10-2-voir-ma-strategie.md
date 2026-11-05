---
title: 'Story 10.2 : Voir ma Stratégie'
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

**Problem:** l'accueil liste des productions à décider au lieu de mettre en avant une seule décision utile et de montrer d'où viennent les missions (#283).

**Approach:** la page Stratégie : « Votre prochaine décision » calculée selon la spécification §3.3, « À valider par vous », et « Vos missions regroupées » qui relie chaque constat à sa mission.

## Boundaries & Constraints

**Always:**
- En-tête « Bonjour {prénom}. » (premier mot du nom saisi, sinon « Bonjour. »), « Challenger le plan » (Paul) et « Créer une mission ».
- Un seul prochain pas : ce qui attend le dirigeant, puis un lancement, puis toute mission vivante, la priorité d'abord ; titre, détail, Pourquoi maintenant, Preuve utilisée, À vérifier, résultat recherché, un seul bouton principal, « Challenger avec Paul », « Rien ne sera lancé ou diffusé sans votre accord. » Sans mission : « Aucune mission en cours » et « Explorer une idée ».
- « À valider par vous » : contenus (aucun tant que l'atelier n'existe pas, dit honnêtement), état des connexions et « Gérer les connexions » ; « Une validation de contenu n'est jamais une autorisation de diffusion. »
- « Vos missions regroupées » : constat (« Déclaré par vous » pour une mission créée par le dirigeant), déduction de Paul, mission (statut, priorité, résultat, modèle et périmètre, actions selon le statut).
- Étape et prochain pas en fonctions pures, testées sur chaque cas de la spécification ; étape « en préparation » pour une mission en cours sans contenu.

**Never:**
- Pas de chiffre ni de constat inventé ; pas de bouton de lancement direct (le lancement passe par le cadre de la mission).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aucune mission | — | « Aucune mission en cours », « Explorer une idée » | — |
| Une mission à décider | statut À décider | « Examiner « … » », vers le détail | — |
| En préparation et à décider | une de chaque | la mission à décider d'abord | — |
| Contenu à valider (atelier) | version courante non validée | « Relire et valider le contenu » | — |
| Toutes closes ou écartées | — | « Aucune mission en cours » | — |

</frozen-after-approval>

## Code Map

`src/lib/missions/stage.ts`, `view.ts`, `scope.ts` ; `src/app/strategie/page.tsx` ; `src/components/mission-ui.tsx`, `mission-actions.tsx` ; `src/lib/paul-context.ts`, `src/lib/agents/page-context.ts` (mission comme élément de contexte) ; tests `delegation`, `user-journey`.

## Tasks & Acceptance

- [x] Étape, suivi en six temps et prochain pas purs, avec tests de chaque cas.
- [x] Page Stratégie : en-tête, prochaine décision, À valider par vous, missions regroupées.
- [ ] Contenus prêts ou validés, programmations et marque dans « À valider par vous » (#289, #261, #290).
- [ ] « Ce que Paul apprend » (#53) ; idées à cadrer (#312) ; constats de Paul et « Voir la source » (#284, #168).
