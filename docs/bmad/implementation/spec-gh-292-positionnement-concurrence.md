---
title: 'GH-292 — Concurrence locale, à confirmer ou écarter (deuxième partie)'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'ce4904cd1a4644544195e29d283bd325e497570b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/planification/prds/prd-BienDecider-cible-v5.2-2026-11-04/prd.md'
  - '{project-root}/docs/bmad/planification/gap-analysis-maquette-v5.2-2026-11-04.md'
  - '{project-root}/docs/bmad/implementation/spec-gh-292-constats-et-diagnostic.md'
  - '{project-root}/docs/bmad/implementation/spec-gh-169-292-corriger-un-constat-et-reperes.md'
---

## Intent

**Problème :**
- #292 (FR-51) demande une « Concurrence locale » (acteur, angle, ce qu'il montre, ce qu'il ne montre pas, fiabilité) avec des concurrents à confirmer ou écarter, et « un concurrent écarté n'est plus proposé ». Les deux PR précédentes (#349, #354) ont volontairement laissé ce lot de côté.
- Un constat de catégorie `concurrence` existe déjà (titre, résumé, ce qui fonctionne, à améliorer, source, certitude) mais n'a ni affichage dédié ni statut : rien ne distingue un concurrent à confirmer d'un constat quelconque.

**Approche :**
- **Affichage.** « Concurrence locale », sous « Des constats aux décisions » dans Entreprise : les constats `concurrence` du diagnostic courant, réaffichés sous l'angle acteur / angle / montre / ne montre pas / fiabilité (réutilise directement titre / contenu / `whatWorks` / `toImprove` / certitude — aucune nouvelle donnée demandée au modèle).
- **Statut.** Deux dates sur `AuditFinding`, posées seulement sur un constat `concurrence` : `competitorConfirmedAt`, `competitorDismissedAt`, jamais les deux à la fois. Par défaut (aucune des deux) : « À confirmer ».
- **Action.** « Confirmer » (immédiat) et « Écarter » (derrière un dialogue qui annonce l'effet), `POST /api/entreprise/concurrents/{id}/statut`, `{ action: "confirmer" | "ecarter" }`. J-39 / J-38.
- **Jamais reproposé.** L'agent marketing (`runMarketingAgent`) reçoit la liste des titres de concurrents déjà écartés (toutes périodes confondues) dans son system prompt, avec consigne explicite de ne pas les reproposer.

## Boundaries & Constraints

**Always :**
- Un seul des deux champs (`competitorConfirmedAt`/`competitorDismissedAt`) est non nul ; écarter après confirmation remplace, jamais les deux ensemble.
- Seul un constat de catégorie `concurrence` et du diagnostic courant de l'entreprise de la session peut être confirmé ou écarté (`findCurrentFinding`) ; sinon 404.
- Écarter ne modifie ni mission, ni contenu, ni programmation — seulement le statut du constat et le journal.
- Fiabilité réutilise les libellés de certitude existants (Observé/Piste à qualifier/À vérifier/Déclaré par vous) : pas un nouveau concept parallèle.
- Charte : Paul seul, 320 à 1440 px, sans défilement horizontal.

**Never :**
- Pas de positionnement, d'axes, de « Ce qu'il faut retenir » ni de « Ce que Paul en fait » dans ce lot : reportés (`deferred-work.md`), ils demandent un nouvel outil d'agent et des décisions de forme.
- Aucune performance de concurrent affirmée sans source lue (inchangé : `missingInputs` continue de dire « non accessible »).
- Un concurrent écarté n'est pas supprimé ni masqué de l'historique : son statut reste visible (« Écarté »), seul un audit futur ne le reproposera pas.

## Reports

Dans `deferred-work.md` : positionnement proposé (observé/supposé/à éviter), axes de positionnement, « Ce qu'il faut retenir », « Ce que Paul en fait ».

## Vérification

- **Unitaires (`test:findings`) :** `competitorRows` (statut par défaut, confirmé, écarté, repli sans `whatWorks`/`toImprove`, catégories ignorées) ; `dismissedCompetitorNames` (dédoublonné, catégories ignorées).
- **Sécurité (`test:security`) :** origine, isolation entre entreprises, 404 sur un constat hors catégorie concurrence, 400 sur une action inconnue, confirmer puis écarter (jamais les deux ensemble), J-38/J-39.
- `tsc`, ESLint sur les fichiers touchés.
