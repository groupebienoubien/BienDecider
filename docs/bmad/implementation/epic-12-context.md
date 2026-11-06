# Epic 12 Context : Diffuser, ou déclarer, une version validée (vague 3 de la cible V5.2)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Faire partir une version validée, une seule fois, sur la destination confirmée par le dirigeant, ou enregistrer qu'il l'a diffusée lui-même ; dire la vérité quand le canal ne répond pas ; régler en un seul endroit ce que BienDecider peut faire sans redemander.

## Stories

- Story 12.1 : Confirmer une diffusion, contrôlée côté serveur et enregistrée (#315 ; site vitrine #172, tranche V5.2)
- Story 12.2 : Diffuser moi-même et le déclarer (#295)
- Story 12.3 : Choisir mon niveau de délégation (#36)
- Story 12.4 : Programmer la diffusion d'une version validée et pouvoir l'annuler (#261), PR suivante : ordonnanceur GitHub Actions toutes les 5 minutes (décision des fondateurs du 2026-11-05), route `/api/cron/publications` protégée par `CRON_SECRET`.
- Hors de l'epic : déconnexion avec liste des programmations dans Canaux & délégation (#293).

## Requirements & Constraints

- Cahier des charges FR-32 à FR-38, FR-42, FR-59, NFR-1, NFR-3, NFR-4 ; spécification §5.1 à §5.6, §9, §14, §15 ; addendum §4.3.
- Le serveur décide : une seule porte `POST /api/contents/[id]/diffusion` (`publish`, `declare`, `resolve`), contrôles purs `checkDiffusion` et `checkDeclaration` dans l'ordre de la spécification.
- « Préparer seulement » ferme aussi les portes historiques (`/api/gmail/send`, `/api/proposals/[id]/execute`, `/api/site/republish`) : 403 M-55.

## Technical Decisions

- **Table `Publication`** (addendum §4.3) : version, titre, canal, destination en clair, mode `confirmed` ou `declared`, statut `sending`, `sent`, `failed`, `uncertain`, `scheduled`, `cancelled`, identifiant externe, adresse publique, motif d'échec. Clé d'idempotence `contenu:version:rang de la tentative` (`:declared` pour la déclaration) : deux confirmations simultanées n'en font qu'une, et la version du contenu est gardée dans la même transaction (une retouche simultanée échoue en M-02).
- **État de la version** déduit des diffusions : diffusée (`sent`), programmée (`scheduled`), à vérifier (`uncertain`, ou `sending` sans réponse). Une version diffusée est en lecture seule (M-46) ; « Créer V(n+1) à partir de Vn » est la seule façon de la reprendre.
- **Résultat incertain** (§5.5) : jamais relancé ; « C'est bien parti » l'enregistre, « Ce n'est pas parti » laisse la version validée et rediffusable (J-25). Un envoi sans réponse depuis 15 minutes devient vérifiable. Nouvelle étape de mission « diffusion à vérifier » (temps « Diffuser »), dans le prochain pas et « À valider par vous ».
- **Facebook** : `publishFacebookPagePost` existant, Page choisie déchiffrée à chaque diffusion ; un jeton refusé passe la connexion en erreur.
- **Site vitrine** (#172, V5.2) : la page validée est enregistrée telle quelle (`SitePage`, unique par mission) et servie en texte sous `/site/{adresse de l'entreprise}/{adresse de la page}`, sans appel au modèle ; une diffusion suivante la remplace. L'adresse de l'entreprise est créée à la première page si elle n'existe pas.
- **Gmail** : aucun contenu e-mail n'a encore de destinataires (agences #316, contacts #287) ; la validation les refuse déjà (M-49).
- **Délégation** : colonne `Company.delegationLevel` (`prepare`, `review` par défaut, `bounded`), réglée dans Canaux & délégation (`/connexions#delegation`), J-26 ; passer en « Préparer seulement » annule les programmations (J-23) après confirmation. Le niveau est rappelé dans la liste des missions, le contrat de mission et le cadre de diffusion de l'atelier ; en « Préparer seulement », l'étape devient « à diffuser vous-même » et l'atelier propose « Récupérer le texte ».
- **Nouveaux messages** (§14) : M-80 hors canal, M-81 résultat incertain en attente, M-82 et M-84 cases de confirmation, M-83 saisie de la déclaration, M-85 niveau inconnu, M-86 rien à vérifier.

## Cross-Story Dependencies

- 12.2 et 12.3 utilisent la table et les contrôles de 12.1.
- Bilan et décision après diffusion (#294, #52) : l'étape « bilan à renseigner » s'ouvre dès la première diffusion.
