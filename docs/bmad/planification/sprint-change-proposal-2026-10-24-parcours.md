---
status: 'approuvé le 2026-10-24'
created: '2026-10-24'
trigger: 'Retours de Samir du 24 octobre, reproduits en production (compte Atelier Lumen du 22 octobre)'
---

# Proposition de changement : épopée 5 « Un parcours qui avance »

## 1. Déclencheur

Cinq retours d'usage, dont trois reproduits en production le 24 octobre et deux vérifiés dans le code.

## 2. Analyse

| # | Retour | Constat | Cause |
| --- | --- | --- | --- |
| P1 | Après une actualisation du diagnostic, d'anciens points restent | Vérifié dans le code | Chaque audit ajoute ses constats (`AuditFinding`) sans retirer ceux de l'audit précédent ; `src/app/diagnostic/page.tsx` les affiche tous. Chaque constat porte `agentRunId` : on sait de quel audit il vient. |
| P2 | Diagnostic → « Voir le plan d'action » → le plan renvoie vers Martine : ça boucle | Reproduit | La première action du plan est « Audit de présence en ligne et fiche Google » (Martine), encore « à lancer » alors que le diagnostic existe. Les recommandations des constats (bouton « Ajouter au plan » de chaque constat) n'y sont pas : le plan ne découle pas du diagnostic. |
| P3 | Dans le plan, les actions menées cachent les actions à faire | Reproduit | `activeItems` (`src/app/dashboard/dashboard-client.tsx`) mêle, par thème, les actions à lancer, en cours et déjà exécutées (« 14 à examiner ») ; seules les terminées et écartées vont dans l'historique. |
| P4 | Pas d'images sur le site web, ni à la création ni ensuite | Vérifié dans le code | `src/lib/site/publish.ts` interdit au modèle toute image ; aucun envoi de fichier ni stockage n'existe ; le site est une page HTML générée, servie dans une iframe sans droits. Aucune modification après publication autre qu'une nouvelle version du brief. |
| P5 | La conversation avec Paul est très difficile sur smartphone | Reproduit (375 × 812) | Panneau flottant qui ne prend pas l'écran : 366 px de conversation sur 812 ; en-tête, bandeau de contexte et trois boutons prennent 140 px ; la barre de navigation du bas recouvre le bas du panneau ; champ de saisie en 12 px (Safari iOS zoome toute la page au focus sous 16 px) ; texte des messages en 13 px ; la page derrière défile (pas de blocage du défilement). Même « Agrandir » garde la carte flottante. |

## 3. Stories proposées

| Story | Contenu | Taille |
| --- | --- | --- |
| 5.1 Un diagnostic à jour | N'afficher que les constats du dernier audit terminé ; option sur les anciens (question 1). | S |
| 5.2 Du diagnostic au plan, sans boucle | Une fois le diagnostic fait, l'action d'audit au plan n'est plus « à lancer » ; le lien du diagnostic devient « Préparer le plan à partir du diagnostic » et le plan reprend ses recommandations (question 2). | M |
| 5.3 Le plan montre d'abord ce qu'il reste à faire | Actions à lancer en tête ; actions en cours ou exécutées séparées (question 3). | S |
| 5.4 Paul utilisable sur smartphone | Plein écran sous 768 px (hauteur `100dvh`, au-dessus de la barre du bas), en-tête compact, saisie en 16 px, texte en 15-16 px, défilement de la page bloqué, champ visible avec le clavier ouvert. | M |
| 5.5 Des photos sur le site | Envoi de photos, stockage, usage dans la page générée, ajout après publication (question 4). | L |

Ordre proposé : 5.4 et 5.3 (gain immédiat, faible risque), 5.1, 5.2, puis 5.5 (le plus lourd, dépend d'un choix de stockage).

Hors épopée, toujours ouverts depuis le test du 24 octobre : F1 (texte de Paul perdu avant un appel d'outil) et O1 (503 de « Préremplir »).

## 4. Décisions des PF (2026-10-24)

1. **Anciens constats** : la page Diagnostic montre le dernier audit terminé ; un lien repliable « Diagnostic précédent du JJ/MM » donne les constats de l'audit d'avant.
2. **Plan après le diagnostic** : un bouton « Préparer le plan à partir du diagnostic » ; Paul propose 3 à 5 actions tirées des constats, rien n'est lancé ; la génération compte comme un lancement, sur clic seulement.
3. **Actions menées** : deux onglets dans le plan, « À faire (N) » ouvert par défaut et « En cours et menées (N) ».
4. **Photos** : Vercel Blob ; 8 photos au plus, 5 Mo chacune au plus, JPG, PNG ou WebP, redimensionnées avant stockage. Prérequis : un PF crée le magasin Blob du projet sur Vercel (variable `BLOB_READ_WRITE_TOKEN`).

## 5. Transmission

- **PF** : créer le magasin Vercel Blob avant la story 5.5.
- **Développement** : épopée 5 dans `epics.md`, puis `bmad-build` story par story.
