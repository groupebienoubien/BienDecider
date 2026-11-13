---
title: 'Découvrir mon entreprise à partir de son nom et de son site (#280)'
type: 'feature'
created: '2026-11-07'
status: 'done'
baseline_commit: '7da84d0e65779246929d925991e9368c74c5469d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis #279, l'étape 1 de `/bienvenue` enregistre les saisies et passe directement à l'étape 2, sans rien lire. La V5.2 veut que Paul fasse une première lecture publique avant le compte : quatre rubriques suivies, sans mot de passe ni accès privé (FR-3, FR-4, spécification §1.2 et §1.3).

**Approach:**
- « Découvrir mon entreprise » enregistre les saisies et lance, côté serveur et après la réponse, une analyse anonyme gardée dans le brouillon.
- L'analyse lit la page d'accueil du site par un lecteur protégé contre le SSRF, cherche la fiche Google par le nom et la localisation, puis fait extraire au modèle les offres, les contacts publics, la zone, les clients et l'identité visuelle.
- L'étape 1 affiche la progression des quatre rubriques. Une fois l'analyse terminée, « Voir mes premiers constats » ouvre l'étape 2, préremplie avec ce qui a été trouvé.
- Sans site, « Je n'ai pas de site » poursuit sans lecture web.

Décisions de Samir (2026-11-07) :
- **Plafond global** des analyses anonymes, en plus des 3 par IP. Il est réglable par `ANONYMOUS_ANALYSIS_DAILY_LIMIT` (300 par défaut). Au-delà, tout le monde reçoit le même message « revenez plus tard », et l'étape 2 reste ouverte.
- **Pages lues** : la page d'accueil, plus jusqu'à deux pages internes du même site repérées par leurs liens (contact, services, prestations). Trois requêtes au plus, chacune passant par le lecteur protégé.
- La spec reste entière (environ 2 700 jetons).

Dérogation de test du 2026-11-13 : le plafond d'analyse par IP et par 24 h passe temporairement de 3 à 10, comme celui de la recherche/préparation des missions. Le plafond global et la durée de la fenêtre restent inchangés.

## Boundaries & Constraints

**Always:**
- **Les quatre rubriques**, chacune « En cours », puis « Lue », « Non disponible » (avec la raison : pas de site, site illisible, accès refusé, service indisponible) ou « Non trouvée » :
  - « Site et offres » ;
  - « Informations publiques » (fiche Google) ;
  - « Zone et clients » ;
  - « Identité visuelle ».
- Une rubrique illisible ne bloque jamais la suite.
- **Provenance.** Chaque valeur garde sa provenance :
  - « observé », avec la source et la date de lecture ;
  - « hypothèse » (déduit par le modèle) ;
  - « déclaré » (saisi par le dirigeant).
- Ce qui n'a pas été lu n'est jamais présenté comme observé. Rien n'est confirmé avant l'étape 2.
- **Lecteur de site** (côté serveur) :
  - http(s) seulement, résolution DNS vérifiée ;
  - refus des adresses privées, de bouclage, link-local et réservées, en IPv4 comme en IPv6, et refus des ports autres que 80 et 443 ;
  - au plus 3 redirections, chacune revérifiée ;
  - 8 secondes et 1 Mo au plus ;
  - seulement `text/html`.
- **Coût et quotas** :
  - 3 analyses par IP hachée et par jour (D2). Au-delà, un message propose de revenir plus tard, et l'étape 2 reste accessible sans analyse.
  - Un seul appel au modèle par analyse, avec `max_tokens` borné et un texte de page tronqué.
  - Le coût estimé est gardé dans le brouillon.
  - Une analyse en cours refuse un second lancement (pas de double clic).
- **Échec ou modèle indisponible** : les rubriques concernées passent « Non disponible », un message est affiché, et le formulaire de l'étape 2 reste ouvert.

