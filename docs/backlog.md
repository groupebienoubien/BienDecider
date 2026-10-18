# Backlog MVP — rôle Business Analyst / CEO

## Suivi courant depuis le 2026-10-10

**GitHub Issues est la source de vérité pour les US, responsables, priorités et statuts** : [US ouvertes](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Atype%3Aus). Répartition et mise à jour : [github-tracking.md](github-tracking.md).

Focus actuel demandé par les fondateurs : **domaine delegation en P1** ; état des 7 P1, dépendances et ordre de prise en charge dans [domaines.md](domaines.md#focus-actuel--délégation-p1). Les Issues restent la source de vérité des labels et affectations.

Tranche `del-5` livrée le 2026-10-10 : facteurs de risque déterministes par type, réglages globaux admin persistants avec plancher automatique, facteurs visibles, types inconnus élevés, garde serveur `Accompagner` sur site/Gmail ; aucune autonomie activée. Règles fondatrices, modes par entreprise et contrôles des autres connecteurs restent à livrer ; détail dans [domaines.md](domaines.md#tranche-del-5-livrée-le-2026-10-10).

## Point d'avancement du 2026-10-18

Ce point remplace les listes « En cours » du point du 14 octobre, plus bas, qui restent pour l'historique. GitHub Issues reste la source de vérité ; au 18 octobre, **143 US dont 24 fermées et 119 ouvertes** (répartition par domaine dans [domaines.md](domaines.md#carte-des-domaines)).

**Livré depuis le 14 octobre** (fusionné sur `main`) :
- **Sécurité** : [#198](https://github.com/groupebienoubien/BienDecider/pull/198) limite des tentatives par adresse IP et compteur d'échecs atomique (US #66 fermée) ; [#199](https://github.com/groupebienoubien/BienDecider/pull/199) type et longueur vérifiés sur les routes API (US #67 fermée) ; [#200](https://github.com/groupebienoubien/BienDecider/pull/200) suppression du compte et des données depuis « Mon entreprise », avec révocation Google et Meta au mieux (US #68 fermée, recette sur le prototype à faire ; LinkedIn sans révocation côté fournisseur, sauvegardes de la base non purgées). [#166](https://github.com/groupebienoubien/BienDecider/pull/166) expiration et révocation des sessions (US #65 fermée).
- **Moteur et plateforme** : [#186](https://github.com/groupebienoubien/BienDecider/pull/186) agents exécutés en tâche de fond avec plafonds par entreprise (US #77 et #71 fermées ; #78, le double lancement, reste ouverte) ; [#194](https://github.com/groupebienoubien/BienDecider/pull/194) échec d'une exécution rendu atomique ; [#187](https://github.com/groupebienoubien/BienDecider/pull/187) mode SSL PostgreSQL explicite.
- **Connecteurs** : [#184](https://github.com/groupebienoubien/BienDecider/pull/184) et [#185](https://github.com/groupebienoubien/BienDecider/pull/185) publication d'une production approuvée sur la Page Facebook connectée, recettée en production le 2026-10-15. #9 et #11 restent ouvertes : compte Instagram, reprise d'un résultat incertain, ouverture à d'autres comptes. [#188](https://github.com/groupebienoubien/BienDecider/pull/188) capacités honnêtes par canal (US #174 fermée).
- **Expérience dirigeant** : [#183](https://github.com/groupebienoubien/BienDecider/pull/183) brouillon sans approbation et version précise approuvée (US #171 fermée) ; [#189](https://github.com/groupebienoubien/BienDecider/pull/189) et [#190](https://github.com/groupebienoubien/BienDecider/pull/190) confidentialité exacte (US #175 fermée) et tranches de #173, #176, #170, #95, #178, #97, #177, #92, #101 ; [#191](https://github.com/groupebienoubien/BienDecider/pull/191) avancement d'un agent (US #91 fermée) ; [#193](https://github.com/groupebienoubien/BienDecider/pull/193) vérifier un prospect et déclarer le contact réel (US #180 fermée) ; [#197](https://github.com/groupebienoubien/BienDecider/pull/197) points à vérifier avant diffusion (tranche de #179) ; [#182](https://github.com/groupebienoubien/BienDecider/pull/182) refonte de l'accueil (tranche de #86).
- **Paul** : [#192](https://github.com/groupebienoubien/BienDecider/pull/192) discussion accessible de toutes les pages, qui connaît la page et l'élément consulté ; [#196](https://github.com/groupebienoubien/BienDecider/pull/196) liens vers les objets cités, résolus côté serveur ; [#201](https://github.com/groupebienoubien/BienDecider/pull/201) réponse affichée au fil de l'eau, dictée, lecture à voix haute et échange vocal mains libres. La voix n'est dans les critères d'aucune US : elle s'appuie sur l'API Web Speech du navigateur, l'audio de la dictée est traité par le service vocal du navigateur (politique de confidentialité mise à jour, à faire valider avec le DPO) et une recette manuelle sur Chrome et Safari reste à faire.

**Reste ouvert d'après les PR** (le détail fait foi dans chaque Issue) : #92 email quand un agent a terminé ; #102 conserver la référence de l'élément après changement de page ; #103 rendu Markdown, distinction « envoyer un message » et « enregistrer une préférence », résumé d'état actuel ; #173 aide et erreur reliées à chaque champ du brief ; #176 résultat commercial séparé et objets historiques sans lien ; #170 bouton « Examiner » dédié, retour du focus et position de liste.

**À fermer après recette** (aucune n'a été fermée sans confirmation du responsable) : #22, #93, #96, #98 et #148 en `status:review` avec recette prototype annoncée ; #79 et #81 en `status:review`.

**Hygiène du suivi** : les labels `status:*` ont été retirés des 24 US fermées, conformément à [github-tracking.md](github-tracking.md). Restent à traiter par les responsables : #39, #106 et #179 sont `status:in-progress` sans responsable ; les 16 US ouvertes du catalogue initial (#2, #4 à #18) n'ont pas de label `domaine:*`.

## Point d'avancement du 2026-10-14

**Livré depuis le 13 octobre** (fusionné sur `main`) :
- [#165](https://github.com/groupebienoubien/BienDecider/pull/165) : décider au téléphone d'une main, US #99 fermée.
- [#162](https://github.com/groupebienoubien/BienDecider/pull/162) : connexion d'une Page Facebook choisie et vérifiée, jetons chiffrés. #9 reste ouverte : publication Meta et recette fournisseur non livrées.
- [#161](https://github.com/groupebienoubien/BienDecider/pull/161) : guidance des écrans vides ; #98 reste ouverte pour le relevé.
- [#153](https://github.com/groupebienoubien/BienDecider/pull/153) à [#160](https://github.com/groupebienoubien/BienDecider/pull/160) : connexion sécurisée du profil LinkedIn (US #148) et correctifs du callback OIDC.
- [#163](https://github.com/groupebienoubien/BienDecider/pull/163), [#164](https://github.com/groupebienoubien/BienDecider/pull/164) : mises à jour de dépendances.

**En cours** : PR [#166](https://github.com/groupebienoubien/BienDecider/pull/166) expiration et révocation des sessions (#65) ; #147 application LinkedIn ; #20 objectif en langage naturel ; #5 Gmail ; #9 Meta ; #39 risque par action. Les assignations font foi dans GitHub.

**Audit UX/UI V0 du 13 octobre** : 20 constats en lecture seule (PDF de 30 pages, non versionné car il contient des captures du compte). Challenge et 25 fiches UX-01 à UX-25 dans [audit-ux-backlog.md](audit-ux-backlog.md). Arbitrage du 14 octobre et mise à jour des Issues :
- Décisions : la vitrine est **servie directement, sans iframe**, comme le demande #45, et l'anomalie d'ancre UX-06 y est rattachée ; UX-19 devient une **Issue séparée** de #39 ; UX-22 **enrichit #155**.
- 14 nouvelles US, toutes en `status:backlog`, sans responsable :
  - P1 : #168 diagnostic courant (UX-01), #169 correction et provenance (UX-02), #170 examiner avant de décider (UX-03), #171 brouillon et version approuvée (UX-04), #172 publier le site prévisualisé (UX-05), #173 labels de formulaires (UX-07), #174 qui fait quoi par canal (UX-09), #175 traitement des données (UX-11), #176 décidé, réalisé, mesuré (UX-12), #179 quoi vérifier avant diffusion (UX-19).
  - P2 : #177 file groupée par action (UX-14), #178 première décision sur mobile (UX-15), #180 prospect réellement suivi (UX-20, #46 garde Gmail).
  - P3 : #181 navigation par tâche (UX-23), après les observations de #100.
- 15 Issues existantes complétées par une section « Complément audit UX du 2026-10-14 » : #45 (UX-06), #155 (UX-22), #95 (UX-08), #94 et #97 (grammaire visuelle et états communs), #2 (UX-10), #78 (UX-13), #86 (UX-16), #24 (UX-17), #102, #103 et #106 (UX-18), #16 (UX-21), #107 (UX-24), #100 (UX-25). Commentaire sur #39 vers #179.
- Les parcours que l'audit n'a pas testés (premier onboarding, confirmations de publication, envoi Gmail, retours OAuth, erreurs serveur) sont ajoutés au protocole de #100.

Ce document conserve l'historique et les décisions. Les cases ci-dessous reflètent leur date de rédaction ; ne pas les maintenir en parallèle du statut des Issues. Le catalogue initial [github-backlog.json](github-backlog.json) importe uniquement les US de travail restant, sans recréer toutes les livraisons passées. Les changements de statut se font dans GitHub, l'import ne les écrase pas.

Délégation prototype (décision du 2026-10-10) : fusion autonome traçable après **4 secondes** sans réponse à la demande de relecture, ou indisponibilité annoncée, pour **tous les niveaux de risque**, y compris sécurité, données, envoi externe et CI/protections. PR et CI toujours obligatoires ; relecture différée et risques documentés. Voir [ci-cd.md](ci-cd.md). Les garde-fous des actions métier et la coordination des modifications de base restent inchangés.

Source : cahier des charges proposé par un tiers (OpenAI), challengé et ajusté le 2026-10-05.
Décision CEO actée : garder l'esprit ("équipe virtuelle IA qui agit, pas qui conseille") sans construire la plateforme complète proposée — cf. [process-build-agentique.md](process-build-agentique.md) pour l'historique des décisions.

## Décision du 2026-10-09 : BienDecider

Le nom public devient **BienDecider**, domaine cible **https://www.biendecider.com** (HTTPS, pas HTTP). Depuis le 2026-10-11, le dépôt GitHub est `groupebienoubien/BienDecider` et le projet Vercel `bien-decider`. Les mentions Pepito/Pépito ci-dessous appartiennent à l'historique du produit.

- [x] Nom remplacé dans la landing, la connexion, la navigation, les pages métier et les documents légaux.
- [x] Métadonnées de marque et de partage configurées, langue française, base des URL publiques sur `https://www.biendecider.com`.
- [x] Prompts actifs des quatre agents mis à jour. Pas de réécriture des productions ou conversations historiques.
- [x] Contact public `contact@biendecider.com` ajouté aux liens de contact et aux documents légaux ; Gmail personnel non exposé dans l'interface ni consigné dans le dépôt.
- [x] Dépôt/package/cookies inchangés : aucune migration de base, aucune rupture technique liée au renommage.
- [x] Domaine configuré et `www.biendecider.com` opérationnel sur Vercel, confirmé par le CEO le 2026-10-09. Vérifier séparément la redirection du domaine nu et la conservation des chemins.
- [x] Bascule DNS web déclarée réalisée par le CEO après le premier contrôle OVH du 2026-10-09. Conserver les MX/TXT de messagerie ; une résolution DNS ne confirme pas la redirection email.
- [ ] Créer la redirection OVH `contact@biendecider.com` vers le Gmail indiqué par le CEO, puis tester la réception depuis une autre adresse (inbox et spam). Configuration externe, pas une route Next.js.
- [ ] Mettre à jour les écrans de consentement Google/Meta (BienDecider), domaine autorisé, URLs légales et callbacks exacts du nouveau domaine. Reconnexion nécessaire sur le nouveau domaine.
- [ ] Vérifier HTTPS, domaine nu/www, connexion, publication d'un site et réception des demandes de contact avant d'annoncer le domaine actif.

Procédure : [domain-email-setup.md](domain-email-setup.md). La redirection entrante ne configure ni l'envoi automatique des rapports ni la prospection sortante ; ces chantiers restent séparés. Les brouillons légaux restent à compléter et à faire valider.

## Priorité OAuth / Meta du 2026-10-09

### Gmail manuel : flux distinct livré le 2026-10-09

Usage confirmé par le CEO : envoyer des emails depuis Gmail. Callback `/api/oauth/gmail/callback`, variables `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, clé serveur dédiée `OAUTH_TOKEN_ENCRYPTION_KEY`. Ce n'est ni GBP, ni l'authentification Google et ce flux n'est pas soumis à l'ancienneté GBP.

- [x] Autorisation Gmail send-only avec PKCE/state, contrôle du scope accordé, jetons chiffrés AES-256-GCM par entreprise et renouvellement avant envoi.
- [x] Formulaire d'envoi manuel confirmé dans Connexions, validation MIME, origine contrôlée, identifiant unique contre les doubles envois, historique et résultat incertain signalé.
- [x] Déconnexion : révocation tentée + effacement local, message explicite si retrait Google non confirmé.
- [x] Tests locaux chiffrement/scope/MIME et gardes OAuth/envoi sans appel Google ; documentation et confidentialité mises à jour.
- [ ] Remplacer le secret partagé dans le chat, configurer les trois variables directement dans Vercel, activer Gmail API et `gmail.send`, ajouter utilisateurs test et redéployer. Aucun secret stocké par l'agent.
- [ ] Vérifier le consentement et un premier envoi réel avec le nouveau secret ; compléter la vérification OAuth de production avant ouverture externe.
- [ ] Brancher séparément rapports/prospection après décision produit, conformité et tests ; aucun envoi automatique activé par cette livraison.

Le chiffrement/renouvellement/déconnexion ci-dessus concerne **Gmail uniquement**. Les tâches GBP/Meta qui suivent restent nécessaires. Procédure complète : [oauth-setup.md](oauth-setup.md).

**État Google déclaré** : compte Gmail, fiche Business Profile créée/vérifiée, projet Cloud BienDecider **`915822663727`** créé. La fiche actuelle a moins de 60 jours ; suspendre la demande GBP jusqu'à éligibilité, sans inventer de date (date de vérification/activité à renseigner). Google autorise aussi une fiche cliente gérée par le demandeur si elle est vérifiée, active 60+ jours et comporte le site de l'entreprise. La règle des 60 jours est un prérequis de candidature, pas la garantie que tout le reste est prêt.

### Maintenant : dossier public et préparation externe

- [x] Homepage explicative, confidentialité et CGU accessibles depuis l'accueil : pages déjà livrées, pas à recréer.
- [x] Confidentialité complétée avec portée Google/Meta, jetons stockés par entreprise, absence d'envoi des jetons à Anthropic, limites de sécurité et procédure actuelle de retrait/suppression. Aucun engagement de fonctionnalité non implémentée.
- [ ] Compléter identité légale, base légale et durées de conservation ; revue juriste/DPO ; ne pas masquer le statut de brouillon pour obtenir une validation fournisseur.
- [ ] Tester la réception réelle de `contact@biendecider.com`, vérifier l'adresse de support sélectionnable chez Google (une redirection seule peut ne pas suffire).
- [ ] Finaliser logo BienDecider et icône de dossier Meta 1024 × 1024, puis reporter dans les consoles. Le nom textuel livré n'est pas un logo final.
- [ ] Vérifier la propriété de `biendecider.com` pour Google OAuth ; préparer branding, audience External, URLs publiques, utilisateurs test et client web.
- [ ] Créer/relier Meta Business Portfolio et app BienDecider ; effectuer Business Verification selon les exigences Meta.
- [x] Architecture Instagram retenue pour la V1 : **Facebook Login**, cohérent avec Facebook + Instagram professionnel lié à une Page. Pas de second flux Instagram Login simultané.
- [ ] Préparer le dossier **Tech Provider / Advanced Access / App Review** : justifications par permission, compte test et vidéo d'un usage réel. Ne pas demander des permissions que l'app ne sait pas démontrer.

### Code : prérequis à l'ouverture OAuth aux entreprises externes

- [x] `/connexions` distingue autorisation enregistrée, expirée, erreur et absence d'autorisation ; ne dit plus « Connecté » sur la seule présence d'un jeton. Publication Google/Meta explicitement indisponible.
- [ ] Chiffrer access/refresh tokens au repos avec clé serveur dédiée, migration contrôlée et rotation ; ne pas envoyer les tokens au client ou aux logs. Remplacer les logs d'exception OAuth bruts par des erreurs filtrées.
- [ ] Renouveler les jetons selon chaque fournisseur, préserver le refresh token Google lors d'une réautorisation sans nouveau refresh token, gérer révocation/expiration/refus et éviter les renouvellements concurrents. En Google Testing, autorisation et refresh token expirent après 7 jours pour ces scopes : renouveler l'access token ne contourne pas cette limite.
- [ ] Vérifier les permissions accordées ; lister/sélectionner comptes GBP, établissements et Pages Meta ; récupérer un jeton de Page et identifier le compte Instagram lié. Persister les IDs de ressources et leur association à l'entreprise. Ne pas déclarer deux canaux connectés à partir du même jeton utilisateur non vérifié.
- [ ] Compléter les états réels connexion en cours / connecté après vérification / erreur / réautoriser / déconnecter, avec révocation fournisseur et effacement local isolés par entreprise. Tester refus OAuth, CSRF, expiration, retrait et accès croisés.
- [ ] Valider scopes et version Graph Meta sur un compte test : divergence entre `instagram_content_publish` utilisé et `instagram_content_publishing` cité dans la documentation App Review actuelle ; vérifier le contrat avant modification/activation et les permissions dépendantes.
- [ ] Implémenter publication validée Google/Meta, tracer les résultats sans secrets, puis fournir une vidéo de bout en bout à la review. L'autorisation OAuth seule ne démontre pas la publication.

### Google : après éligibilité de la fiche

1. Demande **Application for Basic API Access**, Project Number **`915822663727`**, depuis un compte owner/manager de la fiche.
2. Attendre l'approbation ; quotas GBP **0 QPM = non approuvé**, **300 QPM = approuvé** selon Google.
3. Activer les APIs GBP conformément à Basic setup ; configurer le scope `business.manage`, le callback web et les variables Production sur Vercel ; redéployer.
4. Vérifier l'accès effectif à la fiche du compte test, puis l'exécution validée. Distinguer approbation API GBP et vérification OAuth de production.

Procédure et sources : [oauth-setup.md](oauth-setup.md). Ordre : socle légal/support/logo → préparation Meta → sécurité et sélection des comptes → exécution démontrable → review. Les agents continuent à produire des propositions pendant l'attente Google.

## Parcours livré le 2026-10-07

Diagnostic (`/diagnostic`) → plan (`/dashboard`) → file unique de validation (`/dashboard?view=validation`) → résultats (`/rapport`). Équipe conserve les rôles et demandes ponctuelles ; les analyses et validations n'y sont plus dupliquées. Historique accessible dans Aujourd'hui ; un site approuvé reste à publier dans la file. Tests UX desktop/mobile livrés (`npm run test:ux`). Cette organisation remplace les descriptions des anciennes vues ci-dessous.

## KPI MVP (nouveau, retenu du cahier des charges tiers)

> Est-ce que le dirigeant considère que Pépito a réellement travaillé pour son entreprise et veut continuer à l'utiliser/payer ?

Tout ajout au backlog doit se justifier par rapport à ce KPI, pas par exhaustivité fonctionnelle.

## Équipe actuelle (rationalisée le 2026-10-05, cf. section dédiée ci-dessous)

- **Paul** — Co-CEO, point de contact, orchestre les autres agents et produit un plan d'action priorisé
- **Martine** — Marketing Officer : audit, positionnement concurrentiel (`web_fetch`/`web_search`), pilotage de la fiche Google (infos, avis) — fusion de l'ancienne Nadia (Audit) et du pilotage Google de l'ancienne Camille
- **Camille** — Contenu & Site : posts réseaux sociaux et contenu/génération de site, à partir des constats de Martine — recentrée sur la production créative
- **Jean-Claude** — Démarchage : pistes de croissance publiques + templates de prospection générique (inchangé)

## Déjà livré

- Landing page, login minimal (email, cookie de session), onboarding, dashboard, navigation
- Objectif business à l'onboarding, injecté dans tous les prompts agents
- Avatars illustratifs par agent, icône propre à chaque rôle (pas de photos de personnes réelles — cf. note ci-dessous)
- Page "Connexions" : statut par canal (Google Business Profile, Instagram, Facebook), bouton honnête "bientôt — OAuth" plutôt qu'un faux bouton fonctionnel
- Garde-fou commun : validation humaine obligatoire avant toute exécution réelle (niveau d'autonomie 1 = "Assistant")
- Correctif critique (2026-10-05) : Paul affirmait parfois qu'une action avait été faite sans l'avoir réellement déclenchée (hallucination détectée via un test utilisateur réel). Corrigé par un outil `get_current_status` obligatoire avant toute affirmation sur l'état des propositions/audits — revérifié sur le scénario exact qui l'avait révélé.
- Objectif business à l'onboarding, injecté dans tous les prompts agents
- Avatars illustratifs par agent (pas de photos de personnes réelles — cf. note ci-dessous)
- Page "Connexions" : statut par canal (Google Business Profile, Instagram, Facebook), bouton honnête "bientôt — OAuth" plutôt qu'un faux bouton fonctionnel
- Garde-fou commun : validation humaine obligatoire avant toute exécution réelle (niveau d'autonomie 1 = "Assistant")
- Correctif critique (2026-10-05) : Paul affirmait parfois qu'une action avait été faite sans l'avoir réellement déclenchée (hallucination détectée via un test utilisateur réel). Corrigé par un outil `get_current_status` obligatoire avant toute affirmation sur l'état des propositions/audits — revérifié sur le scénario exact qui l'avait révélé.
- Correctif critique (2026-10-05) : échec silencieux de Jean-Claude (démarchage) et Camille (contenu) — un run pouvait consommer des tokens sans produire aucune proposition, sans aucun avertissement (l'action passait en "Terminée" comme un succès). Cause : `max_tokens` trop bas (4000) pour des agents multi-outils (web_search + plusieurs propositions). Corrigé en augmentant `max_tokens` (8000 démarchage/marketing, 6000 contenu) et en levant une erreur explicite propagée jusqu'à l'UI si 0 proposition créée. Dashboard revu en même temps : les actions "Terminée" restent visibles dans la liste principale (seules les actions écartées par l'utilisateur sont masquées derrière un repli) — corrige la perte de repère signalée ("je suis un peu perdu dès que je valide une action").
- Correctif critique (2026-10-05) : coût/usage de tokens sous-estimé dans `/admin` par rapport à la consommation réelle du crédit API Anthropic (signalé par le CEO). Cause racine : `await anthropic.beta.messages.toolRunner({...})` ne résout qu'au dernier tour d'une boucle d'outils multi-tours (confirmé en lisant le SDK, `BetaToolRunner.js`) — un agent qui fait plusieurs allers-retours (web_search, plusieurs propositions, génération de plan à 4-5 items) était facturé par Anthropic sur tous les tours mais seul le dernier était comptabilisé. Sous-comptage mesuré sur un cas contrôlé à 5 tours : x4 en tokens d'entrée, x11 en tokens de sortie. Corrigé par `runToolLoop()` ([src/lib/usage.ts](../src/lib/usage.ts)) qui itère la boucle et somme l'usage de chaque tour, appliqué aux 5 points d'appel agents (Martine, Camille, Jean-Claude, Paul×2). Revérifié en conditions réelles : génération d'un plan à 4 actions par Paul → 4344 tokens d'entrée / 1946 de sortie enregistrés (cohérent avec un run multi-tours, contre un chiffre très inférieur avant correctif).
- Optimisation (2026-10-05, demande CEO) : challenge d'une stratégie de répartition par modèle (Haiku pour le mécanique, Sonnet pour le reste) + prompt caching.
  - **Répartition par modèle — pas de changement.** Les 6 points d'appel réels (Martine, Camille, Jean-Claude, Paul×2, publication de site) sont tous soit des agents à outils (web_search/web_fetch + propositions), soit de la génération de contenu/plan métier — dans la grille proposée par le CEO lui-même, les deux relèvent de Sonnet 5.5, pas du niveau "mécanique" (classification, extraction, reformattage) qui justifierait Haiku. Aucune tâche mécanique isolée n'existe aujourd'hui dans le code ; en créer une artificiellement (ex: un routeur d'intention séparé avant Paul) ajouterait un appel, de la latence et de la complexité pour un gain non démontré — écarté tant qu'un vrai cas mécanique n'apparaît pas.
  - **Prompt caching — implémenté.** Chaque system prompt agent est scindé en un bloc stable (persona, profil entreprise, règles — ne change qu'en cas de modification des réglages) marqué `cache_control: ephemeral`, et un bloc dynamique (brief ponctuel, constats récents, état du plan) laissé hors cache car il change à chaque appel — l'ordre de rendu de l'API (`tools` -> `system` -> `messages`) fait que le cache couvre aussi les définitions d'outils. Le chat de Paul (`runCoCeoTurn`) met en cache tout son system (déjà 100% stable par entreprise, aucun état injecté — il utilise `get_current_status`) ainsi que la queue de conversation grandissante. La publication de site (`publish.ts`) est mise en cache à l'identique pour toutes les entreprises (system totalement générique). Vérifié empiriquement avec un appel réel en double : 577 tokens écrits en cache au 1er appel, intégralement relus (0 écriture, 577 lecture) au 2e. `runToolLoop()`/`recordUsage()` mis à jour pour intégrer le tarif différencié (écriture ~1.25x, lecture ~0.1x le prix d'entrée standard) dans `costUsd` — sans quoi l'ajout du caching aurait de nouveau faussé silencieusement le coût affiché en admin, le même type de bug que celui corrigé juste au-dessus.

## Backlog ajusté (ordre de priorité)

### 1. Objectif business à l'onboarding — ✅ livré (2026-10-05)
### 2. Personnification des agents — ✅ livré (2026-10-05)
### 2bis. Agent "Co-CEO" (Paul) — ✅ livré (2026-10-05, ajouté hors backlog initial à la demande du CEO)
Point de contact conversationnel unique, délègue aux 4 agents via function calling, jamais d'exécution directe. Historique persisté (`ChatMessage`) par entreprise.

### 2ter. Navigation et avatars — ✅ livré (2026-10-05)
Header de navigation commun (Dashboard / Connexions / Mon profil / Déconnexion) sur toutes les pages post-login. Avatars illustratifs (silhouette + couleur) par agent — **décision délibérée de ne pas utiliser de vraies photos de personnes** : Nadia/Camille/Martine/Jean-Claude/Paul sont des IA, pas des employés réels ; une photo réaliste serait trompeuse si elle apparaît un jour hors du dashboard (ex: dans un email envoyé en leur nom).

### 2quater. Connexions OAuth (Google/Instagram/Facebook) — ✅ code livré (2026-10-05), ⚠️ non fonctionnel sans démarche externe du CEO
Demande initiale reformulée pour raison de sécurité : **on ne collecte jamais le mot de passe de l'utilisateur** pour ces plateformes (interdit par leurs conditions d'utilisation, risque de fuite, aucune nécessité technique).
Livré : flux OAuth complet et fonctionnel une fois les identifiants fournis —
- `/api/oauth/google/start` + `/callback` (Google Business Profile), `/api/oauth/meta/start` + `/callback` (Facebook + Instagram), protection CSRF standard (state aléatoire en cookie, vérifié au retour).
- Jetons stockés dans `ChannelConnection` (accessToken/refreshToken/expiresAt). **TODO prod** : chiffrer au repos avant d'aller au-delà du pilote.
- Page `/connexions` honnête : si les variables d'environnement d'un provider sont absentes, le bouton reste désactivé avec le détail exact de ce qui manque (variables + étape d'enregistrement externe) ; sinon le vrai flux OAuth se déclenche.

**Ce qu'il reste à faire, et qui ne dépend que du CEO** (démarche externe, délai hors de notre contrôle) :
1. **Google** : créer un projet sur [Google Cloud Console](https://console.cloud.google.com/), activer la *Business Profile API*, configurer l'écran de consentement OAuth, créer des identifiants OAuth "application web" avec comme URI de redirection autorisée `<votre-domaine>/api/oauth/google/callback`. Renseigner `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET` dans `.env`.
2. **Meta** : créer une app sur [developers.facebook.com](https://developers.facebook.com/), ajouter Facebook Login, demander les permissions `pages_manage_posts` et `instagram_content_publish` (passage en **App Review Meta obligatoire** — délai de plusieurs jours à semaines, hors de notre contrôle). URI de redirection : `<votre-domaine>/api/oauth/meta/callback`. Renseigner `META_APP_ID` et `META_APP_SECRET`.
3. Une fois connecté : les agents produisent toujours des *propositions* (pas de changement du garde-fou) — l'étape suivante (hors scope de ce backlog) serait de brancher l'exécution réelle (appel API Google/Meta) une fois une proposition validée, ce qui n'est pas encore construit.

### 2quinquies. Paul "meneur" — plan d'action + rapport — ✅ livré (2026-10-05, demande CEO)
Demande CEO : "le Co-CEO doit être force de proposition et donner la direction : actions, pour quand, qui, où valider, puis un rapport."
- **Plan d'action** (`ActionPlanItem`, bouton "Générer / actualiser le plan") : Paul propose 3-5 actions priorisées, chacune avec agent responsable, titre, justification liée à l'objectif, et délai — affiché en tête du dashboard, pas noyé dans le chat. Chaque item a un bouton "Lancer" qui déclenche l'agent correspondant (même garde-fou : ça crée des propositions, jamais une exécution directe).
- **Rapport** (`/rapport`) : agrégation déterministe (pas d'appel LLM, pour ne pas réintroduire de risque d'hallucination) — actions validées/en attente/rejetées, dernier positionnement concurrentiel, dernières pistes de croissance.
- Testé en conditions réelles : plan de 5 actions cohérent généré pour un cas concret, item lancé avec succès, rapport reflète les chiffres réels.
- **Non fait** : envoi automatique du rapport par email (nécessite un fournisseur d'envoi configuré, cf. point 4 ci-dessous, toujours pas construit).

### 2quaterdecies. Sécurité P0 : session forgeable + force brute — ✅ corrigé (2026-10-05)
Faille critique trouvée en testant le déploiement de prod : le cookie de session stockait l'email **en clair, non vérifié**. N'importe qui pouvait forger `pepito_session=victime@email.com` à la main (curl, devtools) et accéder à n'importe quel compte sans jamais connaître le mot de passe — testé et confirmé en prod avant correction.
- **Cookie signé (HMAC-SHA256)** : `base64url(email).hmac(email)`, vérifié par comparaison à temps constant (`timingSafeEqual`) à chaque requête. Nécessite `SESSION_SECRET` (généré une fois, même valeur en local et sur Vercel — sinon les sessions existantes s'invalident).
- **Évolution #65 (2026-10-14)** : le format signé porte désormais une date d'expiration maximale de 30 jours et une version de session contrôlée en base ; déconnexion et changement de mot de passe révoquent les sessions. Cookie `Secure` en production. Le déploiement de ce nouveau format impose une reconnexion des sessions antérieures.
- **Anti-force-brute** : 5 échecs consécutifs verrouillent le compte 15 minutes (`Company.failedLoginAttempts`/`lockedUntil`, stocké en base pour rester valable entre plusieurs instances serverless — un compteur en mémoire ne l'aurait pas été).
- Testé en conditions réelles contre la base de prod : cookie en clair rejeté, cookie signature-altérée rejeté, 5 échecs → verrouillage effectif même avec le bon mot de passe ensuite, déverrouillage après le délai.

### 2terdecies. Déploiement, login réel, documents légaux — ✅ code livré (2026-10-05, demande CEO)
- **PostgreSQL** remplace SQLite partout (`prisma/schema.prisma` provider + `@prisma/adapter-pg`) — nécessaire pour tout hébergement serverless (Vercel). Pas de base locale testable depuis cet environnement sans que vous provisionniez une base réelle (Neon/Vercel Postgres) — voir README pour la démarche, zéro secret à partager en conséquence.
- **Déploiement Vercel documenté** (README) : connexion via l'intégration GitHub native de Vercel — **aucune clé API Vercel nécessaire**, zéro secret partagé. La base Postgres se crée en un clic dans l'onglet Storage de Vercel, qui injecte `DATABASE_URL` automatiquement. Chaque push redéploie automatiquement.
- **Admin laissé déverrouillé par défaut**, confirmé par le CEO malgré le risque documenté (visibilité croisée entre entreprises pilotes) — décision actée, pas oubliée.
- **Login par email + mot de passe** (hash scrypt natif Node, pas de dépendance externe) — remplace le login email-seul. Compte créé à la première connexion (mot de passe enregistré à cet instant) ; un compte existant sans mot de passe (créé avant cette fonctionnalité) accepte le premier mot de passe fourni et l'enregistre, migration en douceur.
  - Correctif trouvé en même temps : l'auto-lancement de l'audit en fin d'onboarding appelait encore l'ancienne route `/api/agents/audit/run`, supprimée lors de la fusion des agents — routée vers `/api/agents/marketing/run`.
- **Documents légaux (brouillons)** : `/cgu`, `/confidentialite`, `/mentions-legales`, liés depuis la landing et la barre latérale. **Explicitement non validés juridiquement** — champs à compléter (raison sociale, SIRET, adresse) et relecture par un juriste/DPO nécessaire avant toute ouverture publique, en particulier pour la base légale RGPD. Rédigés en toute transparence sur le fonctionnement réel (données envoyées à Anthropic, hébergement Vercel, OAuth sans mot de passe).
- **Non testé en conditions réelles** : la bascule Postgres et le nouveau login n'ont pu être vérifiés que par relecture de code et type-check — aucune base Postgres disponible dans cet environnement pour un test de bout en bout. À revalider dès le premier déploiement ou dès qu'une base de dev Postgres est fournie.

### 2decies. Rationalisation de l'équipe : 5 agents → 4 — ✅ livré (2026-10-05, demande CEO)
Demande : fusionner Nadia dans Martine ("Marketing Officer"), recentrer Camille sur le contenu, garder Jean-Claude. Challenge posé avant implémentation : la proposition initiale plaçait "communication Insta" à la fois sous Martine et sous Camille — ambiguïté sur qui écrit réellement un post. **Frontière tranchée** : Martine = diagnostic + pilotage structuré de la fiche Google (jamais de contenu créatif) ; Camille = production créative (posts, site), nourrie par les constats de Martine déjà en base (pas de nouveau mécanisme de handoff nécessaire).
- `src/lib/agents/marketing.ts` (Martine, fusion de l'ancien audit.ts + volet GBP/avis de l'ancienne visibilité locale) et `src/lib/agents/contenu.ts` (Camille, posts + site) remplacent les 3 anciens fichiers agents.
- Identité enrichie par agent : trait de personnalité ("humeur" fixe, pas dynamique — complexité non justifiée) + icône propre à chaque rôle (loupe pour Martine, stylo pour Camille, mallette pour Jean-Claude, boussole pour Paul) plutôt qu'une pastille colorée générique.
- **Pas de vraies photos** : aucune génération d'image disponible dans cet environnement, et une fausse photo de personne pour une IA reste trompeuse si elle sort un jour du dashboard — décision maintenue.
- Testé : toutes les pages (landing, dashboard, équipe, rapport, admin) rendent correctement avec la nouvelle équipe, y compris face à des données existantes utilisant les anciens noms d'agent (pas de crash, simple fallback d'affichage). **Le comportement réel des agents fusionnés n'a pas pu être vérifié avec un vrai appel modèle** : le compte de test a atteint sa limite de crédits Anthropic pendant la session précédente — à revalider dès que le compte est rechargé.

### 2nonies. Vue administrateur — ✅ livré (2026-10-05, demande CEO)
- **Coût par entreprise et par modèle** : chaque appel au modèle (tous les agents, y compris la publication de site) enregistre désormais tokens + coût estimé (`UsageEvent`, barème dans [src/lib/usage.ts](../src/lib/usage.ts) — **aucune mesure n'existait avant**, c'était un vrai trou identifié dès l'architecture initiale). Vue agrégée par entreprise, par agent, par modèle.
- **Connexions** : compteur et date de dernière connexion par entreprise (`Company.loginCount`/`lastLoginAt`).
- **Gestion des utilisateurs** : liste des entreprises avec suppression (nettoyage pilote, cascade complète sur toutes les données liées).
- **Proposé en plus (jugement)** : entonnoir d'activation (créées → plan généré → action validée → site publié) — révèle si Pepito "accroche" vraiment, pas seulement le nombre d'inscriptions.
- Accès : **ouvert par défaut à tout utilisateur connecté** (demande CEO, 2026-10-05, tant qu'il n'y a que des entreprises pilotes de confiance) — se referme automatiquement via `ADMIN_EMAILS` (liste blanche) dès que la variable est définie dans `.env`. **À faire avant d'ouvrir Pepito à des clients externes**, sans quoi n'importe quel utilisateur verrait les coûts de toutes les entreprises et pourrait en supprimer.
- Testé en conditions réelles : accès refusé à un compte non-admin (page et API), autorisé à l'admin, suppression en cascade vérifiée. Le traçage de coût lui-même n'a pas pu être vérifié avec un vrai montant > 0 car le compte de test a atteint sa limite de crédits Anthropic pendant la session — le mécanisme est en place et attend un appel réussi pour afficher un premier chiffre.

### 2septies. Sécurité : isolation stricte entre entreprises — ✅ corrigé (2026-10-05, audit demandé par le CEO)
L'utilisateur a posé la question directe : "le contexte entre plusieurs entreprises est-il bien isolé ?" Réponse honnête après audit : **non, pas avant ce correctif.** Les 12 routes API manipulant un `companyId` lui faisaient confiance sans vérifier qu'il appartenait à la session connectée (IDOR) ; deux d'entre elles (`GET /api/proposals`, `GET /api/audit-findings`) renvoyaient même **toutes les entreprises** si aucun `companyId` n'était fourni. Corrigé : toute route dérive désormais l'entreprise de la session (`getSessionCompany`), ignore tout `companyId` client, et les routes par id de ressource vérifient l'appartenance avant lecture/écriture. Testé en conditions réelles avec deux sessions distinctes tentant un accès croisé forcé — refusé partout (404/401).

### 2octies. Métier en recherche libre + profil d'entreprise enrichi — ✅ livré (2026-10-05, demande CEO)
- **Métier** : recherche par sous-chaîne ("res" → "Restaurant") sur une quarantaine de métiers indicatifs ([src/lib/trades.ts](../src/lib/trades.ts)), mais le champ reste texte libre — un métier absent de la liste n'est jamais bloqué.
- **Suppression du sélecteur "ton"** (pro/convivial/technique) jugé sans intérêt par le CEO. Remplacé par une **description libre** ("décrivez votre entreprise et ce qui vous différencie"), plus riche et directement injectée dans tous les prompts agents — le ton s'en déduit naturellement, pas besoin de case à cocher.
- **Champs optionnels ajoutés**, choisis pour leur utilité réelle pour les agents : téléphone (évite les placeholders "[Votre téléphone]" dans le contenu généré), certifications/labels (crédibilité locale), horaires d'ouverture.
- La page d'onboarding sert aussi de page "Mon entreprise" (pré-remplie, modifiable à tout moment).
- Testé en conditions réelles (restaurant à Toulouse, description libre "convivial et bruyant, pas chic") : le post généré par Martine reflète fidèlement le ton décrit, sans aucun sélecteur rigide, et utilise le vrai téléphone et les vrais horaires fournis.

### 2sexies. Boucle plan → agent → réalisation, cohérente et pilotable — ✅ livré (2026-10-05)
Demande CEO : "le plan doit déclencher les bons agents et permettre la réalisation ; je dois pouvoir valider ou réorienter".
- **Correctif de cohérence** : "Lancer" une action du plan transmet désormais l'action comme **brief** à l'agent (avant, l'agent partait à vide et proposait autre chose). Les propositions sont **rattachées à l'action** (`AgentProposal.planItemId`) et affichées sous elle ; l'action passe "terminée" quand tout est décidé.
- **Reprendre la main** : "Écarter" une action avec une raison (Paul la relit et ne la repropose pas) ; champ **"Réorienter Paul"** (`Company.direction`) injecté dans le plan et dans *tous* les agents, prioritaire sur le reste.
- **Première exécution réelle** : un brief de site validé → **"Publier le site"** → page générée et hébergée par Pepito sur `/site/[slug]` (HTML nettoyé + iframe sandbox sans script). C'est la première fois que la boucle complète plan → agent → proposition → validation → résultat visible fonctionne sans dépendance externe.
- **Refonte UI** : barre latérale (Aujourd'hui / Équipe / Rapport / Connexions / Mon entreprise), dashboard centré sur le plan avec Paul en colonne latérale, page Équipe pour le mode manuel agent par agent.

### 3. Déclenchement quotidien programmé (version dégradée de la "boucle quotidienne")
Un job programmé (1x/jour) qui relance les agents pertinents pour chaque entreprise active et alimente le dashboard de nouvelles propositions — **mais qui propose, ne décide ni n'exécute jamais seul**. Ce n'est pas la boucle autonome complète du cahier des charges tiers (observer→décider→agir→mesurer→apprendre sans validation), qu'on rejette tant qu'on est aux niveaux d'autonomie 1-2.
**Pourquoi maintenant** : répond au principe "le système doit réellement faire quelque chose chaque jour", sans rouvrir le débat sur l'autonomie déjà tranché.

### 4. Rapport quotidien par email
Email court envoyé chaque jour : propositions en attente, constats d'audit récents, recommandation du jour. Réutilise l'intégration email déjà identifiée comme prioritaire en architecture.
**Pourquoi maintenant** : différenciant, techniquement simple, dépend du point 3 (il faut qu'il se passe quelque chose chaque jour pour avoir un rapport à envoyer).

### 5. `web_search` pour l'agent Audit (recherche concurrents) — ✅ livré (2026-10-05)
Nadia utilise désormais `web_search` pour identifier 2-3 concurrents locaux réels (nom, positionnement, source citée) en plus de l'audit du site/réseaux. Testé en conditions réelles sur un cas concret (installateur solaire à Cabriès) : 4 concurrents réels identifiés avec recommandations actionnables.

### 7. US du 2026-10-05 — extension des capacités des agents (demande CEO)

- **Camille devient "technique"** — ✅ livré. Nouveau type de proposition `site_web_content` : un brief de contenu de site web d'une page (textes, structure), généré automatiquement quand aucun site n'est déclaré. **Limite assumée** : Camille ne construit jamais de site réel (pas de code, pas d'hébergement) — elle fournit un brief que le dirigeant fait construire (Wix, freelance...). "Aide à la connexion des outils" couverte par Paul en conversation, qui renvoie vers `/connexions` sans jamais demander de mot de passe.
- **Nadia fait un rapport de positionnement concurrentiel** — ✅ livré, voir point 5.
- **Martine génère du contenu automatiquement** — ✅ livré partiellement. `newsContext` devient optionnel : sans actualité fournie, Martine propose ses propres idées génériques (conseil, FAQ, présentation de service) au lieu d'exiger une actualité réelle à chaque fois.
  - **"...et le publie sur les différentes plateformes" — ❌ refusé.** La publication automatique sans validation contredit directement la règle "validation humaine obligatoire" actée depuis le début du projet ([agents-roster.md](agents-roster.md)) et nécessiterait de toute façon les connexions OAuth (point 2quater), pas encore fonctionnelles. Chaque post généré par Martine reste une proposition à valider dans le dashboard.
- **Jean-Claude trouve des pistes de croissance** (news, événements, opportunités) — ✅ livré. Nouvel outil `propose_growth_lead` + `web_search`, distinct des templates de prospection. **Garde-fou RGPD renforcé** : uniquement des informations publiques et professionnelles (entreprises, événements), jamais de donnée personnelle d'un particulier — consigne explicite de refus si on lui demande de cibler des particuliers (ex: "trouve-moi les propriétaires de maison avec piscine", refusé par construction). Testé en conditions réelles : piste réelle et sourcée trouvée (projet solaire local), avec rappel explicite de ne contacter que par voie professionnelle publique.

### 6. Pilote avec 5 vraies entreprises (2 semaines)
Reprise telle quelle du cahier des charges tiers : condition de validation avant d'aller plus loin. Doit s'appuyer sur les points 1-4 au minimum.

## Axe "partenaire de croissance" (cahier des charges CEO du 2026-10-07)

Promesse : *Pépito travaille pour développer votre activité et mesure ce que cela produit* — mesurer avant / agir / mesurer après / apprendre / réorienter. Découpage validé par le CEO le 2026-10-07 :

1. **Profil business + écart chiffré — ✅ livré (2026-10-07).** Champs déclaratifs sur `Company` (CA mensuel actuel, CA visé, échéance, valeur moyenne d'un client, nouveaux clients/mois) saisis à l'onboarding/"Mon entreprise". Calcul déterministe sans LLM ([src/lib/business-target.ts](../src/lib/business-target.ts)) : écart, croissance, mois restants, clients supplémentaires nécessaires par mois. Injecté dans les prompts de Paul et des 3 agents via `objectiveLine(company)` : chaque action doit être justifiée par sa contribution à l'écart. En-tête du dashboard : Objectif / Situation déclarée / Écart / Clients à aller chercher. Choix assumé : **"valeur moyenne d'un client" plutôt que "panier moyen"** — pour une activité récurrente (kiné, restaurant) c'est la valeur sur la durée qui détermine le nombre de clients à aller chercher, le panier sous-estimerait.
2. **Snapshots métriques** (note Google, nb avis, site, réseaux — source `auto`/`déclaré`) et tableau Départ / Aujourd'hui / Évolution. **Décision CEO : la récupération automatique des métriques Google est reportée** (dépend de l'OAuth Google) — on commence par le déclaratif.
3. **Funnel prospection — ✅ livré (2026-10-07).** Nouvel outil `propose_prospect` chez Jean-Claude : organisations réelles (entreprises, associations, collectivités) correspondant à la cible, avec canal professionnel public, type de cible ("segment") et source — jamais un particulier. Chaque prospect naît en base comme `Lead` (stage `propose`) lié à sa proposition ; il n'entre dans le funnel qu'à la **validation humaine** (`a_contacter`), un rejet le sort (`ecarte`, conservé pour l'apprentissage). Le dirigeant déclare ensuite lui-même : contacté → a répondu → RDV → client / sans suite (page **Prospection**, `PATCH /api/leads/[id]`). Agrégation déterministe ([src/lib/funnel.ts](../src/lib/funnel.ts)) : funnel total, "ce mois-ci" (ligne sur le dashboard) et par type de cible. Pepito ne prétend jamais connaître une vente : tout est déclaratif, comme le demande le CDC.
4. **Boucle d'apprentissage — ✅ livré en version légère (2026-10-07).** Paul reçoit le funnel réel (total + par type de cible) dans son prompt de plan, avec la règle d'honnêteté codée : sous 20 contacts sur un type de cible, "trop tôt pour conclure, je continue à tester" — jamais "A fonctionne 5× mieux" sur 5 réponses. Le même seuil est affiché sur la page Prospection ("trop tôt pour conclure"). La "Prochaine priorité" explicite sur le dashboard viendra quand il y aura assez de volume pour qu'elle dise autre chose que "trop tôt".
5. **Repositionnement** landing + promesse "14 jours", une fois qu'il y a des résultats à montrer.

**Décision CEO (2026-10-07) — prise de contact déléguée à Pepito : opt-in — ✅ réglage livré, exécution réelle toujours bloquée.** `Company.autoOutreachEnabled` (défaut `false`, par entreprise), exposé sur `/prospection` avec le même principe honnête que les connexions OAuth (bouton désactivé + explication, cf. `src/app/connexions`) : la case existe et peut être cochée, mais `src/lib/outreach.ts::isOutreachSendingConfigured()` bloque toute exécution réelle tant qu'aucun `OUTREACH_EMAIL_PROVIDER_API_KEY` n'est configuré. Restent à faire avant d'activer réellement l'envoi : fournisseur d'email, validation RGPD/prospection B2B avec Conformité/Juridique, et brancher la décision sur le funnel (point 3, déjà livré).

**"Events" — check-in hebdomadaire automatique — ✅ livré (2026-10-07).** Premier déclencheur de Pepito qui ne vient pas d'un clic ou d'un message : `vercel.json` (cron `0 7 * * 1`, hebdo) appelle `GET /api/cron/weekly-review`, protégé par `CRON_SECRET` (bearer). Pour chaque entreprise onboardée : écart objectif, delta de la semaine sur le funnel (par date réelle de l'étape, pas de création), nombre de propositions en attente — dépose un message de Paul dans le chat, **seulement s'il y a quelque chose à dire** (pas de bruit sur une semaine calme). Volontairement **déterministe, aucun appel modèle** : un message qui part sans supervision humaine immédiate (contrairement au chat où le dirigeant voit et peut challenger tout de suite) ne doit jamais pouvoir halluciner un résultat — même principe que la page Rapport. Garde-fou anti-doublon si le cron rejoue. Vérifié en conditions réelles : 4 entreprises traitées, message exact affiché dans le chat ("12 000 €/mois — situation déclarée 8 000 €/mois (écart +4 000 €)... 10 prospects identifiés, 1 contacté, 1 réponse, 1 RDV, 1 client... 34 propositions en attente"), second appel = 0 message créé (dédupliqué).

**Reste à trancher par le CEO** : variable Vercel `CRON_SECRET` à ajouter (valeur fraîchement générée, transmise séparément) pour activer le cron en prod — sans elle l'endpoint reste inutilisable (401) mais ne casse rien.

**Lisibilité des constats — ✅ livré (2026-10-07).** Signalé par le CEO après le correctif web_fetch : le constat réel produit par Martine sur La Tonnelle était un pavé de texte illisible (plusieurs points numérotés mélangés dans un seul champ `content`). `AuditFinding` structuré en 3 blocs (`whatWorks`, `toImprove`, `actionItems` — colonnes nullable, aucune perte sur les constats existants) : `record_audit_finding` exige maintenant un résumé court (1-2 phrases, pour la carte), "ce qui est bien", "ce qu'il faut améliorer", et 0-3 actions concrètes avec l'agent responsable. [FindingCard](../src/components/finding-card.tsx) affiche une carte compacte cliquable → pop-up avec les 3 sections ; un bouton "Ajouter au plan" par action crée directement un `ActionPlanItem` ([POST /api/action-plan](../src/app/api/action-plan/route.ts), sans appel modèle — le texte est déjà écrit) qui apparaît ensuite dans "Aujourd'hui", lançable comme n'importe quelle autre action (même garde-fou de validation humaine partout ailleurs). Repli automatique vers l'affichage brut pour les constats antérieurs à cette structuration (`whatWorks`/`toImprove` null). Revérifié en conditions réelles : relance de Martine sur La Tonnelle → 3 constats structurés de qualité (ex: carte "Ce qui est bien" / "Ce qu'il faut améliorer" / 3 actions proposées, dont "Ajouter un bloc Dîner sur l'accueil"), rendu de la pop-up conforme, clic "Ajouter au plan" → action réellement créée et visible sur le dashboard ; mode dégradé vérifié sur un constat non structuré (carte + pop-up avec texte brut, aucune erreur).

**Bug corrigé (signalé CEO 2026-10-07, reproduit sur un vrai cas le même jour) — web_fetch n'était jamais appelé avec le site réel.** Cause racine, pas une histoire de site bloquant les robots ou d'URL mal formée : l'outil `web_fetch` refuse de récupérer une URL qui n'est pas déjà apparue dans le contexte (message utilisateur ou résultat d'un outil précédent) — erreur `url_not_in_prior_context`. Or `company.website` n'était injecté que dans le **system prompt** de Martine, jamais dans le message utilisateur : web_fetch ne "voyait" donc jamais l'URL et échouait systématiquement, forçant Martine à se rabattre sur un extrait partiel via `web_search` (observé en prod sur "La Tonnelle" : lecture de la seule version `/en/` au lieu du site réel, avec une incohérence sur les horaires du soir non détectée). Corrigé dans [marketing.ts](../src/lib/agents/marketing.ts) : l'URL est désormais transmise dans le **message utilisateur**, où web_fetch peut la voir, avec consigne de lecture complète (pas une page isolée) et repli explicite par `web_search` si web_fetch échoue malgré tout, avant de conclure "site inaccessible". **Revérifié sur le cas réel exact** (relance de Martine sur La Tonnelle, `restaurant-latonnelle.fr`) : web_fetch a lu 3 pages réelles (accueil, La Carte, Resto-Bowling) au lieu de zéro, et le constat produit pointe précisément l'incohérence signalée ("aucun argument ne distingue le soir du midi", horaires du soir relégués en bas de page) plus plusieurs autres problèmes réels (carte en images non indexables par Google, adresse incohérente entre le site et les réseaux, contenu de saison périmé, deux comptes Instagram concurrents). Limite résiduelle notée dans ce même run : le quota `web_search` (max_uses: 5) a été épuisé avant l'analyse concurrentielle complète — Martine l'a signalé honnêtement plutôt que d'inventer un concurrent ; à surveiller si ça se reproduit, mais pas un bug.

**Point de conformité** : CA, panier/valeur client et marge d'un indépendant en nom propre sont des données personnelles au sens RGPD (la personne = l'entreprise). Non bloquant pour le MVP mais à mentionner dans la politique de confidentialité et à faire valider par le Data Privacy Officer avant le pilote avec de vraies entreprises.

## Propositions du 2026-10-05 (challenge des demandes CEO) — à trancher

**A. WordPress — reporté, contre-proposition livrée.** WordPress ajoute hébergement + API WordPress.com + un OAuth de plus, avant même que Google/Meta soient actifs. À la place, Pepito **génère et héberge lui-même** le site d'une page (livré ci-dessus, point 2sexies). WordPress reviendra comme option *"exporter mon site"* pour les clients qui veulent posséder/personnaliser — pas comme prérequis.

**B. "Connexions facilement activables" — le goulot n'est pas le code.** Deux choses distinctes : (1) *se connecter à Pepito avec Google* (identification) et (2) *autoriser Pepito à agir sur la fiche Google / les pages Meta* (autorisation, permissions sensibles). Le code OAuth est livré pour (2) et (1) se fait en une heure. Ce qui bloque : la création du client OAuth chez Google (10 min, **vous seul pouvez le faire**) et surtout l'**App Review Meta** (dossier, semaines). Proposition : un seul client OAuth Google pour login + fiche (permissions incrémentales) ; checklist exacte au point 2quater et détail pas-à-pas dans [docs/oauth-setup.md](oauth-setup.md). Décision attendue : lancez-vous les démarches Google cette semaine ? Sans ça, la "plateforme centrale qui arrose partout" reste une promesse.

**C. Crédits — conçu, pas construit.** Design proposé : un coût indicatif par *type* d'action (ex: audit avec recherche web = 3, posts = 1, site = 5) affiché à côté de "Lancer", avec un solde mensuel inclus dans l'abonnement. Pas de prix affiché tant que le modèle n'est pas tranché avec Finance — afficher un coût est déjà une promesse commerciale. Prérequis technique à faire d'abord : **mesurer** la consommation réelle par run (`usage` de l'API) pour calibrer, sinon les crédits seront arbitraires.

**D. Ce que je propose en plus (force de proposition) :**
1. **Email du rapport + plan du lundi** (points 3-4 ci-dessous) : c'est ce qui fera revenir le dirigeant sans qu'il y pense. Un seul fournisseur d'envoi à configurer (clé API), tout le reste existe déjà.
2. **Exécution réelle de la fiche Google** dès que l'OAuth Google est actif : une proposition `gbp_update` validée → appel API Business Profile. Même mécanique que le site ("Publier"). C'est la deuxième exécution de bout en bout, la plus attendue par la cible.
3. **Mesure de résultat** : sans retour terrain, Paul pilote à l'aveugle. Proposition légère : à chaque plan, Paul pose *une* question ("combien d'appels cette semaine ?") et stocke la réponse — ça alimente le rapport et le plan suivant.
4. **Pilote 5 entreprises** (point 6) : on a maintenant assez pour tester en vrai. Je recommande de ne plus ajouter de fonctionnalité avant d'avoir 5 retours réels.

## Explicitement reporté / rejeté (et pourquoi)

| Proposition du cahier des charges tiers | Décision | Raison |
|---|---|---|
| Boucle quotidienne 100% autonome (décision + action sans validation) | Rejeté pour le MVP | Contredit la validation humaine obligatoire déjà actée ([agents-roster.md](agents-roster.md)) |
| Crédits + changement de pricing (20€ + crédits) | Reporté | Décision Finance, pas produit — aucune donnée de coût d'inférence réelle pour la justifier encore |
| Architecture MCP générique pour les tools | Rejeté | Aucun client MCP externe à servir ; sur-ingénierie par rapport au besoin actuel |
| Intégration CRM | Reporté | Pas justifié avant validation des agents existants avec de vrais clients |
| Intégration calendrier | Reporté | Idem |
| Chat direct avec chaque agent | Partiellement livré | Le chat avec Paul (Co-CEO) qui délègue est en place ; un chat direct avec Camille/Martine/Jean-Claude individuellement reste reporté |
| Connexion aux comptes via identifiants (mot de passe) utilisateur | **Refusé — ligne rouge sécurité** | Credential harvesting interdit par les CGU des plateformes, risque de fuite, aucune nécessité technique. Remplacé par une approche OAuth (cf. point 2quater) |
| Agent "Acquisition" dédié (concurrents/partenaires) | Fusionné | Absorbé dans l'extension `web_search` de l'agent Audit (point 5) plutôt qu'un agent de plus |
