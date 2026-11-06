# Epic 14 Context : Partenariats, écrire à une ou deux agences de ma zone (vague 3 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre au dirigeant de contacter une ou deux agences de sa zone qui peuvent le recommander, avec un message qu'il a relu et validé, envoyé par son Gmail à chaque agence séparément, sans démarchage de masse ni relance automatique.

## Stories

- Story 14.1 : Trouver des agences de ma zone avec Paul (#316, FR-45)
- Story 14.2 : Choisir une ou deux agences, périmètre verrouillé selon la spécification §6.2 (#316)
- Story 14.3 : Envoyer un e-mail par agence depuis mon Gmail (#316, §5.2)

Livrées ensemble dans une seule PR. La Réactivation (#287) reste hors de ce bloc : elle dépend du cadre légal du fichier de contacts (#69).

## Requirements & Constraints

- Cahier des charges FR-23 et FR-45 ; spécification §4.5, §5.1, §5.2, §6.1 à §6.3 ; addendum §3 (`agencies` → `Lead` avec `segment = agence`, D6) et §4.3 (`PublicationRecipient`).
- Uniquement des organisations et des informations publiques et professionnelles, avec la source citée ; jamais un particulier.
- Aucune relance automatique, aucun entonnoir de prospection (D6) ; règle d'arrêt : 30 jours, puis bilan (#294).

## Technical Decisions

- **Liste d'agences** : `Lead` avec `segment = "agence"`, plus `email` (e-mail professionnel publié, unique par entreprise) et `sector`. La recherche de prescripteurs (`POST /api/agencies/search`) demande à Paul, avec la recherche web, jusqu'à 6 agences de la zone avec nom, secteur, e-mail publié, page source et raison. Le serveur ne garde que les agences complètes (e-mail valide, source `http(s)`, textes nettoyés) et nouvelles (ni même e-mail, ni même nom). La recherche est un lancement soumis au quota et au budget de l'entreprise (`reserveUsageBudget("agency_search")`) ; rien de nouveau : M-90 ; modèle indisponible : M-91.
- **Périmètre** : `{ agencyIds }`, 1 ou 2 identifiants distincts de la liste de l'entreprise (M-30 sinon, vérifié par le service à la création et à chaque changement). Résumé §6.3 : « {agence 1} et {agence 2} ». Paul lit la liste (`agences` dans son état) pour proposer un périmètre.
- **Verrouillage §6.2** du périmètre de toute mission : diffusion programmée (M-88), résultat incertain à vérifier (M-81), version courante diffusée (M-89) ; « Créer V(n+1) » rouvre le périmètre.
- **Destinataires modifiés** (§4.5) : agences changées sur une mission En cours ou un contenu validé → nouvelle version système « Destinataires modifiés », validation retirée.
- **Diffusion Gmail** : `readDestination` lit l'adresse du compte relié (« Gmail (adresse) »). Un envoi par agence, chacun tracé dans `PublicationRecipient` (envoyé, échec, incertain). Accès refusé : les envois suivants ne sont pas tentés et la connexion passe en erreur. Une agence déjà servie pour cette version n'est jamais renvoyée, même après « Ce n'est pas parti ». La publication est envoyée si au moins une agence a reçu le message, incertaine si un envoi est sans réponse.
- **Atelier** : aperçu « À : Agence <adresse>, … · envois séparés » ; résultat de chaque envoi sous la décision.
- Migration additive `20261107090000_partnership_agencies`.
