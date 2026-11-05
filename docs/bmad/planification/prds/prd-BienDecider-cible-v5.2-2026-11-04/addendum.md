---
title: "Addendum technique : cible V5.2"
status: draft
created: 2026-11-04
updated: 2026-11-04
base: "main @ bdde710 (prisma/schema.prisma, src/app, src/lib/agents, vercel.json)"
---

# Addendum technique : cible V5.2

Ce document dit **comment** la production rejoint la cible du [cahier des charges](prd.md) et de la [spécification fonctionnelle](spec-fonctionnelle.md). Il part du code de `main` (bdde710). Les schémas Prisma sont indicatifs : l'architecte les arrête dans la story qui les introduit. Tout ce qui n'est pas vérifié dans le code porte `[ASSUMPTION]`.

## 1. Principes

1. **Le serveur décide.** Chaque transition de la spec (§2, §4, §5, §7) est une fonction de service unique, appelée par l'interface, par les cartes de Paul et par l'ordonnanceur. Aucune règle n'existe seulement dans un composant.
2. **Une transition, une transaction.** Contrôles, écriture, mouvement de crédits, entrée de journal et annulation des programmations sont écrits ensemble, ou rien ne l'est.
3. **Concurrence optimiste.** Toute écriture sur une mission ou un contenu porte la version lue (`expectedVersion`) ; un écart renvoie M-02 (HTTP 409).
4. **Idempotence des effets externes.** Une diffusion porte une clé d'idempotence ; un double clic, une relance réseau ou un second passage de l'ordonnanceur ne publie jamais deux fois.
5. **Messages codés.** Les refus renvoient `{ code: "M-xx", message }` ; le texte vient de la spec §14, pas du composant.
6. **Migration sans perte.** Les données existantes (actions du plan, propositions, versions, journaux d'exécution, prospects) sont reprises, pas effacées. Sauvegarde de la base avant chaque migration de structure.
7. **Bascule progressive.** Les nouvelles pages vivent derrière un drapeau par entreprise `[ASSUMPTION]` jusqu'à la vague 7 ([gap analysis §6](../../gap-analysis-maquette-v5.2-2026-11-04.md)) ; les anciennes adresses redirigent ensuite (§9).

## 2. Modèle Mission et reprise d'`ActionPlanItem` (#277)

### 2.1 Choix

`ActionPlanItem` devient `Mission` **par évolution de la table**, pas par copie : le modèle Prisma est renommé, la table garde son nom (`@@map("ActionPlanItem")`) le temps de la bascule. Les clés étrangères existantes (`AgentProposal.planItemId`, `AgentRun`) restent valides. Une migration ultérieure renomme la table et les colonnes.

> **Décision du 2026-11-05 (#277), contraire à ce choix :** les fondateurs préfèrent un modèle propre. `Mission` est une **table neuve**, sans colonnes historiques et sans reprise des données de l'ancien plan d'action (ni de ses propositions et exécutions, qui restent dans leurs tables jusqu'à la bascule). Les sections 2.2 à 2.5 restent valables pour les champs, le catalogue et les canaux ; la section 2.3 (reprise des données) est abandonnée. Voir `docs/bmad/implementation/epic-9-context.md`.

### 2.2 Schéma cible

```prisma
model Mission {
  id                  String    @id @default(cuid())
  companyId           String
  template            String    // agencies, leads, proof, social_post, google_profile, review_reply, site_page, custom (§2.4)
  channel             String?   // facebook, instagram, linkedin, google_business_profile, gmail, site ; figé dès qu'une version est validée
  stopRuleDays        Int?      // Sur mesure : 7 à 90 ; sinon règle du modèle
  title               String    // 5 à 80
  outcome             String    // résultat recherché, 5 à 120
  originalOutcome     String?   // objectif d'origine, affiché dans « Modifier l'objectif »
  finding             String?   // constat, 10 à 300
  sourceFindingId     String?   // AuditFinding d'origine (« Voir la source »)
  createdBy           String    // paul, owner
  status              String    @default("proposed") // proposed, active, paused, stopped, dismissed
  previousStatus      String?   // pour « Remettre au plan »
  position            Int       // ordre dans le plan
  scope               Json      // { agencyIds } | { contactIds } | { proofId } | { topic } | { reviewIds } | { pageId } | { description }
  contactsConfirmedAt DateTime? // réactivation : confirmation des destinataires
  firstLaunchedAt     DateTime? // le débit de 3 crédits n'a lieu qu'une fois
  version             Int       @default(1) // concurrence optimiste
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  @@index([companyId, status])
  @@map("ActionPlanItem")
}
```

La priorité est portée par l'entreprise (`Company.priorityMissionId`), ce qui garantit une seule mission prioritaire.

### 2.3 Reprise des données

| Existant | Cible | Règle |
| --- | --- | --- |
| `status = propose` | `proposed` | — |
| `status = en_cours`, `lance` | `active` | `firstLaunchedAt = updatedAt` : aucun débit rétroactif |
| `status = termine` | `stopped` | Décision « arrêt » reprise avec la note « Action terminée avant la refonte » |
| `status = ecarte` | `dismissed` | `previousStatus = proposed` ; `feedback` conservé comme motif |
| `agent` et types des productions liées | `template` et `channel` selon §2.4 | Sans correspondance : `template = custom` (Sur mesure). Toutes les actions reprises restent pilotables, et Paul peut leur préparer du contenu `[DÉCISION D9]` |
| `outcome` vide | `outcome = title` tronqué à 120 | Signalé « Objectif à préciser » |
| `rationale` | `finding` | Tronqué à 300 |
| `priority` minimale | `Company.priorityMissionId` | — |
| `timing`, `theme`, `launchExtras` | conservés en colonnes historiques | Non affichés ; supprimés après la vague 7 |

### 2.4 Catalogue des modèles

`[DÉCISION D9]` Les modèles sont décrits en données dans le code (un fichier de catalogue, par exemple `src/lib/missions/templates.ts` `[ASSUMPTION]`) : clé, libellé, canaux permis, format du contenu, validation du périmètre, règle d'arrêt, résultat recherché par défaut, agent interne qui prépare le contenu. Ajouter un modèle, c'est ajouter une entrée et ses tests ; les services communs (§1) ne changent pas.

| Type de production actuel (`AgentProposal.kind`) | Modèle | Canal |
| --- | --- | --- |
| `prospecting_email`, `prospect` | `agencies` (Partenariats) | `gmail` |
| `gmail_email` | `agencies` ou `leads` selon le destinataire (organisation ou personne) | `gmail` |
| `social_post` | `proof` si une réalisation est citée, sinon `social_post` (Publication) | `facebook`, `instagram` ou `linkedin` |
| `gbp_update` | `google_profile` (Fiche Google à jour) | `google_business_profile` |
| `review_reply` | `review_reply` (Réponse aux avis) | `google_business_profile` |
| `site_web_content` | `site_page` (Page du site vitrine) | `site` |
| `piste_croissance` | aucune mission : devient une `Idea` (§4.5) | — |

Une demande qu'aucun modèle ne couvre reste enregistrée comme `UncoveredRequest` (signal pour enrichir le catalogue) et devient une mission `custom` (confirmé par les PF le 4 novembre 2026) ; `channel = null` pour une mission menée hors canal.

### 2.5 Activation des canaux

`[DÉCISION D4]` Chaque canal porte un état `enabled` dans la source unique (`channel-capabilities.ts`), vrai seulement quand son connecteur est livré. Les connecteurs de tous les canaux sont un prérequis de l'ouverture ; en cas d'ouverture anticipée, les canaux non développés restent à `enabled = false`.

- Les services refusent un canal désactivé à la création, au changement de canal, à la connexion et à la diffusion (M-67).
- Le catalogue exposé à l'interface et à Paul (`get_current_status`, `propose_mission`) ne contient que les modèles qui ont au moins un canal actif, plus `custom`.
- Un test vérifie qu'aucun écran ni aucune proposition de Paul ne cite un canal désactivé.

## 3. Correspondance entre la maquette et la production

| Maquette (`state.js`) | Production aujourd'hui | Cible |
| --- | --- | --- |
| `profile.firstName` | `Company.ownerName` (prénom et nom, facultatif) | `Company.firstName` (1 à 40), `ownerName` gardé pour la signature |
| `profile.company`, `website` | `Company.name`, `website` | inchangé |
| `profile.location` | — | `Company.location` |
| `profile.activity`, `zone` | `Company.trade`, `servingArea` | inchangé |
| `profile.clients`, `offers` | `description` (texte libre) | `Company.targetClients`, `offers` |
| `profile.confirmed` | — | `Company.profileConfirmedAt` |
| `goal` (texte, gain, horizon, budget, recrutement) | `objective`, `revenueTarget`, `targetDate`… | `Company.ambitionText`, `ambitionGrowthPct`, `ambitionMonths`, `mediaBudgetMonthly`, `hiringPossible` ; les champs chiffrés en € restent facultatifs (D8) |
| `missions` | `ActionPlanItem` | `Mission` (§2) |
| `contents` | `AgentProposal` | `AgentProposal` + `missionId`, `channel`, `format`, `rightsConfirmedAt`, `profileReviewNeeded` |
| `contents[].versions` | `ProposalRevision` (texte précédent seulement) | `ContentVersion` (instantané complet, §4.2) |
| `publications`, `scheduled` | `ExecutionLog` (unique par proposition) | `Publication` (§4.3) |
| `reports` | `Lead.stage` (déclaratif, par prospect) | `MissionReport` (§4.4) |
| `decisions` | — | `MissionDecision` (§4.4) |
| `ideas` | — | `Idea` (§4.5) |
| `journal` | journaux épars (`AgentRun`, `ExecutionLog`) | `JournalEntry` (§4.6) |
| `account.credits`, `creditHistory` | quotas (`dailyAgentRunLimit`, `dailySpendLimitUsd`…) | `Company.creditBalance` + `CreditLedger` (§4.7) ; les quotas restent comme garde-fou de coût |
| `agencies` | `Lead` (organisations) | `Lead` avec `segment = agence` (D6) |
| `contacts` | — | `Contact` (personnes, §4.8) |
| `proofs` (réalisations) | `SitePhoto` (photos du site) | `Proof` (§4.9) |
| `brand`, `logo` | — | `BrandKit` (§4.10) |
| `delegation` | `autoOutreachEnabled`, `DelegationRiskSetting` (admin) | `Company.delegationLevel` ; `DelegationRiskSetting` reste côté admin |
| `channels` | `ChannelConnection` (facebook, gmail, linkedin, instagram, google_business_profile) | `ChannelConnection` + `accountLabel`, `connectedAt` ; tous les canaux conservés (D4) ; activation par canal dans `channel-capabilities.ts` (§2.5) |
| — | site vitrine (`src/lib/site/`, `/site/[slug]`) | canal `site` des missions « Page du site vitrine » (D4) |
| `threads` de Paul | `ChatMessage` (un seul fil) | `ChatMessage.contextType`, `contextId` (D12) |
| propositions de Paul | `PaulPendingAction` | types étendus (§8) |
| brouillon d'inscription | — (inscription d'abord) | `OnboardingDraft` (§6) et `VisitTrace` (§4.12, D2) |
| avis | — | `ProductFeedback` (§4.11, D7) |

## 4. Autres changements de schéma

### 4.1 Entreprise

```prisma
// Ajouts à Company
firstName           String?
location            String?
targetClients       String?
offers              String?
profileConfirmedAt  DateTime?
profileChangedAt    DateTime?   // déclenche « profil à relire » (spec §4.5)
ambitionText        String?
ambitionGrowthPct   Int?        // 1 à 50
ambitionMonths      Int?        // 3 à 36
mediaBudgetMonthly  Int?        // 0 à 2000
hiringPossible      Boolean?
priorityMissionId   String?
delegationLevel     String      @default("review") // prepare, review, bounded
creditBalance       Int         @default(0)        // jamais négatif (contrainte CHECK)
emailVerifiedAt     DateTime?   // exigé avant toute diffusion (M-54)
timezone            String      @default("Europe/Paris")
```

`autoOutreachEnabled` est repris ainsi : `false` → `review`, `true` → `review` aussi (jamais de passage automatique à `bounded`), puis supprimé.

### 4.2 Versions de contenu

```prisma
model ContentVersion {
  id          String   @id @default(cuid())
  contentId   String   // AgentProposal
  number      Int
  title       String   // accroche ou objet, 1 à 100
  body        String   // 1 à 3000
  layout      String?  // photo-signature, cadre-editorial
  photoUrl    String?
  logoUrl     String?
  palette     Json?    // { primary, accent }
  tone        String?
  companyName String
  author      String   // owner, paul, system
  note        String?
  rejectedAt  DateTime? // « Je ne veux pas de cette version »
  rejectionReason String?
  createdAt   DateTime @default(now())
  @@unique([contentId, number])
}
```

Reprise : chaque `ProposalRevision` devient la version `fromVersion` (texte seul, `author` selon `source`) ; le contenu courant d'`AgentProposal` devient la version `version`. `AgentProposal.content` reste un cache de la version courante. `ProposalRevision` est supprimée après la vague 7.

### 4.3 Diffusions

`ExecutionLog` est unique par proposition : il ne permet ni plusieurs versions diffusées, ni programmation, ni diffusion déclarée. Il est remplacé par :

```prisma
model Publication {
  id              String    @id @default(cuid())
  companyId       String
  missionId       String
  contentId       String
  versionNumber   Int
  channel         String    // facebook, instagram, linkedin, google_business_profile, gmail, site
  reviewRef       String?   // réponse aux avis : identifiant de l'avis
  mode            String    // confirmed, declared
  status          String    // scheduled, sending, sent, failed, uncertain, cancelled
  scheduledAt     DateTime? // UTC
  timezone        String?
  sentAt          DateTime?
  recipientCount  Int?
  externalId      String?   // identifiant renvoyé par le canal
  failureReason   String?   // en clair (J-28)
  cancelReason    String?   // J-23
  idempotencyKey  String    @unique
  createdAt       DateTime  @default(now())
  @@index([status, scheduledAt])
  @@index([missionId])
}
```

Index partiel `[ASSUMPTION]` : une seule `Publication` au statut `scheduled` ou `sending` par `(contentId, versionNumber)`. Reprise : chaque `ExecutionLog` devient une `Publication` `confirmed` de la version approuvée (`succes` → `sent`, `echec` → `failed`, `incertain` → `uncertain`).

E-mail : une ligne `PublicationRecipient (publicationId, contactId | leadId, status, sentAt)` trace l'envoi par destinataire.

### 4.4 Bilan et décision

```prisma
model MissionReport {
  id                String   @id @default(cuid())
  missionId         String
  qualifiedLeads    Int
  meetings          Int      // ≤ qualifiedLeads (contrainte CHECK)
  signedRevenue     Int?     // null ≠ 0
  note              String?  // 600
  publicationCount  Int      // nombre de diffusions au moment de la saisie (« à jour »)
  createdAt         DateTime @default(now())
}

model MissionDecision {
  id                String   @id @default(cuid())
  missionId         String
  choice            String   // continue, stop
  publicationCount  Int
  reportId          String?
  createdAt         DateTime @default(now())
}
```

Le dernier enregistrement fait foi ; les précédents restent pour l'historique. Les étapes `contacte` à `gagne` de `Lead` ne sont plus alimentées par l'interface (D6) ; elles restent lisibles.

### 4.5 Idées

`Idea (id, companyId, text ≤ 200, createdAt, convertedMissionId?)` ; 10 au plus par entreprise, contrôlé dans le service.

### 4.6 Journal

`JournalEntry (id, companyId, missionId?, contentId?, code, actor, params Json, createdAt)`. Le texte est rendu à l'affichage depuis `code` (spec §15) et `params` : il suit la charte sans réécrire l'historique. Les journaux existants ne sont pas repris ; « Tout le journal » commence à la bascule `[ASSUMPTION]`.

### 4.7 Crédits

`CreditLedger (id, companyId, delta, reason, missionId?, contentId?, balanceAfter, createdAt)`. Le débit se fait par `UPDATE Company SET creditBalance = creditBalance - n WHERE id = ? AND creditBalance >= n` dans la transaction de la transition ; zéro ligne touchée renvoie M-15. Comptes existants à la bascule : `[DÉCISION D1]` 20 crédits offerts.

### 4.8 Contacts

```prisma
model Contact {
  id               String   @id @default(cuid())
  companyId        String
  firstName        String?
  lastName         String   // 60, nettoyé
  email            String
  monthsSinceLast  Int      // 0 à 240, à la date d'import
  importedAt       DateTime
  consent          String   // oui, non, inconnu
  importBatchId    String
  @@unique([companyId, email])
}
```

Un contact est une **personne** : il relève du RGPD, contrairement à `Lead` (organisations). Ancienneté réelle = `monthsSinceLast` + mois écoulés depuis `importedAt`. Purge : contacts non recontactables effacés 30 jours après l'import `[ASSUMPTION]` ; tous les contacts inclus dans « Exporter mes données » et effacés avec le compte.

### 4.9 Réalisations

`Proof (id, companyId, title, description?, photoUrl?, doneAt?, source: owner | site)`. Les photos du site (`SitePhoto`) peuvent être proposées comme réalisations, sans copie automatique.

### 4.10 Marque

`BrandKit (companyId @unique, primary, accent, tone, confirmedAt?, logoUrl?, logoPathname?, sources Json)`. Logo et photos sur Vercel Blob, sous un chemin propre à l'entreprise (même principe que `SitePhoto`) ; type et poids vérifiés côté serveur (spec §10).

### 4.11 Avis

`[DÉCISION D7]` `ProductFeedback (id, companyId?, page, rating 1-5, comment ≤ 600, createdAt)`. Fonction permanente : vue d'administration filtrable (page, note, période) et export CSV. À la suppression du compte, `companyId` passe à null et l'avis reste `[ASSUMPTION]`.

### 4.12 Trace des visites

`[DÉCISION D2]` `VisitTrace (id, startedOn Date, lastStep, abandonedStep?, trade?, department?, hasWebsite, sourcesRead Json, ambition Json, proposedTemplates String[], accountCreated Boolean, analysisCostUsd, createdAt)`.

- Écrite dans la transaction d'inscription ou par la purge des brouillons expirés, avant l'effacement (spec §1.5).
- Aucune clé vers `OnboardingDraft`, `Company` ou un utilisateur ; ni IP, ni jeton, ni texte libre. `startedOn` est une date sans heure.
- `department` est tiré de la localisation (code du département), jamais la commune.
- Conservée 25 mois `[ASSUMPTION]` ; effacée par le cron de purge.

## 5. Contrats serveur

| Opération | Entrée | Sortie | Erreurs |
| --- | --- | --- | --- |
| Transition de mission | `missionId`, `action`, `expectedVersion`, paramètres | mission, prochain pas, solde | M-xx (422), M-02 (409) |
| Nouvelle version | `contentId`, `expectedNumber`, champs, `author` | version | M-44 à M-46, M-60, M-15 |
| Valider | `contentId`, `number`, `rightsConfirmed`, `reviewed` | contenu | spec §4.4 |
| Diffuser ou programmer | `contentId`, `number`, `when`, `idempotencyKey` | publication | spec §5.1 |
| Déclarer une diffusion | `contentId`, `number`, `channel`, `date` | publication | spec §5.4 |
| Vérifier un résultat incertain | `publicationId`, `outcome` | publication | — |
| Bilan, décision | `missionId`, valeurs | mission, prochain pas | spec §7 |
| Import de contacts | fichier | rapport de contrôle, puis import confirmé | M-70 à M-74 |

- Le **prochain pas** (spec §3.3) est calculé côté serveur par une fonction pure partagée, testée sur les cas de la spec, et renvoyé avec chaque réponse.
- Les cartes de Paul appellent ces mêmes opérations au moment de l'acceptation, jamais avant.
- Chaque opération vérifie que l'objet appartient à l'entreprise de la session (`companyId`) avant toute lecture.

## 6. Parcours anonyme

| Élément | Choix |
| --- | --- |
| Stockage | `OnboardingDraft (id, tokenHash, ipHash, step, profile Json, analysis Json, ambition Json, createdAt, expiresAt)` |
| Cookie | `pepito_draft`, httpOnly, Secure, SameSite=Lax, 24 h ; seul le hachage du jeton est en base |
| Plafond | 3 analyses par IP hachée et par jour (même principe que `AuthThrottle`) ; plafond de tokens par analyse fixé dans le code `[ASSUMPTION]` ; coût tracé dans `UsageEvent` avec `draftId` (le `companyId` devient facultatif) |
| Analyse | Réutilise `onboarding-audit.ts` sur les données du brouillon ; résultats gardés dans le brouillon, pas dans `AuditFinding` |
| Inscription | Une transaction crée `Company`, reprend profil, ambition, constats (`AuditFinding`, `SourceRead`) et missions proposées, crédite 20, écrit J-04 et la trace de la visite (§4.12), efface le brouillon |
| Vérification de l'e-mail | Lien envoyé à l'inscription ; exigée avant toute diffusion, pas avant l'accès à l'espace |
| Purge | Cron quotidien : trace écrite puis brouillon effacé pour chaque brouillon expiré ; traces de plus de 25 mois effacées |
| Mot de passe | 8 à 128 caractères (aujourd'hui 6 au moins) ; les comptes existants gardent le leur |

## 7. Ordonnanceur

| Élément | Choix |
| --- | --- |
| Déclencheur | Cron `/api/cron/publications` toutes les 5 minutes ; précision annoncée à l'écran : « vers {heure} » `[ASSUMPTION]` |
| Prérequis | Un cron plus fréquent qu'une fois par jour suppose l'offre Vercel Pro `[ASSUMPTION à vérifier]` ; à défaut, une file externe (QStash, Vercel Queues) |
| Sélection | `Publication` `scheduled` avec `scheduledAt ≤ maintenant`, verrouillées (`FOR UPDATE SKIP LOCKED`) puis passées en `sending` |
| Contrôles | Rejoue spec §5.1, contrôles 2 à 9 ; un échec annule (J-23) et remonte dans « À valider par vous » |
| Envoi | Appel au canal avec `idempotencyKey` ; délai dépassé → `uncertain` (spec §5.5), jamais de relance automatique |
| Reprise | Une `Publication` restée `sending` plus de 15 minutes passe en `uncertain` |
| Autres crons | `weekly-review` (lundi 7 h) réécrit pour « Le point de Paul » : missions sans bilan, décisions en attente (D13) ; purge des brouillons (§6) |

## 8. Outils de Paul

| Outil actuel (`co-ceo.ts`) | Cible |
| --- | --- |
| `get_current_status` | Renvoie missions, étapes, prochain pas, solde de crédits, délégation, programmations |
| `propose_launch_marketing`, `_contenu`, `_demarchage` | Remplacés par `propose_mission_launch` : la carte ouvre le dialogue de cadre, jamais de lancement direct |
| `propose_plan_item` | Remplacé par `propose_idea` (idée) et `propose_mission` (mission à créer, tout modèle du catalogue §2.4, avec son canal) |
| `propose_objective_update` | Remplacé par `propose_ambition_limit` (bornes spec §11) |
| `propose_profile_update` | Gardé ; l'acceptation déclenche les effets spec §4.5 |
| `propose_revision` | Renommé `propose_new_version` ; 1 crédit débité à l'acceptation |
| `record_uncovered_request` | Gardé : signal pour enrichir le catalogue (D9) ; Paul peut proposer en même temps une mission `custom` |
| — | Nouveaux : `propose_priority`, `propose_scope`, `propose_pause`, `propose_dismiss`, `propose_restore` |

- Types de `PaulPendingAction` alignés sur ces outils ; `launch_plan_item` et `revise_proposal` repris sous leurs nouveaux noms.
- Contexte : `page-context.ts` et `chat-context.ts` reçoivent `contextType` et `contextId` ; l'historique envoyé au modèle est celui du contexte (60 messages au plus).
- Personas (D3) : `personas.ts` ne sert plus à l'affichage ; les agents internes (marketing, contenu, démarchage) restent des détails d'implémentation, jamais nommés à l'écran.

## 9. Adresses

| Maquette | Production aujourd'hui | Cible |
| --- | --- | --- |
| `#/decouvrir` | `/` | `/` |
| `#/bienvenue` (étapes 1 à 3) | `/onboarding` | `/bienvenue` ; `/onboarding` redirige |
| `#/diagnostic` (étape 4, premières missions) | — | `/bienvenue/missions` : **pas** `/diagnostic`, déjà pris par l'audit |
| `#/inscription` | `/signup` | `/bienvenue/compte` ; `/signup` redirige |
| connexion | `/login` | `/login` |
| `#/paul` (Stratégie) | `/cockpit`, `/dashboard` | `/strategie` ; anciennes adresses redirigent |
| `#/missions/{id}` | — | `/missions`, `/missions/[id]`, `/missions/nouvelle` |
| `#/atelier` (alias `studio`) | `/studio/[id]` | `/atelier/[id]` (identifiant du contenu) ; `/studio/[id]` redirige |
| `#/resultats` | `/rapport` | `/resultats` ; `/rapport` redirige |
| `#/entreprise/audit` | `/diagnostic`, `/entreprise` | `/entreprise/diagnostic` ; `/diagnostic` redirige |
| `#/entreprise/marque` | — | `/entreprise/marque` |
| `#/entreprise/canaux` | `/canaux`, `/connexions` | `/entreprise/canaux` ; anciennes adresses redirigent |
| `#/entreprise/equipe` | `/equipe` | retiré (D3) ; redirige vers `/strategie` |
| — | `/prospection` | retiré (D6) ; redirige vers `/missions` |
| `#/compte` | `/compte` | `/compte` |
| — | `/site/[slug]` | conservé : adresse publique du canal « site vitrine » (D4), lien depuis `/entreprise/canaux` |
| — | `/admin` | inchangé |

`journey-nav.ts` (« 4 temps ») est remplacé par la navigation de FR-12. Avant d'écrire une page, lire le guide de la version de Next.js du dépôt (`node_modules/next/dist/docs/`, cf. `AGENTS.md`).

## 10. Risques

| Risque | Effet | Parade |
| --- | --- | --- |
| Reprise des statuts incomplète | Missions incohérentes, crédits faux | Migration testée sur une copie de la base ; script de contrôle (comptes par statut avant et après) |
| Autorisations des canaux | Publication Facebook (`pages_manage_posts`), Instagram (`instagram_content_publish`), LinkedIn (`w_member_social`, et `w_organization_social` pour une Page), fiche Google (accès à l'API Business Profile, #13) et envoi Gmail (`gmail.send`) soumis à la revue des fournisseurs `[ASSUMPTION]` sur les noms exacts | Demandes lancées ou relancées dès la vague 0 ; connecteurs prérequis de l'ouverture ; en cas d'ouverture anticipée, canaux non développés désactivés (§2.5, FR-59) |
| Catalogue ouvert | Modèles mal bornés, règles qui divergent d'un modèle à l'autre | Modèles décrits en données avec leurs tests (§2.4) ; règles communes dans les services uniques (§1) ; « Sur mesure » toujours en diffusion confirmée, ou déclarée hors canal |
| Trace des visites | Recoupement possible (activité, département, date) | Aucun champ directement identifiant, date sans heure, vue d'administration agrégée (spec §1.5) ; avis RGPD (#69) |
| Coût de l'analyse anonyme | Abus, facture IA | Plafond par IP, plafond de tokens, suivi dans la vue admin |
| Fréquence du cron | Programmations en retard | Vérifier l'offre Vercel ; file externe sinon |
| Données personnelles des contacts | Non-conformité RGPD | Base légale affichée à l'import, purge, export et effacement (§4.8) ; avis juridique avant ouverture |
| Deux parcours en parallèle | Règles divergentes | Services uniques (§1) ; drapeau par entreprise ; date de fin de l'ancien parcours fixée |
| Prompts liés aux noms d'agents | Paul cite des personas retirés | Relecture des prompts dans la story D3 ; test qui interdit les noms de personas dans les réponses |
| Branche locale en retard | Travail bâti sur un code périmé | Partir de `main` à jour pour chaque story |
