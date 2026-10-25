---
title: 'Analyser à partir de sources réellement lues : fiche Google confirmée, avis, concurrents et couverture (#252)'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
baseline_commit: '604588c1372f490db3cfecfdc4ac7f666874d7bd'
review_loop_iteration: 0
context: ['{project-root}/docs/oauth-setup.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Martine ne lit ni la note ni les avis Google, et le dirigeant ne sait pas ce qui a été lu ou non. Identifier la fiche par simple ressemblance de nom exposerait à analyser un homonyme.

**Approach:** Chercher une fiche candidate (Places API (New)), la proposer au dirigeant dans une fenêtre (nom, adresse, lien Google Maps) et n'enregistrer son identifiant sur l'entreprise qu'après sa confirmation. Le diagnostic lit alors la note et les avis de cette fiche. Les mêmes données publiques (note, volume, avis) sont lues pour au plus 3 concurrents identifiés par Martine. Une couverture des sources (lue, non lue, motif) s'affiche sur le Diagnostic.

## Boundaries & Constraints

**Always:** Lecture seule. Fonctionnalité inactive sans `GOOGLE_PLACES_API_KEY` : aucune recherche, source « non lue : non configurée ». Seul le Place ID est conservé (candidat, confirmé, refusé) ; nom, adresse et avis sont lus en direct, jamais stockés. Constats : synthèse avec date de lecture, jamais de citation d'avis mot pour mot, attribution « Google Maps » et lien vers la fiche. Aucun avis lu avant confirmation. L'identifiant confirmé doit être celui déjà proposé par le serveur, jamais une valeur libre du navigateur. Appels bornés : délai 10 s, champs demandés explicites, une recherche et une lecture pour l'entreprise, au plus 3 concurrents par passage (nom et adresse cités dans le constat, aucun stockage de leur contenu Google). Erreurs sans clé ni corps de réponse. Une fiche refusée n'est pas reproposée. Le dirigeant peut retirer la fiche depuis Entreprise.

**Never:** Saisir la clé en production dans cette PR. Lire Facebook, TikTok ou Instagram. Conserver du contenu Google autre que le Place ID. Confirmer sans geste du dirigeant. Modifier quotas ou budget. Publier ou envoyer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clé absente | Aucune clé | Aucune recherche ; « non lue : non configurée » ; pas de fenêtre | Passage non bloqué |
| Candidat proposé | Fiche trouvée, non confirmée | Aucun avis lu ; fenêtre avec nom, adresse, lien ; « à confirmer » | N/A |
| Confirmation | Identifiant = candidat enregistré | Place ID enregistré ; lien et « Retirer » dans Entreprise ; lecture au prochain diagnostic | Identifiant différent : refusé |
| Refus | « Ce n'est pas ma fiche » | Identifiant mémorisé refusé ; candidat suivant au passage suivant | Aucun autre : « fiche introuvable » |
| Lecture réussie | Fiche confirmée | Note, volume, avis fournis au modèle ; « lue » avec date | N/A |
| Fiche sans avis | 0 avis | « lue », 0 avis ; aucune conclusion sur la réputation | N/A |
| Concurrents | Requête de Martine, au plus 3 | Note, volume, avis fournis au modèle ; chaque lecture enregistrée | 4e demande : refus lisible, rien enregistré |
| Fournisseur en erreur | Délai, 403, 429, 5xx, fiche disparue | « non lue : indisponible » ; autres constats créés | Pas de clé ni corps dans journaux |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- `Company` : trois identifiants Google ; nouveau modèle de lecture de source (entreprise, passage, source, statut, motif, nombre, date) ; migration additive.
- `src/lib/google-places.ts` (nouveau) -- client Places : recherche, lecture en direct, lecture des avis ; `fetch` injectable, délai, résultat typé.
- `src/app/api/google-place/route.ts` (nouveau) -- lecture de la fiche proposée, confirmer, refuser, retirer ; mêmes garde de session et d'origine que `src/app/api/companies`.
- `src/lib/agents/marketing.ts` -- état de la fiche résolu par le code avant le modèle ; outil de lecture de la fiche confirmée et outil de lecture d'un concurrent (requête nom et zone, plafond de 3) ; règle de prompt : aucune conclusion sur une source non lue.
- `src/lib/agent-run-execution.ts` -- `bindAgentTools` pour les outils.
- `src/lib/agents/run-caps.ts` -- modèle du verrou et du compte par passage ; non modifié (`RUN_CAPS` est figé par `tests/delegation.spec.ts`), le plafond des concurrents est dans `google-place.ts`.
- `src/lib/audit-findings.ts`, `src/app/diagnostic/page.tsx`, `diagnostic-client.tsx` -- couverture du dernier audit ; fenêtre de confirmation via `src/components/modal.tsx` (exemple : `agent-profile-completion.tsx`).
- `src/app/entreprise/page.tsx` -- ligne « Fiche Google » avec lien et retrait.
- `tests/engine.spec.ts`, `tests/user-journey.spec.ts` -- modèle d'interception de `toolRunner` ; parcours de la fenêtre.
- `docs/architecture.md`, `docs/oauth-setup.md` -- variable optionnelle, vérification des conditions Google avant activation.
- À ne pas modifier : quotas, `src/lib/usage.ts`, lecture Facebook.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- identifiants Google et lectures de sources
- [x] `src/lib/google-places.ts` -- recherche et lecture bornées, testables sans réseau
- [x] `src/app/api/google-place/route.ts` -- confirmation côté serveur, refus, retrait
- [x] `src/lib/agents/marketing.ts`, `src/lib/google-place.ts` -- état, outils (fiche, concurrents), plafond, enregistrement déterministe des lectures
- [x] pages Diagnostic et Entreprise -- fenêtre, couverture, lien, retrait
- [x] tests et docs -- chaque ligne de la matrice ; accès entre entreprises refusé

**Acceptance Criteria:**
- Given une fiche candidate, when le dirigeant ouvre le Diagnostic, then il voit nom, adresse et lien avant tout enregistrement.
- Given une confirmation, when il relance le diagnostic, then les avis sont lus et la couverture l'indique.
- Given une autre entreprise, when elle tente de confirmer ou lire cette fiche, then la demande est refusée.
- Given aucune clé, when le diagnostic s'exécute, then aucun appel Google n'a lieu.

## Implementation Notes

- La fiche de l'entreprise est lue par le code avant le modèle (`readOwnGooglePlace`) et injectée dans le message utilisateur : le modèle ne peut pas l'omettre, et la lecture est enregistrée sans dépendre de lui. Seuls les concurrents passent par un outil (`read_competitor_google_reviews`), absent sans clé.
- Les fiches refusées sont une liste bornée (`googlePlaceDeclinedIds`, 10 plus récentes) plutôt qu'un identifiant unique : sinon deux refus successifs reproposeraient la première fiche.
- Plafond des concurrents : verrou et compte propres à `google-place.ts`. `RUN_CAPS` est inchangé (`tests/delegation.spec.ts` en fige le contenu exact).
- `recordSourceRead` applique la garde de tentative dans un passage d'agent ; hors de tout passage (les tests du moteur lancent Martine sans contexte d'exécution), elle écrit directement.
- `web_fetch` passe de 3 à 6 lectures avec la consigne de lire les pages utiles du site : le coût en jetons augmente, mesuré par le budget existant.
- Risque résiduel : `GET /api/google-place` appelle Google en direct tant qu'une fiche est en attente de confirmation ; un utilisateur connecté peut le répéter. Coût limité à sa propre fiche candidate, pas de limitation de débit ajoutée.
- Validation locale : types, lint, build ; `sources.spec.ts` (20 tests), les trois parcours de la story, la sécurité (12) et la délégation (100) passent sur une base PostgreSQL jetable (PGlite). Les tests du moteur qui ne demandent pas de transactions réellement concurrentes passent (30) ; la suite complète du moteur et du parcours reste à exécuter en CI sur PostgreSQL.
- Non vérifié : appels réels à Places API, conditions Google Maps Platform pour un usage par un modèle d'IA, coût par appel.

