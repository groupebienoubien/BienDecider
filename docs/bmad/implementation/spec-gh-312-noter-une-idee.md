---
title: 'GH-312 · Noter une idée avec Paul et la cadrer en mission'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '0b4f5d95ad37f896bd452d2826371f3f076ebb3e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Une envie du dirigeant qui n'est pas encore une mission se perd dans la conversation : « Explorer une idée » ouvre un fil `idee:{n}` mais rien n'est gardé (FR-17, FR-25, spec §12, §16.3, addendum §4.5, écarts E-06 et R-08).

**Approach:** Ajouter un modèle `Idea` et un service qui note (via une carte de Paul « Noter l'idée », J-16), retire et cadre une idée ; afficher les idées dans « Vos missions regroupées » avec « Cadrer avec Paul » et « Retirer l'idée » ; une mission créée depuis une idée reprend son texte comme constat et retire l'idée.

## Boundaries & Constraints

**Always:**
- Idée : 1 à 200 caractères après `trim`, sans `<` ni `>` (M-62 sinon) ; 10 idées ouvertes au plus par entreprise, contrôlé dans le service et à l'exécution de la carte (M-63).
- Une idée n'est notée qu'au clic sur « Noter l'idée » ; « Garder le cap actuel » ne change rien (mécanique #288).
- Cadrer = `createMissionIn` avec un `ideaId` : la mission et le retrait de l'idée se font dans la même transaction ; idée absente, d'une autre entreprise ou déjà cadrée → refus, rien n'est créé.
- Tout modèle du catalogue, y compris « Sur mesure » qui transmet déjà la demande à l'administration (`UncoveredRequest`).
- Toute route vérifie l'entreprise de la session ; une idée d'une autre entreprise répond 404.
- Journal : J-16 à la note, J-30 au retrait, J-01 suivi de J-31 au cadrage.
- Décision : « Cadrer avec Paul » ouvre le formulaire « Cadrons votre nouvelle mission » prérempli (`/missions/nouvelle?idee={id}`, constat = texte de l'idée, modifiable), avec « En discuter avec Paul » sur la page — même effet que l'acceptation de la carte.
- Décision : J-30 « Idée retirée : « {idée} ». » ; J-31 « Idée cadrée en mission : {mission}. »
- Décision : spec gardée entière (≈ 2 000 tokens), une seule PR.

**Never:**
- Pas de saisie d'idée à la main hors de Paul (FR-17 : « notée avec Paul »).
- Pas de liste d'idées sur la page Missions (spec §13 « Liste ») dans cette US.
- Ne pas lier une idée à un fil `idee:{n}` ; ne pas modifier `nextIdeaKey`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Noter | Carte `idea_note` acceptée, 3 idées | Idée ajoutée, J-16, redirection vers `/missions/nouvelle?idee={id}` | N/A |
| Plafond | 10 idées ouvertes | Paul ne crée pas la carte et demande d'en retirer une ; une carte déjà créée est refusée au clic | M-63, rien ne change |
| Texte vide ou balise | `"  "` ou `"<b>x</b>"` | Refus | M-62 |
| Cadrer | Formulaire prérempli, mission créée | Mission avec le constat saisi, idée retirée de Stratégie, J-01 + J-31 | N/A |
| Idée trop courte pour un constat | Idée de 6 caractères | Constat prérempli, le dirigeant le complète | M-20 du formulaire |
| Idée déjà cadrée ou retirée | `?idee=` obsolète ou double envoi | Formulaire sans préremplissage ; POST refusé | 404, aucune mission créée |
| Retirer | Clic « Retirer l'idée » | Idée supprimée, J-30, page rafraîchie | 404 si absente |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- nouveau `Idea (id, companyId, text, createdAt, convertedMissionId?)`, index `(companyId, createdAt)` ; commentaire des types de `PaulPendingAction` (:274).
- `prisma/migrations/<horodatage libre>_idees/` -- table `Idea` ; vérifier l'horodatage contre `prisma/migrations` juste avant de pousser.
- `src/lib/ideas.ts` (nouveau) -- `validateIdeaText`, `noteIdeaIn(tx, companyId, text)`, `removeIdea(companyId, id)`, `listOpenIdeas(companyId)`, `IDEA_MAX = 10` ; ouvertes = `convertedMissionId` nul.
- `src/lib/missions/messages.ts` -- ajouter M-62, M-63.
- `src/lib/journal.ts` -- ajouter J-16, J-30, J-31 à `JOURNAL_TEXTS`.
- `src/lib/missions/service.ts:58-85` -- `createMissionIn` accepte `ideaId?` : verrouille l'idée ouverte de l'entreprise, crée la mission, pose `convertedMissionId`, écrit J-31.
- `src/app/api/missions/route.ts` -- transmettre `ideaId` ; nouvelle `src/app/api/ideas/[id]/route.ts` (DELETE) en copiant l'authentification des routes missions.
- `src/app/missions/nouvelle/page.tsx` + `new-mission-form.tsx` -- lire `searchParams.idee` (Next : searchParams est une Promise, voir `node_modules/next/dist/docs`), précharger le constat, envoyer `ideaId`.
- `src/lib/agents/pending-action-view.ts` -- type `idea_note` dans `PENDING_ACTION_TYPES`, `CONFIRMED_TEXT`, `PayloadFor`, `PAYLOAD_SCHEMAS` (`{text}`), `CONFIRM_LABELS` « Noter l'idée », `DESCRIBERS`, exclusions de `pendingActionMissionId`.
- `src/lib/agents/pending-actions.ts` -- `EXECUTORS.idea_note` appelle `noteIdeaIn` et renvoie `{redirect}` comme `mission_launch` (:88-97) ; `sameTarget` compare le texte.
- `src/lib/agents/co-ceo.ts` -- outil `propose_idea` sur le modèle de `propose_mission` (:298-320) avec pré-contrôle M-62/M-63 ; `propose_mission` accepte `ideaId` ; `get_current_status` liste les idées ; règle du prompt (:398) : une envie floue → `propose_idea`.
- `src/app/strategie/page.tsx:83-123` -- lignes d'idées après les missions (« Idée notée avec Paul », texte, « À cadrer »), boutons « Cadrer avec Paul » et « Retirer l'idée » (petit composant client) ; état vide seulement sans mission ni idée.
- À ne pas toucher : `src/lib/paul-contexts.ts`, le panneau Paul hors suivi de `redirect` déjà en place (paul-panel:526).

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- modèle `Idea` -- persistance (addendum §4.5).
- [x] `src/lib/ideas.ts`, `messages.ts`, `journal.ts` -- service, messages, codes -- règles centralisées.
- [x] `src/lib/missions/service.ts`, `src/app/api/missions/route.ts`, `src/app/api/ideas/[id]/route.ts` -- cadrage et retrait -- FR-25.
- [x] `src/lib/agents/pending-action-view.ts`, `pending-actions.ts`, `co-ceo.ts` -- carte `idea_note` et outil `propose_idea` -- §16.3.
- [x] `src/app/missions/nouvelle/*`, `src/app/strategie/page.tsx` + composant client -- interface.
- [x] `tests/delegation.spec.ts` (liste des types :500, libellés), `tests/engine.spec.ts` avant « Recette Atelier Lumen » (plafond, M-62, cadrage atomique, double cadrage, autre entreprise, J-16/30/31, carte expirée), `tests/user-journey.spec.ts` avec `workspaceV52: true` (carte acceptée → formulaire prérempli → mission créée → idée disparue ; retrait).

**Acceptance Criteria:**
- Given une idée ouverte, when j'ouvre Stratégie, then elle apparaît après les missions avec « Cadrer avec Paul » et « Retirer l'idée ».
- Given 10 idées, when je demande à Paul d'en noter une autre, then il n'affiche pas de carte et m'invite à en retirer une.
- Given une idée cadrée en mission « Sur mesure », then une `UncoveredRequest` est créée et l'idée n'est plus listée.

## Implementation Notes

- Règles pures (`IDEA_MAX`, `validateIdeaText`, `ideaFrameHref`, `isIdeaId`) dans `src/lib/idea-text.ts`, réexportées par `src/lib/ideas.ts` : `pending-action-view.ts` est importé par le panneau (client) et ne doit pas tirer Prisma.
- Migration `20261107130000_idees` (après `20261106140000_paul_contextes`). `convertedMissionId` sans clé étrangère : une idée cadrée ne redevient jamais ouverte.
- Plafond M-63 : `noteIdeaIn` verrouille la ligne `Company` (`FOR UPDATE`) avant de compter. Cadrage : `lockOpenIdeaIn` verrouille l'idée (`FOR UPDATE`) avant la création, un double envoi attend puis reçoit 404.
- Une carte `mission_create` peut porter `ideaId` (via `propose_mission`) ; idée devenue absente à l'acceptation → carte retirée (`inactive`), aucune mission.
- Le second clic sur une carte `idea_note` déjà acceptée répond `ok` sans redirection.
- Route : `DELETE /api/ideas/[id]` déclarée dans `tests/security.spec.ts`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / suite |
|---|--------|---------|---------|----------------|
| 1 | edge | Formulaire : ideaId périmé renvoyé à chaque essai (404 sans issue) | medium | patch : message « rechargez la page » |
| 2 | edge | Réponse OK illisible : TypeError, bouton bloqué (busy gardé) | low | patch : garde sur payload.mission.id |
| 3 | edge | fetch rejeté : bouton bloqué sans message | low | patch avec 2 |
| 4 | edge | Sans mission mais avec idées : plus d'accès « Créer une mission » | false | le bouton est dans l'en-tête de la page |
| 5 | edge | Plusieurs cartes idea_note sous le plafond refusées au clic | low | rejeté : M-63 recontrôlé à l'acceptation, garde coûteuse |
| 6 | edge+blind | Carte mission_create d'une idée disparue : « Proposition écartée », lue comme refus ; retrait d'idée laisse ces cartes | medium | defer : comportement commun à toutes les cartes depuis #288 |
| 7 | edge | Paul ne reprend pas le texte de l'idée comme constat | medium | patch : description de ideaId et règle du prompt |
| 8 | blind | Même idée notée deux fois | low | rejeté : deux acceptations explicites |
| 9 | blind | « Votre prochaine décision » ignore les idées | low | defer : cas non défini par la spec §13.1 |
| 10 | blind | Retrait sans confirmation | false | la matrice approuvée prévoit le retrait au clic |
| 11 | blind | « Cadrer avec Paul » n'implique pas Paul | false | décision gelée : formulaire prérempli avec « En discuter avec Paul » |
| 12 | blind+gap | propose_idea réussi non testé | medium | patch : test via capturePaulTools |
| 13 | blind+gap | Plafond sous concurrence non testé | medium | patch : test Promise.allSettled |
| 14 | blind+gap | Stratégie avec idées sans mission non testée | medium | patch : parcours UX |
| 15 | blind | ideaId non textuel → 404 trompeur | low | patch : 400 « Demande invalide. » |
| 16 | blind | Lectures redondantes, pas de CHECK ni d'index, pas de FK convertedMissionId | low | rejeté : sans effet observable ; FK absente voulue |
| 17 | gap | Préremplissage avec l'idée d'une autre entreprise non testé | medium | patch : GET dans le test des routes |
| 18 | gap | sameTarget idea_note non testé | medium | patch : test A, B, A remplacée |

## Verification

**Commands:**
- `npm run lint` -- expected: aucun écart
- `npx tsc --noEmit` -- expected: aucune erreur
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- expected: vert
- `npm run test:voice` et `npm run build` -- expected: vert
- Tests moteur, UX et sécurité : en CI uniquement (pas de Postgres local).
