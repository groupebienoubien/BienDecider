---
title: 'GH-290 — Confirmer ma marque avant de créer des visuels'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
baseline_commit: 'f6de8c2'
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

## Intent

**Problème :** aucune identité de marque n'existe : un visuel ne pourrait respecter ni les couleurs ni le ton de l'entreprise, et rien n'empêche de valider un visuel sans que le dirigeant ait confirmé son identité.

**Approche :** un kit minimal confirmé une fois (couleur principale, accent, ton), un rendu déterministe d'un visuel simple à partir de ce kit, et un refus de valider un visuel tant que la marque n'est pas confirmée. Changer la marque recompose chaque visuel dans une nouvelle version.

## Livré (PR « Refs #290 »)

- **Entreprise > Ma marque** (`#ma-marque`) : aperçu (nom, palette), origine de chaque élément (« Lu sur … », « Identité proposée, non issue d'un site », « Saisi par vous »), statut « À confirmer » ou « Confirmé par vous », typographie indiquée comme proposition, trois règles de contenu.
- **Formulaire** : couleur principale, accent, ton (Clair, concret, rassurant / Chaleureux et accessible / Précis et expert), case « Je confirme ces éléments pour les prochaines créations » obligatoire. Contrôlé côté serveur (`POST /api/entreprise/marque`).
- **Proposition de départ** : la palette lue sur le site à l'étape 2 est conservée à l'inscription (`Company.brandProposal`), jamais confirmée d'office ; sans site, identité proposée.
- **Visuel simple** (`src/lib/brand/render.ts`) : deux compositions (« Photo & signature », « Cadre éditorial »), SVG déterministe, accroche ajustée au cadre (taille réduite puis « … », cinq lignes au plus), photo du site si elle existe. Choisi dans l'atelier pour une publication de réseau social ; aperçu et route `GET /api/contents/[id]/visuel?n=` partagent le même rendu.
- **Refus de valider** sans marque confirmée : serveur (M-93) et interface (bouton inactif, lien « Confirmer ma marque »).
- **Modifier la marque** : une version système par visuel modifiable, validation retirée, refus s'il existe une programmation (M-94, annuler d'abord), J-32 « Identité de marque confirmée. Le visuel doit être validé à nouveau. ». Marque inchangée : rien n'est écrit.
- **Instantané par version** (`ContentVersion.brandSnapshot` : nom, palette, ton, composition) : les archives ne changent pas rétroactivement.

## Livré dans la seconde PR (lot Marque & visuel)

- **Logo** PNG, JPEG ou WebP, 500 Ko au plus : ajouter, remplacer, retirer (`POST` et `DELETE /api/entreprise/marque/logo`). Type réel, taille et en-tête contrôlés avant tout stockage ; fichier sous `brand-logos/{entreprise}/` ; origine « Importé par vous ».
- **Logo dans le visuel**, dans ses proportions, pour les deux compositions ; repris dans l'instantané de chaque version.
- **Changer le logo** : comme la marque, une version de chaque visuel à valider à nouveau, refus si un visuel est programmé (M-94), J-33 au journal. L'ancien fichier n'est supprimé que si aucune archive ne le cite ; la suppression du compte efface logo et anciens logos.
- **Stratégie > À valider par vous** : « Votre marque · à confirmer » avec « Confirmer ma marque », dès qu'un contenu peut porter un visuel (#283).
- **Parcours navigateur à 360 px** (`tests/user-journey.spec.ts`) : marque attendue dans la Stratégie, visuel composé et validation refusée, case obligatoire, confirmation, changement de couleur, version suivante, archive inchangée, droits de la photo (#291), sans défilement horizontal.

## Reporté

- Import réel d'un logo dans le parcours navigateur : le stockage n'est pas configuré en CI ; le logo est posé en base pour le test serveur.

## Décisions

- **Opt-in du visuel.** Un contenu n'a de visuel que si le dirigeant en choisit une composition (`MissionContent.visualComposition`). Les contenus existants ne sont donc ni bloqués ni versionnés. `hasVisual` (règle M-65 d'Instagram) lit cette colonne.
- **Pas de publication d'image.** Aucun canal ne publie encore d'image : le visuel est aujourd'hui composé, validé et archivé, pas diffusé. Le rendu partagé garantit que l'image qui sera publiée est celle qui a été validée.
- **Photo.** La première photo du site de l'entreprise (`SitePhoto`) sert de fond ; le choix d'une photo et la vérification des droits relèvent de #291.

## Vérification

- `npm run test:brand-kit` : normalisation des couleurs, proposition, formulaire, déterminisme du rendu, échappement, ajustement de l'accroche.
- `tests/security.spec.ts` : refus M-93, instantané, archive inchangée, M-94, J-32, isolation entre entreprises (nécessite la base de test de la CI).
- `tsc`, ESLint et `next build` passent.

## Impacts et retour arrière

- Migration additive `20261109100000_marque_confirmee` (CODEOWNERS : approbation de l'autre développeur). Retour arrière : supprimer les colonnes `brand*`, `visualComposition`, `brandSnapshot`.
- `tsconfig.json` : `allowImportingTsExtensions` (sans effet à l'émission, `noEmit`) pour que les tests `node --test` chargent les règles pures.
