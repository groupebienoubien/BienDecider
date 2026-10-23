# BienDecider : second test en production comme entrepreneur

23 octobre 2026, nouveau compte en production, version avec les épopées 1 et 2 (commit `2fe9a56`). Même persona que le premier test du 22 octobre ([BienDecider-test-entrepreneur-2026-10-22.md](BienDecider-test-entrepreneur-2026-10-22.md)) : Samuel Morel, Atelier Lumen, ébéniste à Nantes, 140 000 € visant 200 000 € par an, 18 000 € par client, 6 cuisines par an, un Instagram et pas de site.

Parcours suivi : onboarding, objectif donné à Paul, profil (Instagram et horaires), lancement de Jean-Claude depuis une carte, nouvelle demande de prospection, « Où en est l'équipe ? » deux fois de suite, compteurs, modèles d'emails, demande de correction d'un email. Aucune connexion (Gmail, Facebook), rien d'envoyé.

## En une phrase

Paul est devenu fiable sur l'essentiel : il retient ce qu'on lui dit, ne lance rien sans clic, connaît l'état réel de l'équipe et ne crée plus de doublons. Il reste trois chantiers : le volume des productions, la correction d'une production, et sa manière de présenter un changement d'état comme une erreur.

## Ce qui est corrigé depuis le 22 octobre

| Point du premier test | 22 octobre | 23 octobre |
| --- | --- | --- |
| P1 Objectif enregistré | Rien n'était enregistré | Paul demande « par an ou par mois ? », puis affiche une carte. Après « Confirmer », l'objectif apparaît tout de suite sur l'accueil. |
| P2 État réel de l'équipe | Trois statuts faux de suite | Martine « en cours » puis « terminée », Jean-Claude « déjà au travail » : tout correspond au serveur. |
| P3 Lancement sans accord | Trois agents lancés au premier message | Deux cartes « Lancer / Plus tard », aucune exécution avant le clic (vérifié côté serveur). |
| P5 Erreur de calcul | « 1 à 2 cuisines par an », puis « 1 client par mois » | « Environ 3,3 clients de plus par an », calculé par le code. |
| V1 Compteurs | 18 sur le badge contre 16 sur la page | 15 partout : badge, accueil, page Décisions. |
| V2 Doublons | Deux actions de prospection | « Lance Jean-Claude sur les architectes » pendant que la prospection tourne : rien n'est recréé, Paul dit qu'il y travaille déjà. |
| V4 / O3 Audit d'inscription | « Je n'ai pas encore examiné votre présence » | L'audit de Martine est en cours dès l'arrivée sur l'accueil. |
| Q1 Signature « Paul » | Emails signés « Paul » | Signés « Atelier Lumen », avec les horaires confirmés dans la carte de profil. |
| Profil | Instagram perdu | Carte « Compte Instagram : @atelierlumen.nantes / Horaires », enregistrée en un clic et reprise par Jean-Claude. |
| I1 Titre de Paul | « Votre copilote » | « Partenaire de croissance » partout. |

## Ce qui reste ou est nouveau

| # | Constat | Gravité | Piste |
| --- | --- | --- | --- |
| R1 | **Volume** : un seul passage de Jean-Claude produit 13 éléments (9 prospects, 2 emails, 2 pistes). Avec Martine, cela fait 15 décisions après un quart d'heure d'usage. | haute | Story 3.2 (plafonds par passage). |
| R2 | **Correction d'une production impossible** : à « retire l'avertissement et signe avec mon nom », Paul propose une nouvelle exécution de Jean-Claude. Elle créerait de nouveaux emails à côté des anciens (probablement avec un nouveau lot de prospects), sans qu'il le dise. Il ne précise pas non plus qu'il ne peut pas modifier l'existant. | haute | Story 3.3 (révision). En attendant, Paul devrait dire clairement que la relance crée une nouvelle production. |
| R3 | **Nom du dirigeant** : Paul ne peut pas enregistrer « Samuel Morel » ; les emails sont signés du nom de l'atelier. | moyenne | Story 3.1 (`ownerName`). |
| R4 | **Changement d'état présenté comme une erreur** : « J'avais écrit qu'il était encore en cours, et c'était faux », alors que c'était vrai au moment de ce message (l'exécution tournait pendant que les premières productions arrivaient). Même chose pour Martine (« je dois corriger un point »). Le dirigeant croit que Paul se trompe alors qu'il est exact. | moyenne | Donner à Paul l'heure de chaque état (`finishedAt`, heure de son message précédent) et la consigne de dire « depuis, X a terminé » au lieu de « c'était faux ». |
| R5 | **« Préremplir mon profil » toujours en échec** (503, reproduit sur un second compte). | moyenne | Bug systématique, à diagnostiquer avec les logs Vercel (accès refusé à l'outil, 403). |
| R6 | **Avertissement RGPD dans le corps des emails** (« ⚠️ Template générique… »). | basse | Séparer l'avertissement du contenu (Q2 du premier rapport). |
| R7 | **Constat périmé** : Martine indique « aucun réseau social » alors que l'Instagram vient d'être confirmé. Paul le relativise lui-même, ce qui est bien, mais le constat reste affiché. | basse | Relancer l'audit ou marquer le constat comme antérieur au profil. |
| R8 | Paul propose de lui-même deux lancements (Camille et Jean-Claude) dès la deuxième réponse. Ce n'est pas un défaut (rien ne part sans clic), mais cela fait trois cartes sous un seul message. | basse | À observer avec de vrais utilisateurs. |
| R9 | Libellé technique sur la carte après le clic : « Action « … » du plan lancée. Jean-Claude travaille en arrière-plan… ». | basse | Phrase plus simple : « C'est lancé : Jean-Claude s'en occupe. » |

## Priorités proposées

1. **Épopée 3** telle que prévue : plafonds (R1), révision (R2), nom du dirigeant et date (R3).
2. **Paul et le temps** (R4) : une petite story, à ajouter à l'épopée 3 ou à faire à part.
3. **Bug « Préremplir »** (R5), à diagnostiquer avec les logs.
