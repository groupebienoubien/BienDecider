const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ structuredClone });
for (const file of ["state.js", "paul.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), context);
const api = vm.runInContext(
  "({ initialState, transition, currentVersion, capacityLoad, nextStep, journeyStage, journeyProgress, scopeLock, eligibleContacts, parseContactsCsv, sampleCsv, paulReply, paulIntro, parseContext, contextLabel, suggestionsFor, timeUsed, recipientsOf })",
  context,
);
const { initialState, transition, currentVersion, capacityLoad, nextStep, journeyStage, journeyProgress, scopeLock, eligibleContacts, parseContactsCsv, sampleCsv, paulReply, paulIntro, parseContext, contextLabel, suggestionsFor, timeUsed } = api;

function onboarded() {
  let state = transition(initialState(), { type: "profile", value: { firstName: "Alex", name: "Maison Test" } });
  state = transition(state, { type: "begin" });
  return transition(state, { type: "onboard" });
}

function ready(document = "email") {
  let state = onboarded();
  state.brand.confirmed = true;
  state.contactsConfirmed = true;
  state = transition(state, { type: "start", mission: state.documents[document].mission });
  state = transition(state, { type: "approve", document, rights: true });
  return transition(state, { type: "channel", channel: state.documents[document].channel, connected: true });
}

test("Le prénom est collecté et exigé ; le profil se transmet aux contenus sans lancer de mission", () => {
  assert.throws(() => transition(initialState(), { type: "onboard" }), /prénom/);
  const state = onboarded();
  assert.equal(state.profile.firstName, "Alex");
  assert.match(state.documents.email.versions[0].body, /Alex · Maison Test/);
  assert.ok(Object.values(state.missions).every((status) => status === "proposed"));
});

test("Les limites de l'ambition sont appliquées", () => {
  assert.throws(() => transition(onboarded(), { type: "goal", value: { growth: 300 } }), /entre 1 et 50/);
  assert.throws(() => transition(onboarded(), { type: "goal", value: { time: 0 } }), /entre 1 et 10/);
  assert.equal(transition(onboarded(), { type: "goal", value: { budget: 0 } }).goal.budget, 0);
});

test("Valider un contenu ne le diffuse pas", () => {
  const state = ready();
  assert.equal(state.documents.email.approved, 1);
  assert.equal(state.publications.length, 0);
});

test("Garde-fou temps : une mission de trop est bloquée, puis permise si le temps augmente", () => {
  let state = onboarded();
  state.contactsConfirmed = true;
  state = transition(state, { type: "start", mission: "agencies" });
  state = transition(state, { type: "start", mission: "proof" });
  assert.equal(capacityLoad(state).hours, 2);
  assert.throws(() => transition(state, { type: "start", mission: "leads" }), /porterait votre temps/);
  state = transition(state, { type: "goal", value: { time: 3 } });
  assert.throws(() => transition(state, { type: "start", mission: "leads" }), /projets/);
  state = transition(state, { type: "start", mission: "leads", acceptCapacity: true });
  assert.equal(state.missions.leads, "active");
});

test("Réduire le temps sous la charge des missions actives est journalisé", () => {
  let state = onboarded();
  state = transition(state, { type: "start", mission: "agencies" });
  state = transition(state, { type: "start", mission: "proof" });
  state = transition(state, { type: "goal", value: { time: 1 } });
  assert.match(state.journal[0].text, /Temps disponible/);
});

test("Le périmètre est éditable : 1 à 2 agences, 1 à 8 contacts recontactables", () => {
  let state = onboarded();
  state = transition(state, { type: "scope", mission: "agencies", value: { ids: ["mazarin"] } });
  assert.deepEqual([...state.scope.agencies.ids], ["mazarin"]);
  assert.throws(() => transition(state, { type: "scope", mission: "agencies", value: { ids: ["cours", "sud", "mazarin"] } }), /1 ou 2/);
  const blocked = state.contacts.find((contact) => contact.consent === "non");
  assert.throws(() => transition(state, { type: "scope", mission: "leads", value: { ids: [blocked.id] } }), /recontactables/);
  const eligible = eligibleContacts(state);
  assert.ok(eligible.length >= 8);
  state = transition(state, { type: "scope", mission: "leads", value: { ids: eligible.slice(0, 5).map((item) => item.id) } });
  assert.equal(state.scope.leads.ids.length, 5);
});

test("Changer le périmètre d'une mission active invalide la validation et crée une version", () => {
  let state = ready();
  state = transition(state, { type: "scope", mission: "agencies", value: { ids: ["cours"] } });
  assert.equal(state.documents.email.approved, null);
  assert.equal(currentVersion(state.documents.email).number, 2);
  assert.equal(currentVersion(state.documents.email).note, "Destinataires modifiés");
});

test("Après diffusion : lecture seule, périmètre figé, puis nouvelle version explicite à revalider", () => {
  let state = transition(ready(), { type: "publish", document: "email" });
  assert.throws(() => transition(state, { type: "revision", document: "email", value: { body: "Retouche" } }), /lecture seule/);
  assert.match(scopeLock(state, "agencies"), /figé/);
  assert.throws(() => transition(state, { type: "scope", mission: "agencies", value: { ids: ["cours"] } }), /figé/);
  state = transition(state, { type: "revision", document: "email", reopen: true, value: {} });
  assert.equal(currentVersion(state.documents.email).number, 2);
  assert.equal(state.documents.email.approved, null);
  assert.equal(state.publications[0].version, 1);
  assert.doesNotThrow(() => transition(state, { type: "scope", mission: "agencies", value: { ids: ["cours"] } }));
});

test("Le journal distingue ce que vous faites de ce que Paul prépare", () => {
  let state = ready();
  state = transition(state, { type: "revision", document: "email", value: { body: "À la main" } });
  assert.match(state.journal[0].text, /retouchée par vous/);
  assert.equal(state.journal[0].actor, "vous");
  assert.equal(currentVersion(state.documents.email).note, "Retouche directe par vous");
  state = transition(state, { type: "revision", document: "email", by: "paul", value: { body: "Variante", note: "Préparée avec Paul : plus court" } });
  assert.match(state.journal[0].text, /préparée avec Paul \(Jean-Claude\)/);
  assert.equal(state.journal[0].actor, "Paul");
});

test("Chaque mission a sa règle d'arrêt et son agent cohérent", () => {
  const rules = new Set(Object.values(vm.runInContext("missionDefinitions", context)).map((mission) => mission.stopRule));
  assert.equal(rules.size, 3);
  const defs = vm.runInContext("missionDefinitions", context);
  assert.equal(defs.agencies.owner, "Jean-Claude");
  assert.match(initialState().documents.email.versions[0].note, /Jean-Claude/);
  assert.match(initialState().documents.post.versions[0].note, /Camille/);
});

test("La diffusion exige une mission active, une version validée et un canal connecté", () => {
  assert.throws(() => transition(initialState(), { type: "publish", document: "email" }), /active/);
  let state = ready();
  state = transition(state, { type: "channel", channel: "gmail", connected: false });
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /Connectez/);
  state = transition(state, { type: "channel", channel: "gmail", connected: true });
  state = transition(state, { type: "revision", document: "email", value: { body: "Retouche" } });
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /Validez/);
});

