---
title: 'Story 2.2 — Faire enregistrer son profil par Paul'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'b422bc83666e063ac74a90747c01f1af8a4d2bed'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-2-context.md'
  - '{project-root}/docs/bmad/implementation/spec-2-1-dire-son-objectif-a-paul-et-le-confirmer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** quand le dirigeant donne à Paul son Instagram, son site ou ses horaires, rien n'est enregistré : Martine audite ensuite « aucun réseau social déclaré » alors que le dirigeant l'a dit.

**Approach:** un second type d'intention, `update_profile`, sur le même mécanisme de carte que l'objectif (story 2.1) : Paul propose, le dirigeant confirme d'un clic, le serveur écrit le profil avec les mêmes règles que la page Entreprise.

## Boundaries & Constraints

**Always:** champs modifiables par Paul : `website`, `socialHandles`, `phone`, `openingHours`, `description`, avec les mêmes limites de longueur et le même nettoyage (texte vide = effacé) que `POST /api/companies`, via une fonction partagée ; une carte peut porter plusieurs champs ; elle affiche chaque champ avec son libellé de la page Entreprise et sa nouvelle valeur ; une nouvelle intention `update_profile` annule la précédente encore `pending`.

**Never:** nom commercial, métier et zone de chalandise ne sont jamais modifiés par Paul : il renvoie vers la page Entreprise ; aucune écriture avant le clic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Instagram | outil : `socialHandles: "@atelierlumen.nantes"` | carte « Compte Instagram ou Facebook : @atelierlumen.nantes » ; `Company` inchangée | N/A |
| Confirmer | POST `confirm` | `Company.socialHandles = "@atelierlumen.nantes"` ; intention `confirmed` | N/A |
| Plusieurs champs | `website` + `openingHours` | une carte, deux lignes ; les deux écrits à la confirmation | N/A |
| Champ interdit | l'outil reçoit `name` ou `trade` | rejeté par le schéma de l'outil ; aucune intention | Paul renvoie vers la page Entreprise |
| Trop long | `description` au-delà de la limite de la page Entreprise | aucune intention ; l'outil renvoie l'erreur à Paul | Paul demande une version plus courte |
| Agent suivant | intention confirmée, puis Martine lancée | le contexte de Martine contient la nouvelle valeur | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/agents/pending-actions.ts` (story 2.1) -- ajouter le type `update_profile` : schéma zod du payload, description affichable, exécuteur.
- `src/app/api/companies/route.ts` -- limites `TEXT_LIMITS` et `clearableText` : à extraire dans `src/lib/company-profile.ts` (partagé par la route et l'exécuteur), sans changer le comportement de la route.
- `src/lib/agents/co-ceo.ts` -- outil `propose_profile_update` ; règle du prompt : nom, métier et zone → page Entreprise.
- `src/components/paul-panel.tsx` -- la carte de la story 2.1 affiche les lignes de `describePendingAction` : rien de spécifique si elle est générique.
- `src/lib/agents/marketing.ts` -- lit `socialHandles` et `website` de `Company` au lancement : rien à changer, à vérifier par test.
- `tests/delegation.spec.ts`, `tests/engine.spec.ts` -- matrice.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/company-profile.ts` -- limites et nettoyage partagés -- une seule règle
- [x] `src/app/api/companies/route.ts` -- utilise le module partagé -- pas de divergence
- [x] `src/lib/agents/pending-actions.ts` -- type `update_profile` -- carte de profil
- [x] `src/lib/agents/co-ceo.ts` -- outil et prompt -- Paul propose
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une carte de profil confirmée, quand le dirigeant ouvre la page Entreprise, alors la nouvelle valeur y figure.

## Implementation Notes

- Partie pure du type `update_profile` (schéma de l'outil strict, schéma du payload avec limites, `profileUpdateValues`, description) dans `pending-action-view.ts`, comme `update_objective`.
- Libellés partagés (`PROFILE_FIELD_LABELS`) utilisés aussi par le formulaire Entreprise ; la description garde le libellé de la page (« Décrivez votre entreprise… »).
- Message d'expiration selon le type (`expiredMessage`) : celui de l'objectif est inchangé.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind | Une nouvelle carte de profil efface sans le dire les champs de la carte précédente encore ouverte | medium | remplacement par type sans fusion | patch |
| 2 | edge | Deux appels de l'outil dans le même message créent deux cartes | medium | le drapeau d'une carte par tour est posé après `await` | patch |
| 3 | blind | Paul ne voit ni le site ni le compte social actuels | medium | `companyProfileLines` ne les affiche pas | patch |
| 4 | blind | Longueur mesurée avant nettoyage (POST, Paul) et après (PATCH) | low | deux règles ; correctif direct | patch |
| 5 | blind, edge | Valeur `null` ou clé interdite : erreur brute du schéma, sans renvoi vers Entreprise | medium | `.strict()` et `optional()` seuls | patch |
| 6 | edge | Échec de `createPendingAction` remonte brut à Paul | low | correctif direct | patch |
| 7 | edge | Charge utile illisible à la confirmation : 500 | low | `parse` dans l'exécuteur ; correctif direct | patch |
| 8 | blind | `DECIDED_TEXT.expired` vide, message choisi dans le JSX ; repli « objectif » pour un type inconnu | low | correctif direct | patch |
| 9 | blind | `isProfileTextField` inutilisé | low | correctif direct | patch |
| 10 | gap | Outil `propose_profile_update` jamais exercé par un test | medium | aucun test ne passe par `run` | patch |
| 11 | gap | Message d'expiration d'une carte de profil non vérifié (route, panneau) | medium | test d'expiration seulement pour l'objectif | patch |
| 12 | blind | `rejects.toThrow()` accepte n'importe quelle erreur | low | correctif direct | patch |
| 13 | blind | Libellé de la description trop long sur la carte | low | imposé par la spec (« libellé de la page Entreprise ») | rejeté |
| 14 | blind | Valeur longue affichée en une ligne | low | rendu acceptable | rejeté |
| 15 | blind | Messages d'erreur de la route Entreprise avec clés anglaises | low | comportement antérieur | rejeté |
| 16 | blind | Format du site, du téléphone et du compte non vérifié | low | hors de l'intention | defer |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
