# Charte BienDecider

Référence de la refonte UX validée le 2026-10-20 (retours A à G). Toute US, maquette ou revue d'interface s'y confronte. Version précédente du produit : tag `v0-avant-refonte-ux`.

## 1. La promesse

**Vous décidez. Votre activité avance.**

Une équipe prépare le travail pour atteindre **votre objectif**. Vous gardez le dernier mot. Chaque écran doit rendre visibles ces trois choses : l'objectif, l'équipe qui avance, la décision qui vous revient.

Ce que BienDecider n'est pas : un CRM, un outil de gestion de contenus, un tableau de bord de chiffres.

## 2. Le parcours, colonne vertébrale

Quatre temps, dans cet ordre, partout : navigation, accueil, onboarding, récit de l'accueil public.

| Temps | Question à laquelle l'écran répond | Contient aujourd'hui |
| --- | --- | --- |
| **Objectif** | Où je veux aller, et où j'en suis ? | objectif, diagnostic |
| **Plan** | Que propose l'équipe pour y arriver ? | plan d'action |
| **Décisions** | Qu'est-ce qui m'attend ? | À décider, productions, prospection à valider |
| **Résultats** | Qu'est-ce que ça a donné ? | historique, publications, retours prospects |

Règles :
- L'objectif est affiché en tête de l'accueil, en grand, avec une progression simple. Il n'est jamais relégué sur une ligne secondaire.
- Un objet n'a qu'une maison. Une production se décide dans **Décisions**, pas aussi dans le plan et l'accueil. Les autres écrans y renvoient.
- Entreprise, Compte et Administration sont des réglages, hors du parcours, en bas de navigation.

## 3. L'équipe

Chaque agent est un personnage reconnaissable : illustration (jamais de photo réaliste, décision actée), couleur propre, ton propre. La couleur suit l'agent partout : avatar, liseré de ses productions, filtres.

| Agent | Rôle | Couleur | Ton |
| --- | --- | --- | --- |
| **Paul** | Partenaire de croissance | encre `#111827` | direct, synthétique, ne promet rien qu'il ne peut tenir |
| **Martine** | Diagnostic et fiche Google | sarcelle `#0f766e` | analytique, dit d'abord ce qui ne marche pas |
| **Camille** | Contenu et site | framboise `#be185d` | créative, concrète |
| **Jean-Claude** | Prospection | ambre `#b45309` | tenace, terre à terre |

Règles :
- Une proposition est présentée comme le travail d'une personne : « Camille vous propose un post Facebook », pas « Facebook · Camille · v1 ».
- **Paul a une seule place** : un panneau de conversation unique, ouvert depuis le même bouton sur chaque page. Les encarts et liens « Demander à Paul » ouvrent ce panneau, avec le contexte de l'élément ; ils ne créent pas une autre conversation.
- On ne montre jamais au dirigeant la consigne brute donnée à un agent. On montre le résultat attendu en une phrase ; le détail est repliable.

## 4. Le ton

- **Vouvoiement**, phrases courtes, verbes d'action. Un titre dit ce qu'on fait sur la page : « Ce qui vous attend », pas « Les contacts deviennent des échanges ».
- Concret avant abstrait : un chiffre, un nom, une date plutôt qu'un concept.
- Honnête sans être défensif : une limite de canal est dite **une fois**, au moment où elle compte (au moment de publier), puis portée par une icône ou une info-bulle. Pas de phrase de réassurance répétée en tête de chaque page.
- Les agents parlent à la première personne dans leurs propositions et messages ; l'interface, elle, reste neutre.

## 5. Palette et ambiance

Chaude, claire, posée. Le vert reste la marque, il n'est plus la seule couleur.

| Rôle | Valeur | Usage |
| --- | --- | --- |
| Fond | `#faf7f2` (crème) | fond général, remplace le gris-vert `#f6f8f6` |
| Surface | `#ffffff` | cartes et panneaux, sans bordure quand l'espacement suffit |
| Encre | `#202824` | texte |
| Texte secondaire | `#65716a` | métadonnées, au plus une ligne par carte |
| **Marque** | `#176b50` (vert) | logo, bouton principal, confirmation |
| **Accent chaud** | `#e06a30` (corail) | ce qui attend le dirigeant, moments de réussite, mise en avant ; jamais pour une erreur ni pour du petit texte (contraste insuffisant), à utiliser en aplat, pastille ou liseré |
| Attention | `#a04d26` | à vérifier, résultat incertain |
| Erreur | `#aa3d3d` | échec uniquement |

Règles :
- Un seul bouton principal (vert plein) par écran.
- Les sections alternent fond crème et surface blanche pour rythmer la page, au lieu de séparateurs gris.
- Les états vides et les réussites ont une illustration et une phrase de l'agent concerné. Une publication confirmée déclenche une petite célébration (animation brève, message de l'agent), désactivée si `prefers-reduced-motion`.
- Dark mode : hors périmètre de la refonte, palette à décliner ensuite.

Typographie inchangée : **Sora** pour les titres, **DM Sans** pour le texte. Les titres de page passent en Sora, plus grands et plus courts.

## 6. Règles de mise en page

1. **Une idée, une action principale par écran.** Le reste est secondaire, visuellement plus léger, ou replié.
2. **Trois informations maximum par carte** : qui (agent), quoi (titre), quelle décision (bouton). État, canal, version et thème passent en icône ou dans le détail.
3. **Regrouper avant de lister.** Une liste de plus de 5 éléments similaires est groupée (par agent, thème ou canal) ou paginée ; les groupes sont visibles par défaut.
4. **Le détail se déplie.** Justification, consigne, historique de versions : accessibles en un clic, jamais affichés d'office.
5. **Décider une chose à la fois.** La relecture des productions se fait en file, en plein écran : une production, ses trois choix (approuver, demander une modification, rejeter), puis la suivante.
6. **Fiches plutôt que tableaux** pour tout ce qui concerne des personnes (prospects). Les tableaux sont réservés à l'historique et à l'administration.
7. **Mobile d'abord pour décider.** Toute décision doit pouvoir se prendre d'une main sur téléphone.

## 7. Accueil public

Un seul récit, dans l'ordre du parcours : promesse → l'équipe (dès le haut de page, avec ses illustrations) → un exemple concret → « vous gardez la main » → créer son compte. Un appel à l'action en haut et en bas. Les réserves détaillées par canal vont dans une page dédiée, liée depuis l'accueil.

## 8. Contrôle avant livraison

Une US d'interface est terminée si l'écran concerné :
- se rattache à un des quatre temps du parcours ;
- n'a qu'une action principale ;
- respecte trois informations maximum par carte ;
- présente le travail des agents comme celui d'une personne, avec sa couleur ;
- n'affiche ni consigne brute d'agent ni réassurance répétée ;
- fonctionne sur téléphone.
