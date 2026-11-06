# Epic 13 Context : Canaux & délégation, seulement ce qui marche vraiment (vague 3 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Montrer au dirigeant, à un seul endroit, les canaux sur lesquels BienDecider peut vraiment diffuser pour lui, leur état, ce que coûte une déconnexion, et ce que BienDecider peut faire sans redemander ; ne jamais lancer un flux fournisseur voué à l'échec.

## Stories

- Story 13.1 : Gérer mes canaux et ma délégation au même endroit (#293, avec la déconnexion de #10)
- Story 13.2 : Ne proposer que les canaux réellement disponibles pour mon compte (#301)

Livrées ensemble dans une seule PR.

## Requirements & Constraints

- Cahier des charges FR-36, FR-42, FR-59 ; spécification §5.3, §5.6, §9, §13.5 ; addendum §2.5.
- Décisions des fondateurs (2026-11-06) : Facebook et Gmail restent **ouverts à tous par défaut** ; l'administrateur peut les réserver aux entreprises autorisées (comptes testeurs, #302) puis les rouvrir. LinkedIn et la fiche Google, désactivés, sont retirés de la page et leur démarrage OAuth est refusé ; leur code de connecteur reste, les connexions existantes ne sont pas effacées.

## Technical Decisions

- **Deux axes distincts** : le connecteur est livré (`channel-capabilities.enabled`, D4) ; le fournisseur a approuvé l'application, sinon le canal est réservé (`ChannelRollout.openToAll`, absent = ouvert) et accordé par entreprise (`ChannelAccess` : `requested` ou `granted`). `readChannelAccess` rend `disabled`, `open`, `granted`, `requested` ou `none` ; seuls `open` et `granted` permettent de connecter et de diffuser.
- **Contrôle serveur** au démarrage OAuth (Meta, Gmail, LinkedIn, Google → `/connexions?error=channel_unavailable`) et à la diffusion (`readDestination` : M-67), pas seulement dans l'interface.
- **Page** `/connexions` (fil d'Ariane « Entreprise ») : une ligne par canal actif (Facebook, Gmail) avec état, programmations en cours, et une déconnexion qui liste les programmations annulées (« Vos contenus et leurs validations restent ») ; le site vitrine (pages en ligne, toujours disponible) ; le site actuel lu pour l'analyse ; la délégation. Un canal réservé affiche « Pas encore disponible pour votre compte » et « Demander l'accès ».
- **Retour à la diffusion** : « Connecter » depuis l'atelier ouvre `/connexions?retour=/atelier/{id}` ; l'adresse est gardée dans l'onglet pendant l'autorisation, un lien « Revenir au contenu » y ramène, rien n'est diffusé en revenant.
- **Administration** : « Accès aux canaux » réserve ou ouvre chaque canal actif, liste demandes et autorisations, autorise une entreprise sans demande préalable (`PATCH /api/admin/channel-access`).
- **Paul** ne cite comme connectables que les canaux actifs.
- Migration additive `20261106160000_channel_access`.
