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
- source_spec: `docs/bmad/implementation/spec-2-3-paul-propose-le-lancement.md`
  summary: Supprimer ou signaler les actions de plan créées par un tour de Paul qui a échoué avant la carte.
  evidence: cancelOrphanPendingActions annule la carte mais laisse l'action « à lancer ».
- source_spec: `docs/bmad/implementation/spec-2-3-paul-propose-le-lancement.md`
  summary: Tester dans le panneau le rendu d'un lancement refusé (pas de coche verte).
  evidence: l'expression succeeded n'existe que dans le composant ; les textes sont couverts par les tests unitaires.
- source_spec: `docs/bmad/implementation/spec-2-4-pas-d-action-en-double.md`
  summary: Appliquer la règle « une action active par agent et par thème » à la génération du plan, à POST /api/action-plan et à l'audit d'inscription.
  evidence: seule createChatPlanItem la vérifie ; la spec excluait le plan généré par Paul.
- source_spec: `docs/bmad/implementation/spec-2-4-pas-d-action-en-double.md`
  summary: Index (companyId, agent, theme, status) sur ActionPlanItem et test de concurrence déterministe.
  evidence: lecture sérialisable sans index ; le test Promise.all ne prouve pas le chevauchement.
- source_spec: `docs/bmad/implementation/spec-3-1-date-du-jour-et-nom-du-dirigeant.md`
  summary: Expirer ou signaler une piste de croissance dont l'événement est passé pendant qu'elle attendait la décision.
  evidence: la date de fin n'est que dans le texte de la proposition ; aucun contrôle à la décision.
- source_spec: `docs/bmad/implementation/spec-3-4-recette-du-scenario-atelier-lumen.md`
  summary: Vérifier dans le parcours navigateur que le badge, le lien de l'accueil et l'en-tête de Décisions affichent le même nombre.
  evidence: le test de recette compare des fonctions (badge et Paul lisent la même), pas ce que les pages affichent.
- source_spec: `docs/bmad/implementation/spec-4-2-aucune-fausse-rectification.md`
  summary: Vérifier que Paul n'annonce pas, à chaque question d'état, des changements sans rapport parce que aChangeApresMonMessageDe est non nul pour presque tout.
  evidence: non vérifié (dépend du modèle) ; à observer à l'étape 8 de la recette manuelle ; si c'est le cas, limiter la règle aux éléments dont Paul a parlé.
- source_spec: `docs/bmad/implementation/spec-4-2-aucune-fausse-rectification.md`
  summary: depuisMonMessagePrecedent (story 3.5) compare à l'heure d'enregistrement de la réponse de Paul, pas au début de son tour.
  evidence: une fin survenue pendant le tour, après la lecture de l'état, n'est pas marquée « depuis mon dernier message ».
- source_spec: `docs/bmad/implementation/spec-4-1-parler-a-paul-ne-consomme-pas-les-lancements.md`
  summary: Tester par les vrais appelants que « Préremplir » compte comme message et la mise en ligne du site comme lancement.
  evidence: les tests appellent reserveUsageBudget avec des libellés écrits en dur ; changer le purpose dans onboarding/interpret ou publish.ts ne ferait échouer aucun test.
- source_spec: `docs/bmad/implementation/spec-5-4-paul-utilisable-sur-smartphone.md`
  summary: Fermer Paul avec le geste ou le bouton « retour » d'Android au lieu de quitter la page.
  evidence: le panneau plein écran sur téléphone ressemble à un écran ; le retour système navigue ailleurs.
- source_spec: `docs/bmad/implementation/spec-5-4-paul-utilisable-sur-smartphone.md`
  summary: Vérifier sur un vrai iPhone le blocage du défilement et le champ au-dessus du clavier (visualViewport).
  evidence: le test de parcours tourne sous Chromium de bureau, sans clavier virtuel ni Safari iOS.
- source_spec: `docs/bmad/implementation/spec-5-2-du-diagnostic-au-plan-sans-boucle.md`
  summary: Afficher une action d'audit fermée par un audit avec « Voir le diagnostic » plutôt que « Voir la production ».
  evidence: statut `lance` sans production rattachée ; le bouton mène à l'historique.
- source_spec: `docs/bmad/implementation/spec-5-2-du-diagnostic-au-plan-sans-boucle.md`
  summary: Tester le retour au bouton « Préparer le plan » après « Actualiser le diagnostic », et un plan entièrement écarté.
  evidence: `setPlanUpToDate(false)` et le filtre `ecarte` ne sont couverts par aucun test.
- source_spec: `docs/bmad/implementation/spec-gh-7-chiffrer-jetons-google-meta.md`
  summary: Ajouter un timeout explicite et un diagnostic sûr au fetch d'échange OAuth Google.
  evidence: `exchangeGoogleCode` utilise fetch sans AbortSignal.timeout; ce comportement préexistait à l'US #7 et le timeout de plateforme borne déjà la durée de la route.
- source_spec: `docs/bmad/implementation/spec-gh-7-chiffrer-jetons-google-meta.md`
  summary: Afficher au dirigeant le résultat par fournisseur de la révocation lors de la suppression de compte.
  evidence: `/api/companies/delete` renvoie `revocations`, mais `DeleteAccountSection` redirige vers la connexion dès la réussite sans lire ce rapport; le comportement d'interface préexistait à l'US #7 et relève du parcours de suppression.
- source_spec: `docs/bmad/implementation/spec-gh-7-chiffrer-jetons-google-meta.md`
  summary: Ajouter une recette déterministe du timeout et de l'annulation du fetch OAuth Google.
  evidence: Le timeout réseau de l'échange est déjà différé séparément; la revue confirme qu'aucun test simulé ne vérifie encore la réponse quand le fournisseur ne répond pas.

- source_spec: `docs/bmad/implementation/spec-corrections-audit-agents-ia.md`
  summary: Réconcilier la consommation et la réservation d'une tentative dont le processus a été tué avant la finalisation d'usage.
  evidence: Revue B4, medium : getAgentRun libère déjà le budget d'un worker périmé sans connaître son cumul en mémoire ; il faut une source durable et une reprise serveur indépendante du suivi individuel.
- source_spec: `docs/bmad/implementation/spec-corrections-audit-agents-ia.md`
  summary: Prévoir la reprise idempotente d'un enregistrement d'usage après indisponibilité de la base.
  evidence: Revue B5, medium : sans journal durable du cumul, une finalisation échouée conserve prudemment le budget mais aucun service ne peut la rejouer ; cette réconciliation dépasse les huit corrections approuvées.
- source_spec: `docs/bmad/implementation/spec-corrections-audit-agents-ia.md`
  summary: Montrer le nombre et un lien vers les productions conservées dans le suivi d'un run échoué partiellement.
  evidence: Revue B9, medium : les productions restent dans les décisions et le diagnostic, mais le suivi d'échec préexistant propose surtout la relance ; l'arrêt explicite et la conservation restent couverts par le lot actuel.
- source_spec: `docs/bmad/implementation/spec-gh-8-renouveler-jetons-google-meta.md`
  summary: Ne pas afficher « Connexion expirée · reliez de nouveau le compte » quand un refresh token GBP permet le renouvellement à la demande.
  evidence: `src/app/connexions/page.tsx` déduit l'expiration de `expiresAt` seul; l'accès dure environ une heure, donc une connexion renouvelable est présentée comme à relier. Le libellé préexistait à l'US #8 et la spec choisit un renouvellement à la demande sans tâche planifiée.
