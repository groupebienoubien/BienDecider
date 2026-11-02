---
title: 'Maquette V3 du parcours entrepreneur'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

Produire dans `maquette_v3/` une maquette statique navigable de reference, inspiree de V2 et des ecrans de premiere connexion. Paul est le seul interlocuteur et coordonne les specialistes. Le parcours relie decouverte, correction des informations, ambition, audit source, positionnement, discussion strategique, missions et actions, delegation, studio de design, marque issue des sources et publication explicite sur un canal. Les resultats alimentent la prochaine decision. Tester le parcours complet sur ordinateur et mobile. Aucun branchement reel, envoi, scraping ou modification de l'application de production.

</frozen-after-approval>

## Implementation Notes

- Perimetre isole, sans API ni migration : HTML, CSS, JavaScript et ressources locales dans `maquette_v3/`. V2 reste intacte. Aucune operation Git de publication.
- Cas coherent : Dupont Renovation, Aix-en-Provence, croissance sans recrutement. Donnees d'exemple identifiees ; observation, hypothese et confirmation distinctes.
- Etat persistant localement, navigation recuperable, confirmations avant activation et publication. Une revision annule l'approbation precedente. Deconnexion d'un canal bloque la publication.
- Tests : syntaxe JavaScript puis parcours Playwright, retour arriere, correction, brainstorming, mission, version, approbation, programmation, annulation, delegation et mobile. Verifier l'absence de debordement et le chargement des visuels.
- Realise : HTML/CSS/JS autonomes, icones Lucide et police Manrope locales avec licences, visuels V2 optimises et photographie illustrative. Etat local, formulaires, navigation par URL et dialogues accessibles.
- Verification : 14 tests Node reussis ; parcours navigateur complet ; variantes sans site, priorite prospects, retouches conservees, comparaison visuelle, dates passees refusees, archives exactes et clavier verifies. Vues controlees a 1440, 1024, 390 et 360 pixels, sans debordement horizontal ni image manquante ; aucune erreur JavaScript observee pendant le balayage final.
- V2 et code applicatif non modifies. Seule adaptation hors maquette : exclusion ESLint, comme V2. Pas de commit, push ni deploiement demande ou effectue. L'application Next.js complete n'a pas ete reconstruite pour cette maquette statique.

## Review Triage Log

- medium, corrige : une correction de zone/offre laissait une ancienne validation active ; toute correction de profil cree un brouillon a revoir et annule les programmations.
- medium, corrige : sans site, la marque annoncait une provenance web ; provenance maintenant conditionnelle.
- medium, corrige : la priorite prospects etait inaccessible dans Paul ; choix explicite et traitement du texte ajoutes.
- medium, corrige : les retouches disparaissaient en changeant d'onglet ; brouillons preserves, apercu direct et validation bloquee jusqu'a enregistrement.
- medium, corrige : un import asynchrone pouvait viser une autre production ; document et version captures au lancement.
- medium, corrige : les confirmations utilisaient le document courant mutable ; identite/version liees au formulaire, verification et fermeture lors d'une navigation.
- medium, corrige : la marque modifiait retroactivement les archives ; instantane du nom, palette et ton conserve par version.
- medium, corrige : les resultats ouvraient la derniere version ; lien vers la version executee et etat archive distincts.
- medium, corrige : la comparaison ignorait les visuels ; deux apercus visuels ajoutes.
- medium, corrige : programmation sans fuseau ; instant UTC et fuseau de confirmation conserves.
- medium, corrige : longue accroche coupee sur mobile ; ajustement du texte au contenant, verifie a 360 pixels.
- low, corrige : le lien d'evitement changeait de page ; focus direct sur le contenu sans changement de route.
- Recette complementaire : champ de date masque avant choix de programmation, menu mobile inerte lorsqu'il est ferme, restauration du texte apres annulation d'une retouche, aucune progression de CA inventee.