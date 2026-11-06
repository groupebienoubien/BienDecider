---
title: 'Story 13.2 : Ne proposer que les canaux réellement disponibles pour mon compte'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '5d90d7d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-13-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** tant que Meta, Google ou LinkedIn n'ont pas approuvé l'application, seules les entreprises déclarées comme testeurs peuvent se connecter ; les autres lancent un flux voué à l'échec (#301).

**Approach:** une source unique (connecteur livré) plus un réglage d'ouverture par canal et un accès par entreprise, contrôlés côté serveur au démarrage OAuth et à la diffusion.

## Boundaries & Constraints

**Always:**
- Canal désactivé : ni affiché, ni connectable (démarrage OAuth refusé), ni proposé, ni cité par Paul ; mission sur ce canal : M-67.
- Canal réservé : « Pas encore disponible pour votre compte », « Demander l'accès » (une demande, visible en administration) ; démarrage OAuth refusé (`channel_unavailable`) ; diffusion refusée (M-67) ; une programmation due sur ce canal est annulée par l'ordonnanceur (J-23).
- Administration : réserver ou ouvrir un canal ; autoriser ou retirer une entreprise.
- Par défaut (décision du 2026-11-06) : Facebook et Gmail ouverts à tous.

**Never:**
- Un repli en diffusion déclarée pour un canal non développé (D4) ; un message avec jargon fournisseur ou secret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouvert à tous | défaut | connecter, diffuser | — |
| Réservé, non autorisée | Gmail | « Demander l'accès », démarrage refusé | `channel_unavailable` |
| Autorisée | accès accordé | connecter, diffuser | — |
| LinkedIn | désactivé | absent, démarrage refusé | `channel_unavailable` |
| Non administrateur | réglage | refusé | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (ChannelRollout, ChannelAccess) ; `src/lib/channel-access.ts` ; `src/app/api/channel-access/route.ts`, `src/app/api/admin/channel-access/route.ts` ; `src/app/admin/channel-access-panel.tsx` ; démarrages OAuth (Meta, Gmail, LinkedIn, Google) ; `src/lib/contents/publish.ts` (`readDestination`) ; `src/lib/agents/co-ceo.ts` ; tests `engine`, `security`, `user-journey`, `linkedin`.

## Tasks & Acceptance

- [x] Accès par canal et par entreprise, contrôlé au démarrage OAuth et à la diffusion.
- [x] Demande d'accès et administration.
- [ ] Avertissement de réautorisation périodique (Google en mode Testing, 7 jours) : avec le connecteur fiche Google (#14).
- [ ] Prévenir le dirigeant quand un canal qu'il utilise est désactivé ou réservé (annonce dans la Stratégie) : avec #41.
