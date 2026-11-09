---
title: 'GH-291 — Importer une photo et confirmer les droits avant de valider un visuel'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
baseline_commit: '1e348fa'
context:
  - '{project-root}/docs/bmad/implementation/spec-gh-290-confirmer-ma-marque.md'
  - '{project-root}/docs/charte.md'
---

## Intent

**Problème :** le visuel de #290 reprenait implicitement une photo du site, sans que le dirigeant ait choisi la photo ni confirmé qu'il peut l'utiliser.

**Approche :** le dirigeant importe une photo dans le visuel d'un post ; la photo est portée par la version, et les droits d'utilisation se confirment à la validation de cette version, en plus de la relecture.

## Livré

- **Import** depuis l'atelier (« Importer une photo » / « Remplacer la photo ») : `POST /api/contents/[id]/photo` (multipart `file`, `alt`, `number`).
  - Taille maximale **1 Mo** (comme la maquette). Le navigateur réduit la photo (1080 px, qualité décroissante) ; le serveur recontrôle la taille, le type réel (JPG, PNG, WebP, jamais le nom ni le type annoncé) et l'en-tête image.
  - Stockage Vercel Blob sous `content-photos/{entreprise}/{contenu}/`. Les contrôles passent avant le stockage ; si la version n'est pas créée, le fichier est supprimé.
  - Nouvelle version « Photo importée par vous, droits à reconfirmer », validation retirée. Composition « Photo & signature » choisie si aucune ne l'était.
  - Refus : version obsolète (M-02, 409), contenu qui n'est pas une publication de réseau social (M-97), version programmée ou diffusée (règles de #289), retouches de texte non enregistrées (bouton inactif et message M-60). L'adresse et la version sont fixées au clic : changer de page pendant l'envoi ne rattache jamais la photo à une autre production.
- **Texte alternatif** obligatoire (1 à 200 caractères), proposé par défaut (« Photo de {entreprise} »), repris dans la description de l'image.
- **Droits** : à la validation d'une version qui porte une photo, case « Je confirme le visuel et les droits d'utilisation » en plus de « J'ai relu le contenu » ; vérifiée côté serveur (M-96) ; enregistrée sur la version (`rightsConfirmedAt`). Toute nouvelle version garde la photo mais repart sans confirmation.
- **Retirer la photo** : nouvelle version sans photo ; plus de droits à confirmer.
- **Sans photo** : illustration neutre de la marque (aplat des couleurs), jamais d'image générée ni de banque d'images. Le visuel n'emprunte plus les photos du site.
- **Suppression du compte** : les photos des versions sont supprimées du stockage avec celles du site.

## Décisions

- **1 Mo** retenu (et non plus avec redimensionnement serveur) : le navigateur réduit déjà la photo, le serveur reste strict.
- **Une photo par version**, reprise par les versions suivantes ; les anciens fichiers restent tant que le compte existe, car les archives les affichent.
- **Droits par version, pas par photo** : « portée par la version, invalidée par tout changement ». Changer le texte ou la marque demande donc de reconfirmer.

## Reporté

- Lien « Confirmer ma marque » dans le refus de droits : déjà présent pour la marque (M-93) ; pas de lien propre aux droits (aucune page ne les gère).
- Photo de réalisation (#317) : sa modification retirera la confirmation quand cette mission existera.
- Import réel dans le parcours navigateur : le stockage n'est pas configuré en CI. Le parcours (`tests/user-journey.spec.ts`, lot Marque & visuel) valide une version portant une photo posée en base : case des droits obligatoire, puis « Droits confirmés pour cette version ».

## Vérification

- `npm run test:brand-kit` : contrôles de photo, texte alternatif, dossier de l'entreprise, droits, description du visuel.
- `tests/security.spec.ts` : fichier absent, texte alternatif absent, type, taille, image illisible, autre entreprise, version obsolète, M-96, droits portés par la version, retrait, M-97.
- `tsc`, ESLint et `next build`.

## Impacts et retour arrière

Migration additive `20261109110000_photo_visuel` (CODEOWNERS). Retour arrière : supprimer `ContentVersion.photo` et `rightsConfirmedAt`.