test("Le parcours de bout en bout se lit dans nextStep", () => {
  let state = onboarded();
  assert.equal(nextStep(state).stage, "launch");
  state.brand.confirmed = true;
  state = transition(state, { type: "start", mission: "agencies" });
  assert.equal(nextStep(state).stage, "approve");
  state = transition(state, { type: "approve", document: "email" });
  assert.equal(nextStep(state).stage, "connect");
  state = transition(state, { type: "channel", channel: "gmail", connected: true });
  assert.equal(nextStep(state).stage, "publish");
  state = transition(state, { type: "publish", document: "email" });
  assert.equal(nextStep(state).stage, "report");
  state = transition(state, { type: "report", mission: "agencies", leads: 2, meetings: 1, revenue: "" });
  assert.equal(nextStep(state).stage, "decide");
});

test("Le bilan est rattaché à une mission et cohérent", () => {
  let state = ready();
  assert.throws(() => transition(state, { type: "report", mission: "agencies", leads: 1, meetings: 0 }), /première diffusion/);
  state = transition(state, { type: "publish", document: "email" });
  assert.throws(() => transition(state, { type: "report", mission: "agencies", leads: 1, meetings: 2 }), /plus de rendez-vous/);
  assert.throws(() => transition(state, { type: "report", mission: "agencies", leads: "", meetings: "" }), /Renseignez/);
  assert.throws(() => transition(state, { type: "report", mission: "agencies", leads: -1, meetings: 0 }), /entiers/);
  state = transition(state, { type: "report", mission: "agencies", leads: 0, meetings: 0, revenue: "" });
  assert.equal(state.reports.agencies.revenue, null);
  assert.equal(state.reports.agencies.leads, 0);
});

