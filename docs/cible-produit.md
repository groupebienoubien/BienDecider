# Cible produit : BienDecider V5.2

Depuis le 4 novembre 2026, la cible du produit est la **maquette V5.2**, traduite en cahier des charges et validée par les pères fondateurs (PF). Cette page est le point d'entrée : elle dit où sont les documents et ce qui a été décidé, sans répéter le détail.

## Les documents

| Document | Rôle |
| --- | --- |
| Maquette `maquette_v5.2/`, publiée sur https://groupebienoubien.github.io/BienDecider/maquette_v5.2/ | Référence visuelle et fonctionnelle. Les services y sont simulés ; ses artifices de démo ne sont pas à reproduire (gap analysis §2). |
| [Gap analysis](bmad/planification/gap-analysis-maquette-v5.2-2026-11-04.md) | Écart entre la maquette et la production (110 exigences), décisions D1 à D13, chemin critique, tri des US. |
| [Cahier des charges](bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md) | Parcours, exigences fonctionnelles (FR-1 à FR-61) et non fonctionnelles, mesure du succès, hypothèses ouvertes. |
| [Spécification fonctionnelle](bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md) | Règles, transitions, contrôles, catalogue des modèles, messages (§14), événements du journal (§15). |
| [Addendum technique](bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/addendum.md) | Modèle Mission, schéma cible, reprise des données, activation des canaux, contrats serveur. |
| [Version lisible](bmad/planification/BienDecider-cible-v5.2.html) | Les mêmes documents réunis en une page HTML autonome. |

Les étiquettes `[DÉCISION Dn]` renvoient aux décisions ci-dessous ; `[ASSUMPTION]` marque une valeur encore à confirmer (cahier des charges §9).

## Décisions des PF (4 novembre 2026)

| # | Décision |
| --- | --- |
| D1 | Les crédits sont l'unité de consommation visible : 20 offerts, sans paiement pendant le PoC. |
| D2 | Analyse réelle et plafonnée avant le compte ; brouillon anonyme effacé après 24 heures ; trace anonyme des visites gardée pour connaître les visiteurs et améliorer le produit. |
| D3 | Paul est le seul interlocuteur visible ; les autres agents restent internes. |
| D4 | Tous les canaux sont conservés : Facebook, Instagram, LinkedIn (profil et Page), fiche Google, Gmail, site vitrine. Leurs connecteurs sont un prérequis de l'ouverture ; en cas d'ouverture anticipée, les canaux non développés sont désactivés. |
| D5 | La réactivation d'anciens contacts attend l'avis RGPD (#69). |
| D6 | L'entonnoir de prospection et la prise de contact automatique sont retirés ; la recherche de prescripteurs alimente la mission Partenariats. |
| D7 | « Laisser un avis » est une fonction permanente du produit. |
| D8 | L'ambition se dit en texte libre, reformulée par Paul ; le chiffrage en euros reste facultatif. |
| D9 | Le catalogue des missions est ouvert à tous les modèles d'action, avec la mission « Sur mesure » pour une demande hors catalogue. |
| D10 | Le profil compris est montré et corrigeable avant le compte. |
| D11 | Le refus motivé d'une version est conservé. |
| D12 | Paul tient une conversation par contexte. |
| D13 | Le bilan hebdomadaire par e-mail est gardé, recentré sur ce qui attend une décision et les bilans à renseigner. |

Le détail de chaque décision, avec l'option proposée et sa raison, est dans la gap analysis §3.

## Où en est le travail

- Suivi du PoC, ordre de réalisation et définition de fini : [Issue #272](https://github.com/groupebienoubien/BienDecider/issues/272).
- US alignées sur la cible : [label `cible-v5.2`](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Acible-v5.2). Jalons : PoC 1 - Prérequis d'ouverture, PoC 2 - Parcours cible V5.2, PoC 3 - Canaux réels, Après le PoC.
- Tri des US du 4 novembre 2026 : 8 US créées (#310 à #317), 14 réécrites, 6 fermées comme non retenues ; détail action par action dans la [gap analysis, §7](bmad/planification/gap-analysis-maquette-v5.2-2026-11-04.md#7-tri-des-us-appliqué-le-4-novembre-2026). Chaque US touchée porte un commentaire « Tri du 2026-11-04 ».
- Le prototype en ligne ne suit pas encore cette cible : [architecture.md](architecture.md) décrit ce qui existe aujourd'hui.

## Ce qui a été remplacé

Les cibles précédentes (maquette V1 d'octobre, maquette V3, backlog MVP, domaines, spécification de contextualisation) sont archivées dans [archives/](archives/README.md), avec la raison et le document qui les remplace. Les maquettes antérieures (`docs/maquette/`, `maquette_v2/` à `maquette_v5/`) restent publiées pour mémoire ; seule `maquette_v5.2/` fait référence.
