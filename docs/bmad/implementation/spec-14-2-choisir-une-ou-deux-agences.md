---
title: 'Story 14.2 : Choisir une ou deux agences, périmètre verrouillé selon §6.2'
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

**Problem:** le périmètre d'une mission Partenariats doit nommer une ou deux agences de la liste, et ne plus bouger une fois le contenu programmé ou diffusé (#316, §6.1, §6.2).

**Approach:** cases à cocher dans « Ce que vous choisissez » ; le service vérifie les agences et le verrouillage, et crée la version « Destinataires modifiés » quand il le faut.

## Boundaries & Constraints

**Always:**
- 1 ou 2 agences distinctes de la liste de l'entreprise (M-30).
- Résumé : « {agence 1} et {agence 2} » (§6.3), dans la mission, l'atelier, le journal (J-12) et la demande à Paul.
- Verrouillage de tout périmètre : programmation (M-88), résultat incertain (M-81), version courante diffusée (M-89).
- Agences changées sur une mission En cours ou un contenu validé : nouvelle version système « Destinataires modifiés », validation retirée (§4.5).

**Never:**
- L'agence d'une autre entreprise, ou une organisation sans e-mail.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Une agence de la liste | proposée | périmètre enregistré, J-12 nommé | — |
| Trois agences, doublon | — | refus | M-30 |
| Agence d'une autre entreprise | identifiant connu | refus | M-30 |
| Mission En cours, contenu validé | 2e agence ajoutée | V(n+1) « Destinataires modifiés » | — |
| Diffusion programmée | — | refus | M-88 |
| Version diffusée | — | refus ; V(n+1) rouvre | M-89 |

</frozen-after-approval>

## Code Map

`src/lib/missions/{templates,scope,service,view}.ts` ; `src/lib/contents/service.ts` (`checkScopeLock`, `markRecipientsChanged`) ; `src/lib/agencies/service.ts` ; `src/app/missions/[id]/{page,scope-editor}.tsx` ; tests `delegation`, `engine`, `security`.

## Tasks & Acceptance

- [x] Modèle Partenariats ouvert au catalogue (Gmail, règle d'arrêt 30 jours).
- [x] Choix des agences, vérification serveur, résumé nommé.
- [x] Verrouillage §6.2 et version « Destinataires modifiés ».
