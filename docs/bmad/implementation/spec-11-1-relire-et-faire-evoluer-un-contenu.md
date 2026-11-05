---
title: 'Story 11.1 : Relire et faire évoluer un contenu, version par version'
type: 'feature'
created: '2026-11-06'
status: 'review'
baseline_commit: '45f5056'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad/implementation/epic-11-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** une mission lancée n'a aucun contenu : le dirigeant ne peut ni voir ce qui partirait, ni le retoucher, ni le valider (#289).

**Approach:** l'atelier (§13.3) : un contenu par mission, préparé par Paul, avec aperçu par canal, versions, historique, retouche directe, « Retravailler avec Paul » et validation sans diffusion.

## Boundaries & Constraints

**Always:**
- Premier brouillon préparé par Paul à la création (0 crédit) ; s'il échoue, l'atelier propose de le préparer à la demande.
- Barre : sélecteur de contenu, « V{n} · courante » ou « · archive », état (Brouillon, Validée) ; aperçu propre au canal (publication, e-mail au destinataire, page) ; « Copier le texte ».
- Historique de la plus récente à la plus ancienne : auteur (vous, Paul, système), note, état, date ; une ancienne version est en lecture seule, « Revenir à cette version » crée une nouvelle version.
- Retouche : accroche ou objet 1 à 100, texte 1 à 3 000 ; nouvelle version « Retouche directe par vous », validation retirée ; retouches non enregistrées gardées, signalées, bloquantes (M-60).
- « Retravailler avec Paul » : plus court, plus humain, un autre angle, votre consigne ; proposition créée en version seulement si gardée, 1 crédit.
- Validation : dialogue « Valider la version Vn », case « J'ai relu le contenu et vérifié les informations qui engagent mon entreprise » obligatoire, bouton « Valider sans diffuser », journal J-20 « Aucun envoi effectué ».
- Refus serveur dans l'ordre §4.3 et §4.4 : M-44, M-45, M-46, M-02, M-47, M-49, M-65, M-66, M-52, M-53, M-77, M-15.

**Never:**
- Valider n'envoie ni ne programme rien ; aucune version n'est modifiée après création ; Paul n'invente ni prix, ni date, ni coordonnée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brouillon | mission créée | V1 par Paul, 0 crédit, J-19 | M-79 si Paul échoue, rien d'écrit |
| Retouche | V1 validée | V2 par vous, validation retirée, J-19 | M-16 hors bornes |
| Proposition gardée | 20 crédits | V(n+1) par Paul, 19 crédits | M-15 sans crédit, Paul non appelé |
| Ancienne version | V1 sur V3 | lecture seule ; y revenir crée V4 | — |
| Valider | mission à décider | refusé | M-47 |
| Valider | case non cochée | refusé | M-77 |
| Version périmée | double onglet | refusé | M-02, 409 |
| Mission arrêtée | contenu | lecture seule | M-44 |
| Autre entreprise | identifiant étranger | introuvable | 404 |

</frozen-after-approval>

## Code Map

`prisma/schema.prisma` (MissionContent, ContentVersion) ; `src/lib/contents/{rules,writer,service,view}.ts` ; `src/app/api/contents/[id]/route.ts`, `src/app/api/missions/[id]/content/route.ts` ; `src/app/atelier/page.tsx`, `src/app/atelier/[id]/{page,content-workbench}.tsx` ; `src/components/prepare-draft-button.tsx` ; `src/lib/missions/{view,stage,service}.ts` ; Stratégie et détail de mission ; tests `delegation`, `engine`, `security`, `user-journey`.

## Tasks & Acceptance

- [x] Tables, migration additive, règles pures et services transactionnels avec journal (J-19, J-20).
- [x] Premier brouillon par Paul, idempotent, à la création, au lancement et à la demande.
- [x] Atelier : aperçu par canal, historique, retouche, reprise, « Retravailler avec Paul », validation sans diffusion.
- [x] Stratégie (« À valider par vous », prochain pas) et mission (étapes 2 et 3, lien vers le contenu) branchées sur l'état réel.
- [ ] Profil relu avant validation et versions « Profil corrigé » (§4.4 condition 3, §4.5).
- [ ] Visuels, marque et droits (M-51, M-65 en vrai) : #290.
- [ ] « Créer V(n+1) à partir de Vn » après diffusion : avec la diffusion (#315).
