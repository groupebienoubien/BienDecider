---
title: 'Corriger les huit défauts de gestion des agents IA'
type: 'bugfix'
created: '2026-10-24'
status: 'done'
baseline_commit: '805914999cb67d74720e232a6b15bb0be7d6480f'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/docs/audit-agents-ia-2026-10-24.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** A01–A08 fragilisent consommation, relances et demandes confiées aux agents.

**Approche :** corriger les huit dans un lot, avec comptabilité sur erreur, boucles bornées, écritures réservées à la tentative courante et demande durable commune aux lancements.

## Boundaries & Constraints

**Toujours :** confirmations humaines, isolation, quotas et plafonds actuels conservés. Usage mesuré compté une seule fois, même sur erreur/flux interrompu ; réservation gardée jusqu'à finalisation. Limites : 32 tours, échéance à 270 secondes depuis le début, contrôle du coût entre tours au seuil réservé de 1 USD ; comptabiliser entièrement le tour franchissant ce seuil. Arrêt partiel explicite, productions conservées à relire. Garde transactionnelle des écritures. Paramètres durables, anciennes cartes compatibles, action reprise inchangée. Migration additive nullable.

**Jamais :** publier/envoyer automatiquement, changer modèle/tarifs/quotas, déployer ou modifier la production. Les observations complémentaires de l'audit restent hors lot.

## I/O & Edge-Case Matrix

| Étant donné | Quand | Alors |
|---|---|---|
| A01 : usage reçu | tour suivant échoué | coût conservé une fois, erreur propagée |
| A02 : boucle répétitive/bloquée | limite atteinte | arrêt explicite, aucun tour supplémentaire |
| A03 : ancienne tentative | relance active | écritures obsolètes refusées |
| A04 : run ancien | retry puis polling | date renouvelée, pas de fausse péremption |
| A05 : cible/actualité | carte reportée, plan ou retry | mêmes paramètres transmis |
| A06 : reprise par suivi | travail supérieur à 60 s | route autorisant 300 s, échéance respectée |
| A07 : lancement concurrent | action écartée | HTTP 409, état courant conservé |
| A08 : modèle sans action | fin de génération | coût enregistré, `no_result` |

</frozen-after-approval>

## Code Map

- `src/lib/usage.ts`, `src/lib/agents/{marketing,contenu,demarchage,co-ceo,revision}.ts` : sept chemins de boucle ; finalisation commune, supprimer les doubles comptes.
- `src/lib/agent-run-{execution,limits}.ts` à créer : contexte, garde et constantes sans cycle ; `src/lib/agent-runs.ts` : claim, péremption et retry protégés.
- `src/lib/agents/{run-caps,plan-runner,capabilities,revision,co-ceo}.ts` et outils : garde, plafond et écriture dans la même transaction.
- `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/agents/plan-items.ts` : `ActionPlanItem.launchExtras Json?`, récupération des anciennes cartes, payload du retry conservé.
- `src/app/api/agent-runs/[id]/route.ts` : durée statique ; `src/app/api/action-plan/[id]/route.ts` : transition conditionnelle ; `src/lib/agent-run-progress.ts` : anciens plans vides.
- `tests/engine.spec.ts` : réutiliser fixtures, `inRequestScope`, captures d'outils et `processWithScenario`. `tests/delegation.spec.ts` : règles pures.

## Tasks & Acceptance

**Exécution :**
- [x] `usage.ts`, limites et agents : A01/A02, flux partiel et persistance défaillante.
- [x] `agent-runs.ts`, garde et outils : A03/A04, tentative capturée dans le claim, nettoyage conditionnel.
- [x] Schéma, migration et demande de lancement : A05, compatibilité historique.
- [x] Routes, planning et progression : A06/A07/A08.
- [x] Tests ci-dessus : huit régressions, succès, cache, flux et concurrence déterministe.

**Précisions issues de la première revue, à réimplémenter :**
- [x] L'échéance borne aussi l'attente avant la boucle et la finalisation. Une opération suspendue ne retient pas le worker ; toute écriture tardive reste interdite. Garder le budget si la consommation n'est pas encore finalisée, y compris si l'attente du worker se termine avant celle du finaliseur.
- [x] Étendre le contexte d'annulation aux outils de conversation : actions du plan, cartes et demandes hors catalogue. Vérifier l'annulation et l'échéance avant ET après les opérations asynchrones d'une transaction, avant son commit. Un outil libéré après l'échec du chat ne crée aucune carte orpheline ni nouvelle action. Les outils capturés par les tests existants restent utilisables durant un tour actif.
- [x] Les réservations du chat qui n'ont pas été finalisées continuent à compter après leur échéance de bail ; la finalisation réussie les libère. Ne pas modifier les plafonds ni les autres finalités d'appels directs.
- [x] À la limite de tours ou de coût, terminer les outils demandés par le dernier message reçu, sans autoriser une nouvelle requête au modèle. Lire le vrai SDK installé (assistant émis avant exécution de ses outils). L'échéance et l'annulation restent prioritaires. Vérifier avec le vrai runner et un client simulé ; inclure la réponse finale sans outil à la frontière.
- [x] Les identifiants de productions ne prouvent un succès qu'après commit ; vérifier les lignes effectivement persistées avant `ensureAgentProduced`, y compris après un commit rejeté.
- [x] Normaliser les paramètres complémentaires avant de contrôler leur longueur ; conserver les textes acceptés entourés d'espaces. Exposer le message d'arrêt partiel dans les réponses chat JSON et en flux.
- [x] Renforcer les tests moteur : ancien worker produisant puis suspendu et retournant normalement après démarrage du retry ; outil prospect sous échéance expirée, signal annulé et échéance dépassée pendant la transaction ; comptabilité réelle de Paul dans les deux modes, succès et échec après un tour facturé ; outil de chat libéré après annulation ; réservation chat non finalisée expirée ; attente avant boucle bloquée.

