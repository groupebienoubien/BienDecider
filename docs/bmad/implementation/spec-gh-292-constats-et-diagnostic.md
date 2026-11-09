---
title: 'GH-292 — Premiers constats sourcés, et Diagnostic & positionnement dans Entreprise (première partie)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '325e594ce0270fdf1f3d3990db6c972e58c6b221'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md'
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/spec-fonctionnelle.md'
  - '{project-root}/docs/charte.md'
---

## Intent

**Problème :**
- L'étape 2 du parcours d'entrée s'appelle « Premiers constats » (spécification §1.1), mais n'en montre aucun : seulement le lien de la fiche Google, des contacts et des couleurs. FR-6 n'est pas tenue.
- À l'inscription, rien de ce qui a été lu n'entre dans le compte. Le diagnostic reste vide jusqu'au premier audit, et « Préparer mes missions » (#284) renvoie vers le diagnostic.
- Entreprise montre encore « Votre équipe » (Martine, Camille, Jean-Claude), contre D3, et aucun diagnostic.
- « Preuve utilisée » (Stratégie) et « Pourquoi cette mission ? » (détail) disent « Constat relevé par Paul », même quand la mission est reliée à un constat (#168).

**Approche (Refs #292, première partie) :**
- **Étape 2.** Jusqu'à trois constats, chacun avec sa certitude, le fait relevé, sa conséquence possible, sa source et sa date de lecture.
- **Inscription.** Les constats deviennent des `AuditFinding` sans exécution. Ils forment le diagnostic de départ jusqu'au premier audit terminé (`splitAudits`, inchangé).
- **Entreprise › Diagnostic & positionnement.**
  - Résumé chiffré, date du relevé et les actions (Corriger mon profil, Voir les constats et les missions, Questionner avec Paul, diagnostic détaillé).
  - « Des constats aux décisions » : constat et certitude, ce que Paul en déduit, suite proposée.
  - « Ce qu'il nous manque ».
  - « Votre équipe » est retirée.
- **Provenance.** « Preuve utilisée » et le détail d'une mission reprennent la provenance de `missionProvenance`, avec « Voir la source ».

## Boundaries & Constraints

**Always :**
- **Certitude.** La certitude d'un premier constat ne vient jamais du modèle :
  - « Observé » seulement si sa source est une page réellement lue ou la fiche Google lue, avec la date de lecture ;
  - sinon « Piste à qualifier », sans source ni date.
- **Règles de secours.** Sans constat du modèle, les règles ne disent que ce que la lecture a établi : fiche Google trouvée, site lisible. L'absence de site et de fiche n'est dite que si la fiche a été cherchée sans résultat et qu'aucun site n'a été déclaré.
- **Bornes.** Trois constats au plus ; fait et conséquence de 10 à 200 caractères, sans balise ; aucun chiffre, note ni citation d'avis Google demandés au modèle.
- **Suite proposée.** Une ligne d'Entreprise ne montre une déduction que si une mission en découle (hors écartée ou arrêtée) ; sinon « — » et « À discuter avec Paul ».
- **Ce qu'il nous manque.** La liste est tirée du profil, jamais supposée ; la performance des concurrents est dite « non accessible ».
- **Charte.** Paul seul, de 320 à 1440 px, sans défilement horizontal.

**Never :**
- Pas de positionnement, d'axes ni de concurrence affichés sans données réelles (voir les reports).
- Aucune migration : `AuditFinding` porte déjà la catégorie, la source, son statut et la certitude (#168).
- Aucun contenu Google conservé au-delà du lien de la fiche.

## Reports

Dans `deferred-work.md` :
- positionnement, axes et concurrence locale, avec les concurrents à confirmer ou écarter ;
- « Corriger cette information » sur un constat, et la boussole avec la capacité disponible ;
- missions de départ reliées aux premiers constats, et `SourceRead` du site lu avant compte.

## Vérification

- **Unitaires (`test:delegation`) :**
  - certitude contrôlée et constats gardés ;
  - repli par règles ;
  - relecture du brouillon ;
  - reprise au compte ;
  - lignes, résumé et manques d'Entreprise.
- **Parcours (`test:ux`, CI) :**
  - étape 2 à 360 px : constat observé avec source et date, piste sans source ;
  - inscription : deux `AuditFinding` ;
  - Entreprise : certitudes, « À discuter avec Paul », « Voir la source », « non accessible », sans défilement horizontal.