**Never:**
- Ni Facebook, ni TikTok, ni Instagram (cela demande une connexion au compte), ni concurrents.
- Ni web_search, ni lecture hors du site fourni (même hôte, trois pages au plus).
- Ni `AuditFinding`, ni `SourceRead`, ni `UsageEvent` (ces tables exigent une entreprise).
- Pas de mode factice activé par une variable d'environnement dans le code de production.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu | Erreur |
|----------|---------------|------------------|--------|
| Avec site | Site public lisible | 4 rubriques terminées ; étape 2 préremplie (activité, zone, clients, offres) en hypothèses | — |
| Sans site | « Je n'ai pas de site » | Site et Identité visuelle « Non disponible (pas de site) », Google cherché ; étape 2 « À renseigner par vous » | — |
| Site interne | `http://127.0.0.1`, `http://10.0.0.5`, nom résolu vers une IP privée | Aucune requête ; Site « Non disponible (accès refusé) » | — |
| Site en erreur | 500, délai dépassé, pas du HTML, plus de 1 Mo | Site « Non disponible (site illisible) » ; la suite continue | — |
| Quota IP atteint | 4e analyse du jour | Pas d'analyse ; message « revenez plus tard » et passage à l'étape 2 sans analyse | 429 |
| Double clic | Découvrir pendant une analyse en cours | Refus, l'analyse en cours continue | 409 |
| Modèle indisponible | Pas de clé ou erreur de l'API | Zone et Identité « Non disponible » ; observé du site conservé | — |

</frozen-after-approval>

## Code Map

- `src/lib/onboarding/draft-rules.ts` -- `DraftState`, `applyDraftAction` (« discover » passe aujourd'hui à l'étape 2), `readDraftState`, `checkDiscovery`. Il faut ajouter l'état d'analyse et l'action « voir les constats » (analyse terminée → étape 2), et faire que « discover » reste à l'étape 1 en lançant l'analyse.
- `src/lib/onboarding/draft.ts` -- `toJson` et `saveDraft`, qui écrasent tout l'état. L'écriture de l'analyse en arrière-plan doit passer par son propre `updateMany` sur la colonne `analysis` (id et `expiresAt > now`).
- `src/app/api/bienvenue/route.ts` -- POST des transitions. Ajouter le lancement via `after()` (`maxDuration` 60) et un GET de la progression, avec cookie et sans session.
- `src/app/bienvenue/page.tsx`, `step-forms.tsx`, `journey-client.tsx` -- étape 1 : ajouter « Je n'ai pas de site », l'aide « Aucun mot de passe ni accès privé nécessaire », la liste des rubriques en `aria-live`, une interrogation toutes les 1,2 s et « Voir mes premiers constats ». Étape 2 : préremplir depuis l'analyse.
- `src/lib/google-places.ts:83` `searchPlaceIds`, `:138` `readPlaceDetails` -- sans entreprise, avec dépendances injectables. Retourner `not_configured` donne la rubrique « Non disponible ».
- `src/lib/anthropic.ts` -- `anthropic`, `AGENT_MODEL`. Reprendre le modèle d'extraction en un seul appel de `src/app/api/onboarding/interpret/route.ts:36-66` (un outil, `tool_choice` forcé, analyse par zod), sans `reserveUsageBudget` ni `recordUsage`, qui exigent une entreprise.
- `src/lib/usage.ts:29` `estimateCostUsd` -- fonction pure, à réutiliser.
- `src/lib/auth-throttle.ts:5,26,57,80` -- ajouter la portée `analysis` (3 par 24 h) ; `refundIpAttempt` si le lancement échoue avant l'analyse.
- `prisma/schema.prisma` `OnboardingDraft` -- ajouter `analysis Json?` (migration additive ; CODEOWNERS).
- `tests/support/smtp-sink.ts` -- modèle d'un serveur local, à suivre pour un site factice `node:http`.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/20261107160000_analyse_brouillon/` -- `OnboardingDraft.analysis Json?`.
- [x] `src/lib/onboarding/site-reader.ts` -- `readPublicSite(url, deps)` avec résolveur et `fetch` injectables :
  - garde SSRF à chaque requête ;
  - limites de taille et de délai ;
  - réduction du HTML en texte ;
  - accueil, plus au plus deux pages internes du même hôte, choisies par les mots de leurs liens (contact, services, prestations, tarifs) ;
  - palette (`theme-color`, couleurs CSS en ligne) et logo (`og:image`, icônes) repérés.