**Critères d'acceptation :**
- Étant donné deux entreprises, quand elles utilisent les chemins corrigés, alors leurs données et décisions restent isolées.
- Étant donné un lancement normal, quand l'agent termine, alors confirmations, productions et révisions fonctionnent toujours.

## Implementation Notes

- 24 octobre : implémentation contrôlée contre le diff depuis la baseline. A01/A02 : cumul finalisé sur erreur, flux partiel et bornes communes. A03/A04 : identité capturée au claim, verrou SQL partagé avec les écritures, retry et nettoyage conditionnels. A05 : JSON nullable et reprise des cartes historiques. A06/A07/A08 : durée 300 s, décision atomique et plan vide en `no_result`.
- Vérification avant revue : moteur 143/143 (dont 12 régressions audit), délégation 70/70, voix 11/11, sécurité 11/11 ; lint, TypeScript, build, migrations et cohérence Prisma réussis. PostgreSQL 17.10 jetable, port 55433 ; serveur compilé local, port 3187 ; modèle simulé et clé réelle neutralisée.
- Sous Windows, tests moteur exécutés avec un préchargeur d'alias temporaire ignoré dans `node_modules/.cache/agent-audit-db/aliases.cjs`. Aucune dépendance ajoutée au projet. Next.js signale une vulnérabilité connue de la version existante ; mise à niveau hors de ce lot.
- Matrice : A01/A02 couverts par `audit A01/A02` dans délégation et usage moteur ; A03 par les trois scénarios de tentative/concurrence/nettoyage ; A04/A05 par retry, paramètres différés et cartes historiques ; A06 par durée exportée ; A07 par vrai handler en concurrence déterministe ; A08 par plan vide puis plan réussi. Tous exécutés avec succès.

- Itération 1 vérifiée : moteur 151/151, frontières 11/11, sécurité 11/11, délégation 76/76 (vrai SDK simulé JSON/flux), voix 11/11. Lint, TypeScript, build, migration, comparaison Prisma et wiki strict réussis. Les huit lignes de la matrice ont des tests exécutés et réussis ; nouvelles couvertures des annulations transactionnelles, du retour normal obsolète et de la comptabilité des appelants de Paul.
- Clôture locale : 260 tests réussis, aucune migration en production, aucun appel au fournisseur réel. Les trois relecteurs indépendants de la seconde passe ont tous été interrompus par la limite d'usage du compte avant de rendre des constats ; cette seconde passe n'est donc pas validée indépendamment. Relecture locale du diff et de la matrice A01–A08 effectuée ; les retours de la première passe ont été corrigés ou explicitement différés ci-dessous. Livraison finalisée à la demande de l'utilisateur, avec cette limite de revue conservée dans le bilan.

## Spec Change Log

- Itération 1 — retours B1/B2/B6/B10 et E2/E3 : le plan initial ne précisait pas suffisamment les frontières d'annulation, le bail des réservations de conversation et l'ordre réel assistant/outils du SDK. Compléter les tâches techniques et leurs tests sans modifier le bloc approuvé. Éviter un arrêt seulement local à l'itérateur, une écriture après annulation et un nouveau tour payant à la frontière. KEEP : finaliseur commun et unique avec cache/flux partiel, garde transactionnelle tenant/tentative et claim atomique, dates du retry, JSON nullable durable avec cartes historiques, CAS du PATCH, durée de route 300 s, plan vide `no_result`, plafonds de productions et confirmations humaines. Conserver les tests de régression et la couverture moteur/délégation/sécurité existantes ; préserver l'isolation et le payload original au retry.

## Review Triage Log

