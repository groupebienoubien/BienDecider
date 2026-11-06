---
title: 'Story 14.1 : Trouver des agences de ma zone avec Paul'
type: 'feature'
created: '2026-11-07'
status: 'review'
baseline_commit: 'origin/main'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-14-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** la mission Partenariats a besoin d'une liste d'agences de la zone, avec un e-mail professionnel et une source, que le dirigeant n'a pas (#316, FR-45).

**Approach:** depuis la mission, « Chercher des agences avec Paul » : Paul cherche sur le web, le serveur ne garde que des agences complètes et nouvelles.

## Boundaries & Constraints

**Always:**
- Nom, secteur, e-mail professionnel publié par l'agence, page source citée, raison en une phrase.
- Au plus 6 agences par recherche ; aucun doublon (même e-mail ou même nom).
- Quota et budget de l'entreprise ; coût mesuré enregistré, même en cas d'échec.

**Never:**
- Un particulier, une adresse personnelle, une agence ou une adresse inventée ; un envoi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recherche utile | agences complètes | ajoutées à la liste | — |
| Agence incomplète | sans e-mail valide ou source web | ignorée | — |
| Rien de nouveau | toutes déjà connues | rien n'est écrit | M-90 |
| Modèle indisponible | erreur ou clé absente | rien n'est écrit | M-91 (503) |
| Quota atteint | lancements du jour | rien n'est écrit | message du quota (429) |
| Autre origine | en-tête Origin | refus | 403 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (`Lead.email`, `Lead.sector`) ; `src/lib/agencies/{rules,finder,service}.ts` ; `src/app/api/agencies/search/route.ts` ; `src/app/missions/[id]/scope-editor.tsx` ; `src/lib/agents/co-ceo.ts` (liste lue par Paul) ; tests `delegation`, `engine`, `security`.

## Tasks & Acceptance

- [x] Recherche de prescripteurs avec la recherche web, sous quota et budget.
- [x] Règles de l'agence trouvée et dédoublonnage, testés.
- [ ] Retirer une agence de la liste : après le PoC si le besoin apparaît.
