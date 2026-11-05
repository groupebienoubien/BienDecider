# Charte BienDecider

Référence de l'interface, réécrite le 2026-11-05 pour la cible V5.2 ([cible-produit.md](cible-produit.md), #276). Elle remplace la version du 2026-10-20 (retours A à G), qui reste dans l'historique de ce fichier. Toute US, maquette ou revue d'interface s'y confronte.

Sources : cahier des charges (§3 glossaire, FR-12, FR-55, NFR-8, NFR-10, NFR-11) et spécification fonctionnelle (§13 écrans, §14 messages) dans `docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/`. En cas de désaccord, le cahier des charges l'emporte sur cette charte, qui doit alors être corrigée.

## 1. La promesse

**Vous décidez. Votre activité avance.**

Paul prépare le travail pour atteindre **votre ambition**. Vous gardez le dernier mot. Chaque écran doit rendre visibles trois choses : votre cap, ce que Paul prépare, la décision qui vous revient.

Ce que BienDecider n'est pas : un CRM, un outil de gestion de contenus, un tableau de bord de chiffres.

## 2. Le parcours, colonne vertébrale

Quatre pages, dans cet ordre, partout : navigation, accueil de l'espace, récit de l'accueil public.

| Page | Question à laquelle l'écran répond | Contient |
| --- | --- | --- |
| **Stratégie** | Où je veux aller, et quelle est ma prochaine décision ? | prochain pas, ce que Paul apprend, ce qui est à valider, missions regroupées par constat |
| **Missions** | Que teste-t-on, et où en est chaque test ? | liste et détail des missions, création, périmètre, règle d'arrêt, idées à cadrer |
| **Atelier** | Quelle version dois-je valider ou diffuser ? | contenus, versions, validation, diffusion, programmation |
| **Résultats** | Qu'est-ce que ça a donné ? | bilans, diffusions et leur suivi, point de Paul, journal des décisions |

