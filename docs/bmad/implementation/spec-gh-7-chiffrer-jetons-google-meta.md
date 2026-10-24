---
title: 'US #7 — Chiffrer les jetons Google et Meta'
type: 'feature'
created: '2026-10-24'
status: 'in-review'
route: 'dispatch'
baseline_commit: '805914999cb67d74720e232a6b15bb0be7d6480f'
review_loop_iteration: 0
context:
  - 'docs/oauth-setup.md'
  - 'docs/github-tracking.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Google Business Profile stocke ses jetons OAuth en clair et peut journaliser le corps brut d'erreur. Meta chiffre déjà les jetons, mais d'anciennes lignes en clair subsistent et la rotation n'est pas documentée.

**Approach:** Chiffrer Google avec une clé dédiée et le `companyId` comme AAD, préserver les jetons GBP existants par chiffrement contrôlé, purger les anciennes lignes Meta en clair et filtrer les erreurs OAuth. Documenter configuration, rotation et retour arrière sans changer Gmail.

**Décisions produit:** Chiffrer en place les jetons GBP existants; purger les anciennes lignes Facebook/Instagram en clair, désormais illisibles par le code, et demander une réautorisation si nécessaire. Pour la rotation, retirer les connexions, remplacer la clé puis réautoriser. Tester le rollback transactionnel sur une base fictive; ne jamais remettre des jetons en clair en production. Les backups existants expirent selon la rétention de l'hébergeur.

**Always:** Jetons côté serveur, clé dédiée par fournisseur, chiffrement authentifié lié au `companyId`. Erreur, altération ou mauvais propriétaire ne devient jamais une connexion valide. Les logs et messages ne contiennent ni jeton, ni secret, ni corps fournisseur brut.

**Never:** Ne pas réutiliser `OAUTH_TOKEN_ENCRYPTION_KEY`, ne pas réintroduire de jetons en clair pour permettre un rollback, ne pas modifier la clé Gmail, ni changer les permissions ou activer de nouveaux flux OAuth.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Callback GBP | Jetons OAuth reçus | Chiffrer access/refresh avant stockage | Configuration absente: aucun stockage, erreur filtrée |
| Legacy / ciphertext invalide | Ancienne valeur Meta ou enveloppe altérée | Purger legacy; refuser le déchiffrement invalide | Exiger réautorisation; pas d'appel fournisseur |
| Mauvais propriétaire | Enveloppe créée pour un autre `companyId` | Refuser le déchiffrement | État erreur non sensible |
| Erreur fournisseur | Réponse OAuth non-2xx | Réponse et logs filtrés | Catégorie sûre uniquement |

</frozen-after-approval>

## Code Map