| Itération / retour | Verdict | Preuve et décision |
|---|---|---|
| 1 B1 | medium | `processAgentRun` attend directement `executeRun` ; le timer annule seulement son signal, sans interrompre une lecture précédant la boucle. `bad_spec`, frontière globale à préciser. |
| 1 B2 | medium | L'itérateur abandonné peut reprendre `createPendingAction` après le nettoyage du chat ; aucun contexte d'annulation ne protège cette transaction. `bad_spec`. |
| 1 B3 | medium | Les trois spécialistes ajoutent leurs IDs dans le callback transactionnel, avant commit, et vérifient leur longueur avant de lire les lignes. `patch`, à intégrer à la re-dérivation. |
| 1 B4 | medium | Le nettoyage ancien libère déjà le budget d'un worker tué, dont le cumul mémoire est perdu. `defer` : reprise durable et réconciliation après mort du processus relèvent de l'observation d'architecture exclue ; ne pas prétendre récupérer un usage jamais transmis au finaliseur. |
| 1 B5 | medium | Aucun journal durable ne permet de rejouer l'écriture d'usage après indisponibilité de la base ; la réservation conservatrice reste bloquée. `defer` : réconciliation durable préexistante, hors des huit défauts et explicitement séparée dans l'audit. |
| 1 B6 | high | L'agrégat ignore `UsageReservation` expirée même si son finaliseur a échoué. Le contrat de réservation du chat serait violé. `bad_spec`. |
| 1 B7 | medium | `proposeLaunch` valide la longueur nettoyée, `cleanPlanLaunchExtras` vérifie la longueur brute ; une consigne acceptée peut disparaître. `patch`, re-dérivation. |
| 1 B8 | medium | La route de chat remplace `AgentRunLimitError` par le texte générique d'indisponibilité dans ses deux branches. `patch`, re-dérivation. |
| 1 B9 | medium | Le suivi d'un run échoué n'offre pas de lien résultat ni de compte partiel ; les productions restent accessibles dans les décisions/diagnostic. `defer` : ergonomie des échecs partiels préexistante ; l'arrêt explicite et la conservation à relire restent exigés dans ce lot. |
| 1 B10 | medium | `BetaToolRunner` émet l'assistant puis exécute ses outils à la reprise ; jeter l'erreur avant `next()` abandonne donc les outils du dernier tour payé. `bad_spec`, préciser la frontière de nouveau tour. |
| 1 E1 | medium | Même perte démontrée de texte entouré d'espaces que B7. Groupe normalisation, `patch` à intégrer à la re-dérivation. |
| 1 E2 | medium | `withAgentRunWrite` retourne directement la promesse du callback ; une échéance dépassée pendant ce callback n'est pas revérifiée avant commit. `bad_spec`, même frontière d'annulation que B2. |
| 1 E3 | medium | Même transaction de carte sans annulation que B2, libérée après le nettoyage des cartes orphelines. `bad_spec`, même groupe. |
| 1 E4 | medium | Même liste d'IDs alimentée avant commit que B3. Groupe succès prouvé par persistance, `patch` à intégrer à la re-dérivation. |
| 1 V1 | medium | Pré-vérifié : le scénario d'ancien worker lance une erreur avant la finalisation du plan ; il ne couvre pas un retour normal devenu obsolète. `patch`, ajouter le scénario demandé. |
| 1 V2 | medium | Pré-vérifié : les tests de boucle injectent leur comptabilité, les tests de Paul s'arrêtent à la construction du runner. `patch`, vérifier ses vrais appels et réservations dans les deux modes. |
| 1 V3 | medium | Pré-vérifié : les tests de garde n'invoquent pas l'outil prospect avec échéance expirée ou signal annulé. `patch`, couvrir zéro proposition et zéro lead. |

## Design Notes

Aucun arbitrage produit ouvert. Verrouiller la ligne du run et vérifier la tentative dans la transaction métier ; un contrôle séparé serait insuffisant. Branche prévue : `codex/fix-agent-orchestration`, notes locales préservées. Lot libre, sans modifier les stories 4.1/4.2. Seule évolution de schéma prévue : paramètres de lancement ; aucune application en production.

## Verification

- Lint, build, `test:delegation`, `test:voice` : succès.
- Migration et cohérence Prisma sur PostgreSQL jetable.
- `test:engine`, `test:security` : serveur contrôlé, modèle simulé, base locale isolée ; documenter toute indisponibilité.
- Revues BMAD indépendantes, triage et vérifications après corrections.
- Wiki strict : `node scripts/build-wiki.cjs node_modules/.cache/agent-audit-db/wiki-check --strict` ; liens du rapport d'audit portables.

### Environnement de vérification local disponible

PostgreSQL jetable tourne sur `127.0.0.1:55433`, base `agent_audit`, utilisateur `audit`, authentification trust limitée à la boucle locale. Toutes les migrations ont été appliquées. Le lanceur ignoré `node_modules/.cache/agent-audit-db/run.mjs` injecte la base de test, les secrets factices, `ANTHROPIC_API_KEY` vide et un fournisseur local injoignable ; l'utiliser pour les tests qui simulent le modèle et pour ne pas charger les secrets réels. Commande moteur : `node node_modules/.cache/agent-audit-db/run.mjs node_modules/@playwright/test/cli.js test tests/engine.spec.ts --workers=1 --tsconfig=tsconfig.json` avec `NODE_OPTIONS=--require=C:/Users/Utilisateur/Pepito/node_modules/.cache/agent-audit-db/aliases.cjs` pour les alias Windows. Les connexions locales demandent l'exécution hors sandbox dans cet environnement. Ne pas ajouter de dépendance au projet, ne pas utiliser de service distant ni modifier les notes locales de l'utilisateur.