Hors du parcours :
- **Entreprise** (diagnostic et positionnement, ma marque, canaux et délégation) s'ouvre depuis le bloc de l'entreprise, en tête de la navigation.
- **Mon compte** est en bas de la navigation, avec le solde de crédits.
- **Laisser un avis** est une entrée du menu, disponible sur toutes les pages (FR-12). Le même dialogue sert à dire ce qui ne va pas (#275).
- **Administration** est réservée aux administrateurs, en bas de navigation, jamais mise en avant.

Règles :
- Le cap (bloc « Votre cap » : ambition courte, horizon, position sur le recrutement) est visible en tête de la navigation. Il n'est jamais relégué sur une ligne secondaire.
- **Un objet n'a qu'une maison.** Une mission vit dans Missions. Un contenu et sa validation vivent dans l'Atelier. Un bilan vit dans Résultats. Les autres écrans en montrent un résumé et renvoient vers cette maison, sans la dupliquer.
- Chaque page porte sa conversation avec Paul : « Discuter avec Paul » ouvre la conversation du contexte de la page (section 3).

## 3. Paul, seul interlocuteur

Décision D3, FR-55. Le produit ne présente aucun autre personnage que Paul : ni avatar, ni nom, ni « via un autre agent ». L'équipe de plusieurs agents à personnalité propre est abandonnée.

| | Règle |
| --- | --- |
| Rôle | Paul est le partenaire de croissance : il analyse, propose, prépare et coordonne. |
| Ton | Direct, synthétique, ne promet rien qu'il ne peut tenir. |
| Couleur | Encre `#111827`. Aucune couleur n'identifie plus un agent. |
| Illustration | Illustration, jamais de photo réaliste (décision actée). |
| Auteurs affichés | « vous », « Paul » ou « mise à jour automatique », rien d'autre. |

Règles :
- Une proposition est présentée comme le travail de Paul : « Paul vous propose un message pour vos anciens clients », pas « Facebook · v1 ».
- **Paul a une seule place** : un panneau de conversation intitulé « Paul à propos de… », qui nomme le contexte (stratégie, mission, contenu, résultats, ambition, positionnement, concurrence, sources, idée) et propose un sélecteur pour ouvrir les autres conversations (FR-56). Les boutons « Discuter avec Paul » et « Affiner avec Paul » ouvrent ce panneau avec le contexte de l'élément ; ils ne créent pas une autre conversation.
- On ne montre jamais au dirigeant la consigne brute donnée à Paul. On montre le résultat attendu en une phrase ; le détail est repliable.
- Retirés de l'interface : avatars et couleurs d'agents, liserés et filtres par agent, phrases du type « Camille vous propose ».

## 4. Ton, langue et vocabulaire

### 4.1 Le ton

- **Vouvoiement**, phrases courtes, verbes d'action. Un titre dit ce qu'on fait sur la page : « Votre prochaine décision », pas « Les contacts deviennent des échanges ».
- Concret avant abstrait : un chiffre, un nom, une date plutôt qu'un concept.
- Honnête sans être défensif : une limite de canal est dite **une fois**, au moment où elle compte (au moment de diffuser), puis portée par une icône ou une info-bulle. Pas de phrase de réassurance répétée en tête de chaque page.
- Paul parle à la première personne dans ses propositions et ses messages ; l'interface, elle, reste neutre.

### 4.2 Règles de rédaction

- **Aucun terme technique, aucun anglicisme visible** (NFR-10). Exemples à bannir : jeton, token, agent, prompt, run, webhook, API, quota, erreur 500. On dit ce qui se passe et ce que le dirigeant peut faire.
- **Aucun chiffre inventé** (NFR-11). Ce qui n'est pas mesuré s'affiche « — », jamais 0. Le **déclaré** (saisi par le dirigeant) et l'**observé** (relevé par Paul ou le canal) sont toujours distingués, avec les mots « déclaré » et « observé ». Aucune mention de démonstration ou de simulation.
- **Messages d'erreur** : ceux de la spécification §14 (codes M-01 et suivants) font référence. Un nouveau message suit leur forme : une phrase qui dit ce qui manque ou ce qui bloque, puis la marche à suivre ; jamais de code technique ni de reproche.
- **Journal** : les textes du journal suivent la spécification §15 (codes J-01 et suivants), avec leur auteur.

### 4.3 Vocabulaire figé

Le glossaire du cahier des charges (§3) fait foi. Les termes ci-dessous ne changent pas d'un écran à l'autre.

| Terme | Sens, et usage |
| --- | --- |
| **Stratégie** | Page qui relie l'ambition, les constats, les missions et les apprentissages ; met en avant le prochain pas. |
| **Mission** | Test limité issu d'un constat : modèle d'action, canal, résultat recherché, périmètre, règle d'arrêt. Statuts : À décider, En cours, En pause, Arrêtée, Écartée. |
| **Modèle d'action** | Type de mission du catalogue (Partenariats, Réalisation, Réactivation, Publication, etc., et Sur mesure). |
| **Périmètre** | Ce sur quoi porte une mission (1 ou 2 agences, 1 à 8 contacts, 1 réalisation…). Figé au lancement. |
| **Atelier** | Page où l'on travaille un contenu, version par version. |
| **Contenu** | Ce que Paul prépare pour une mission (e-mail, publication, fiche Google, réponse à un avis, page du site). |
| **Version** | État précis d'un contenu (V1, V2…). Une version diffusée est en lecture seule ; on en crée une nouvelle pour la modifier. |
| **Valider** | Accord du dirigeant sur une version précise. **Ne diffuse rien.** Bouton : « Valider cette version », « Valider sans diffuser ». |
| **Confirmer la diffusion** | Geste distinct de la validation : publier ou envoyer une version validée, maintenant ou programmée. Bouton : « Confirmer la diffusion », « Confirmer l'envoi ». |
| **Programmer** | Choisir une date et une heure futures pour une diffusion ; annulable, le contenu reste validé. |
| **Diffusion déclarée** | Diffusion faite par le dirigeant lui-même et déclarée (« J'ai diffusé moi-même »), distincte d'une diffusion confirmée par le canal. |
| **Bilan** | Déclaration du dirigeant sur ce qu'une mission a produit après une diffusion. |
| **Décider la suite** | Poursuivre, adapter avec Paul ou arrêter la mission, après le bilan. |
| **Crédits** | Unité de consommation visible du dirigeant ; solde affiché dans Mon compte et en bas de navigation. |
| **Canal** | Facebook, Instagram, LinkedIn, fiche Google, Gmail ou site vitrine. Une connexion n'autorise aucune diffusion. |

Anciens termes à ne plus employer, et leur équivalent :

| Ancien terme | Équivalent |
| --- | --- |
| Avec Paul (page ou entrée de menu) | « Discuter avec Paul » (bouton), « Paul à propos de… » (panneau) |
| Studio | Atelier |
| Production | Contenu ; une itération se dit Version |
| Plan d'action, Plan | Stratégie (la page), missions (les éléments) |
| Décisions (page ou compteur) | « Votre prochaine décision » (Stratégie), « À valider par vous » (contenus), statut « À décider » (mission) |
| Objectif (page du parcours) | Stratégie ; le souhait du dirigeant se dit Ambition, ce que vise une mission se dit résultat recherché |
| Approuver, rejeter | Valider cette version, Je ne veux pas de cette version |
| Publier, envoyer (en général) | Diffuser, avec la précision du canal quand elle compte |
| Budget IA | Crédits |
| Agent, équipe, Martine, Camille, Jean-Claude | Paul |

## 5. Palette, typographie et identité visuelle

Chaude, claire, posée. Le vert reste la marque, il n'est pas la seule couleur. Les jetons portent les mêmes noms et valeurs dans `src/app/globals.css` et dans la maquette V5.2 (`maquette_v5.2/styles.css`).

| Rôle | Valeur | Usage |
| --- | --- | --- |
| Fond | `#faf7f2` (crème) | fond général |
| Surface | `#ffffff` | cartes et panneaux, sans bordure quand l'espacement suffit |
| Encre | `#202824` | texte |
| Texte secondaire | `#65716a` (production), `#58635c` (maquette) | métadonnées, au plus une ligne par carte ; écart à trancher, voir plus bas |
| **Marque** | `#176b50` (vert) ; survol `#10583f` | logo, bouton principal, confirmation |
| **Accent chaud** | `#e06a30` (corail) ; texte `#9a3f12` | ce qui attend le dirigeant, moments de réussite, mise en avant ; jamais pour une erreur ni pour du petit texte en `#e06a30` (contraste insuffisant), à utiliser en aplat, pastille ou liseré |
| Attention | `#a04d26` | à vérifier, résultat incertain |
| Erreur | `#aa3d3d` | échec uniquement |
| Information | `#326594` | information neutre |
| Focus | `#438875` | anneau de focus visible de 3 px |

Règles :
- Un seul bouton principal (vert plein) par écran.
- Les sections alternent fond crème et surface blanche pour rythmer la page, au lieu de séparateurs gris.
- Les états vides et les réussites ont une phrase de Paul. Une diffusion confirmée déclenche une brève célébration (animation courte, message de Paul), désactivée si `prefers-reduced-motion`.
- Dark mode : hors périmètre, palette à décliner ensuite.

Typographie : **Sora** pour les titres, **DM Sans** pour le texte. Les titres de page sont plus grands et plus courts.

### Identité de la maquette V5.2

La maquette V5.2 reprend l'identité de la production : vert, fond crème, Sora et DM Sans, mêmes jetons. Écarts acceptés :
- Les alias historiques de la maquette (`--blue`, `--green`, `--rose`, etc.) sont ramenés sur les jetons de la charte ; ils n'existent pas en production.
- Les polices sont chargées par une feuille externe dans la maquette, par `next/font` en production.
- Les services (comptes, IA, envois) sont simulés dans la maquette ; la production ne simule rien (NFR-11).

Écarts **non acceptés**, à corriger en production et à ne pas reproduire :
- les jetons de couleur par agent (`--bd-agent-*`) et leurs usages ;
- les noms Martine, Camille et Jean-Claude restants dans les textes de la maquette (`views.js`, `paul.js`, `state.js`), et toute mention de « démonstration » ;
- l'écart de texte secondaire entre production (`#65716a`) et maquette (`#58635c`) : les fondateurs choisissent la valeur commune, qui doit tenir 4,5:1 sur le fond crème (NFR-8).

## 6. Règles de mise en page

1. **Une idée, une action principale par écran.** Le reste est secondaire, visuellement plus léger, ou replié.
2. **Trois informations maximum par carte** : quoi (titre), où en est-on (état ou preuve, une ligne), quelle décision (bouton). Canal, version et thème passent en icône ou dans le détail.
3. **Regrouper avant de lister.** Une liste de plus de 5 éléments similaires est groupée (par constat, statut ou canal) ou paginée ; les groupes sont visibles par défaut.
4. **Le détail se déplie.** Justification, consigne, historique de versions : accessibles en un clic, jamais affichés d'office.
5. **Décider une chose à la fois.** La relecture d'un contenu se fait version par version : une version, ses choix (Valider cette version, Retravailler avec Paul, Je ne veux pas de cette version), puis la suivante.
6. **Fiches plutôt que tableaux** pour tout ce qui concerne des personnes (contacts). Les tableaux sont réservés aux résultats, à l'historique et à l'administration.
7. **Mobile d'abord pour décider.** Toute décision doit pouvoir se prendre d'une main sur téléphone. Sur téléphone, la navigation est un menu latéral repliable et la page derrière est inerte quand il est ouvert.
8. **Valider et diffuser sont deux gestes.** Valider une version ne publie ni n'envoie rien ; la diffusion a sa propre confirmation, avec sa destination.
9. **Un dialogue se ferme toujours** par Échap ou par son bouton de fermeture, garde le focus à l'intérieur tant qu'il est ouvert, et se ferme quand on navigue.

## 7. Accueil public

Un seul récit, dans l'ordre du parcours (FR-1) : promesse → Paul, copilote unique → un exemple concret (ambition, plan en trois missions, extrait de contenu) → « Vous gardez la main » (trois engagements) → « Six étapes, une seule boucle » → commencer. Le bouton principal est « C'est parti » ; « Retrouver mon compte » est un accès secondaire, remplacé par « Retourner à mon espace » quand une session est ouverte. Un appel à l'action en haut et en bas. Les réserves détaillées par canal vont dans une page dédiée, liée depuis l'accueil.

## 8. Contrôle avant livraison

Une US d'interface est terminée si l'écran concerné :
- se rattache à l'une des quatre pages (Stratégie, Missions, Atelier, Résultats) ou à un réglage (Entreprise, Mon compte, Administration) ;
- n'a qu'une action principale, en vert plein ;
- respecte trois informations maximum par carte ;
- ne montre que Paul : aucun autre personnage, auteurs limités à « vous », « Paul » et « mise à jour automatique » ;
- n'affiche ni consigne brute ni réassurance répétée ;
- emploie le vocabulaire de la section 4.3 et aucun ancien terme, vouvoie, ne contient aucun terme technique (NFR-10) ;
- affiche « — » pour ce qui n'est pas mesuré, distingue déclaré et observé, ne mentionne aucune démonstration (NFR-11) ;
- reprend les messages de la spécification §14 ou suit leur forme ;
- fonctionne de 320 à 1440 px de large, sans défilement horizontal, y compris les dialogues ;
- respecte l'accessibilité (NFR-8) : dialogues à focus piégé fermés par Échap, lien d'évitement, cibles de 44 px, contraste de 4,5 au moins, messages annoncés aux lecteurs d'écran, clavier complet.
