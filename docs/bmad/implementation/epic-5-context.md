# Epic 5 Context: Un parcours qui avance

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le dirigeant passe du diagnostic au plan sans boucle, voit ce qu'il lui reste à faire, parle à Paul depuis son téléphone et montre ses réalisations sur son site. Retours d'usage du 24 octobre, reproduits en production : anciens constats affichés après une actualisation, plan dont la première action renvoie à refaire l'audit, actions menées mêlées aux actions à faire, panneau de Paul inutilisable à 375 px, site sans photos.

## Stories

- Story 5.1: Un diagnostic à jour
- Story 5.2: Du diagnostic au plan, sans boucle
- Story 5.3: Le plan montre d'abord ce qu'il reste à faire
- Story 5.4: Paul utilisable sur smartphone
- Story 5.5: Des photos sur le site

Ordre de réalisation : 5.4, 5.3, 5.1, 5.2, 5.5.

## Requirements & Constraints

- Décisions des PF (2026-10-24, `docs/bmad/planification/sprint-change-proposal-2026-10-24-parcours.md`) : dernier audit affiché, audit précédent dans un lien repliable ; plan préparé sur un bouton du diagnostic (3 à 5 actions, rien de lancé, un lancement compté) ; deux onglets au plan, « À faire (N) » par défaut et « En cours et menées (N) » ; photos sur Vercel Blob, 8 au plus, 5 Mo, JPG/PNG/WebP, redimensionnées.
- Rien n'est lancé sans clic du dirigeant (épopée 2) ; une action équivalente n'est pas recréée (story 2.4).
- Le site public reste servi dans une iframe `sandbox` sans droits ; seules les images envoyées par le dirigeant sont admises.
- Charte (`docs/charte.md`) : vouvoiement, une action principale par écran, aucun détail technique.

## Technical Decisions

- Diagnostic : `AuditFinding.agentRunId` identifie l'audit ; `src/app/diagnostic/page.tsx`, `diagnostic-client.tsx`, `/api/audit-findings`.
- Plan : `src/app/dashboard/dashboard-client.tsx` (`activeItems`, `planGroups`, `closedItems`), `src/lib/action-plan-view.ts` (`planItemStatusView`) ; génération par `enqueuePlanGeneration` et `runCoCeoPlanning` (`src/lib/agents/co-ceo.ts`).
- Paul : `src/components/paul-panel.tsx`, styles `#paul-panel` ; barre de navigation mobile du bas.
- Site : `src/lib/site/publish.ts` (`sanitizeHtml`, prompt du site), `src/app/site/[slug]/page.tsx`.
- Tests : `tests/user-journey.spec.ts` (navigateur, base jetable), `tests/engine.spec.ts` (base, CI), `tests/delegation.spec.ts` (fonctions pures, locales).

## UX & Interaction Patterns

- Onglets : motif de la page Décisions (`.tabs`, `aria-pressed`, compteur entre parenthèses).
- Mobile : sous 768 px, Paul plein écran, en-tête sur une ligne, saisie en 16 px au moins.

## Cross-Story Dependencies

- 5.2 lit le dernier audit défini par 5.1.
- 5.3 et 5.2 touchent tous deux le plan (`dashboard-client.tsx`) : 5.3 d'abord.
- 5.5 attend le magasin Vercel Blob créé par un PF.
