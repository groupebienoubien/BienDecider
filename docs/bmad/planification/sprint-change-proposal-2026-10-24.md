---
status: 'approuvé le 2026-10-24 (option A)'
created: '2026-10-24'
trigger: 'BienDecider-test-entrepreneur-2026-10-24.md (constats Q1 et E1)'
---

# Proposition de changement : épopée 4 « Paul reste disponible et cohérent »

## 1. Déclencheur

Le troisième test en production (24 octobre, commit `4274785`) valide l'épopée « Paul fiable » : les 12 étapes de la recette passent. Il fait apparaître deux écarts qu'aucune épopée ne couvre.

- **Q1, quota épuisé en 10 minutes.** Après 7 messages à Paul, l'audit, une exécution de Jean-Claude et une révision, tout est bloqué jusqu'au lendemain (429 « quota journalier de lancements atteint »). « Préremplir mon profil » est bloqué lui aussi.
- **E1, une « rectification » restante.** « Je rectifie ce que j'ai dit plus haut : l'audit de Martine est terminé », alors que Paul l'avait annoncé en cours à 08:02, ce qui était exact.

## 2. Analyse

### Q1 : un seul compteur pour deux usages très différents

`assertRunQuota` (`src/lib/agent-runs.ts`) additionne deux choses sous la même limite `Company.dailyAgentRunLimit` (10 par jour, 100 par mois) :

- les tentatives d'exécution d'agents (`AgentRunAttempt`, relances comprises) ;
- les appels directs au modèle, enregistrés comme `UsageReservation` par `reserveUsageBudget` : chaque message à Paul (`co_ceo_chat`), chaque « Préremplir mon profil » (`onboarding_interpret`) et chaque mise en ligne du site (`site_publish`).

Un message à Paul coûte beaucoup moins cher qu'une exécution d'agent, mais compte autant. Le plafond de dépense (5 $ par jour, 25 $ par mois, avec 1 $ réservé par appel en cours) protège déjà le coût. Les deux fenêtres sont calculées en UTC : le « demain » du message tombe à 1 h ou 2 h, heure de Paris.

### E1 : une seule référence, le dernier message de Paul

`buildCurrentStatus` (`src/lib/agents/co-ceo.ts`, story 3.5) marque `depuisMonMessagePrecedent` en comparant chaque état au **dernier** message de Paul. L'historique transmis au modèle n'a pas d'heures. Dans le test, Martine a fini entre le message de 08:02 (« en cours ») et celui de 08:03 (qui n'en parlait pas). Au tour suivant, rien n'indique que le changement est postérieur à 08:02 ; Paul lit « en cours » dans son historique, « terminé » dans l'état, et conclut à une erreur.

## 3. Impact sur les documents

| Document | Changement |
| --- | --- |
| PRD « Paul fiable » | FR-17 (quota), FR-18 (aucune fausse rectification) ; question ouverte 4 sur les valeurs du quota. |
| `epics.md` | Épopée 4, stories 4.1 et 4.2 ; FR17 et FR18 dans l'inventaire et la carte de couverture. |
| Architecture | Aucun nouveau principe. 4.1 ajoute deux colonnes à `Company` (migration additive) ; 4.2 ne change que `buildCurrentStatus` et le prompt. |
| `sprint-status.yaml` | Épopée 3 et story 3.4 en « done » ; épopée 4 en « backlog ». |
| Recette manuelle | Une étape ajoutée par la story 4.2 (changement entre deux messages de Paul). |

## 4. Le choix à faire : quel quota ?

Question pour les PF : combien d'échanges et de lancements un dirigeant peut-il faire par jour ?

| Option | Principe | Avantages | Risques |
| --- | --- | --- | --- |
| **A (recommandée)** | Deux compteurs : **messages à Paul** (proposé : 50 par jour, 500 par mois, « Préremplir » compris) et **lancements d'agents** (inchangé : 10 par jour, 100 par mois, mise en ligne du site comprise). Le plafond de dépense reste la vraie limite de coût. | Une séance normale ne bloque plus ; le dirigeant comprend la différence entre parler et lancer ; les limites des agents ne bougent pas. | Une migration et un écran d'administration à adapter. |
| B | Un seul compteur relevé (par exemple 40 par jour, 400 par mois). | Une ligne à changer. | Un dirigeant qui parle beaucoup bloque encore ses agents, et l'inverse ; le problème revient à l'échelle. |
| C | Plus de compteur pour Paul : seul le plafond de dépense le limite. | Le plus simple pour l'utilisateur. | Aucun garde-fou contre un usage anormal (boucle, script) avant le plafond en dollars. |

Dans les trois options :

- le jour se compte en heure de Paris (minuit), et le message dit quand réessayer (« demain matin », « le 1er novembre ») ;
- « Contactez l'administrateur » n'apparaît plus dans un message destiné au dirigeant ;
- avant de fixer les chiffres, un PF relève sur la page Admin le coût réel du compte de test du 24 octobre (ligne « Jour UTC »). Si 10 minutes d'usage dépassent 2 $, le plafond de dépense de 5 $ bloquera lui aussi une séance, et devra être revu dans la même décision.

## 5. Correction proposée pour E1

Chaque exécution et chaque action de `get_current_status` porte un champ de plus, `aChangeApresMonMessageDe` : l'heure du dernier message de Paul **antérieur** au changement (début, fin ou mise à jour), parmi les messages de l'historique qu'il relit. Il est nul si le changement précède tous ces messages.

Règle du prompt : un élément dont `aChangeApresMonMessageDe` n'est pas nul a changé **après** ce que Paul en a dit ; ce n'est jamais une erreur. Paul annonce « depuis, Martine a terminé (08:03) », et n'emploie pas « je rectifie », « je dois corriger » ou « c'était faux ». Une vraie correction ne vise qu'un élément qui n'a pas changé depuis le message qui l'annonçait.

`depuisMonMessagePrecedent` reste : il dit ce qui est nouveau depuis le dernier message, à annoncer en premier.

## 6. Plan

| Story | Contenu | Dépend de |
| --- | --- | --- |
| 4.1 Parler à Paul ne consomme pas les lancements | Option retenue par les PF ; jour de Paris ; message clair. | décision des PF |
| 4.2 Aucune fausse rectification | Champ `aChangeApresMonMessageDe`, règle du prompt, étape de recette. | story 3.5 |

Ordre : 4.2 peut partir tout de suite ; 4.1 attend le choix des PF. Les deux touchent des fichiers différents (`agent-runs.ts` et l'administration pour 4.1, `co-ceo.ts` pour 4.2).

## 7. Transmission

- **PF** : choisir l'option (A, B ou C) et les chiffres ; relever le coût réel du test sur la page Admin.
- **Développement** : `bmad-build` story par story, comme pour les épopées 1 à 3 ; recette manuelle rejouée en production après fusion, sur un nouveau compte.
