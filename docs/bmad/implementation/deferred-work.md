- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Détecter dans getTeamState un run actif périmé (au-delà de maxDurationSeconds) comme le fait getAgentRun.
  evidence: medium non vérifié ; à confirmer en cherchant si un run peut rester running sans polling de l'interface (Paul seul).
- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Ajouter l'index @@index([companyId, createdAt]) sur AgentRun.
  evidence: la lecture des exécutions récentes trie toutes les exécutions de l'entreprise, à chaque page ; migration interdite dans la story 1.1.
- source_spec: `docs/bmad/implementation/spec-1-1-une-seule-lecture-de-l-etat-de-l-equipe.md`
  summary: Tester le nombre affiché dans la fenêtre « Actualiser le diagnostic et le plan ».
  evidence: le compte est passé à actionable.length sans assertion.
