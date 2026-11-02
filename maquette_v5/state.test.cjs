const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ structuredClone });
for (const file of ["state.js", "paul.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), context);
const api = vm.runInContext(
  "({ initialState, transition, currentVersion, nextStep, journeyStage, journeyProgress, scopeLock, eligibleContacts, parseContactsCsv, sampleCsv, paulReply, paulIntro, parseContext, contextLabel, suggestionsFor, recipientsOf, interpretAmbition, goalLabel, missionTarget, restoreState, resolveView })",
  context,
);
const { initialState, transition, currentVersion, nextStep, journeyStage, journeyProgress, scopeLock, eligibleContacts, parseContactsCsv, sampleCsv, paulReply, paulIntro, parseContext, contextLabel, suggestionsFor, interpretAmbition, goalLabel, missionTarget } = api;

function onboarded() {
  let state = transition(initialState(), { type: "profile", value: { firstName: "Alex", name: "Maison Test" } });
  state = transition(state, { type: "account", email: "Alex@Test.example" });
  state = transition(state, { type: "begin" });
  state = transition(state, { type: "goal", value: { statement: "Augmenter mon CA de 20 % cette année", growth: 20, months: 12, budget: 0, hiring: false } });
  state.step = 3;
  state = transition(state, { type: "diagnose", delegation: "review" });
  state = transition(state, { type: "interest" });
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

test("Le prénom et l'e-mail sont collectés et exigés ; le profil se transmet aux contenus sans lancer de mission", () => {
  assert.throws(() => transition(initialState(), { type: "onboard" }), /prénom/);
  const named = transition(initialState(), { type: "profile", value: { firstName: "Alex" } });
  assert.throws(() => transition(named, { type: "onboard" }), /diagnostic/);
  assert.throws(() => transition(named, { type: "account", email: "pas-un-mail" }), /e-mail valide/);
  const state = onboarded();
  assert.equal(state.profile.firstName, "Alex");
  assert.equal(state.profile.location, "Aix-en-Provence");
  assert.equal(state.account.email, "alex@test.example");
  assert.match(state.documents.email.versions[0].body, /Alex · Maison Test/);
  assert.ok(Object.values(state.missions).every((status) => status === "proposed"));
});

test("Le diagnostic précède l'intérêt puis l'inscription, sans lancer de mission ni consommer de crédits", () => {
  let state = transition(initialState(), { type: "begin" });
  assert.throws(() => transition(state, { type: "interest" }), /diagnostic/);
  assert.throws(() => transition(state, { type: "diagnose", delegation: "review" }), /profil et votre ambition/);
  state = transition(state, { type: "profile", value: { firstName: "Alex" } });
  state = transition(state, { type: "goal", value: { statement: "Obtenir plus de demandes locales" } });
  state.step = 3;
  state = transition(state, { type: "diagnose", delegation: "review" });
  assert.equal(state.step, 4);
  assert.equal(state.account.email, "");
  assert.equal(state.onboarded, false);
  assert.equal(state.signedIn, false);
  assert.throws(() => transition(state, { type: "onboard" }), /Ça m'intéresse/);
  state = transition(state, { type: "interest" });
  assert.equal(state.step, 5);
  assert.throws(() => transition(state, { type: "onboard" }), /e-mail/);
  state = transition(state, { type: "account", email: "alex@test.example" });
  state = transition(state, { type: "onboard" });
  assert.equal(state.signedIn, true);
  assert.equal(state.account.credits, 20);
  assert.ok(Object.values(state.missions).every((status) => status === "proposed"));
  assert.throws(() => transition(state, { type: "onboard" }), /existe déjà/);
});

test("Se connecter et se déconnecter", () => {
  let state = onboarded();
  assert.equal(state.signedIn, true);
  state = transition(state, { type: "signout" });
  assert.equal(state.signedIn, false);
  assert.throws(() => transition(state, { type: "signin", email: "autre@test.example" }), /Aucun compte/);
  assert.throws(() => transition(initialState(), { type: "signin", email: "alex@test.example" }), /Aucun compte/);
  state = transition(state, { type: "signin", email: " ALEX@test.example " });
  assert.equal(state.signedIn, true);
});

test("Les routes privées suivent l'avancement et ne contournent pas l'inscription", () => {
  let state = initialState();
  assert.equal(api.resolveView(state, "paul"), "decouvrir");
  state = transition(state, { type: "begin" });
  assert.equal(api.resolveView(state, "inscription"), "bienvenue");
  state.step = 4;
  assert.equal(api.resolveView(state, "paul"), "diagnostic");
  assert.equal(transition(state, { type: "begin" }).step, 4);
  state.step = 5;
  assert.equal(api.resolveView(state, "paul"), "inscription");
  state = onboarded();
  assert.equal(api.resolveView(state, "bienvenue"), "paul");
  assert.equal(api.resolveView(state, "decouvrir"), "decouvrir");
  state = transition(state, { type: "signout" });
  assert.equal(api.resolveView(state, "missions"), "decouvrir");
});

test("Une ancienne session garde son travail et complète son compte sans erreur", () => {
  const old = onboarded();
  old.schema = 1;
  delete old.account;
  delete old.signedIn;
  delete old.missionEdits;
  old.goal.time = 2;
  const restored = api.restoreState(old);
  assert.equal(restored.schema, 3);
  assert.equal(restored.onboarded, false);
  assert.equal(restored.step, 4);
  assert.equal(restored.account.credits, 20);
  assert.deepEqual(restored.documents, old.documents);
  assert.equal("time" in restored.goal, false);
  assert.equal(api.restoreState(transition(onboarded(), { type: "signout" })).signedIn, false);
  assert.equal(api.restoreState(null).started, false);
  const legacy = transition(initialState(), { type: "begin" });
  legacy.schema = 2;
  legacy.step = 6;
  legacy.diagnosticReady = true;
  assert.equal(api.restoreState(legacy).step, 5);
  legacy.step = 5;
  assert.equal(api.restoreState(legacy).step, 4);
  legacy.step = 4;
  legacy.diagnosticReady = false;
  assert.equal(api.restoreState(legacy).step, 3);
});

test("L'ambition en texte libre est comprise par Paul sans champ figé", () => {
  const full = interpretAmbition("Je voudrais augmenter mon chiffre d'affaires de 20 % cette année, sans embaucher.");
  assert.equal(full.growth, 20);
  assert.equal(full.months, 12);
  assert.equal(full.hiring, false);
  assert.equal(full.questions.length, 0);
  const vague = interpretAmbition("Je voudrais plus de clients");
  assert.equal(vague.growth, null);
  assert.equal(vague.questions.length, 2);
  assert.equal(interpretAmbition("Doubler mon CA en 2 ans avec 300 euros de budget").growth, null);
  assert.equal(interpretAmbition("+10 % en 18 mois, budget 300 €").budget, 300);
  assert.equal(interpretAmbition("Passer à +15 % en 2 mois").months, null);
  const costs = interpretAmbition("Réduire mes coûts de 20 % et améliorer la satisfaction client");
  assert.equal(costs.growth, null);
  assert.equal(goalLabel(costs), costs.statement);
  const state = transition(onboarded(), { type: "goal", value: { statement: "Plus de clients", growth: null, months: null, budget: 0, hiring: false } });
  assert.equal(goalLabel(state.goal), "Plus de clients");
});

test("Les limites de l'ambition sont appliquées", () => {
  assert.throws(() => transition(onboarded(), { type: "goal", value: { growth: 300 } }), /entre 1 et 50/);
  assert.throws(() => transition(onboarded(), { type: "goal", value: { budget: 5000 } }), /entre 0 et 2000/);
  assert.equal(transition(onboarded(), { type: "goal", value: { budget: 0 } }).goal.budget, 0);
});

test("Valider un contenu ne le diffuse pas", () => {
  const state = ready();
  assert.equal(state.documents.email.approved, 1);
  assert.equal(state.publications.length, 0);
});

test("Plus aucune notion de temps : trois missions peuvent tourner, le co\u00fbt est en cr\u00e9dits", () => {
  let state = onboarded();
  state.contactsConfirmed = true;
  assert.equal(state.account.credits, 20);
  state = transition(state, { type: "start", mission: "agencies" });
  state = transition(state, { type: "start", mission: "proof" });
  state = transition(state, { type: "start", mission: "leads" });
  assert.equal(state.missions.leads, "active");
  assert.equal(state.account.credits, 20 - 3 * 3);
  assert.equal(state.account.ledger.length, 3);
  assert.equal("time" in state.goal || "capacity" in state.goal, false);
});

test("Les cr\u00e9dits manquants bloquent le lancement et une recharge les r\u00e9tablit", () => {
  let state = onboarded();
  state.account.credits = 2;
  assert.throws(() => transition(state, { type: "start", mission: "agencies" }), /Cr\u00e9dits insuffisants/);
  assert.throws(() => transition(state, { type: "recharge", amount: 7 }), /inconnu/);
  state = transition(state, { type: "recharge", amount: 10 });
  assert.equal(state.account.credits, 12);
  assert.match(state.account.ledger[0].label, /simulation/);
  state = transition(state, { type: "start", mission: "agencies" });
  assert.equal(state.account.credits, 9);
  state = transition(state, { type: "pause", mission: "agencies" });
  state = transition(state, { type: "start", mission: "agencies" });
  assert.equal(state.account.credits, 9);
});

test("Une version pr\u00e9par\u00e9e avec Paul co\u00fbte un cr\u00e9dit, une retouche directe est gratuite", () => {
  let state = ready();
  const before = state.account.credits;
  state = transition(state, { type: "revision", document: "email", value: { body: "\u00c0 la main" } });
  assert.equal(state.account.credits, before);
  state = transition(state, { type: "revision", document: "email", by: "paul", value: { body: "Variante" } });
  assert.equal(state.account.credits, before - 1);
});

test("\u00c9carter, remettre au plan et modifier l'objectif d'une mission", () => {
  let state = onboarded();
  state = transition(state, { type: "start", mission: "proof" });
  assert.throws(() => transition(state, { type: "dismiss", mission: "proof" }), /mettez-la en pause/);
  state = transition(state, { type: "dismiss", mission: "agencies" });
  assert.equal(state.missions.agencies, "dismissed");
  assert.equal(state.priority, "proof");
  assert.equal(journeyStage(state, "agencies"), "dismissed");
  assert.throws(() => transition(state, { type: "start", mission: "agencies" }), /\u00e9cart\u00e9e/);
  assert.throws(() => transition(state, { type: "strategy", priority: "agencies" }), /\u00e9cart\u00e9e/);
  assert.throws(() => transition(state, { type: "scope", mission: "agencies", value: { ids: ["cours"] } }), /\u00e9cart\u00e9e/);
  assert.notEqual(nextStep(state).mission, "agencies");
  state = transition(state, { type: "restore", mission: "agencies" });
  assert.equal(state.missions.agencies, "proposed");
  assert.throws(() => transition(state, { type: "restore", mission: "agencies" }), /pas \u00e9cart\u00e9e/);
  assert.throws(() => transition(state, { type: "mission-edit", mission: "agencies", target: "ok" }), /5 \u00e0 120/);
  state = transition(state, { type: "mission-edit", mission: "agencies", target: "2 rendez-vous avec des agences en 45 jours" });
  assert.equal(missionTarget(state, "agencies"), "2 rendez-vous avec des agences en 45 jours");
  assert.match(state.journal[0].text, /Objectif modifi\u00e9/);
});

test("Tout \u00e9carter laisse Paul sans prochaine mission", () => {
  let state = onboarded();
  for (const mission of ["agencies", "proof", "leads"]) state = transition(state, { type: "dismiss", mission });
  assert.equal(nextStep(state).stage, "idle");
});

test("Créer une mission produit un parcours indépendant pour chacun des trois types", () => {
  for (const template of ["agencies", "proof", "leads"]) {
    let state = transition(onboarded(), { type: "create-mission", template, title: "Mon nouveau test", target: "Obtenir un échange qualifié", rationale: "Une opportunité identifiée avec Paul" });
    const id = "custom-1";
    const document = state.customMissions[id].document;
    assert.equal(state.missions[id], "proposed");
    assert.equal(state.account.credits, 20);
    assert.notEqual(state.scope[id], state.scope[template]);
    state.brand.confirmed = true;
    state = transition(state, { type: "start", mission: id, confirmContacts: true });
    state = transition(state, { type: "approve", document, rights: true });
    state = transition(state, { type: "channel", channel: state.documents[document].channel, connected: true });
    state = transition(state, { type: "publish", document });
    assert.equal(journeyStage(state, id), "report");
    assert.equal(state.missions[template], "proposed");
    state = transition(state, { type: "report", mission: id, leads: 1, meetings: 1 });
    state = transition(state, { type: "outcome", mission: id, outcome: "continue" });
    assert.equal(journeyStage(state, id), "next-round");
    assert.equal(api.restoreState(state).customMissions[id].title, "Mon nouveau test");
  }
});

test("Restaurer une mission déjà lancée ne facture pas un second lancement", () => {
  let state = transition(onboarded(), { type: "start", mission: "agencies" });
  state = transition(state, { type: "pause", mission: "agencies" });
  state = transition(state, { type: "dismiss", mission: "agencies" });
  state = transition(state, { type: "mission-edit", mission: "agencies", target: "Obtenir un échange qualifié" });
  state = transition(state, { type: "restore", mission: "agencies" });
  assert.equal(state.missions.agencies, "paused");
  const credits = state.account.credits;
  state = transition(state, { type: "start", mission: "agencies" });
  assert.equal(state.account.credits, credits);
});

test("Le nouveau logo s'applique à tous les visuels sans modifier leurs anciennes versions", () => {
  let state = transition(onboarded(), { type: "create-mission", template: "proof", title: "Mon cas client", target: "Obtenir un échange qualifié", rationale: "Une réalisation à documenter" });
  state = transition(state, { type: "logo", logo: "data:image/png;base64,iVBORw0KGgo=" });
  const custom = state.documents["document-custom-1"];
  assert.equal(currentVersion(custom).logo, state.brand.logo);
  assert.equal(custom.versions[0].logo, null);
  state = transition(state, { type: "brand", value: { color: "#123456", confirmed: true } });
  assert.equal(currentVersion(state.documents["document-custom-1"]).color, "#123456");
  assert.equal(custom.versions[0].color, "#24564b");
});

test("Les vues retrouvent les missions personnalisées et leurs contenus", () => {
  const browser = vm.createContext({ structuredClone, location: { hash: "#/missions/custom-1" } });
  for (const file of ["state.js", "paul.js", "views.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), browser);
  browser.fixture = transition(onboarded(), { type: "create-mission", template: "proof", title: "Mon cas client", target: "Obtenir un échange qualifié", rationale: "Une réalisation à documenter" });
  const html = vm.runInContext('state = fixture; ui.mission = "custom-1"; missionDetail()', browser);
  assert.match(html, /Mon cas client/);
  assert.match(html, /data-mission="custom-1"/);
  const atelier = vm.runInContext('ui.document = "document-custom-1"; atelierPage()', browser);
  assert.match(atelier, /value="document-custom-1" selected/);
  assert.match(atelier, /Aperçu Facebook/);
  assert.equal(contextLabel("mission:custom-1", browser.fixture), "Mission · Mon cas client");
});

test("Le parcours présente la localisation, puis le diagnostic directement après l'ambition", () => {
  const browser = vm.createContext({ structuredClone, location: { hash: "#/bienvenue" } });
  for (const file of ["state.js", "paul.js", "views.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), browser);
  const discovery = vm.runInContext('state = initialState(); state.started = true; onboarding()', browser);
  assert.match(discovery, /name="location" required/);
  browser.fixture = initialState();
  browser.fixture.started = true;
  browser.fixture.step = 4;
  browser.fixture.diagnosticReady = true;
  browser.fixture.profile.location = "Lyon";
  const diagnostic = vm.runInContext('state = fixture; onboarding()', browser);
  assert.match(diagnostic, /4 sur 5/);
  assert.match(diagnostic, /Lyon/);
  assert.match(diagnostic, /Ça m'intéresse/);
  assert.doesNotMatch(diagnostic, /Collaboration|name="delegation"/);
});

test("Le logo cr\u00e9e une nouvelle version du visuel \u00e0 revalider et se retire", () => {
  let state = ready("post");
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.throws(() => transition(state, { type: "logo", logo: "data:image/svg+xml;base64,AAAA" }), /PNG, un JPG/);
  state = transition(state, { type: "logo", logo: png });
  assert.equal(state.brand.logo, png);
  assert.equal(state.documents.post.approved, null);
  assert.equal(currentVersion(state.documents.post).logo, png);
  assert.equal(state.documents.post.versions[0].logo, null);
  state = transition(state, { type: "logo", logo: null });
  assert.equal(currentVersion(state.documents.post).logo, null);
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
    crédits: ask("Combien me reste-t-il de crédits ?").text,
    risque: ask("Quel risque ?").text,
    resultats: ask("Comment mesurer ?").text,
    canaux: ask("Où en est Facebook ?").text,
    comparer: ask("Comparer les pistes").text,
    écarter: ask("Quelle mission écarter ?").text,
    prochain: ask("Que faire maintenant ?").text,
    equipe: ask("Qui fait quoi ?").text,
  };
  assert.equal(new Set(Object.values(answers)).size, Object.keys(answers).length);
  assert.match(answers.budget, /0 €|crédits/);
  assert.match(answers.crédits, /20 crédits/);
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
  reply = paulReply(state, parseContext("strategy"), "Je préfère commencer par les agences");
  assert.equal(reply.proposal.event.priority, "agencies");
  state = transition(state, { type: "start", mission: "agencies" });
  reply = paulReply(state, parseContext("mission:agencies"), "Mets cette mission en pause");
  state = transition(state, reply.proposal.event);
  assert.equal(state.missions.agencies, "paused");
  reply = paulReply(state, parseContext("mission:agencies"), "Écarte cette mission");
  assert.equal(reply.proposal.event.type, "dismiss");
  state = transition(state, reply.proposal.event);
  assert.equal(state.missions.agencies, "dismissed");
  reply = paulReply(state, parseContext("strategy"), "Remets la mission agences au plan");
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
