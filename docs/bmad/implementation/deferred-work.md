- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Détecter dans getTeamState un run actif périmé (au-delà de maxDurationSeconds) comme le fait getAgentRun.
  evidence: medium non vérifié ; à confirmer en cherchant si un run peut rester running sans polling de l'interface (Paul seul).
- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Ajouter l'index @@index([companyId, createdAt]) sur AgentRun.
  evidence: la lecture des exécutions récentes trie toutes les exécutions de l'entreprise, à chaque page ; migration interdite dans la story 1.1.
- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Tester le nombre affiché dans la fenêtre « Actualiser le diagnostic et le plan ».
  evidence: le compte est passé à actionable.length sans assertion.
- source_spec: `docs/bmad/implementation/spec-1-2-motifs-d-echec-types-et-dits-en-clair.md`
  summary: Une action en_cours sans exécution active renvoie already_running sans runId.
  evidence: medium non vérifié ; à confirmer avec la détection des runs périmés (report de la story 1.1).
- source_spec: `docs/bmad/implementation/spec-1-2-motifs-d-echec-types-et-dits-en-clair.md`
  summary: Tester que processAgentRun enregistre no_result quand l'agent lève AgentNoResultError.
  evidence: demande un modèle simulé dans les tests du moteur ; seule la classification est testée.
- source_spec: `docs/bmad/implementation/spec-1-2-motifs-d-echec-types-et-dits-en-clair.md`
  summary: Vérifier le champ reason des réponses 409 et de l'événement d'erreur du flux de Paul.
  evidence: aucun écran ne lit encore reason ; à couvrir avec le premier consommateur (épopée 2).
- source_spec: `docs/bmad/implementation/spec-1-3-le-premier-audit-nait-dans-le-plan.md`
  summary: Rattraper une entreprise dont le profil est rempli mais sans audit d'inscription.
  evidence: possible seulement après une panne au moment de la création ; aucun mécanisme de reprise.
- source_spec: `docs/bmad/implementation/spec-1-3-le-premier-audit-nait-dans-le-plan.md`
  summary: Empêcher Paul de créer une seconde action d'audit en déléguant sans planItemId.
  evidence: relève du dédoublonnage par agent et thème (story 2.4, AD-16).
- source_spec: `docs/bmad/implementation/spec-1-3-le-premier-audit-nait-dans-le-plan.md`
  summary: Faire passer le lancement de Martine depuis la page Diagnostic par le plan.
  evidence: src/app/diagnostic/diagnostic-client.tsx appelle encore /api/agents/marketing/run (run direct hors plan).
- source_spec: `docs/bmad/implementation/spec-1-4-une-action-terminee-renvoie-vers-ses-productions.md`
  summary: Aligner docs/maquette/maquette.js sur le vocabulaire « lancer » des actions.
  evidence: la maquette garde « Examiner et valider », « Valider l'action, puis préparer », « À valider ».
- source_spec: `docs/bmad/implementation/spec-2-1-dire-son-objectif-a-paul-et-le-confirmer.md`
  summary: Permettre de saisir un rythme de nouveaux clients par an dans la page Entreprise.
  evidence: le champ n'offre que « par mois » alors que l'objectif peut être annuel.
- source_spec: `docs/bmad/implementation/spec-2-1-dire-son-objectif-a-paul-et-le-confirmer.md`
  summary: Purger ou marquer expirées les cartes de Paul anciennes, et contraindre type et statut en base.
  evidence: expiration seulement à la lecture ; colonnes texte sans contrainte.
- source_spec: `docs/bmad/implementation/spec-2-2-faire-enregistrer-son-profil-par-paul.md`
  summary: Vérifier le format du site, du téléphone et du compte social avant de les enregistrer.
  evidence: une phrase ou « atelierlumen point fr » serait enregistrée telle quelle puis transmise aux agents.
