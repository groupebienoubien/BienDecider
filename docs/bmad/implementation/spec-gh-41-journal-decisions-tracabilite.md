---
title: 'Journal des décisions consultable et exportable dans Résultats (#41)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: 'ec1341f6c58f0496327c86211bff666fc5e1b0ae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le journal (`JournalEntry`) est écrit à chaque décision, mais aucune page ne l'affiche et il ne peut pas être exporté. Il manque aussi deux événements du §15 dont la fonctionnalité existe : le profil corrigé (J-02) et le canal connecté ou déconnecté (J-07). Le dirigeant ne peut donc pas retrouver tout ce qui a été fait en son nom (FR-50, NFR-12).

**Approach:**
- Ajouter à Résultats une section « Décisions & traçabilité » : texte rendu depuis le code (§15), auteur, date et mission, des plus récentes aux plus anciennes.
- Ajouter un export CSV du journal entier.
- Journaliser J-02 avec le comportement que promet son texte, ainsi que J-07.

**Décisions (2026-11-06) :**
- Export : un fichier CSV avec les colonnes date, auteur, mission et décision.
- J-02 et J-07 sont dans #41, et J-02 reçoit son comportement complet (§4.5) : quand le profil est corrigé après l'inscription, les programmations sont annulées (J-23) et chaque contenu modifiable reçoit une nouvelle version système « Profil corrigé : informations du contenu à vérifier ». La validation est retirée, puis J-02 est écrit.
- J-04 est reporté au parcours d'entrée (étape 5, #168/#279) : il sera écrit quand l'étape existera.
- La spec est gardée entière malgré sa taille (environ 2 300 tokens).

## Boundaries & Constraints

**Always:**
- Le texte est rendu à l'affichage avec `renderJournal(code, params)`. Aucun texte n'est stocké.
- Libellés des auteurs : `owner` → « vous », `paul` → « Paul », `system` → « mise à jour automatique » (charte §8).
- Seules les entrées de l'entreprise connectée sont lues. L'export vérifie la session comme les autres routes.
- La section suit la charte : 5 entrées visibles, puis « Tout le journal (n) » pour déplier le reste ; un tableau ; de 320 à 1440 px sans défilement horizontal ; accessibilité NFR-8. Un paramètre absent s'affiche « — », jamais `{x}`.
- J-02 n'est écrit que pour un profil déjà créé et seulement si au moins un champ change réellement. Il couvre la modification depuis Entreprise (POST hors première création), le complément de profil (PATCH) et la carte « profil » de Paul. Tout se fait dans une seule transaction : programmations annulées, versions, J-02.
- J-07 s'écrit dans la même transaction que la connexion ou la déconnexion. À la déconnexion, `{n}` est le nombre de programmations annulées. La déconnexion de LinkedIn annule désormais ses programmations, comme celles de Facebook et de Gmail.
- Le CSV est en UTF-8 avec BOM et séparateur `;`. Les champs sont échappés, et une cellule qui commence par `= + - @` est neutralisée.

**Never:**
- Aucun `update` ni `delete` de `JournalEntry` dans le code applicatif. Une ligne ne disparaît qu'avec la suppression du compte (cascade).
- Pas de reprise des anciens journaux (`AgentRun`, `ExecutionLog`).
- Pas de J-03, J-05, J-06 ni J-13 : ces fonctionnalités n'existent pas encore.
- J-02 ne touche pas un contenu de mission en lecture seule ou dont la version courante est diffusée : `checkNewVersion` le refuse, et J-02 n'échoue pas pour autant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Journal vide | aucune entrée | « Aucune décision enregistrée pour l'instant. », pas de lien d'export | N/A |
| Plus de 5 entrées | 12 entrées | 5 entrées visibles, « Tout le journal (12) » déplie les autres | N/A |
| Mission supprimée | entrée dont le missionId n'existe plus | colonne mission « — » | N/A |
| Export | GET avec une session valide | CSV du journal entier, plus ancien d'abord, seulement l'entreprise connectée | 401 sans session |
| Profil corrigé | contenu validé et programmé, nom modifié | programmation annulée (J-23), nouvelle version système, validation retirée, J-02 | erreur → rien n'est écrit |
| Profil inchangé | même valeurs renvoyées | aucune version, aucun J-02 | N/A |
| Première création | POST onboarding | aucun J-02 | N/A |
| Contenu diffusé | version courante envoyée | contenu laissé tel quel, J-02 écrit | N/A |
| Canal connecté / déconnecté | callback OAuth / route disconnect | J-07 « {Canal} connecté. » / « {Canal} déconnecté : {n} programmation(s) annulée(s). » | échec de la connexion → pas de J-07 |

