# BienDecider : troisième test en production, recette « Paul fiable »

24 octobre 2026, 08:00-08:10, nouveau compte en production, version complète de l'épopée « Paul fiable » (commit `4274785`, épopées 1 à 3). Recette manuelle déroulée pas à pas : [docs/bmad/implementation/recette-paul-fiable.md](docs/bmad/implementation/recette-paul-fiable.md). Même persona que les tests du [22](BienDecider-test-entrepreneur-2026-10-22.md) et du [23 octobre](BienDecider-test-entrepreneur-2026-10-23.md) : Samuel Morel, Atelier Lumen, ébéniste à Nantes. Aucune connexion (Gmail, Facebook), rien d'envoyé.

## En une phrase

Les 12 étapes de la recette passent, y compris les cinq qui bloquent une mise en production. Un seul écart touche une promesse de l'épopée (Paul « rectifie » encore un état exact dans un cas précis). Un nouveau problème, sérieux, est apparu : le quota journalier est épuisé après dix minutes d'usage normal.

## Résultat de la recette

| # | Étape | Résultat | Détail |
| --- | --- | --- | --- |
| 1 | Onboarding | conforme | Une seule action d'audit, en cours dès l'accueil. |
| 2 | Objectif dit à Paul | conforme (bloquante) | Pas de question sur la période, une carte, aucun montant mensuel dans la réponse, rien d'enregistré avant le clic. |
| 3 | Confirmer l'objectif | conforme | Affiché aussitôt, « environ 3,3 clients de plus par an ». |
| 4 | Profil et nom | conforme | Une carte : nom, Instagram, horaires ; les trois dans Entreprise après confirmation. |
| 5 | Prospection | conforme (bloquante) | Carte « Lancer Jean-Claude », aucune exécution avant le clic. Voir l'écart E1. |
| 6 | Doublon | conforme (bloquante) | « Depuis mon dernier message, vous avez cliqué sur « Lancer » et Jean-Claude a commencé » ; aucune nouvelle action. |
| 7 | Décisions | conforme | 11 décisions : 5 prospects, 2 emails, 2 pistes, 2 propositions de fiche Google. Emails signés « Samuel Morel », horaires repris. Salon annoncé « dans 6 jours » (exact), aucun événement passé. |
| 8 | « Où en est l'équipe ? » | conforme, avec réserve | Statuts exacts, « Depuis mon dernier message, Jean-Claude a terminé ». Les heures ne sont pas citées (E3). |
| 9 | Même question aussitôt | conforme (bloquante) | « Rien n'a changé depuis mon dernier message (08:06) », mêmes statuts. |
| 10 | Compteurs | conforme | 11 sur les deux badges, l'accueil et Décisions ; Paul dit aussi 11. |
| 11 | « Retire l'avertissement et signe avec mon nom » | conforme, avec réserve | Cartes de révision, pas de relance de Jean-Claude. Voir E2. |
| 12 | Confirmer la révision | conforme (bloquante) | Même email en version 2, sans l'avertissement, signé ; « Révisée par Jean-Claude : … », « Voir la version précédente » ; toujours 11 décisions. |

## Comparaison avec les deux tests précédents

| Point | 22 octobre | 23 octobre | 24 octobre |
| --- | --- | --- | --- |
| Objectif retenu | non | oui (carte) | oui, période comprise sans question |
| Écart calculé | « 1 à 2 cuisines par an » (faux) | 3,3 par an | 3,3 par an |
| Lancement sans accord | 3 agents d'office | aucun | aucun |
| Statuts annoncés | 3 faux de suite | justes, mais « c'était faux » | justes ; « depuis mon dernier message » utilisé deux fois, une « rectification » restante (E1) |
| Doublons | 2 actions de prospection | aucun | aucun |
| Décisions après le parcours | 18 (16 affichées) | 15 | 11 |
| Compteurs | 18 contre 16 | 15 partout | 11 partout |
| Signature des emails | « Paul » | « Atelier Lumen » | « Samuel Morel » |
| Correction d'un email | impossible | relance complète proposée | version 2 de la même production |
| Événement passé proposé | oui (juin) | non | non, date relative exacte |

## Écarts et constats

| # | Constat | Gravité | Piste |
| --- | --- | --- | --- |
| Q1 | **Quota journalier épuisé en 10 minutes.** Chaque message à Paul compte comme un lancement (`assertRunQuota` additionne exécutions et appels synchrones, plafond 10 par jour). 7 messages + l'audit + Jean-Claude + une révision = 10 : après cela, Paul et les agents sont bloqués jusqu'au lendemain (429 « quota journalier de lancements atteint »). Un vrai dirigeant serait bloqué dès la première séance. | haute | Séparer le quota des messages à Paul (ou le relever nettement) de celui des exécutions d'agents ; garder le plafond de dépense en euros comme vraie limite. À trancher par les PF (coût par client). |
| E1 | **Paul « rectifie » encore un état exact** : « Je rectifie ce que j'ai dit plus haut : l'audit de Martine est terminé », alors qu'il l'avait dit en cours à 08:02, ce qui était vrai. L'indicateur « depuis mon dernier message » compare au dernier message de Paul (08:03), or l'annonce venait d'un message plus ancien et Martine a fini entre les deux. | moyenne | Comparer chaque état au message où Paul en a parlé, ou plus simplement : tout changement postérieur au premier message de la conversation récente est une mise à jour ; règle du prompt « ne dis jamais "je rectifie" pour un état qui a changé depuis ». |
| E2 | **Paul ignore la production depuis laquelle on lui écrit** : ouvert depuis l'email de premier contact, il écrit « je suppose que vous parlez des deux emails » et propose deux cartes. | basse | Donner la priorité au contexte de page (« À propos de ») dans le prompt quand une seule production est visée. |
| E3 | Paul ne cite pas les heures à « Où en est l'équipe ? » (attendu par la recette, étape 8). | basse | Inviter Paul à donner l'heure de fin des exécutions récentes. |
| E4 | Deux prospects sans lien dans les réponses de Paul (« Un amour de maison », « Créative Home »). | basse | Le marqueur `[[bd:proposal:…]]` manque pour ces noms. |
| E5 | Paul propose de lui-même une carte pour Camille (page web) dès la troisième réponse et la rappelle à chaque message. Rien ne part sans clic, mais l'insistance peut lasser. | basse | Une seule relance par conversation. |
| E6 | « Préremplir mon profil » n'a pas pu être retesté (quota atteint). | — | À retester demain ou après Q1. |

## Nettoyage

Le compte de test reste en production avec 11 décisions en attente et une carte de révision non confirmée. Il est à supprimer depuis la page Compte, section « Supprimer mon compte et mes données » : la suppression définitive est à faire par un PF.

## Priorités proposées

1. **Q1, quota** : décision des PF avant toute ouverture à de vrais utilisateurs.
2. **E1** : petite correction de la règle de Paul.
3. E2 à E5 : finitions.
