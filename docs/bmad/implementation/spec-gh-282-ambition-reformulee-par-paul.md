---
title: 'Dire mon ambition avec mes mots et la faire reformuler par Paul (#282)'
type: 'feature'
created: '2026-11-07'
status: 'done'
baseline_commit: 'e2e80d3e224912991f25e46a5f11789e2f9b3be1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** À l'étape 3 de `/bienvenue`, l'ambition est un texte libre enregistré tel quel : Paul ne la reformule pas, n'en tire ni gain ni horizon et ne pose aucune question (FR-7, spécification §11). Depuis Entreprise, l'ambition ne se modifie pas : seul l'ancien champ « objectif » existe, sans journal (FR-52).

**Approach:**
- « Interpréter » envoie le texte. Paul répond « Voici ce que je comprends. {reformulation}. », puis donne :
  - les éléments trouvés : gain, horizon, budget média, recrutement ;
  - ses notes ;
  - « Pour affiner, vous pouvez préciser : », avec une question par élément manquant (gain, horizon).
- « C'est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment. » accompagne toujours la reformulation.
- « C'est bien ça » enregistre le texte tel quel et les éléments retenus. Modifier le texte après l'interprétation retire la reformulation et le bouton : il faut interpréter de nouveau.
- La même mécanique sert à l'étape 3 et dans Entreprise. Dans Entreprise, confirmer écrit le journal J-03 « Cap mis à jour avec Paul : {cap}. » et ne touche à aucune mission.

Décisions de Samir (2026-11-07) :
- La carte de Paul « Ajuster ma limite » (`propose_ambition_limit`) est reportée et reste rattachée à #288.
- Dans Entreprise, un bloc « Votre ambition » remplace « Objectif de ce mois » et « Modifier l'objectif ». L'onglet « Objectifs » de `CompanyProfileForm` perd son champ objectif. L'ambition ne se modifie plus que par la nouvelle mécanique.
- La spec reste entière (environ 2 600 jetons).

## Boundaries & Constraints

**Always:**
- **Bornes de §11, appliquées côté serveur par une fonction pure partagée**, aussi bien sur la sortie du modèle que sur celle de l'analyseur de secours :
  - texte de 10 à 600 caractères, sans `<` ni `>` ;
  - gain de 1 à 50 %, un doublement valant 100 % ; hors bornes, le gain reste dans le texte, n'est pas converti, et Paul ajoute une note ;
  - horizon de 3 à 36 mois ; hors bornes, même règle ;
  - budget média de 0 à 2 000 €/mois ; au-delà, il est ramené au maximum avec une note ;
  - recrutement : non, possible, ou non précisé. Non précisé donne la note « Recrutement non précisé : aucune embauche supposée ».
- Le budget média est indicatif : la reformulation dit qu'il n'autorise aucune dépense. Paul ne demande ni limite de temps ni limite de capacité.
- L'interprétation n'est jamais enregistrée seule. Elle revient avec un jeton signé par HMAC (`SESSION_SECRET`) sur le texte exact et les éléments retenus. Confirmer exige ce jeton. Un texte qui diffère est refusé avec « Interprétez de nouveau votre ambition avant de la confirmer. ».
- **Modèle** : un seul appel avec un outil forcé, `max_tokens` 400 et 15 s au plus, sortie vérifiée par zod.
- **Analyseur de secours** : sans clé, en cas d'échec ou de quota atteint, un analyseur déterministe (expressions régulières bornées) produit la reformulation, sans message d'erreur. Le parcours n'est jamais bloqué par le modèle.
- **Quotas**
  - Anonyme : 10 interprétations par modèle par IP hachée et par 24 h (portée `ambition`). Au-delà, l'analyseur de secours prend le relais.
  - Connecté : `reserveUsageBudget` et `recordUsage`, comme `src/app/api/onboarding/interpret`.
- Brouillon : `ambition` devient `{ text, terms }`. À l'inscription, `ambitionText`, `ambitionTerms`, `ambitionConfirmedAt` et `objective` (= texte) sont repris.
- Libellé court du cap (§11) : le texte, sinon « +{gain} % de chiffre d'affaires en {horizon} mois », sinon « Cap à définir avec Paul ».