- [x] `src/lib/auth-throttle.ts` -- portée `analysis` (10 par IP en 24 h pendant les tests) et compteur global du jour (une ligne `AuthThrottle` de clé fixe, plafond `ANONYMOUS_ANALYSIS_DAILY_LIMIT`, 300 par défaut).
- [x] `src/lib/onboarding/analysis.ts` -- `runDraftAnalysis(draftId, profile, deps)` : rubriques mises à jour au fil de l'eau, extraction en un seul appel au modèle, provenance et coût ; fonction pure `rubricsFor(...)`.
- [x] `src/lib/onboarding/draft-rules.ts`, `draft.ts` -- état d'analyse, actions « discover » (lance) et « see_findings » (étape 2), préremplissage de l'étape 2.
- [x] `src/app/api/bienvenue/route.ts`, `src/app/api/bienvenue/analyse/route.ts` -- lancement plafonné par IP, refus d'un double lancement, GET de la progression.
- [x] `src/app/bienvenue/*` -- interface de l'étape 1 et préremplissage de l'étape 2.
- [x] `tests/delegation.spec.ts` -- garde SSRF (IP privées, IPv6, redirection vers une IP privée), limites, déduction sur des pages fictives, transitions.
- [x] `tests/user-journey.spec.ts`, `tests/security.spec.ts` -- parcours sans site, URL invalide, quota IP, double clic, et modèle indisponible (CI sans clé) qui laisse l'étape 2 ouverte.

**Acceptance Criteria:**
- Given une analyse terminée, when « Voir mes premiers constats », then l'étape 2 s'ouvre préremplie et `profileConfirmed` reste faux.
- Given une analyse, then son coût estimé et l'état de chaque rubrique sont dans `OnboardingDraft.analysis`, et aucune ligne `Company`, `UsageEvent` ni `SourceRead` n'est créée.

## Implementation Notes

- Une redirection vers un autre hôte est refusée : la rubrique « Site et offres » passe « Non disponible (site illisible) ».
- Quota dépassé (par IP ou global) : les quatre rubriques passent « Non disponible (service indisponible) » et le dirigeant peut continuer sans analyse.
- Le texte de `/confidentialite` sur la trace des visites anonymes n'est pas ajouté ici ; il viendra avec la trace et la purge (#311).
- Les tests qui demandent une base (`security`, `user-journey`, `brand`) sont écrits mais ne tournent qu'en CI.
- `goto 2` contrôle aussi que l'analyse correspond au profil saisi, comme « Voir mes premiers constats ».
- Vérifié en local : lint, `tsc`, `prisma validate`, 148 tests de délégation, build.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-07, trois couches : Blind Hunter (BH), Edge Case Hunter (EC) et Verification Gap (VG).

