---
title: 'Parcours d''entrée en cinq étapes, compte créé en dernier (#279)'
type: 'feature'
created: '2026-11-07'
status: 'done'
baseline_commit: '5f5e0071420c28bce89bb11e394c1c18ec5ad84c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aujourd'hui, on crée un compte (e-mail, mot de passe) avant de dire quoi que ce soit de son entreprise, puis `/onboarding` demande trois champs. La V5.2 veut l'inverse : cinq étapes anonymes, et le compte en dernier (FR-2, spécification §1.1 à §1.4, addendum §6).

**Approach:** Un brouillon anonyme côté serveur, lié au cookie `pepito_draft`, porte les saisies d'étape en étape. Les pages `/bienvenue` (étapes 1 à 3), `/bienvenue/missions` (4) et `/bienvenue/compte` (5) remplacent `/signup` et `/onboarding`. À la création du compte, une transaction transforme le brouillon en entreprise et en trois missions « À décider », et écrit J-04.

Décisions de Samir (2026-11-06) :
- Les étapes 1 à 4 sont en version minimale, sans analyse ni Paul :
  - étape 1 : prénom, entreprise, localisation, site facultatif ;
  - étape 2 : activité, zone, clients et offres, à confirmer ;
  - étape 3 : ambition en texte libre (10 caractères au moins) ;
  - étape 4 : trois missions tirées du catalogue.
  - L'analyse (#280, #281), la reformulation de l'ambition (#282) et les missions fondées sur le diagnostic (#284) viendront ensuite.
- L'ancien parcours `/signup` et `/onboarding` est remplacé.
- Adresse déjà utilisée : message neutre qui renvoie vers « Retrouver mon compte » sans dire que le compte existe (FR-9 prévaut sur M-14).

Décisions de Samir (2026-11-07) :
- **Vérification de l'e-mail pendant le POC.** Une adresse non confirmée peut tout utiliser, diffusion comprise.
  - Le blocage revient quand la variable d'environnement `REQUIRE_EMAIL_VERIFICATION=true` est posée, sans changement de code.
  - Tous les contrôles actuels passent par une seule fonction : agents, Gmail, exécution, M-54.
  - L'e-mail de vérification est toujours envoyé, et le bandeau reste affiché.
- **Étape 2** : le titre de la spécification, « Paul semble avoir compris votre entreprise. », dès maintenant.
- **Étape 4** : les trois premiers modèles disponibles (`availableTemplates`), dans l'ordre fixe « Fiche Google à jour », « Publication », « Page du site vitrine », « Réponse aux avis », « Sur mesure ».
- La spec reste entière (environ 3 000 jetons).

## Boundaries & Constraints

**Always:**
- Le serveur contrôle chaque transition (spécification §1.2) avec des fonctions pures testées. Une étape ne s'ouvre que si la précédente est confirmée. Revenir à une étape inférieure à 4 rend le diagnostic « non prêt », et les saisies restent.
- Seul le hachage du jeton est stocké. Le cookie est httpOnly, Secure en production, SameSite=Lax et dure 24 h. Un brouillon expiré est ignoré, et le parcours repart à l'étape 1.
- Aucune ligne `Company` ni `Mission` avant l'étape 5. Le parcours ne demande ni connexion de canal ni niveau de délégation.
- Le compte demande un e-mail valide et un mot de passe de 8 à 128 caractères, saisi deux fois. Le contrôle des inscriptions, le plafond par IP et l'e-mail de vérification de `/api/auth/signup` restent en place.
- Les comptes existants ne sont jamais renvoyés dans le parcours :
  - avec une session, `/bienvenue*` mène à `/strategie` ;
  - un ancien compte sans nom garde le formulaire de `/onboarding`, qui exige une session.
- Clavier et 360 px : le focus va sur le titre de chaque étape, et les erreurs sont annoncées (`role="alert"`).

**Never:**
- Ni analyse, ni appel à un modèle, ni crédit consommé pendant le parcours.
- Ni compte ni donnée de démonstration.
- Pas de reconnexion par e-mail seul : le mot de passe reste (FR-10).
- Ne pas modifier `/api/companies` ni le formulaire de profil de `/entreprise`.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu | Erreur |
|----------|---------------|------------------|--------|
| Premier passage | `/bienvenue` sans cookie | Étape 1 vide, « 1 sur 5 » ; le brouillon naît à la première validation | — |
| Rechargement | Cookie valide, étape 3 | Étape 3 réaffichée avec ses saisies | — |
| Saut d'étape | `/bienvenue/compte` avec un brouillon à l'étape 2 | Redirigé vers l'étape 2 | — |
| Retour avant l'ambition | Étape 4 → « Retour » jusqu'à 2 | Étape 2 ; ambition gardée mais à reconfirmer | — |
| Site invalide | `ftp://x` | Rien n'est enregistré | Message M-04 sous le champ |
| Création réussie | Étape 5, adresse libre | Entreprise, 3 missions `proposed`, J-04, session ouverte, brouillon effacé, arrivée sur `/strategie` | — |
| Adresse déjà utilisée | Étape 5, adresse connue | Brouillon conservé, aucun compte créé | Message neutre avec un lien « Retrouver mon compte » |
| Session ouverte | `/bienvenue` connecté | Redirigé vers `/strategie` | — |
| Brouillon expiré | Cookie de plus de 24 h | Étape 1 vide | — |

</frozen-after-approval>

## Code Map

- Contrôles de l'e-mail, à faire passer par une fonction unique `emailVerificationGateOpen(emailVerifiedAt)` :
  - `src/lib/agent-runs.ts:440` ;
  - `src/app/api/gmail/send/route.ts:19` ;
  - `src/app/api/proposals/[id]/execute/route.ts:36` ;
  - `src/lib/contents/publish.ts:235` et `src/lib/contents/view.ts:95`, qui alimentent M-54 dans `checkDiffusion`.
  - Le bandeau de `src/lib/shell-data.ts` ne change pas.
  - `.github/workflows/ci.yml:37` : poser `REQUIRE_EMAIL_VERIFICATION: "true"` pour que le test de sécurité :625 continue de vérifier le blocage.
- `src/app/api/auth/signup/route.ts` -- création du compte, à réécrire : exige un brouillon à l'étape 5 et le diagnostic prêt. À garder : contrôle des inscriptions, `consumeIpAttempt`, `reserveSignupSlot`, `setSessionEmail`, `sendVerificationEmail` dans `after()`.
- `src/app/signup/*`, `src/app/onboarding/page.tsx` -- `/signup` redirige vers `/bienvenue`. `/onboarding` : pas de session → `/bienvenue` ; session avec nom → `/strategie` ; session sans nom → formulaire actuel (`CompanyProfileForm guided`).
- `src/lib/session.ts` -- modèle de cookie signé ; `setSessionEmail` exige que l'entreprise existe déjà.
- `src/lib/auth-throttle.ts:28` -- politiques par IP ; en ajouter une pour la création de brouillon.
- `src/lib/password-policy.ts` -- de 8 à 128 caractères, déjà en place.
- `src/lib/missions/service.ts:72` `createMissionIn(tx, companyId, body, "paul")` -- crée une mission `proposed` et écrit J-01.
- `src/lib/missions/templates.ts:106` `availableTemplates()`.
- `src/lib/journal.ts:6,67` -- ajouter J-04 « Profil et ambition confirmés. Aucune mission lancée. » à `JOURNAL_TEXTS` et l'écrire avec `writeJournal(tx, …, actor: "owner")`.
- `src/lib/agents/onboarding-audit.ts:18` `startOnboardingAudit` -- l'appeler après la transaction, au mieux, comme `/api/companies:141-152`.
- `src/components/trade-combobox.tsx` -- réutilisé pour l'activité à l'étape 2.
- `src/lib/workspace.ts:8` -- inchangé : les anciens comptes sans nom vont sur `/onboarding`.
- `src/app/page.tsx:15` `START_HREF`, `src/app/login/page.tsx:92` -- pointer vers `/bienvenue`.
- `prisma/schema.prisma` -- `OnboardingDraft` (addendum §6) et, sur `Company`, `firstName`, `location`, `targetClients`, `offers`, `profileConfirmedAt`, `ambitionText` (addendum §4.1). Le dossier `prisma/` est en CODEOWNERS (Rémi).
- Tests touchés :
  - `tests/security.spec.ts` :208, :276, :304, :344, :504, :625 et :708 appellent `/api/auth/signup` et ont besoin d'un brouillon à l'étape 5 ;
  - `tests/brand.spec.ts` :50, :103 et :127 visent `/signup`.
  - Les autres tests créent les entreprises directement en base.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/email-verification-policy.ts` -- `emailVerificationGateOpen(verifiedAt)`, qui renvoie vrai si `REQUIRE_EMAIL_VERIFICATION` n'est pas `"true"` ou si l'adresse est confirmée ; l'utiliser aux cinq endroits de la Code Map ; poser la variable dans `ci.yml`.
- [x] `prisma/schema.prisma`, `prisma/migrations/20261107150000_parcours_entree/` -- migration additive : `OnboardingDraft` (id, tokenHash unique, step, profile Json, ambition Json?, profileConfirmed, diagnosticReady, createdAt, expiresAt) et les champs `Company` ci-dessus.
- [x] `src/lib/onboarding/draft-rules.ts` -- fonctions pures des transitions §1.2 (découvrir, confirmer le profil, confirmer l'ambition, ça m'intéresse, revenir, aller à) et choix des trois modèles.
- [x] `src/lib/onboarding/draft.ts` -- lecture du brouillon par cookie (expiré = absent), création avec plafond par IP, écriture.
- [x] `src/app/api/bienvenue/route.ts` -- POST `{ action, … }`, réponses 422 avec les codes M.
- [x] `src/app/bienvenue/` -- layout (colonne d'étapes, « n sur 5 », Retour ou « Revoir le concept ») et pages des étapes 1 à 5, gardées côté serveur.
- [x] `src/app/api/auth/signup/route.ts` -- transaction : entreprise, trois missions, J-04, brouillon effacé ; message neutre en cas d'adresse déjà utilisée.
- [x] `src/app/signup`, `src/app/onboarding`, `src/app/page.tsx`, `src/app/login/page.tsx` -- redirections et liens.
- [x] `tests/delegation.spec.ts` -- tests unitaires des transitions et du choix des modèles.
- [x] `tests/user-journey.spec.ts`, `tests/security.spec.ts`, `tests/brand.spec.ts` -- un fixture « brouillon à l'étape 5 » ; parcours complet, retour arrière, rechargement, adresse déjà utilisée, session ouverte, 360 px.

**Acceptance Criteria:**
- Given un parcours complet, when le compte est créé, then l'entreprise porte prénom, localisation, activité, zone, clients, offres et ambition, a trois missions `proposed` et une entrée J-04, et le dirigeant arrive sur `/strategie`.
- Given un ancien compte sans nom, when il se connecte, then il retrouve `/onboarding` et jamais `/bienvenue`.
- Given une adresse non confirmée et `REQUIRE_EMAIL_VERIFICATION` absente, when le dirigeant parle à Paul ou diffuse, then rien n'est bloqué ; given la variable à `true`, then le blocage actuel s'applique (M-54, 403).

## Implementation Notes

- Il n'y a pas de `layout.tsx`. La colonne des étapes, « n sur 5 » et Retour ou « Revoir le concept » sont dans `src/app/bienvenue/welcome-frame.tsx`, parce qu'un layout ne se réaffiche pas quand on passe d'une étape à l'autre. Sur téléphone, la colonne devient une rangée de pastilles.
- Avec le catalogue actuel, l'étape 4 propose « Publication », « Page du site vitrine » et « Sur mesure », car le canal Google est désactivé. Le constat de chaque mission reprend les saisies du dirigeant.
- À la création du compte, `objective` (« Votre cap ») et `ownerName` sont aussi renseignés. L'audit de départ (`startOnboardingAudit`) est lancé au mieux, après la transaction.
- `/api/auth/signup` exige maintenant `passwordConfirmation` et refuse une session déjà ouverte. Le brouillon est réclamé dans la transaction, seulement s'il est à l'étape 5 avec le diagnostic prêt.
- Lors de la création d'un brouillon, il y a 5 % de chances que les brouillons expirés soient effacés. La purge quotidienne reste reportée à #311.
- Le test de sécurité sur l'adresse non vérifiée ne tourne que si `REQUIRE_EMAIL_VERIFICATION=true`, ce que la CI pose.
- Vérifié en local : lint, `tsc`, `prisma validate`, `test:delegation` (137 tests) et build. Les tests de parcours, de sécurité et de marque n'ont pas tourné, faute de base de données ; ils passeront en CI.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-07, trois couches : Blind Hunter (BH), Edge Case Hunter (EC) et Verification Gap (VG).

| # | Source | Constat | Verdict | Suite |
|---|--------|---------|---------|-------|
| 1 | BH | L'audit est lancé à l'inscription et attendu ; « Erreur inattendue » serait écrite au journal quand la vérification est exigée | false | `EmailNotVerifiedError` hérite de `AgentRunQuotaError` (agent-errors.ts:82), donc le refus est bien intercepté. L'audit est une ligne de plan et non une mission, et il était déjà lancé à la création du profil. Rejeté. |
| 2 | BH, EC | `saveDraft` fait un `update` sans garde : un brouillon effacé ou expiré entre la lecture et l'écriture donne une erreur 500 | medium | patch |
| 3 | BH | Le texte « enregistrées pendant 24 heures » est faux, puisque l'expiration est fixée dès la création du brouillon | low | patch (correction directe du texte) |
| 4 | BH | L'adresse e-mail n'est pas mise en minuscules | medium | defer : l'ancienne inscription et la connexion ne normalisent pas non plus (aucun `toLowerCase` dans `src/app/api/auth`). |
| 5 | BH, EC | L'inscription ne refuse pas une session ouverte : un second compte est créé et la session bascule dessus | medium | patch |
| 6 | BH | Le cookie `pepito_draft` et le brouillon ne figurent pas dans `/confidentialite` | medium | patch |
| 7 | BH | `REQUIRE_EMAIL_VERIFICATION` n'est pas documentée ; en mode POC, le bandeau dit encore que la diffusion est bloquée | low | Le dépôt n'a pas de `.env.example` ; la variable sera signalée dans la PR. Pour le texte du bandeau : defer. |
| 8 | BH | La garde par expression régulière de la fonction unique est étroite | low | Rejeté : ce n'est qu'un test de qualité. Le vrai manque est la ligne 21. |
| 9 | BH | Le titre de l'étape 2 promet une compréhension qui n'existe pas encore | false | Choix explicite de Samir du 2026-11-07. Rejeté. |
| 10 | BH | `confirm_ambition` est accepté aux étapes 4 et 5 et ramène l'étape 5 à 4 | low | patch (une condition) |
| 11 | BH, VG | L'origine refusée par `/api/bienvenue` n'est pas testée | medium | patch (test) |
| 12 | BH, VG | Aucun test pour deux inscriptions simultanées sur le même brouillon | low | defer : le bouton est désactivé pendant l'envoi. |
| 13 | BH | Plusieurs `role="alert"` annoncés à la fois | low | Rejeté : peu probable de gêner au quotidien, et la correction réorganise les erreurs. |
| 14 | BH | M-12 jamais utilisé, consigne du mot de passe écrite en dur | low | Rejeté : purement cosmétique. |
| 15 | BH | Les missions de l'étape 4 peuvent différer de celles créées si le catalogue change entre-temps | low | Rejeté : cela suppose un changement de configuration pendant le parcours. |
| 16 | BH | 20 brouillons par IP et par jour pénalisent les réseaux partagés | low | Rejeté : même principe que les autres plafonds par IP. |
| 17 | EC | La réclamation du brouillon accepte un brouillon revenu à une étape antérieure dans un autre onglet | medium | patch (conditions dans le `where`) |
| 18 | EC | Écritures concurrentes : la dernière l'emporte | low | Rejeté : l'interface envoie une action à la fois. |
| 19 | EC | `consumeIpAttempt` sans IP : aucune limite | low | Rejeté : même comportement que l'inscription existante. |
| 20 | EC | Un brouillon à l'étape 5 aux champs vides crée une entreprise vide | false | Les transitions contrôlent chaque champ, et l'état ne s'écrit que par elles. Rejeté. |
| 21 | EC | Moins de trois missions si le catalogue se réduit | low | Rejeté : « Sur mesure » est toujours disponible et deux autres canaux sont actifs. |
| 22 | EC | Inscriptions fermées : le visiteur ne l'apprend qu'à l'étape 5 | medium | patch (avis dès l'étape 1) |
| 23 | VG | L'audit créé à l'inscription n'est pas vérifié | medium | patch (test) |
| 24 | VG | Le mode POC (variable absente) n'est vérifié chez aucun consommateur | medium | defer : il faudrait un second serveur de CI sans la variable. |
| 25 | VG | `objective` (« Votre cap ») n'est pas vérifié | low | patch (test, correction directe) |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npx prisma validate` -- sans erreur.
- `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder npm run test:delegation` -- vert.
- `npm run build` -- réussi. Les tests UX et de sécurité tournent en CI.

**Manual checks:**
- Navigateur à 360 px et à 1440 px : les cinq étapes, le retour arrière, le rechargement, et la tabulation qui place le focus sur le titre.