</frozen-after-approval>

## Code Map

- `src/lib/journal.ts` -- `JOURNAL_TEXTS` : ajouter J-02 et J-07 (textes du §15, la variante de J-07 portée par les params). `renderJournal` existe mais n'est appelé nulle part : à réutiliser. `writeJournal(tx, {…, actor?})`. Ajouter les libellés d'auteur et `listJournal(companyId)`.
- `prisma/schema.prisma:642` -- `JournalEntry`, index (companyId, createdAt). Mettre à jour le commentaire `code`, sans changer le schéma.
- `src/app/resultats/page.tsx` -- page serveur, données de `loadResults` (`src/lib/missions/results-view.ts:40`). Ajouter la section en dernier.
- `src/app/api/missions/[id]/report/route.ts` -- modèle à suivre pour vérifier la session dans la route d'export.
- `src/lib/contents/service.ts` -- `addVersion` (privée, :105), `markRecipientsChanged` (:174, modèle à suivre), `checkNewVersion`, `isReadOnly`. Exporter `markProfileChanged(tx, companyId)`.
- `src/lib/contents/publish.ts:270` -- `cancelScheduledPublications(tx, where, reason, actor)` écrit J-23 et renvoie le nombre de programmations annulées. Raison : « profil corrigé ». L'appeler avant `addVersion`, car M-45 refuse une nouvelle version programmée.
- Points J-02 :
  - `src/app/api/companies/route.ts` : PATCH (:24, à passer en transaction) et POST (:45, `isFirstCreation` :133) ;
  - l'exécuteur `update_profile` (`src/lib/agents/pending-actions.ts:69`).
- Points J-07 :
  - connexion : `api/oauth/gmail/callback/route.ts:31`, `api/oauth/linkedin/callback/route.ts:36`, `lib/oauth/google-connection.ts:11`, et `api/facebook/page/route.ts:37` (le vrai « connecté » de Meta) ;
  - déconnexion : `api/facebook/disconnect/route.ts:24`, `api/gmail/disconnect/route.ts:13` et `api/linkedin/disconnect/route.ts:11`, à passer en transaction interactive avec annulation des programmations.
  - Libellé : `channelLabel` (`src/lib/missions/channels.ts:20`).
- Tests :
  - `tests/engine.spec.ts` : `journal(missionId)` à :442, PATCH profil à :2797 ;
  - `tests/user-journey.spec.ts` : `/resultats` à :627, contrôle à 390 px à :678 ;
  - `tests/security.spec.ts:63` : matrice 401 ;
  - `tests/facebook|gmail|linkedin.spec.ts` ;
  - `tests/delegation.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/journal.ts` -- J-02 et J-07, `JOURNAL_ACTOR_LABELS`, rendu avec « — » quand un paramètre manque, `listJournal`, `journalCsv(rows)` -- une seule source pour la page et l'export.
- [x] `src/app/resultats/page.tsx` -- la section « Décisions & traçabilité » (`aria-labelledby`) : tableau date (Europe/Paris), auteur, mission, décision ; `<details>` ; lien « Exporter le journal (CSV) » ; état vide.
- [x] `src/app/api/journal/export/route.ts` -- GET, session vérifiée, `text/csv` en pièce jointe `journal-biendecider.csv`.
- [x] `src/lib/contents/service.ts` + `src/app/api/companies/route.ts` + `src/lib/agents/pending-actions.ts` -- `markProfileChanged`, puis J-02 dans les trois chemins, après la comparaison des valeurs.
- [x] Les routes OAuth et disconnect listées -- J-07, et l'annulation des programmations LinkedIn.
- [x] `tests/delegation.spec.ts` -- libellés, paramètre manquant, échappement et neutralisation CSV.
- [x] `tests/engine.spec.ts` -- `listJournal` (isolation, ordre), export 401 et contenu, J-02 (programmé, inchangé, première création, diffusé, carte de Paul), J-07 à la déconnexion.
- [x] `tests/user-journey.spec.ts` + `tests/security.spec.ts` -- la section visible avec « vous » et J-17, la largeur à 390 px, la route déclarée.