**Never:**
- Ne pas modifier, mettre en pause ni recréer une mission quand l'ambition change dans Entreprise.
- Ne pas supprimer `src/app/api/onboarding/interpret` : il appartient à #20, qui doit d'abord être recetté.
- Pas de chiffrage CA ni de valeur client (#169). Pas de carte de Paul (#288).
- Ne pas modifier une migration déjà appliquée.

## I/O & Edge-Case Matrix

| Scénario | Entrée | Résultat attendu |
|----------|--------|------------------|
| Complet | « +20 % de CA en 12 mois, sans embaucher, 300 € de pub par mois » | Gain 20 %, horizon 12 mois, budget 300 €, recrutement non ; aucune question |
| Manquants | « Avoir plus de clients pros » | Aucun gain ni horizon ; deux questions (gain, horizon) ; note sur le recrutement |
| Hors bornes | « Doubler mon CA en 5 ans » | Gain et horizon non convertis ; deux notes de Paul ; texte gardé |
| Budget trop haut | « … 5 000 € de pub par mois » | Budget ramené à 2 000 €, avec une note |
| Texte modifié | Interpréter, modifier un caractère, puis confirmer | 422 avec le message de réinterprétation ; rien n'est enregistré |
| Modèle indisponible | Pas de clé, ou quota atteint | Reformulation par l'analyseur de secours ; 200 |
| Trop court | 9 caractères | 422, M-06 |

</frozen-after-approval>

## Code Map

- `src/lib/onboarding/draft-rules.ts` -- `DraftState.ambition` (texte seul), `checkAmbition`, action `confirm_ambition` (l. 280), `readDraftState` (lit `ambition.text`). Le retour en arrière remet déjà `diagnosticReady` à faux. C'est là qu'il faut ajouter `interpret_ambition` et le jeton.
- `src/lib/onboarding/draft.ts` -- `toJson` écrit `{ text }`. Une ambition absente reste celle en base (l. 68).
- `src/app/api/bienvenue/route.ts` -- POST `{ action }` : refus 422 avec `code` et `errors`, 409 pour une autre étape. Modèle à suivre pour les quotas : `consumeIpAttempt` et `refundIpAttempt` de `src/lib/auth-throttle.ts` (ajouter `"ambition"` à `ThrottleScope`).
- `src/lib/onboarding/analysis.ts` -- `extractWithModel` : import paresseux d'`@/lib/anthropic`, `tool_choice` forcé, zod, absence de clé, `estimateCostUsd`. C'est le modèle à reprendre.
- `src/app/api/onboarding/interpret/route.ts` -- ancien interprète (#20), connecté : `reserveUsageBudget`, `recordUsage`, `AgentRunQuotaError`. Ne pas le modifier.
- `src/app/bienvenue/step-forms.tsx` -- `AmbitionForm` (l. 210), `useDraftAction` de `journey-client.tsx`.
- `src/app/bienvenue/missions/page.tsx` -- affiche `state.ambition` : passer à `.text`.
- `src/app/api/auth/signup/route.ts` -- l. 74-108 : reprise de `ambitionText` et `objective`, et `starterMissions(profile, ambition)`.
- `prisma/schema.prisma` -- `Company.ambitionText` (l. 73). Ajouter `ambitionTerms Json?` et `ambitionConfirmedAt DateTime?` par une nouvelle migration `20261107170000_ambition_interpretee`.
- `src/lib/journal.ts` -- ajouter `J-03` : « Cap mis à jour avec Paul : {cap}. ». `writeJournal(tx, …)`.
- `src/app/entreprise/page.tsx` -- l. 56-59 : objectif en lecture seule. `src/components/company-profile-form.tsx` : champ objectif de l'onglet « Objectifs ».
- `src/lib/shell-data.ts` -- `cap: company.objective` reste valable, car `objective` = texte.
- `tests/support/onboarding-draft.ts` -- l. 56 : `ambition: { text }` pour les fixtures.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/ambition-rules.ts` -- types `AmbitionTerms`, `boundAmbition`, `capLabel`, `reformulation`, questions, notes, analyseur de secours `parseAmbition`, jeton `signInterpretation` / `verifyInterpretation` -- règles pures partagées.
- [x] `src/lib/ambition.ts` -- `interpretAmbition(text, deps)` : modèle (injectable), sinon secours, toujours borné -- un seul point d'entrée.
- [x] `prisma/schema.prisma` et la migration -- `ambitionTerms`, `ambitionConfirmedAt`.
- [x] `src/lib/onboarding/draft-rules.ts`, `draft.ts` et `src/app/api/bienvenue/route.ts` -- action `interpret_ambition` (étape 3, profil confirmé, quota `ambition`, réponse 200 avec l'interprétation et le jeton) ; `confirm_ambition` exige le jeton ; le brouillon garde `{ text, terms }`.
- [x] `src/app/api/auth/signup/route.ts` et `src/app/bienvenue/missions/page.tsx` -- reprise de `{ text, terms }`.
- [x] `src/components/ambition-editor.tsx` -- client partagé : texte, « Interpréter », reformulation, éléments, notes, questions, mention « C'est une cible… », « C'est bien ça ». Une modification du texte efface l'interprétation. `aria-live` sur la reformulation. Utilisé par `AmbitionForm`.
- [x] `src/app/api/entreprise/ambition/route.ts` -- session obligatoire, contrôle de l'origine ; `interpret` et `confirm` ; à la confirmation, une transaction qui écrit les champs d'ambition, `objective` et J-03 (acteur `owner`).
- [x] `src/app/entreprise/page.tsx` et `src/components/company-profile-form.tsx` -- Le bloc « Votre ambition » (`AmbitionEditor`, initialisé avec le texte actuel) remplace les lignes 56 à 59. Le bloc porte l'ancre `id="modifier"`, pour que les liens existants `/entreprise?tab=objectifs#modifier` y mènent. Le champ objectif disparaît du formulaire, qui ne doit plus envoyer `objective` : vérifier que `/api/companies` laisse inchangé un champ absent, au lieu de le vider. Les autres éléments de l'onglet « Objectifs » restent.
- [x] Tests -- `tests/delegation.spec.ts` (bornes, notes, questions, secours, jeton, libellé du cap, matrice) ; `tests/security.spec.ts` (jeton falsifié ou texte modifié refusé, quota `ambition`, Entreprise sans session 401) ; `tests/user-journey.spec.ts` (confirmation, modification après interprétation, hors bornes) ; fixtures mises à jour.

**Acceptance Criteria:**
- Given une ambition confirmée dans Entreprise, when la page Résultats s'affiche, then le journal montre « Cap mis à jour avec Paul : {cap}. » et le nombre de missions ainsi que leurs statuts sont inchangés.
- Given le parcours terminé, when le compte est créé, then `Company.ambitionText` est le texte saisi tel quel et `ambitionTerms` contient les éléments retenus.
- Given une reformulation affichée, then la mention « C'est une cible, pas une promesse de résultat. » est visible, et le budget est présenté comme n'autorisant aucune dépense.

## Implementation Notes

- Le jeton (`signInterpretation`, `verifyInterpretation`) est dans `src/lib/ambition-token.ts`, pas dans `ambition-rules.ts` : `draft-rules.ts` et `ambition-rules.ts` sont importés par des composants client, qui ne peuvent pas embarquer `node:crypto`. `applyDraftAction` reçoit donc le vérificateur en paramètre (par défaut, tout jeton est refusé).
- Hors bornes : la note de Paul remplace la question ; « Pour affiner » ne porte que sur un gain ou un horizon absent du texte. Un texte sans position sur le recrutement ajoute toujours sa note, en plus des deux notes de bornes.
- Reformulation construite à partir des seuls éléments retenus (jamais de chiffre hors bornes) ; le modèle ne fournit qu'un objectif court, nettoyé, utilisé quand aucun gain n'est retenu.
- `CompanyProfileForm` : le champ objectif ne reste que dans l'ancien formulaire guidé (`/onboarding`, #20, encore à recetter) ; dans Entreprise, il disparaît et `objective` n'est plus envoyé (`/api/companies` laisse un champ absent inchangé). L'ancre `id="modifier"` passe au bloc « Votre ambition ».
- Usage connecté : objet `ambition_interpret`, compté comme un message (`CHAT_USAGE_PURPOSES`).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | verification-gap | Le test du quota `ambition` ne l'exerce pas en CI (pas de clé, le bloc ne tourne jamais) | medium | Écart pré-vérifié ; `ci.yml` n'a ni `ANTHROPIC_API_KEY` ni `ANTHROPIC_AUTH_TOKEN` | patch |
| 2 | verification-gap | Repli d'Entreprise quand le budget est atteint (`AgentRunQuotaError`), et `ambition_interpret`, sans test | medium | Écart pré-vérifié ; il faudrait rendre la réservation injectable au niveau de la route | defer |
| 3 | verification-gap / blind / edge | Réservation d'usage non libérée après un échec du modèle sans `usage` | medium | `modelFor` n'appelle `recordUsage` que si `usage && model` ; `writer.ts:76` libère avec un usage nul | patch |
| 4 | blind | « 12.5 % » lu comme 125 % par l'analyseur de secours | medium | `readNumber` retire les points avant de convertir la virgule | patch |
| 5 | blind / edge | « depuis 30 ans » ou « 30 ans d'expérience » lus comme un horizon ; « -10 % » lu comme un gain | medium | `parseHorizon` prend tout « N ans » ; `parseGain` ignore le signe | patch |
| 6 | blind / edge | Pourcentages hors contexte (« coûts de 20 % », « de 10 % à 20 % »), dates « d'ici 2027 » | low | Secours seulement (le modèle est la voie normale), heuristique ; la correction ajoute des branches | rejeté |
| 7 | blind | `goal` du modèle avec des chiffres hors bornes dans la reformulation | low | Le texte du dirigeant contient déjà ces chiffres, et la note dit qu'ils ne sont pas convertis | rejeté |
| 8 | blind / edge | Quota anonyme ouvert quand le magasin de quotas échoue (`.catch(() => null)`) | medium | `useModel` reste vrai si `consumeIpAttempt` lève | patch |
| 9 | blind | Pas de plafond global pour les interprétations anonymes | low | Chaque interprétation exige un brouillon à l'étape 3, dont la création est déjà limitée par IP (`draft`) ; 400 jetons par appel | rejeté |
| 10 | blind | Usage enregistré sous `agent: "onboarding"` | low | Classement interne du coût, déjà utilisé par l'ancien interprète | rejeté |
| 11 | blind / edge | Le lien « Renseigner mon objectif chiffré » du rapport mène maintenant au bloc d'ambition | medium | `rapport/page.tsx:71` vise `#modifier`, que porte désormais le bloc « Votre ambition » | patch |
| 12 | blind | Autres liens (`journey-progress`, `objective-hero`, tableau de bord) | false | « Compléter mon objectif » et « Le saisir moi-même » visent bien l'ambition ; `?tab=objectifs` garde les chiffres | rejeté |
| 13 | blind | `ambitionTerms` jamais lu ; revenir à l'étape 3 oblige à réinterpréter | low | Les éléments sont gardés pour #169 et le bilan ; réinterpréter est la règle de la spec | rejeté |
| 14 | blind | `capLabel` renvoie toujours le texte entier | false | C'est la règle de §11 : le libellé court est le texte | rejeté |
| 15 | blind / edge | Un J-03 en double quand le même texte est reconfirmé | low | Le bouton est désactivé pendant l'envoi ; la correction ajoute une comparaison | rejeté |
| 16 | blind | Bloqué après un refus `reinterpret` : la reformulation reste affichée | low | L'éditeur garde l'interprétation sur un 422 ; correction directe | patch |
| 17 | blind | Jeton sans expiration et non lié au brouillon ni à l'entreprise | low | Les éléments signés viennent du même texte et restent bornés : les réutiliser ne donne rien de plus | rejeté |
| 18 | blind / edge | Brouillons d'avant #282 : `ambitionConfirmedAt` posé avec des éléments vides | false | Ces dirigeants avaient confirmé leur texte (« C'est bien ça » de #279) | rejeté |
| 19 | blind | Tâche « Tests » restée `[ ]` dans la spec | low | Les tests existent ; cochée | patch |
| 20 | blind | Cas `interpret_ambition` de `applyDraftAction` inaccessible depuis la route | low | Les tests l'utilisent ; aucun effet pour l'utilisateur | rejeté |
| 21 | blind | `<h2>Votre ambition</h2>` dans une section déjà titrée par un `<h2>` | low | Plan des titres aplati ; correction directe en `<h3>` | patch |
| 22 | edge | Un échec du modèle consomme quand même une tentative du quota | low | 10 par jour ; la correction ajoute un remboursement conditionnel | rejeté |
| 23 | edge | `SESSION_SECRET` absent : 500 à l'interprétation | false | Variable obligatoire : sessions et quotas lèvent déjà sans elle | rejeté |
| 24 | edge | Erreur de base dans `reserveUsageBudget` : 500 au lieu du secours | false | Échouer bruyamment sur une panne de base est le comportement voulu ; le secours vise le modèle | rejeté |
| 25 | edge | Texte modifié pendant l'interprétation : reformulation affichée pour un autre texte | low | `shown` ne compare pas `interpretation.value` au texte courant ; correction directe | patch |
| 26 | edge | « 1.5k€ » lu comme 5 000 € | low | L'expression des montants n'accepte pas la décimale avant `k` | patch |
| 27 | edge | « sans avoir à embaucher », « pas besoin d'embaucher » lus comme « embauche possible » | medium | Contraire à ce que dit le dirigeant ; `parseRecruitment` ne couvre pas ces tournures | patch |

## Verification

**Commands:**
- `npm run lint` -- aucune alerte.
- `npx tsc --noEmit` -- aucune erreur.
- `npx prisma validate` -- schéma valide.
- `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run test:delegation` -- tout vert.
- `npm run build` -- succès.

**Manual checks:**
- Les tests `security` et `user-journey` ne tournent qu'en CI (pas de base locale).