## Spec Change Log

## Review Triage Log

| Constat | Verdict | Preuve |
|---|---|---|
| Dialogue : erreur réseau avale en silence | low (rejeté) | Un échec du GET laisse la proposition en attente pour la prochaine visite ; ajouter un état d'erreur complexifie sans gravité. |
| POST sans contrôle du Content-Type | false | `request.json().catch(() => null)` puis schéma strict : un corps invalide donne 400 (test dédié). |
| GET sans AbortSignal | false | Le drapeau `cancelled` empêche toute mise à jour d'état après démontage. |
| Verrou du plafond limité à un processus | false | Une tentative tourne dans un seul processus ; le compte en base borne aussi (même principe que `run-caps.ts`). |
| `limit` non validé | false | Seuls des appels internes avec les constantes 1 et 3. |
| 10 fiches refusées au plus | low (rejeté) | La recherche ne renvoie que 3 fiches ; en refuser plus de 10 distinctes est irréaliste. |
| Confirmation avec compteur 0 | false | `confirmGooglePlace` renvoie false, la route répond 409 (test). |
| Pas de délai côté client | low (rejeté) | Comportement des autres écrans ; hors du sujet. |
| Message d'erreur générique | low (rejeté) | Cosmétique. |
| `readOwnGooglePlace` peut lever | false | Les erreurs Google deviennent `unavailable` ; une erreur de base fait échouer le passage, comme toute écriture de l'agent. |
| `describeOwnReading` vide | false | Renvoie toujours un texte non vide dans les deux branches. |
| `getSourceCoverage` rejette la page | false | Même domaine de défaillance que les autres lectures de la page. |
| `router.refresh` lève | false | Ne lève pas ; déclenche un rendu serveur. |
| Budget `web_fetch` non vérifié | medium → patch | Assertions ajoutées (max_uses 6 et consigne des pages utiles) dans le test de Martine. |

## Design Notes

La couverture vient du code qui exécute la lecture, pas d'une déclaration du modèle. Le site et Facebook gardent le `sourceStatus` déclaré par leurs constats, étiqueté comme tel. Un concurrent est identifié par la requête de Martine sans confirmation du dirigeant : le constat cite nom et adresse lus. La couverture déterministe du site et la lecture Facebook restent dans #252, #253 et #254.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run lint` -- expected: aucun avertissement
- `npx prisma validate` -- expected: schéma valide
- `npm run test:engine` -- expected: succès (PostgreSQL requis, exécuté en CI)

**Manual checks (if no CLI):**
- Production : valider conditions Google Maps Platform et facturation avant de saisir la clé ; recette sur une entreprise de test, sans publication.
