---
title: 'Story 7.2 : Voir l''activité et les erreurs d''une entreprise'
type: 'feature'
created: '2026-11-05'
status: 'review'
baseline_commit: 'd411853'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** quand un entrepreneur du PoC signale un problème, les fondateurs n'ont aucune vue de ce qui s'est passé chez lui : derniers lancements, échecs, erreurs (#74). Ils doivent fouiller la base à la main.

**Approach:** une page d'administration par entreprise qui liste ses derniers lancements d'agents avec leur état, leur motif d'échec en clair et le message d'erreur nettoyé de tout secret.

## Boundaries & Constraints

**Always:**
- Page `/admin/entreprises/[id]`, lisible par les seuls administrateurs (`isAdminEmail`) ; un non-administrateur voit « Accès réservé » sans donnée ; sans session : connexion.
- Contenu : identité (nom, métier, zone, adresse du compte, date de création, état suspendue / confirmée), compteurs (lancements et échecs sur 7 jours, coût du jour et du mois) et les 25 derniers lancements : agent, état, motif d'échec en clair (`failureMessage`), horodatages, nombre de résultats, message d'erreur.
- Message d'erreur : tronqué à 300 caractères et nettoyé par une fonction pure `redactSecrets` qui masque jetons (`Bearer …`, `sk-…`, `token=…`), mots de passe (`password=…`), longues suites hexadécimales ou base64 et URL de connexion à une base ; jamais de contenu de jeton ni de mot de passe stocké (les colonnes de jetons et `passwordHash` ne sont pas lues par cette page).
- Lien « Activité » depuis la liste des entreprises de l'administration.
- Les données affichées sont celles de l'entreprise demandée uniquement (identifiant de l'URL contrôlé).

**Never:**
- Pas de contenu de production (propositions, messages à Paul) ; pas d'écriture ; pas de jeton ni de hachage de mot de passe, même masqué.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Administrateur | entreprise connue | identité, compteurs et derniers lancements | N/A |
| Non-administrateur | session simple | « Accès réservé », aucune donnée | N/A |
| Sans session | aucun cookie | redirection vers la connexion | N/A |
| Entreprise inconnue | identifiant inexistant | page « introuvable » | 404 |
| Erreur avec secret | `Bearer abc…`, `password=…`, chaîne hexadécimale de 64 caractères | secret remplacé par un marqueur | N/A |
| Aucun lancement | entreprise neuve | état vide explicite | N/A |

</frozen-after-approval>

## Code Map

`src/lib/redact-secrets.ts` (pure) ; `src/app/admin/entreprises/[id]/page.tsx` ; `src/app/admin/page.tsx` (lien) ; `tests/delegation.spec.ts` (nettoyage) ; `tests/security.spec.ts` (page refusée, page gardée) ; `tests/engine.spec.ts` si besoin d'une entreprise avec lancements.

## Tasks & Acceptance

- [x] Fonction de nettoyage et tests.
- [x] Page d'activité et lien.
- [x] Tests : accès, isolation, nettoyage, état vide.