test("Poursuivre exige un bilan ; arrêter clôt la mission et annule les programmations", () => {
  let state = transition(ready(), { type: "publish", document: "email" });
  assert.throws(() => transition(state, { type: "outcome", mission: "agencies", outcome: "continue" }), /bilan/);
  state = transition(state, { type: "report", mission: "agencies", leads: 3, meetings: 1 });
  state = transition(state, { type: "outcome", mission: "agencies", outcome: "continue" });
  assert.equal(state.missions.agencies, "active");
  assert.equal(journeyStage(state, "agencies"), "next-round");
  state = transition(state, { type: "outcome", mission: "agencies", outcome: "stop" });
  assert.equal(state.missions.agencies, "stopped");
  assert.throws(() => transition(state, { type: "start", mission: "agencies" }), /arrêtée/);
});

test("Le parcours visuel Facebook suit les mêmes règles que l'e-mail", () => {
  let state = onboarded();
  state = transition(state, { type: "start", mission: "proof" });
  assert.throws(() => transition(state, { type: "approve", document: "post", rights: true }), /marque/);
  state.brand.confirmed = true;
  assert.throws(() => transition(state, { type: "approve", document: "post", rights: false }), /droits/);
  state = transition(state, { type: "approve", document: "post", rights: true });
  assert.throws(() => transition(state, { type: "publish", document: "post" }), /Connectez/);
  state = transition(state, { type: "channel", channel: "facebook", connected: true });
  state = transition(state, { type: "publish", document: "post", date: "2099-01-15T10:00Z" });
  assert.equal(journeyStage(state, "proof"), "scheduled");
  state = transition(state, { type: "channel", channel: "facebook", connected: false });
  assert.equal(state.documents.post.scheduled, null);
  assert.match(state.journal[0].text, /1 programmation annulée/);
  assert.deepEqual([...journeyProgress(state, "proof").map((step) => step.state)], ["done", "done", "done", "current", "todo", "todo"]);
});

test("La réalisation choisie se retrouve dans le visuel", () => {
  let state = onboarded();
  state = transition(state, { type: "scope", mission: "proof", value: { project: "p2" } });
  assert.match(currentVersion(state.documents.post).body, /Pompe à chaleur · Luynes/);
  assert.equal(currentVersion(state.documents.post).number, 1);
});

test("Le temps consommé progresse avec les décisions", () => {
  let state = ready();
  assert.equal(timeUsed(state, "agencies"), 25);
  state = transition(state, { type: "publish", document: "email" });
  assert.equal(timeUsed(state, "agencies"), 35);
});

test("Import CSV : adresses .example uniquement, contrôle d'ancienneté et de droit de recontact", () => {
  const sample = parseContactsCsv(sampleCsv());
  assert.equal(sample.contacts.length, 27);
  assert.throws(() => parseContactsCsv("prenom;nom;email;mois_depuis_dernier_contact;recontact\nA;B;a@vrai-domaine.fr;3;oui"), /\.example/);
  assert.throws(() => parseContactsCsv("nom;email\nA;a@b.example"), /Colonnes/);
  let state = onboarded();
  state = transition(state, { type: "contacts", contacts: sample.contacts.slice(0, 10) });
  assert.equal(state.contactsSource, "import");
  assert.ok(state.scope.leads.ids.every((id) => state.contacts.some((contact) => contact.id === id)));
  assert.equal(state.contactsConfirmed, false);
});

test("Une correction de profil impose une nouvelle revue et annule les programmations", () => {
  let state = transition(ready(), { type: "publish", document: "email", date: "2099-01-15T10:00:00+01:00" });
  state = transition(state, { type: "profile", value: { area: "Marseille", offers: "Isolation seulement" } });
  assert.equal(state.documents.email.approved, null);
  assert.equal(state.documents.email.scheduled, null);
  assert.throws(() => transition(state, { type: "approve", document: "email" }), /profil a changé/);
});

test("Une ancienne confirmation est refusée après changement de version", () => {
  const state = transition(ready(), { type: "revision", document: "email", value: { body: "Nouvelle version" } });
  assert.throws(() => transition(state, { type: "approve", document: "email", expectedVersion: 1 }), /version a changé/);
});

test("La préparation seule interdit toute diffusion", () => {
  const state = ready();
  state.delegation = "prepare";
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /uniquement la préparation/);
});

test("La programmation refuse le passé et bloque les retouches", () => {
  const prepared = ready();
  assert.throws(() => transition(prepared, { type: "publish", document: "email", date: "2020-01-01T10:00" }), /futures/);
  const state = transition(prepared, { type: "publish", document: "email", date: "2099-01-15T10:00:00+01:00" });
  assert.equal(state.documents.email.scheduled, "2099-01-15T09:00:00.000Z");
  assert.throws(() => transition(state, { type: "revision", document: "email", value: { body: "Retouche" } }), /programmation/);
});