- `src/lib/oauth/meta.ts` -- format Meta `v1`, AES-256-GCM/AAD `facebook:<companyId>`; erreurs déjà filtrées.
- `src/app/api/oauth/meta/callback/route.ts` -- Meta est chiffré avant upsert; ancien plaintext non lu mais conservé.
- `src/lib/oauth/google.ts` et `src/app/api/oauth/google/callback/route.ts` -- échange OAuth, exigence de clé, chiffrement avant upsert et filtrage des erreurs.
- `src/lib/account-deletion.ts` -- déchiffrer GBP côté serveur avant révocation; ne pas toucher au flux Gmail.
- `tests/facebook.spec.ts` -- tests unitaires de crypto/migration, redaction des erreurs et fixture DB locale; exécuté par `test:facebook` en CI.
- `prisma/schema.prisma` -- `ChannelConnection` accepte les enveloppes dans ses colonnes texte; migration SQL non présumée.
- `docs/oauth-setup.md` -- documenter clé, purge, rotation et rétention des backups.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/oauth/google-token.ts`, `src/app/api/oauth/google/callback/route.ts` et `src/lib/account-deletion.ts` -- chiffrement/déchiffrement GBP par entreprise; config refuse l'OAuth sans clé dédiée; erreurs fournisseur filtrées.
- [x] `scripts/migrate-oauth-token-encryption.cjs` -- dry-run par défaut, chiffrement GBP en place, purge legacy Meta/Instagram, purge GBP explicite pour rotation; garde de cible, sauvegarde et transaction.
- [x] `tests/facebook.spec.ts` -- chiffrement/tenant binding/tampering, erreur Google filtrée, plan de migration, garde remote et test PostgreSQL local protégé.
- [x] `docs/oauth-setup.md` -- clé dédiée, ordre opératoire, migration, rotation/réautorisation et limites de rétention des backups.

**Acceptance Criteria:**
- Étant donné un callback GBP valide, quand les jetons sont enregistrés, alors access et refresh sont chiffrés et liés à leur entreprise.
- Étant donné une enveloppe altérée ou appartenant à une autre entreprise, quand elle est déchiffrée, alors elle est refusée et n'est jamais envoyée au fournisseur.
- Étant donné une erreur OAuth fournisseur, quand le callback échoue, alors le corps de réponse et les identifiants n'apparaissent pas dans les logs.
- Étant donné des lignes historiques, quand la migration s'exécute, alors GBP est chiffré en place et l'ancien plaintext Meta est purgé; une fixture prouve le rollback transactionnel sans écriture en production.
- Étant donné une rotation, quand la clé d'un fournisseur change, alors seules ses connexions exigent une réautorisation; Gmail reste inchangé.

## Implementation Notes

- Les callbacks Google écrivent désormais les jetons dans l'enveloppe AES-256-GCM liée à `google_business_profile:<companyId>`; la révocation de suppression déchiffre côté serveur.
- Lors d'une réautorisation sans nouveau refresh token, le callback conserve une enveloppe existante après vérification ou chiffre l'ancienne valeur legacy; une enveloppe invalide fait échouer l'écriture.
- Le script de migration n'est pas exécuté ici. Il exige explicitement `--apply` et la confirmation `BACKUP_VERIFIED`; toute cible distante exige le nom de base exact et `--allow-remote`; il refuse l'environnement Vercel Production. La purge GBP de rotation exige aussi la confirmation `GOOGLE_ACCESS_REVOKED` après révocation par le propriétaire chez Google.
- Aucun secret réel, fournisseur OAuth ou base distante n'a été utilisé.

## Spec Change Log

## Review Triage Log

| Finding | Verdict / route | Evidence |
|---|---|---|
| Blind 1 — diagnostic clé absente/invalide trop générique | patch | `googleOAuthConfigurationError()` distingue les trois variables absentes et le format de clé invalide; la route start renvoie le diagnostic sans valeur secrète. |
| Blind 2 — regex d'enveloppe dupliquée | patch | Le script de migration utilise `isEncryptedTokenEnvelope()` du helper partagé pour Google, Facebook et Instagram. |
| Blind 3 — reprise de rotation interrompue non décrite | patch | `docs/oauth-setup.md` précise l'état après purge, garde de clé courante et reprise par réautorisation; migration DB atomique. |
| Blind 4 — erreur de fermeture du client PG avalée | patch | Le test d'intégration suit `clientConnected`, attend `client.end()` sans catch silencieux et nettoie Prisma dans un `finally` imbriqué. |
| Blind 5 — erreur de déchiffrement sans diagnostic | false | La révocation GBP retourne explicitement `non_revoque` et journalise une catégorie sûre (clé indisponible ou enveloppe invalide); GCM ne permet pas de distinguer fiablement corruption, mauvais propriétaire et altération. |
| Blind 6 — refresh absent non testé | patch | Le test vérifie l'omission du champ `refreshToken` quand Google n'en renvoie pas, ce qui évite d'écraser une valeur récente et préserve le comportement Prisma d'update partiel. |
| Blind 7 — normalisation SSL inexpliquée | patch | `normalizeDatabaseUrl()` précise qu'elle reprend la politique existante de `src/lib/database-url.ts`. |
| Blind 8 — clé vérifiée après connexion DB | false | `main()` contrôle `isGoogleTokenEncryptionConfigured()` avant de construire/connecter le client PG et avant toute transaction. |
| Blind 9 — callback sans guidance d'opérateur | false | Le démarrage signale les noms des variables à vérifier; le callback conserve un message/log générique afin de ne pas divulguer le corps OAuth. |
| Edge 1 — expires_in absent pourrait être stocké comme Invalid Date | false | La valeur de date est validée par Prisma avant l'upsert; une date invalide fait échouer l'opération, capturée par le callback, donc aucune ligne invalide n'est enregistrée. Le calcul est préexistant. |
| Edge 2 — payload chiffré incomplet | false | `encryptGoogleConnectionTokens()` produit toujours l'access token ou lève; le callback réutilise son résultat et le test vérifie les champs persistés. |
| Edge 3 — callbacks concurrents écrasant un refresh plus récent | patch | Le préchargement du refresh a été supprimé; sans nouveau refresh, l'upsert omet le champ plutôt que de réécrire une valeur lue avant la course. |
| Edge 4 — état de révocation non montré après suppression | defer | Le rapport `revocations` est retourné par l'API, mais le composant de suppression redirige sans l'afficher; UX de suppression préexistante, hors #7. |
| Edge 5 — échange OAuth Google sans timeout explicite | defer | `exchangeGoogleCode()` conservait ce fetch avant #7; le code ne prétend pas qu'il n'existe pas. Revoir séparément délai/annulation et test réseau simulé. |
| Verification gap 1 — callback non testé jusqu'au stockage | patch | `handleGoogleOAuthCallback()` est testé avec échange simulé; le service `persistGoogleBusinessProfileConnection()` est couvert par une fixture PostgreSQL qui vérifie les jetons réellement stockés chiffrés. La fixture attend la CI. |
| Verification gap 2 — révocation GBP après déchiffrement non testée | patch | Test PostgreSQL ajouté: le jeton déchiffré est observé au faux endpoint Google; une enveloppe corrompue ne déclenche aucun appel et produit `non_revoque`. Exécution en CI requise. |
| Verification gap 3 — refus de start sans clé non testé en route | patch | Test de route ajouté avec session et entreprise fictives: clé invalide donne 503 et nomme la variable à corriger. Exécution en CI requise. |

## Verification

**Commands:**
- `npm run test:facebook` et tests GBP -- chiffrement, AAD, altération, purge, logs; aucun appel fournisseur réel.
- `npm run test:security`, `npm run test:ux`, `npm run lint`, `npm run build` -- succès sur les données fictives/DB jetable de CI.
- Validations locales exécutées: 4 tests Playwright ciblés GBP/Google/migration (succès), checks syntaxe Node (succès), diagnostics éditeur sur les fichiers touchés (aucune erreur), checks du plan transactionnel avec client simulé (succès).

**Manual checks:** Le test d'intégration PostgreSQL ajouté n'a pas été exécuté localement (aucun PostgreSQL local; dépendances incomplètes dans le dépôt principal); Checks CI doit le valider. Répéter migration et rollback transactionnel sur une base jetable; jamais sur Production. Ne pas mettre les clés ou jetons dans les Issues/logs.