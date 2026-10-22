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
