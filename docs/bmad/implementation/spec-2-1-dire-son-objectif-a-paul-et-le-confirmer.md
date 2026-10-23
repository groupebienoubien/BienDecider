---
title: 'Story 2.1 — Dire son objectif à Paul et le confirmer en un clic'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'a29b7bd6c9eb578aeca86501662840c8f82f2707'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le dirigeant donne son objectif à Paul, mais Paul n'a aucun moyen de l'enregistrer : l'accueil, le plan, les résultats et la page Entreprise le redemandent. Et le calcul de l'écart arrondit au client supérieur chaque mois : pour 5 000 €/mois d'écart et 18 000 € par client, il annonce « 1 client de plus par mois » (12 par an) au lieu d'environ 3 à 4 par an.

**Approach:** Paul propose une carte de confirmation (`PaulPendingAction` de type `update_objective`) avec les valeurs converties par le code ; au clic, le serveur enregistre l'objectif comme le ferait la page Entreprise. Le calcul de l'écart donne des clients par an et par mois sans arrondi au supérieur.

## Boundaries & Constraints

**Always:** rien n'est écrit dans `Company` avant le clic ; la conversion année → mois est faite par `toMonthly` (arrondi à l'euro) ; la confirmation écrit aussi `Company.objective`, une phrase construite par le code (« Passer de 140 000 € à 200 000 € de chiffre d'affaires par an ») ; `newClientsPerMonth` devient décimal (migration `Int → Double precision`, valeurs existantes conservées) et la page Entreprise accepte une décimale ; l'écart affiché vient de `computeBusinessTarget`, qui renvoie `extraClientsPerMonth` et `extraClientsPerYear` arrondis à une décimale ; l'accueil et les résultats affichent l'écart par an quand il est inférieur à 1 client par mois ; une nouvelle intention `update_objective` annule l'intention `pending` précédente du même type ; une carte expire 24 h après sa création ; la route de confirmation filtre sur l'entreprise de la session.

**Never:** pas de profil (story 2.2) ni de lancement (story 2.3) dans cette story ; Paul n'écrit jamais lui-même un chiffre calculé : il cite `computeBusinessTarget` ; pas de carte quand la période (mois ou an) manque.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Objectif annuel | outil : cible 200 000, actuel 140 000, `year`, 18 000 par client, 6 clients/an | intention `pending` ; carte : 16 667 €/mois visés, 11 667 €/mois actuels, 18 000 € par client, 0,5 client/mois ; `Company` inchangée | N/A |
| Confirmer | POST `confirm` sur cette intention | `Company` : `revenueTarget` 16667, `monthlyRevenue` 11667, `averageClientValue` 18000, `newClientsPerMonth` 0.5, `objective` rempli ; intention `confirmed` | N/A |
| Double clic | deux POST `confirm` simultanés | une seule écriture ; le second reçoit l'état `confirmed` sans réécrire | N/A |
| Annuler | POST `cancel` | intention `cancelled` ; `Company` inchangée | N/A |
| Expirée | `expiresAt` dépassé | 409 `expired` ; intention `expired` ; rien n'est écrit | message « Cette proposition a expiré. Redites votre objectif à Paul. » |
| Autre entreprise | id d'une intention d'une autre entreprise | 404 | N/A |
| Écart | 140 000 → 200 000 €/an, 18 000 € par client | `extraClientsPerYear` 3.3, `extraClientsPerMonth` 0.3 ; accueil : « environ 3,3 clients de plus par an » | N/A |
| Remplacement | deux intentions `update_objective` successives | la première passe `cancelled` | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` (`Company.newClientsPerMonth Int?`) -- passer en `Float?` ; nouveau modèle `PaulPendingAction` (`id`, `companyId` + relation, `chatMessageId String?` + relation `ChatMessage`, `type`, `payload Json`, `status` défaut `pending`, `createdAt`, `decidedAt?`, `expiresAt`, index `[companyId, status]`).
- `src/lib/business-target.ts` -- `computeBusinessTarget` (ceil mensuel à `:40`) ; ajouter `toMonthly(amount, period)` et `extraClientsPerYear` ; `businessTargetLines` (prompts) cite les deux.
- `src/components/objective-hero.tsx:55`, `src/app/rapport/page.tsx:66` -- affichage de l'écart : passer à l'année sous 1 client/mois.
- `src/app/api/companies/route.ts` (validation entière de `newClientsPerMonth`) et le champ du formulaire `src/components/company-profile-form.tsx` -- accepter une décimale.
- `src/lib/agents/pending-actions.ts` (nouveau) -- `createPendingAction`, `describePendingAction` (lignes affichables, fonction pure), `decidePendingAction(companyId, id, decision)` ; exécuteur `update_objective` qui écrit `Company`.
- `src/app/api/co-ceo/pending-actions/[id]/route.ts` (nouveau) -- `POST { decision }` ; 401/404/409 ; réponse `{ action }` (vue).
- `src/lib/agents/co-ceo.ts` -- `runCoCeoTurn` : outil `propose_objective_update` ; les intentions créées pendant le tour sont rattachées au message de Paul enregistré à la fin (`chatMessageId`) et renvoyées avec la réponse ; prompt : demander la période si elle manque, ne jamais calculer un chiffre affiché.
- `src/app/api/co-ceo/message/route.ts` et `src/lib/chat-stream.ts` (événement `done`) -- ajouter `actions` à la réponse.
- `src/app/api/co-ceo/messages/route.ts` -- l'historique renvoie les intentions de chaque message de Paul.
- `src/components/paul-panel.tsx:405-440` -- rendu d'une carte par intention sous le message de Paul : lignes, bouton vert « Confirmer », lien « Corriger » (annule et remet le focus dans la saisie) ; états confirmée, annulée, expirée ; `router.refresh()` après confirmation.
- `tests/delegation.spec.ts` (fonctions pures) et `tests/engine.spec.ts` (base) -- tests de la matrice.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- `PaulPendingAction`, `newClientsPerMonth` décimal -- support des intentions
- [x] `src/lib/business-target.ts` + affichages -- `toMonthly`, `extraClientsPerYear`, écart par an sous 1 client/mois -- chiffres justes
- [x] `src/lib/agents/pending-actions.ts` -- création, description, décision atomique, exécuteur objectif -- cœur de la carte
- [x] `src/app/api/co-ceo/pending-actions/[id]/route.ts` -- confirmation et annulation -- clic du dirigeant
- [x] `src/lib/agents/co-ceo.ts`, routes de chat, `chat-stream.ts` -- outil, rattachement au message, réponse et historique -- Paul propose
- [x] `src/components/paul-panel.tsx` -- carte de confirmation -- interface
- [x] `src/app/api/companies/route.ts`, `company-profile-form.tsx` -- décimale acceptée -- cohérence avec la carte
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné une carte confirmée, quand le dirigeant ouvre l'accueil, le plan, les résultats ou Entreprise, alors l'objectif y apparaît sans ressaisie.
- Étant donné un objectif enregistré, quand Paul répond sur le nombre de clients nécessaires, alors il cite les valeurs de `computeBusinessTarget`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | gap | Route `pending-actions/[id]` absente de `GUARDED_ROUTES` : `test:security` échouera | high | `security.spec.ts:119-127` exige que chaque route soit déclarée | patch |
| 2 | blind, edge | Une carte remplacée s'affiche « annulée, dites à Paul ce qu'il faut corriger » | medium | même statut `cancelled` que le clic « Corriger » | patch |
| 3 | blind, edge | Deux créations simultanées laissent deux cartes ouvertes | medium | `updateMany` + `create` en lecture validée | patch |
| 4 | edge | Confirmer une carte déjà remplacée répond 200 sans rien écrire | medium | `transition.count === 0` traité comme succès | patch |
| 5 | blind | Exécution codée en dur pour `update_objective` : un autre type serait « confirmé » sans effet | medium | pas de table d'exécuteurs par type | patch |
| 6 | blind, edge | Un montant hors bornes fait échouer le tour au lieu d'une réponse lisible | medium | `parse` lève dans `run` de l'outil | patch |
| 7 | blind | Période unique pour tous les montants : « 12 000 €/mois, 200 000 €/an » oblige Paul à convertir | medium | interdit par sa règle « ne calcule jamais » | patch |
| 8 | blind | La date cible n'est pas captée | medium | prévue dans le contexte de l'épopée, absente de l'outil | patch |
| 9 | blind | Paul ignore l'état de ses cartes (confirmée, annulée, expirée) | medium | rien dans `get_current_status` | patch |
| 10 | blind | Plafond de 3 cartes sans effet pour un seul type | low | une seule carte d'objectif utile par tour ; correctif direct | patch |
| 11 | blind | `catch` de conflit de sérialisation inatteignable dans `decidePendingAction` | low | transaction en isolation par défaut ; correctif direct | patch |
| 12 | blind | Le résultat de l'outil donne des montants que Paul ne doit pas répéter | low | correctif direct | patch |
| 13 | blind, edge | Écart arrondi à 0 affiché « environ 0 client » ; choix mois/an fait sur la valeur arrondie ; commentaire faux | low | `roundOneDecimal` ; correctif direct | patch |
| 14 | edge | Un montant positif arrondi à 0 est enregistré | low | correctif direct (minimum après conversion) | patch |
| 15 | edge | Carte orpheline si le tour échoue après sa création | medium | `chatMessageId` nul, carte confirmable par identifiant | patch |
| 16 | edge | La route de confirmation lève une 500 sans corps JSON | low | correctif direct | patch |
| 17 | edge | Sans CA actuel, Résultats reste vide après confirmation | medium | `computeBusinessTarget` exige les deux montants ; Paul doit le demander | patch |
| 18 | gap | Carte du panneau, historique et événement `done.actions` non testés | medium | aucun test n'envoie `actions` | patch |
| 19 | gap | Décimale de `newClientsPerMonth` sur `POST /api/companies` non testée | medium | aucun test n'envoie ce champ | patch |
| 20 | blind | `toInt` ne renvoie plus un entier | low | nom seulement | rejeté |
| 21 | blind | Le formulaire Entreprise ne permet pas un rythme annuel | low | hors de l'intention | defer |
| 22 | blind | Pas de purge ni de contrainte sur la table des cartes | low | expiration paresseuse suffisante à ce volume | defer |

## Verification

**Commands:**
- `npx prisma validate` -- expected: schéma valide
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: 0 avertissement
- `npm run test:delegation` -- expected: tests verts
- `npm run test:engine` -- expected: tests verts (la CI fait foi sous Windows)
