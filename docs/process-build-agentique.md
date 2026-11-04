# Process de build en mode agentique

## Principe

Le build du produit est organisé autour de rôles inspirés d'une petite organisation, chacun associé à un livrable concret et vérifiable — pas un jeu de rôle décoratif. Le rôle "CEO" (décisions finales, arbitrages) reste humain (Rémi) : aucun agent ne valide ses propres décisions à sa place.

## Rôles et livrables

| Rôle | Responsabilité | Livrable |
|---|---|---|
| Business Analyst | Traduire les besoins en specs fonctionnelles | Documents `docs/spec-*.md` |
| Architecte / CTO | Décisions techniques (stack, orchestration des agents, intégrations) | Document `docs/architecture-*.md` + ADR si décision structurante |
| Dev | Implémentation | Code + PR |
| Test | Critères d'acceptation, plan de test, exécution | `docs/test-plan-*.md` + rapport d'exécution |
| Chargé de comm' | Contenus et messages orientés utilisateur final (pas de décision produit) | Textes, maquettes de contenu |
| CEO | Arbitrage, validation des orientations | Décision actée dans ce document ou en commit |

## Garde-fous

- Chaque rôle produit un artefact écrit avant de passer au suivant — pas d'implémentation sans spec validée, pas de spec sans besoin identifié.
- Les décisions structurantes (architecture, scope, pricing) sont actées explicitement par le CEO avant exécution, pas supposées à partir d'une discussion.
- Ce document est mis à jour à chaque changement de process constaté en cours de route.

## Historique des décisions actées

- 2026-10-04 — Produit multi-métier dès la conception (cœur générique + packs de contexte par métier).
- 2026-10-04 — Douleur cible : manque de temps + manque de compétence marketing.
- 2026-10-04 — Validation humaine obligatoire avant toute exécution d'action par un agent (pas d'autonomie totale en V1).
- 2026-10-04 — Prix de travail : 15€/mois (non verrouillé — à valider avec Finance sur la base d'un chiffrage du coût d'inférence par client actif).
- 2026-10-04 — Ordre de build retenu : spec fonctionnelle de contextualisation d'abord, architecture technique ensuite.
- 2026-10-04 — Architecture retenue : Claude API + Tool Runner (TypeScript), pas de Managed Agents ni de Claude Agent SDK (nos agents n'ont pas besoin d'un sandbox bash/fichiers). Stack : Next.js + PostgreSQL + file de jobs asynchrones. Voir [architecture-technique.md](archives/architecture-technique.md).
- 2026-10-04 — Choix du modèle Claude (Opus 5.5 vs Sonnet 5.5) non verrouillé : proposition de démarrer en pilote avec Sonnet 5.5 pour maîtriser le coût à 15€/mois, à valider par le CEO après test qualité.
- 2026-10-04 — Scaffolding réalisé (rôle Dev) : Next.js + Prisma (SQLite en dev, PostgreSQL ciblé en prod) + premier agent "Visibilité locale" via Claude API + Tool Runner. Flux validé de bout en bout (création entreprise → agent propose → cockpit valide/rejette), sauf l'appel réel au modèle (nécessite une clé `ANTHROPIC_API_KEY` que vous devez fournir). Voir [README.md](../README.md) pour le démarrage local.
- 2026-10-04 — Tentative de bascule vers OpenAI envisagée puis annulée par le CEO (reste sur Claude). Clé Anthropic obtenue et testée en conditions réelles : agent "Visibilité locale" confirmé (3 propositions pertinentes, ton respecté, garde-fou confidentialité spontané sur les avis).
- 2026-10-04 — Deuxième agent livré : "Communication / réseaux sociaux" ([src/lib/agents/contenu.ts](../src/lib/agents/contenu.ts), alors nommé `communication.ts`). Nécessite une actualité déclarée par l'utilisateur en entrée (l'agent n'invente jamais d'événement, cf. garde-fou du roster). Testé en conditions réelles : 3 propositions de post cohérentes avec le ton et l'actualité fournie.
- 2026-10-04 — Refonte du parcours (demande CEO) : landing page (`/`) → login minimal par email sans mot de passe (`/login`, cookie de session, cf. [architecture-technique.md](archives/architecture-technique.md)) → onboarding dédié (`/onboarding`, remplace le formulaire inline du cockpit) → dashboard (`/dashboard`, remplace `/cockpit` qui redirige désormais). Challenge posé et acté : pas de vrai système d'auth tant qu'il n'y a qu'un utilisateur pilote, à durcir avant tout client payant.
- 2026-10-04 — Agent "Audit" ajouté : diagnostic de présence en ligne via l'outil serveur `web_fetch`, déclenché automatiquement à la fin de l'onboarding. Absence de site web traitée comme un constat, pas une erreur. Testé en conditions réelles (y compris un cas d'échec de fetch, corrigé : l'URL doit être explicitement mentionnée dans le message utilisateur, pas seulement dans le system prompt, pour que `web_fetch` y ait accès).
- 2026-10-04 — Troisième agent livré, "Démarchage / prospection", plus tôt que prévu au roster initial (décision re-ouverte à la demande du CEO) : templates génériques uniquement, aucune liste de destinataires réels, rappel RGPD explicite dans chaque proposition. Testé en conditions réelles.