| # | Source | Constat | Verdict | Suite |
|---|--------|---------|---------|-------|
| 1 | EC | Les expressions régulières à paires de balises sont quadratiques sur un HTML piégé : la boucle d'événements est bloquée par une requête anonyme | high | patch (balayages linéaires, nombre de liens plafonné) |
| 2 | BH, EC | Un téléphone inventé par le modèle est « trouvé » parmi tous les chiffres de la page et affiché comme observé | medium | patch |
| 3 | BH, EC | `see_findings` ne vérifie pas que l'analyse correspond au profil : l'étape 2 peut être préremplie avec une autre entreprise | medium | patch |
| 4 | BH, EC | Des modifications faites après l'analyse sont perdues par « Voir mes premiers constats » | medium | patch |
| 5 | BH | La réponse « busy » de `startAnalysis` ne contient pas l'analyse : pas d'interrogation | low | patch (correction directe) |
| 6 | BH, EC | La résolution DNS n'est pas bornée par les 8 secondes | medium | patch |
| 7 | BH | Le `<meta charset>` est ignoré, ce qui abîme les accents | medium | patch |
| 8 | BH | Une redirection vers un autre domaine s'affiche « accès refusé » | low | patch (correction directe) |
| 9 | EC | Un encodage inconnu ou une liste d'encodages transmet des octets compressés au modèle | low | patch (correction directe) |
| 10 | EC | Une URL de plus de 600 caractères fait échouer le schéma : l'analyse disparaît et l'interrogation ne s'arrête pas | medium | patch |
| 11 | BH | `cleanValue` laisse des débris de balises | low | patch (correction directe) |
| 12 | BH | Le journal d'erreur perd l'erreur | low | patch (correction directe) |
| 13 | EC | Une analyse interrompue ne peut pas être relancée pour la même entreprise | medium | patch |
| 14 | EC | Interrogation sans fin quand l'analyse est nulle ou le brouillon expiré | medium | patch |
| 15 | BH | L'introduction « hypothèses de Paul » s'affiche même sans hypothèse | low | patch (affichage conditionnel) |
| 16 | VG | Le plafond global et son remboursement ne sont pas testés | medium | patch (test) |
| 17 | VG | La garde `runId` de `saveAnalysis` n'est pas testée | medium | patch (test) |
| 18 | VG | Le refus « busy » de `startAnalysis` n'est pas testé | low | patch (test séquentiel) ; la course réelle est reportée avec celle de #279 |
| 19 | VG | L'affichage de l'observé et des hypothèses à l'étape 2 n'est pas testé | medium | patch (test) |
| 20 | BH | « Identité visuelle » est « Lue » avec seulement l'icône du site | low | Rejeté : l'icône est bien observée. Montrer le ton et le logo relève de #281. |
| 21 | BH | Le coût des analyses anonymes n'est cumulé nulle part | medium | defer : il ira dans la trace des visites (#311, `analysisCostUsd`). |
| 22 | BH, VG | Les tests partagent le compteur global et pourraient appeler des services réels | low | Rejeté : la CI repart d'une base vide à chaque run et n'a aucune clé. |
| 23 | BH | Les brouillons de #279 restent bloqués avant l'étape 2 | low | Rejeté : ils ont 24 heures au plus et datent de quelques heures. |
| 24 | BH | Le GET de progression n'a pas de plafond | low | Rejeté : simple lecture liée au cookie. |
| 25 | BH | La spec n'est pas dans le diff | false | Elle est commitée avec le reste. Rejeté. |
| 26 | EC | Branche « limited » : `startAnalysis` peut renvoyer busy ou missing, ou lever une exception | low | Rejeté : situation rare (course pendant un refus de quota). |
| 27 | EC | Un autre onglet passe le brouillon à l'étape 2 | low | Rejeté : l'étape suivante redirige. |
| 28 | EC | Jusqu'à 12 requêtes avec les redirections | low | Rejeté : trois pages, chaque saut protégé et borné. |
| 29 | EC | Fenêtre glissante de 24 h et non jour calendaire | low | Rejeté : l'effet sur le coût est le même. |
| 30 | VG | Les attentes de 30 secondes sont trop courtes avec des clés réelles | low | Rejeté : la CI n'a pas de clé. |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npx prisma validate` -- sans erreur.
- `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder npm run test:delegation` -- vert.
- `npm run build` -- réussi.

**Manual checks:**
- Navigateur, à 360 px : étape 1 sans site, puis avec un site public réel si une clé est disponible en local. Les rubriques s'annoncent et le focus va sur « Voir mes premiers constats ».
