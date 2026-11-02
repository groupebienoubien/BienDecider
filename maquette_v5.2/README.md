# Maquette V5 · BienDecider

Référence fonctionnelle du parcours dirigeant, de la découverte à la boucle **mission → atelier → validation → diffusion → bilan → décision**. Elle sert de spécification pour la production : les règles et les écrans sont à reproduire, les services (comptes, IA, envois) sont simulés.

Ouvrir `index.html` directement, sans serveur. L'état est enregistré dans le navigateur (clé `biendecider-maquette-v5`, schéma 3 ; les états des schémas 1 et 2 sont migrés sans perte de documents).

## Parcours nouveau dirigeant

| # | Écran | URL | Règle |
| --- | --- | --- | --- |
| 0 | Découverte | `#/decouvrir` | Bouton principal **C'est parti**. « Retrouver mon compte » est un accès secondaire pour un compte déjà créé. |
| 1 | Découverte de l'entreprise | `#/bienvenue` | Prénom, entreprise, localisation (ville/commune), site (ou « pas de site »). La localisation est distincte de la zone d'intervention. Pas d'e-mail. |
| 2 | Compréhension | `#/bienvenue` | Profil compris par Paul, à confirmer ou corriger. |
| 3 | Ambition | `#/bienvenue` | Texte libre conservé tel quel, interprété par Paul puis confirmé. Modifier le texte après interprétation invalide la confirmation. |
| 4 | Diagnostic | `#/diagnostic` | Succède directement à l'ambition. Synthèse du diagnostic et des trois premières missions identifiées (preuve, cible, périmètre, réserve). Bouton **Ça m'intéresse**. Aucun compte ni mission créés. |
| 5 | Création de compte | `#/inscription` | E-mail seul. Crée le compte et ouvre la Stratégie. |
| 6 | Stratégie | `#/paul` | Espace connecté. Missions à l'état « proposée ». |

Garde-fous de navigation (`resolveView`, `state.js`) :

- Un parcours incomplet ramène à son étape (`bienvenue`, `diagnostic` ou `inscription`), y compris après rechargement ou saisie manuelle d'une URL.
- Une page de l'espace connecté est inaccessible sans compte créé ni session ouverte : retour à `#/decouvrir`.
- On ne saute pas d'étape : `diagnose`, `interest` et `onboard` refusent un état qui n'a pas passé l'étape précédente.
- Revenir avant l'étape 4 annule le diagnostic ; les saisies sont conservées.
- Le niveau de délégation n'est pas demandé pendant l'inscription ; il se règle et se modifie dans Entreprise > Canaux & délégation.
- Un nouveau parcours sur un navigateur qui contient déjà un compte demande une confirmation explicite avant d'effacer les données.
- La reconnexion se fait par e-mail seul et exige un compte existant dans ce navigateur.

## Missions, crédits et périmètre

- **Crédits** : 20 crédits fictifs à la création du compte. Création d'une mission : 0. Lancement : 3. Une révision demandée à Paul : 1. Reprise après pause ou après remise au plan : 0 (pas de double facturation). Plus de limite de temps ni de capacité.
- **Trois modèles d'action** : agences (`agencies`), prospects (`leads`), réalisation (`proof`). Une mission créée par l'utilisateur (page `#/missions/nouvelle`, 10 maximum) reprend l'un des trois modèles avec son propre titre, objectif, périmètre, document et versions. Titre de 5 à 80 caractères, objectif de 5 à 120, raison de 10 à 300, sans `<` ni `>`.
- **Cycle de vie** : proposée → active → bilan → décision. Une mission écartée se remet au plan ; elle retrouve son état « en pause » si elle l'était. Une mission close ou écartée ne se relance pas.
- **Périmètre** : 1 ou 2 agences sur 6, jusqu'à 8 contacts sur 27, une réalisation sur 4. Figé après lancement.
- **Contacts** : import CSV simulé, ancienneté de 24 mois et droit de recontact contrôlés, adresses `.example` uniquement. Le changement de contacts réinitialise la confirmation globale (`contactsConfirmed`).
- **Versions** : toute version validée puis diffusée est en lecture seule. Une modification crée une nouvelle version à valider ; les anciennes sont conservées.
- **Marque et logo** : un changement ajoute une version à chaque visuel Facebook (y compris des missions créées) et retire la validation. Refusé si un visuel est programmé. Logo en PNG, JPEG ou WebP, taille limitée.
- **Diffusion** : jamais sans validation explicite et confirmation. Un canal doit être connecté (retour à la confirmation après connexion). La déconnexion d'un canal annule les programmations et les liste.
- **Bilan** : rattaché à une mission, rendez-vous supérieurs aux demandes qualifiées refusés, champs vides différents de zéro. Changer de mission dans le formulaire recharge les chiffres de celle-ci.
- **Paul** : assistant par intentions (règles, pas d'IA). Ses propositions ne modifient l'état qu'après acceptation.

## Simulé ou à produire

| Simulé dans la maquette | À réaliser en production |
| --- | --- |
| Compte par e-mail seul, sans mot de passe ni vérification | Authentification réelle, vérification de l'e-mail, sessions serveur |
| Diagnostic, concurrents (échantillon fictif), agences, contacts | Analyse réelle du site et du marché, provenance et date de chaque source |
| Paul (règles et mots-clés) | Modèle d'IA, limites de contexte, traçabilité des décisions |
| Crédits fictifs | Facturation, grille de crédits, remboursement |
| Connexion Gmail et Facebook, envoi, programmation | OAuth, stockage chiffré des jetons, ordonnanceur, reprise sur erreur |
| Enregistrement dans le navigateur | Base de données, droits, audit |
| Export JSON du journal | Export soumis à consentement. Il contient les champs libres (ambition, bilans, journal) : ne pas le présenter comme anonymisé |

Limites connues :

- Trois modèles d'action seulement ; une idée d'un autre type reste une note.
- Le détail de l'onglet Entreprise > Diagnostic est un exemple figé, présenté comme tel.
- En « préparation seule », le prochain pas peut encore proposer de connecter ou de diffuser ; la diffusion manuelle et son bilan ne sont pas modélisés.
- Quelques réponses de Paul sont approximatives : la remise au plan annonce « à décider » même pour une mission reprise en pause, et le périmètre d'une mission d'agences créée peut être nommé « contacts ».
- Le lancement affiche encore un bouton sur une mission close ou écartée ; l'action est refusée par la logique.
- Accessibilité : fenêtres natives `dialog`, saut au contenu, cibles de 44 px, contrastes 4,5 et plus. Non éprouvé avec NVDA ou VoiceOver.

## Vérifier

```bash
node --test maquette_v5/state.test.cjs
```

42 tests couvrent la logique (`state.js`) et Paul (`paul.js`) : ordre diagnostic, intérêt, inscription ; routage et migration ; crédits et pause ; cycle complet d'une mission créée pour chaque modèle ; versions et marque ; contacts ; bilans ; rendu des vues.

Parcours vérifié dans Chromium à 1440 px et 390 px (sans erreur de console, sans débordement horizontal à 320 px sur les pages clés) : C'est parti, diagnostic, rechargement, retour arrière, accès direct refusé, inscription, création et ajustement d'une mission, lancement, validation, connexion Gmail et diffusion, version lue seule, bilan refusé puis accepté, décision, logo, programmation Facebook puis déconnexion, export, déconnexion, accès refusé et reconnexion.