**Acceptance Criteria:**
- Given des décisions, when le dirigeant ouvre Résultats, then chaque entrée indique quoi, quand, par qui et pour quelle mission.
- Given le journal, when il exporte, then il reçoit toutes ses entrées et seulement les siennes.
- Given le code applicatif, when on cherche une écriture sur `JournalEntry`, then on ne trouve que `create`.

## Implementation Notes

- J-07 : accord au féminin quand le libellé du canal l'exige (« Page Facebook connectée », « Fiche établissement Google connectée ») ; écart volontaire au texte du §15 (« {Canal} connecté »), porté par `channelJournalParams`.
- J-02 : les programmations annulées (J-23) sont attribuées au dirigeant (`owner`), comme les autres annulations en cascade ; les nouvelles versions « Profil corrigé : informations du contenu à vérifier » sont écrites par le système (J-19, `system`).
- Import circulaire `contents/service.ts` ↔ `contents/publish.ts` (`markProfileChanged` appelle `cancelScheduledPublications`) : sans risque tant que les deux modules ne s'utilisent que dans des fonctions, jamais au chargement.
- Déconnexion : J-07 n'est écrit que si une connexion `connecte` existait. Un canal en `erreur` voit ses programmations annulées (J-23), sans J-07.
- Pas de marqueur « profil à relire » (§4.5) : il demanderait un champ (`profileChangedAt`) et la spec exclut tout changement de schéma.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|--------|---------|---------|----------------|
| 1 | Blind + Edge | Tâche J-07 non cochée dans la spec | low | rejeté : corrigé en tenue de la spec (case cochée), pas un défaut du code |
| 2 | Blind | J-02 dit « programmations annulées » même sans programmation | low | rejeté : texte imposé par le §15 et par la décision figée « J-02 écrit » |
| 3 | Blind | J-07 « déconnecté » écrit pour une connexion jamais connectée (Facebook en `selection_requise`) | medium | patch : ne compter que la ligne `connecte` |
| 4 | Blind + Edge | Transaction J-02 avec le délai par défaut de 5 s | medium | patch : `{ maxWait: 5000, timeout: 20000 }` |
| 5 | Blind | Mission supprimée : le titre de `params.mission` n'est pas repris | false | rejeté : la matrice figée impose « — » pour une mission supprimée |
| 6 | Blind + Edge | CSV : tabulation, retour chariot ou espace avant `= + - @` non neutralisés | low | patch : regex étendue, test ajouté |
| 7 | Blind + Edge | Tout le journal est chargé à chaque affichage de Résultats | low | rejeté : journal court au PoC ; la pagination ajouterait de la complexité alors que la matrice demande de tout déplier |
| 8 | Blind + VG | Seuil de 5 entrées et état vide non vérifiés | medium | patch : tests de parcours |
| 9 | Blind + VG | J-07 à la connexion de Gmail, LinkedIn et Facebook non testé | medium | defer : aucun point d'injection pour les échanges OAuth et Graph |
| 10 | VG | J-07 à la déconnexion de Gmail non testé | medium | patch : cas Gmail ajouté au test moteur |
| 11 | Blind | Rien ne garantit la règle « create seul » | low | patch : test qui parcourt `src/` |
| 12 | Blind + Edge | Une nouvelle autorisation d'un canal déjà connecté réécrit J-07 « connecté » | medium | patch : J-07 seulement si le statut précédent n'était pas `connecte` |
| 13 | Blind | J-02 annule toutes les programmations, même pour un contenu ignoré ensuite | false | rejeté : la décision figée annule toutes les programmations, et la liste des contenus est lue après l'annulation |
| 14 | Blind | Ordre du CSV à horodatage égal obtenu par effet de bord | low | patch : départage explicite par id |
| 15 | Edge | Une modification concurrente d'un contenu (M-02) fait renvoyer une erreur 500 à la correction du profil | low | rejeté : cas rare ; la correction est annulée en entier, sans état partiel |
| 16 | Edge | Une erreur de `listJournal` fait tomber toute la page Résultats | low | rejeté : `loadResults` interroge la même base et tomberait de la même façon |
| 17 | Edge | La perte implicite de la connexion Google (jeton refusé) n'écrit pas J-07 | medium | defer : comportement existant ; seule la déconnexion par le dirigeant est dans le périmètre |
| 18 | Edge | Le nombre `{n}` peut être surévalué en cas de course avec l'envoi | low | rejeté : `cancelScheduledPublications` existait déjà ; écart rare et sans conséquence durable |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run build` -- aucune erreur
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- tout passe
- Tests moteur, parcours, sécurité et canaux -- en CI
