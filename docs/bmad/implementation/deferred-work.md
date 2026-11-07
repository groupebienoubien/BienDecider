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
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Proposition d'une nouvelle version d'un contenu préparée avec Paul (`propose_new_version`, 1 crédit débité à l'acceptation) et conversation `contenu:{id}` (#289).
  evidence: l'atelier n'existe pas encore ; la route des messages refuse la clé `contenu:{id}` et Paul ne propose plus de révision depuis GH-288 (le Studio de l'ancien parcours garde sa révision par `startRevisionFromCard`).
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Carte « Explorer une idée » transformée en mission depuis la conversation `idee:{n}` (`propose_idea`, #312).
  evidence: la conversation « Nouvelle idée n°n » existe et Paul peut y proposer une mission avec `propose_mission`, mais pas de carte d'idée dédiée.
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Proposition de limite d'ambition par Paul (`propose_ambition_limit`, #282).
  evidence: l'ancienne carte d'objectif chiffré (`update_objective`) est retirée ; aucune carte ne la remplace encore, l'ambition se modifie sur sa page.
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Retirer les noms et avatars de Martine, Camille et Jean-Claude des pages de l'ancien parcours (Équipe, Studio, Décisions, Diagnostic, plan) et des messages de résultat d'exécution.
  evidence: le panneau, le prompt du chat et les pages V5.2 ne montrent que Paul ; la génération de plan (`runCoCeoPlanning`, `CAPABILITY_CATALOG`) et ces pages, hors périmètre, nomment encore les agents.
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Exposer la délégation et les programmations réelles dans `get_current_status` quand elles seront stockées.
  evidence: aucune donnée de délégation ni de programmation n'existe : Paul lit « Valider avant chaque action (par défaut) » et une liste de programmations vide.
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Ouvrir les conversations « ambition », « concurrence » et « sources » depuis leurs écrans (étape 3 et Modifier mon ambition, Entreprise › Diagnostic, dialogue d'une source).
  evidence: leurs titres, introductions et suggestions existent dans `paul-contexts.ts`, mais aucun bouton n'y mène ; l'ambition arrive avec #282, le diagnostic en constats avec #292.
- source_spec: `docs/bmad/implementation/spec-gh-288-paul-propositions-a-confirmer.md`
  summary: Tester ce que `get_current_status` expose des cartes récentes (`cartesRecentes`, `missionId`) et du message précédent de Paul dans le contexte courant.
  evidence: non vérifié ; un test qui affirme qu'une carte `mission_pause` en attente apparaît avec sa mission, qu'une ancienne carte `launch_plan_item` est écartée et qu'un message d'un autre contexte est ignoré le trancherait.
- source_spec: `docs/bmad/implementation/spec-gh-312-noter-une-idee.md`
  summary: Une carte devenue inexécutable (idée retirée ou déjà cadrée, comme une mission disparue depuis #288) passe en « cancelled » : le dirigeant lit « Proposition écartée » et Paul la prend pour un refus ; retirer une idée ne retire pas non plus les cartes « Créer la mission » qui la visent.
  evidence: decidePendingAction (src/lib/agents/pending-actions.ts:226-229) marque cancelled tout exécuteur qui renvoie false ; il faudrait un statut ou un texte « n'est plus possible » distinct du refus, commun à toutes les cartes.
- source_spec: `docs/bmad/implementation/spec-gh-312-noter-une-idee.md`
  summary: « Votre prochaine décision » de Stratégie ignore les idées notées : sans mission, elle propose encore « Explorer une idée » au lieu de cadrer une idée déjà notée.
  evidence: nextStep(missions, …) dans src/app/strategie/page.tsx ne reçoit pas les idées ; la spec §13.1 ne définit pas ce cas.
- source_spec: `docs/bmad/implementation/spec-gh-41-journal-decisions-tracabilite.md`
  summary: Écrire J-04 « Profil et ambition confirmés. Aucune mission lancée. » à la création du compte (étape 5 du parcours d'entrée V5.2).
  evidence: L'étape 5 et l'ambition n'existent pas encore (#168, #279) ; décision de Samir du 2026-11-06 de le reporter au parcours d'entrée.
- source_spec: `docs/bmad/implementation/spec-gh-41-journal-decisions-tracabilite.md`
  summary: Tester l'écriture de J-07 « connecté » sur les retours OAuth Gmail et LinkedIn et sur le choix de la page Facebook (y compris le 409 d'un choix concurrent).
  evidence: Ces chemins dépendent d'échanges externes (exchangeLinkedInCode, jetons Google, verifyFacebookPage) sans point d'injection ; seul persistGoogleBusinessProfileConnection est testé.
- source_spec: `docs/bmad/implementation/spec-gh-41-journal-decisions-tracabilite.md`
  summary: Journaliser la perte implicite de la connexion Google (jeton refusé, statut « erreur ») avec un J-07 système.
  evidence: src/lib/oauth/google-access.ts efface les jetons et passe le statut à « erreur » sans écrire au journal ; seule la déconnexion par le dirigeant est couverte par #41.
- source_spec: `docs/bmad/implementation/spec-gh-168-provenance-des-missions.md`
  summary: Critères d'octobre de #168 : chaque analyse expose sa date, son état et la référence du contexte utilisé (« contexte non identifié » pour les anciennes) ; une modification du métier, de l'offre ou de la cible signale l'analyse comme à réexaminer, selon une règle explicite et testée ; un nouveau plan ne consomme pas en silence les constats remplacés.
  evidence: Décision de Samir du 2026-11-06 de ne livrer que les critères V5.2 (provenance dans Stratégie). Le diagnostic échoué qui ne remplace pas le précédent (splitAudits) et la consultation des diagnostics précédents existent déjà.
- source_spec: `docs/bmad/implementation/spec-gh-168-provenance-des-missions.md`
  summary: Contrôler après déploiement la reprise de la certitude des constats (compter les constats par `certainty` face à `sourceStatus`).
  evidence: Le CI applique la migration sur une table vide ; aucun test ne vérifie l'UPDATE sur des constats existants.
- source_spec: `docs/bmad/implementation/spec-gh-168-provenance-des-missions.md`
  summary: Aligner « Preuve utilisée » (Votre prochaine décision dans Stratégie, détail de mission) sur la provenance reliée : titre et certitude du constat au lieu de « Constat relevé par Paul ».
  evidence: src/app/strategie/page.tsx:56 et src/app/missions/[id]/page.tsx:79 affichent encore « Constat relevé par Paul » pour toute mission de Paul ; la spec #168 laissait le reste de la page inchangé.
- source_spec: none
  summary: #279 Parcours d'entrée en cinq étapes, compte créé en dernier, à faire juste après #310.
  evidence: Découpage décidé par Samir le 2026-11-06 : #310 d'abord. Décisions déjà prises pour #279 : étapes 1 à 4 en version minimale (saisies, confirmation du profil, ambition en texte libre, trois missions tirées des modèles ; l'analyse et Paul arrivent avec #280, #281, #282 et #284), l'ancien parcours /signup et /onboarding est remplacé ; adresse déjà utilisée → message neutre qui renvoie vers « Retrouver mon compte » sans révéler que le compte existe (FR-9 prévaut sur M-14). Reste à trancher : la vérification de l'e-mail, qui bloque aujourd'hui tous les agents (agent-runs.ts:440), alors que l'addendum §6 ne l'exige qu'avant une diffusion.
- source_spec: `docs/bmad/implementation/spec-gh-310-page-decouverte.md`
  summary: Supprimer `public/brand/workspace-preview.png` et `workspace-preview-mobile.png`, que l'accueil n'utilise plus.
  evidence: La capture de l'ancien espace a été retirée de `src/app/page.tsx` par #310 ; aucune autre page ne référence ces fichiers.
- source_spec: `docs/bmad/implementation/spec-gh-310-page-decouverte.md`
  summary: Aligner /canaux sur Paul copilote unique (« Préparé par l'équipe, publié par vous ») et mettre à jour son test.
  evidence: L'accueil présente Paul seul depuis #310 ; tests/brand.spec.ts vérifie encore le texte « l'équipe » de /canaux.
- source_spec: `docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md`
  summary: Purge quotidienne des brouillons expirés (cron), avec la trace anonyme de la visite écrite juste avant l'effacement.
  evidence: À faire avec #311 (trace des visites, addendum §4.12 et §6) ; dans #279, un brouillon expiré est seulement ignoré à la lecture.
- source_spec: `docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md`
  summary: Aiguillage §1.4 pour les pages de l'espace : sans session, aller à l'étape courante du brouillon ou à la page de découverte, au lieu de /login.
  evidence: #279 ne traite que les pages d'entrée ; changer la redirection de l'espace touche une quinzaine de pages et les tests qui attendent /login.
- source_spec: `docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md`
  summary: Normaliser l'adresse e-mail (minuscules) à l'inscription, à la connexion et à la réinitialisation.
  evidence: Aucun `toLowerCase` dans src/app/api/auth ; « Claire@x.fr » et « claire@x.fr » donnent deux comptes et contournent le message neutre d'adresse déjà utilisée.
- source_spec: `docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md`
  summary: Tester le mode POC (REQUIRE_EMAIL_VERIFICATION absente) chez au moins un consommateur, et adapter le texte du bandeau qui annonce encore un blocage de la diffusion.
  evidence: La CI pose la variable à true pour tout le job ; seul l'assistant pur est testé avec un environnement injecté.
- source_spec: `docs/bmad/implementation/spec-gh-279-parcours-entree-cinq-etapes.md`
  summary: Tester deux inscriptions simultanées sur un même brouillon (un seul compte, une 409 M-10, emplacement du jour libéré).
  evidence: Les tests d'inscription envoient des requêtes l'une après l'autre ; la branche `count === 0` n'est pas couverte.
- source_spec: `docs/bmad/implementation/spec-gh-280-decouverte-entreprise.md`
  summary: À la création du compte, reprendre les constats de l'analyse anonyme (AuditFinding, SourceRead) et son coût, comme le prévoit l'addendum §6.
  evidence: #280 garde l'analyse dans OnboardingDraft.analysis seulement ; les constats affichés et corrigés relèvent de #281, leur reprise dans le compte vient avec.
- source_spec: `docs/bmad/implementation/spec-gh-280-decouverte-entreprise.md`
  summary: Cumuler le coût des analyses anonymes (y compris des brouillons qui n'aboutissent pas à un compte) dans la trace des visites et une vue d'administration.
  evidence: Le coût n'est gardé que dans OnboardingDraft.analysis, effacé avec le brouillon ; à faire avec #311 (analysisCostUsd de VisitTrace).
- source_spec: none
  summary: Carte de Paul « Ajuster ma limite » (`propose_ambition_limit`, §16.3), séparée de #282.
  evidence: Découpage choisi par Samir le 2026-11-07 : #282 livre l'étape 3 et la modification depuis Entreprise ; la carte reste rattachée à #288.
- source_spec: `docs/bmad/implementation/spec-gh-282-ambition-reformulee-par-paul.md`
  summary: Tester le repli d'Entreprise quand le budget est atteint (`AgentRunQuotaError` → analyseur de secours, 200) et l'enregistrement d'usage sous `ambition_interpret`.
  evidence: En CI, aucune clé de modèle n'est posée, donc `modelFor` sort avant `reserveUsageBudget` ; il faudrait rendre la réservation injectable au niveau de la route.
- source_spec: none
  summary: À l'inscription, reprendre ce que l'analyse anonyme a lu en constats (`AuditFinding`, `SourceRead`), au format des premiers constats sourcés.
  evidence: Choix de Samir du 2026-11-07 : séparé de #281 et laissé à #292, qui définit les constats (certitude, fait, conséquence, source, date).
- source_spec: `docs/bmad/implementation/spec-gh-281-corriger-ce-que-paul-a-compris.md`
  summary: Cumuler le coût de toutes les analyses d'un même brouillon (chaque relance de la découverte remet le coût à 0) avant de le reprendre au compte.
  evidence: `newAnalysis` crée un coût nul à chaque relance ; seule la dernière analyse devient un `UsageEvent` à l'inscription. À traiter avec le cumul des coûts anonymes de #311.
