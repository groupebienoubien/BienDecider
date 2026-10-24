# Recette manuelle : Paul fiable (scénario Atelier Lumen)

Le parcours des tests en production du 22 et du 23 octobre 2026 ([rapport du 23 octobre](../../../BienDecider-test-entrepreneur-2026-10-23.md)), à rejouer avec le vrai modèle avant chaque mise en production touchant Paul ou les agents. Durée : 20 minutes environ.

**Persona.** Samuel Morel, Atelier Lumen, ébéniste à Nantes. 140 000 € de chiffre d'affaires par an, il vise 200 000 € par an ; un client rapporte 18 000 € ; 6 cuisines par an. Les chiffres ne se recoupent pas (6 × 18 000 € = 108 000 €, pas 140 000 €) : c'est voulu, ce sont ceux des deux tests ; le reste du chiffre d'affaires vient d'autres travaux, et Paul ne doit pas « corriger » le dirigeant. Un Instagram (`@atelierlumen.nantes`), pas de site.

## Préparation

- Environnement : la production (`https://` du domaine BienDecider) ou une préversion Vercel déployée depuis la branche à livrer, avec la clé du modèle configurée. Noter l'URL et le commit testés.
- Un compte neuf, avec une adresse jamais utilisée (par exemple `recette+AAAAMMJJ@…`). Aucune connexion (Gmail, Facebook) : rien ne doit partir.
- Heures des messages : noter l'heure (montre ou horloge du système) à la fin de chaque réponse de Paul, à la minute. La page Équipe donne le début et la fin de chaque exécution : c'est la référence pour les étapes 8 et 9.

## Étapes

| # | Ce que vous faites ou écrivez à Paul | Résultat attendu |
| --- | --- | --- |
| 1 | Onboarding : nom « Atelier Lumen », métier « Ébéniste », zone « Nantes », sans remplir votre nom. Arrivée sur l'accueil. | L'audit de Martine est **en cours** dès l'accueil ; une seule action d'audit au plan. |
| 2 | « Je fais 140 000 € de chiffre d'affaires par an et je veux arriver à 200 000 € par an. Un client me rapporte 18 000 €, je fais 6 cuisines par an. » | La période étant dite, Paul ne repose pas la question « par an ou par mois ? » et affiche **une** carte d'objectif reprenant 200 000 € par an, 140 000 € par an, 18 000 € par client, 6 clients par an. Aucun montant converti au mois dans sa réponse. Rien n'apparaît sur l'accueil avant « Confirmer ». |
| 3 | Cliquer « Confirmer » sur la carte d'objectif. | L'accueil montre l'objectif tout de suite ; l'écart est « environ 3,3 clients de plus par an » (calculé, jamais « 1 à 2 cuisines »). |
| 4 | « Mon Instagram est @atelierlumen.nantes, je travaille du lundi au vendredi de 8h à 18h. Je m'appelle Samuel Morel. » | Une carte de profil : « Compte Instagram : @atelierlumen.nantes », horaires, « Votre prénom et nom : Samuel Morel ». Après « Confirmer », la page Entreprise affiche les trois valeurs. |
| 5 | « Trouve-moi des architectes d'intérieur qui pourraient me recommander. » | Une carte « Lancer Jean-Claude : … » avec « Lancer / Plus tard ». **Aucune exécution** avant le clic (rien dans Équipe). Après « Lancer », Jean-Claude travaille. |
| 6 | Pendant qu'il travaille : « Lance Jean-Claude sur les architectes » | Paul dit que Jean-Claude y travaille déjà ; aucune nouvelle action au plan. Un clic sur « Lancer » d'une éventuelle carte ne relance rien. |
| 7 | Attendre la fin de Jean-Claude et de Martine, puis ouvrir Décisions. | Au plus 5 prospects, 2 modèles d'email, 2 pistes ; Martine au plus 2 propositions de fiche Google et 4 constats (les constats ne sont pas des décisions). **Au plus 12 décisions** en attente (15 le 23 octobre). Ouvrir chaque email : signé « Samuel Morel », jamais « Paul » ni seulement « Atelier Lumen ». Aucun événement déjà terminé. |
| 8 | « Où en est l'équipe ? » | Statuts exacts (comparer avec Équipe), avec leurs heures. |
| 9 | Aussitôt : « Où en est l'équipe ? » | Mêmes statuts. Si un agent a terminé entre les deux, Paul dit « depuis mon dernier message, … a terminé », **jamais** « c'était faux » ni « je dois corriger un point ». |
| 10 | Comparer le badge du menu, l'accueil (« Toutes les décisions (N) ») et la page Décisions. | Le même nombre partout. |
| 11 | Ouvrir un modèle d'email de Jean-Claude, puis écrire à Paul : « retire l'avertissement et signe avec mon nom » | Une carte « Demander à Jean-Claude une version 2 : … · Confirmer / Annuler ». Paul ne propose **pas** de relancer Jean-Claude. |
| 12 | Cliquer « Confirmer », attendre la fin. | Le même email passe en « Version 2 », signé Samuel Morel ; « Voir la version précédente » montre la version 1. Aucune nouvelle production, aucun nouveau prospect ; le nombre de décisions ne change pas. |

**« Au plus 12 ».** C'est l'indicateur de l'épopée : décisions en attente = productions à relire (prospects, emails, pistes, propositions de fiche ; ni les constats d'audit, ni les actions à lancer). Les plafonds donnent au plus 5 + 2 + 2 + 2 = 11 ; la marge d'une décision couvre une production d'un autre agent proposée par Paul en chemin (R8). Le test automatique, qui maîtrise chaque appel d'outil, exige exactement 11.

## Ce que vérifie le test automatique, et ce qu'il ne vérifie pas

Le bloc « Recette Atelier Lumen » de `tests/engine.spec.ts` rejoue ce parcours à chaque CI, sans modèle, dans un ordre différent : onboarding, objectif, profil, lancement, doublon, plafonds, révision, puis état et compteurs (la révision y précède l'état et les compteurs, alors qu'elle clôt la recette manuelle). Ce qu'il ne couvre pas reste à vérifier à la main :

- Compteurs : il compare la fonction de comptage partagée par le menu, l'accueil, la page Décisions et Paul, pas les pages affichées (étape 10).
- Signature : il vérifie que le nom « Samuel Morel » figure dans les consignes données à Jean-Claude, pas la signature de l'email réellement écrit par le modèle (étape 7).
- Phrases de Paul : aucune ; seuls les états, cartes et écritures en base sont vérifiés.
- Il est ignoré quand `ANTHROPIC_API_KEY` est défini pour les tests. La CI n'en a pas : l'audit d'inscription, exécuté par le serveur de test, échoue sans rien produire. Une clé présente seulement côté serveur lancerait un vrai audit et fausserait les comptes.

## En cas d'écart

Noter l'étape, l'heure, la phrase exacte de Paul et une capture. Un écart aux étapes 2, 5, 6, 9 ou 12 bloque la mise en production : il touche une promesse de l'épopée (rien sans clic, pas de doublon, pas de fausse erreur, une correction sans nouvelle exécution). Les autres écarts vont dans `docs/bmad/implementation/deferred-work.md`.

## Nettoyage

Supprimer le compte de test à la fin (page Compte, section « Supprimer mon compte et mes données », bouton « Supprimer mon compte… »), pour qu'il ne reste ni données ni décisions en attente en production. Si la suppression échoue, la noter avec l'adresse du compte.
