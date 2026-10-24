---
title: 'Story 5.5 — Des photos sur le site'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '76b17831f12a90cdd713088a0bbb5863b2e94fad'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le site d'une page généré par BienDecider ne peut contenir aucune image : le modèle a l'interdiction d'en mettre, rien ne permet d'en envoyer, et un site publié ne se modifie qu'en réécrivant le brief. Un artisan ne peut pas montrer ses réalisations.

**Approach:** décisions des PF du 2026-10-24 : le dirigeant ajoute jusqu'à 8 photos (JPG, PNG ou WebP, 5 Mo au plus chacune), redimensionnées avant stockage, stockées sur Vercel Blob ; il peut en retirer et décrire chacune (texte alternatif). À la mise en ligne, la page générée affiche ces photos, et aucune autre image distante. Un site déjà publié se republie avec ses photos actuelles sans réécrire le brief ; la republication compte comme un lancement.

## Boundaries & Constraints

**Always:** section « Photos du site » sur la page Entreprise (ancre `#photos-site`), avec un lien depuis la carte de relecture du contenu du site ; redimensionnement dans le navigateur (plus grand côté 1600 px, WebP) avant envoi ; côté serveur, session et origine vérifiées, type réel contrôlé par les premiers octets (pas l'extension ni le type annoncé), 5 Mo au plus, 8 photos au plus par entreprise ; stockage public Vercel Blob sous un chemin propre à l'entreprise ; retrait = suppression du fichier et de la ligne ; à la génération, les URL et textes alternatifs des photos sont transmis au modèle, et le nettoyage du HTML retire toute balise `<img>` (et tout `srcset`) dont l'adresse n'est pas une photo de l'entreprise ; la page publique reste servie dans l'iframe `sandbox` actuelle ; « Republier avec les photos » régénère à partir du dernier brief publié (la version approuvée), avec la même revue des affirmations que la publication ; sans `BLOB_READ_WRITE_TOKEN`, la section dit que l'envoi de photos n'est pas encore disponible, sans erreur technique.

**Never:** pas d'autre image distante dans la page ; pas de photo d'une autre entreprise ; pas de JavaScript dans la page publique ; pas de publication automatique après un ajout de photo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ajout | photo JPG de 3 Mo | redimensionnée, stockée, affichée dans la section | N/A |
| Trop lourde | fichier de 6 Mo après redimensionnement | refusé | 413, « 5 Mo au plus » |
| Mauvais type | fichier `.jpg` qui est un PDF | refusé | 415, « JPG, PNG ou WebP » |
| Neuvième | 8 photos déjà | refusée | 409, « 8 photos au plus » |
| Retrait | photo existante | fichier et ligne supprimés | photo d'une autre entreprise : 404 |
| Génération | 2 photos, HTML avec une 3e image distante | les 2 photos restent, la 3e est retirée | N/A |
| Republier | site publié, photos changées | page régénérée avec les photos ; un lancement compté | quota : message de limite (story 4.1) |
| Sans stockage | `BLOB_READ_WRITE_TOKEN` absent | section visible, envoi indisponible expliqué | 503 côté route |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` + migration additive -- modèle `SitePhoto` (`id`, `companyId`, `url`, `pathname`, `alt`, `width`, `height`, `position`, `createdAt`), relation `Company`, index `companyId`.
- `package.json` -- dépendance `@vercel/blob` (version exacte).
- `src/app/api/site/photos/route.ts` (POST, GET) et `src/app/api/site/photos/[id]/route.ts` (DELETE, PATCH du texte alternatif) -- nouvelles routes ; les déclarer dans `tests/security.spec.ts` (toute route doit l'être).
- `src/lib/site/photos.ts` (pur) -- détection du type par les premiers octets, limites, liste blanche d'URL pour le nettoyage.
- `src/lib/site/publish.ts` (`sanitizeHtml`, prompt système l. 74, message utilisateur) -- photos dans le message, prompt qui autorise `<img>` sur ces seules URL, nettoyage par liste blanche ; extraire la génération pour la republication (`republishSite(companyId)`), même revue (`reviewPublishedSiteHtml`) et même réservation `site_publish`.
- `src/app/api/site/republish/route.ts` -- POST, session et origine.
- `src/app/entreprise/page.tsx` + composant client `src/components/site-photos.tsx` -- section, redimensionnement (canvas), envoi, retrait, texte alternatif, « Republier avec les photos » si un site est publié.
- `src/components/proposal-card.tsx` (l. 180, brief de site) -- lien « Ajouter des photos ».
- `src/app/site/[slug]/page.tsx` -- inchangé.
- Tests : `tests/delegation.spec.ts` (type, limites, nettoyage), `tests/security.spec.ts` (routes), `tests/engine.spec.ts` (limites et appartenance en base, client Blob remplacé), `tests/user-journey.spec.ts` (section visible, état sans stockage).

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + migration -- `SitePhoto` -- stockage des métadonnées
- [x] `src/lib/site/photos.ts` -- contrôles purs -- sécurité et limites
- [x] routes photos et republication -- envoi, retrait, republication -- gestion des photos
- [x] `src/lib/site/publish.ts` -- photos dans la génération, nettoyage par liste blanche -- photos affichées, rien d'autre
- [x] `src/components/site-photos.tsx`, `src/app/entreprise/page.tsx`, `src/components/proposal-card.tsx` -- interface -- ajout à la création ou après
- [x] tests -- une ligne de la matrice par test -- non-régression

**Acceptance Criteria:**
- Étant donné un site publié et deux photos ajoutées, quand le dirigeant clique « Republier avec les photos », alors la page publique affiche les deux photos avec leur texte alternatif.
- Étant donné un PF qui n'a pas encore créé le magasin Blob, quand le dirigeant ouvre la section, alors il lit que l'envoi n'est pas encore disponible.

## Implementation Notes

- Dépendance `@vercel/blob` 2.8.2 ; modèle `SitePhoto`, migration `20261024180000_site_photos` (additive, à appliquer au déploiement).
- `src/lib/site/photos.ts` (pur) : type réel et dimensions lus dans l'en-tête (JPG, PNG, WebP), 5 Mo et 1600 px de côté au plus, 8 photos ; `keepOnlyCompanyPhotos` : attributs lus par un analyseur, chaque `<img>` gardé reconstruit (`src` autorisée, `alt` de la base, `loading="lazy"`), toute autre balise reconstruite sans attribut de chargement ; éléments de chargement retirés (`picture`, `source`, `link`, `use`, `meta`, `base`, `iframe`, `form`…) ; CSS normalisé (entités, commentaires, échappements) puis sans `url(`, `image-set(`, `@import`.
- `src/lib/site/photo-store.ts` : stockage remplaçable par les tests ; limite recomptée dans une transaction sérialisable ; retrait : ligne puis fichier (meilleur effort) ; `deleteCompanySitePhotoFiles` appelé avant la suppression d'un compte (route du dirigeant et route d'administration).
- `src/lib/site/publish.ts` : génération commune (`generateSiteHtml`) ; `republishSite` : dernier brief publié avec succès et approuvé, même contrôle de risque, même revue ; un point à confirmer renvoie `SiteReviewRequiredError` (409, liste des points) que l'interface fait confirmer (« J'ai vérifié, republier ») ; trace dans `executionLog`.
- Interface : `src/components/site-photos.tsx` sur la page Entreprise (`#photos-site`), redimensionnement WebP avec repli JPEG, lien « Ajouter des photos » sur la carte du site.
- Tests base, sécurité (hors déclaration des routes) et parcours : CI seulement (base locale arrêtée).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind, edge | Le filtre d'images se contourne (faux `src=` dans un attribut, `srcset` collé, échappements et commentaires CSS, entités, `<use>`, `<meta>`) | medium | expressions régulières sur le texte de la balise ; l'iframe `sandbox` charge quand même les images | patch (reconstruction des `<img>`, CSS normalisé) |
| 2 | verification-gap, edge | Republication refusée dès qu'un point demande confirmation, sans moyen de confirmer | high | l'interface envoie `{}` ; le téléphone du profil suffit à bloquer | patch |
| 3 | blind | Republication sans contrôle de risque ni trace | medium | ni `canExecuteAction` ni `executionLog` | patch |
| 4 | verification-gap | Choix du dernier brief publié non testé | low | une seule publication dans la fixture | patch (test) |
| 5 | blind, edge, verification-gap | Fichier supprimé avant la ligne | low | ordre dans `removeSitePhoto` | patch |
| 6 | blind, edge | Le retrait casse tout de suite la photo du site publié, le texte dit le contraire | medium | suppression du fichier imposée par la spec | patch (texte) |
| 7 | blind | Description modifiée sans effet sur le site, non signalé | low | message d'enregistrement | patch |
| 8 | blind, edge | Fichiers Blob publics après la suppression du compte | medium | cascade des lignes seulement | patch |
| 9 | edge | Dimensions non bornées côté serveur (dépassement d'entier) | low | seul le navigateur redimensionne | patch |
| 10 | blind, edge | Navigateur sans encodage WebP : PNG lourd refusé | low | `toBlob` rend du PNG | patch (repli JPEG) |
| 11 | blind | HEIC refusé ; orientation EXIF | low | iOS convertit en JPEG à l'envoi ; `createImageBitmap` oriente par défaut | rejet |
| 12 | blind | `position` et `pathname` inutilisés | low | prévus par la spec ; tri non demandé | rejet |
| 13 | blind, edge | Republication concurrente d'une publication | low | double action rare ; dernière écriture gagne | rejet |
| 14 | edge | Corps sans `content-length` mis en mémoire | low | Vercel borne la requête à 4,5 Mo | rejet |
| 15 | edge | `alt` envoyé comme fichier ; PATCH mal formé ; suppression concurrente | low | messages trompeurs sur des requêtes forgées | rejet |
| 16 | edge | Photo retirée pendant une génération | low | fenêtre de quelques secondes | rejet |
| 17 | subagent | Requêtes au-delà de 4,5 Mo refusées par Vercel avant la route | low | photos redimensionnées à 1600 px, bien en dessous | rejet |