test("Les prospects exigent un contrôle préalable ; changer de priorité ne lance rien", () => {
  const state = onboarded();
  assert.throws(() => transition(state, { type: "start", mission: "leads" }), /droit de recontact/);
  const proposed = transition(state, { type: "strategy", priority: "leads" });
  assert.equal(proposed.priority, "leads");
  assert.equal(proposed.missions.leads, "proposed");
});

test("Paul : réponses par intention, au moins 8 intentions distinctes", () => {
  const state = onboarded();
  const ask = (message, key = "strategy") => paulReply(state, parseContext(key), message);
  const answers = {
    budget: ask("Combien ça coûte ?").text,
    temps: ask("Combien de temps ça prend ?").text,
    risque: ask("Quel risque ?").text,
    resultats: ask("Comment mesurer ?").text,
    canaux: ask("Où en est Facebook ?").text,
    comparer: ask("Comparer les pistes").text,
    capacite: ask("Combien de projets clients puis-je absorber ?").text,
    prochain: ask("Que faire maintenant ?").text,
    equipe: ask("Qui fait quoi ?").text,
  };
  assert.equal(new Set(Object.values(answers)).size, Object.keys(answers).length);
  assert.match(answers.budget, /200 €/);
  assert.match(answers.risque, /Règle d'arrêt/);
});

test("Paul dit quand une question sort du cadre et propose une suite", () => {
  const reply = paulReply(onboarded(), parseContext("strategy"), "Quelle est la météo demain à Marseille ?");
  assert.match(reply.text, /sort de ce que je peux traiter/);
  assert.ok(reply.links.length >= 2);
});

test("Les actions de Paul modifient l'état une fois confirmées", () => {
  let state = onboarded();
  let reply = paulReply(state, parseContext("mission:agencies"), "Réduis à 1 agence");
  assert.equal(reply.proposal.event.type, "scope");
  state = transition(state, reply.proposal.event);
  assert.equal(state.scope.agencies.ids.length, 1);
  reply = paulReply(state, parseContext("strategy"), "Mets le budget à 100");
  state = transition(state, reply.proposal.event);
  assert.equal(state.goal.budget, 100);
  assert.match(paulReply(state, parseContext("strategy"), "Mets le budget à 99999").text, /va de 0 à 2000/);
  reply = paulReply(state, parseContext("strategy"), "Je peux consacrer 3 h par semaine");
  state = transition(state, reply.proposal.event);
  assert.equal(state.goal.time, 3);
  reply = paulReply(state, parseContext("strategy"), "J'ai peu de temps");
  assert.equal(reply.proposal.event.priority, "proof");
  state = transition(state, { type: "start", mission: "agencies" });
  reply = paulReply(state, parseContext("mission:agencies"), "Mets cette mission en pause");
  state = transition(state, reply.proposal.event);
  assert.equal(state.missions.agencies, "paused");
});

test("Paul verrouille ses propositions de périmètre après diffusion", () => {
  const state = transition(ready(), { type: "publish", document: "email" });
  const reply = paulReply(state, parseContext("mission:agencies"), "Réduis à 1 agence");
  assert.equal(reply.proposal, undefined);
  assert.match(reply.text, /figé/);
});

test("Paul dans l'atelier prépare une version attribuée à Paul", () => {
  const state = ready();
  const reply = paulReply(state, parseContext("atelier:email"), "Plus court");
  const next = transition(state, reply.proposal.event);
  assert.equal(currentVersion(next.documents.email).by, "paul");
  assert.match(next.journal[0].text, /préparée avec Paul/);
});

test("Une idée neuve ouvre sa propre conversation et peut être notée", () => {
  const state = onboarded();
  assert.equal(contextLabel("idea:2"), "Nouvelle idée n°2");
  const reply = paulReply(state, parseContext("idea:2"), "Proposer un diagnostic gratuit aux syndics du quartier");
  assert.equal(reply.proposal.event.type, "idea");
  const next = transition(state, reply.proposal.event);
  assert.equal(next.ideas.length, 1);
});

test("Chaque contexte a une introduction et des suggestions propres", () => {
  const state = onboarded();
  const keys = ["strategy", "ambition", "positionnement", "concurrence", "sources", "results", "mission:leads", "atelier:post", "idea:1"];
  const intros = new Set(keys.map((key) => paulIntro(state, parseContext(key))));
  assert.equal(intros.size, keys.length);
  assert.ok(keys.every((key) => suggestionsFor(state, parseContext(key)).length > 0));
});
