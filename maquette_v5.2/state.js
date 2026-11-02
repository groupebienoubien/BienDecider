"use strict";

// Logique métier de la maquette V5 : aucune dépendance au DOM, testable seule (state.test.cjs).

const STORAGE_KEY = "biendecider-maquette-v5";
const SEED_VERSION = 3;
const CONTACT_MAX_AGE_MONTHS = 24;
const LEADS_MAX = 8;
const AGENCIES_MAX = 2;
const CREDIT_COST = { start: 3, paulRevision: 1 };
const CREDIT_PACKS = [10, 25, 50];

const JOURNEY = ["Cadrer", "Préparer", "Valider", "Diffuser", "Faire le bilan", "Décider"];

const missionDefinitions = {
  agencies: {
    title: "Ouvrir la porte des agences locales",
    short: "Partenariats agences",
    target: "1 rendez-vous qualifié en 30 jours",
    owner: "Jean-Claude",
    ownerClass: "jean",
    document: "email",
    evidence: "6 agences repérées dans votre zone",
    rationale:
      "Un réseau de prescripteurs à construire. Un test limité à 2 agences, sans budget média.",
    risk: "Premier contact commercial : votre accord reste obligatoire.",
    delay: "30 jours",
    certainty: ["Piste à qualifier", "amber"],
    caveat: "Premier contact commercial",
    stopRule:
      "Arrêt dès un refus clair, ou à 30 jours sans réponse des agences contactées. Aucune relance automatique.",
  },
  proof: {
    title: "Faire parler vos réalisations",
    short: "Preuves & réalisations",
    target: "Publier 1 cas chantier, puis mesurer les demandes",
    owner: "Camille",
    ownerClass: "camille",
    document: "post",
    evidence: "4 réalisations visibles sur 18 déclarées",
    rationale:
      "Votre savoir-faire est peu visible. Une réalisation documentée peut rassurer les prospects et soutenir les partenariats.",
    risk: "Photo et témoignage : droits à confirmer avant publication.",
    delay: "7 jours",
    certainty: ["Observation", "green"],
    caveat: "Droits photo à confirmer",
    stopRule:
      "Bilan à J+7 après la publication. Pas de deuxième réalisation sans ce bilan.",
  },
  leads: {
    title: "Renouer avec les bons prospects",
    short: "Réactivation prospects",
    target: "Tester 8 contacts, viser 2 échanges qualifiés",
    owner: "Jean-Claude",
    ownerClass: "jean",
    document: "followup",
    evidence: "27 anciens contacts déclarés, fichier non vérifié",
    rationale:
      "Repartir de relations existantes avant d'acheter du trafic. La pertinence et le droit de recontact sont à vérifier.",
    risk: "Aucun envoi avant vérification de la liste et du droit de recontact.",
    delay: "30 jours",
    certainty: ["À vérifier", "amber"],
    caveat: "Droit de recontact à vérifier",
    stopRule:
      "Arrêt dès 2 oppositions au recontact, ou à 30 jours. Aucune relance automatique.",
  },
};

const AGENCIES = [
  { id: "cours", name: "Agence du Cours", email: "contact@agence-du-cours.example", note: "Centre-ville" },
  { id: "sud", name: "Maison Sud", email: "contact@maison-sud.example", note: "Quartiers sud" },
  { id: "mazarin", name: "Agence Mazarin", email: "contact@agence-mazarin.example", note: "Quartier Mazarin" },
  { id: "pigonnet", name: "Immo Pigonnet", email: "contact@immo-pigonnet.example", note: "Pigonnet, Saint-Eutrope" },
  { id: "provence", name: "Provence Transactions", email: "contact@provence-transactions.example", note: "Aix-Ouest" },
  { id: "tholonet", name: "Cabinet du Tholonet", email: "contact@cabinet-tholonet.example", note: "Route du Tholonet" },
];

const PROJECTS = [
  { id: "p1", title: "Isolation des combles · Jas-de-Bouffan" },
  { id: "p2", title: "Pompe à chaleur · Luynes" },
  { id: "p3", title: "Rénovation globale · Puyricard" },
  { id: "p4", title: "Isolation de façade · Les Milles" },
];

const COMPETITORS = [
  "ÉcoHabitat Provence",
  "Maison Thermique",
  "Confort Aix",
  "Rénovation du Sud",
  "Énergie Habitat",
];

const GOAL_LIMITS = {
  growth: { min: 1, max: 50, label: "La croissance visée", unit: "%", usual: "5 à 20 %" },
  months: { min: 3, max: 36, label: "L'horizon", unit: "mois", usual: "6 à 12 mois" },
  budget: { min: 0, max: 2000, label: "Le budget média", unit: "€/mois", usual: "0 € pour un premier test" },
};

const slug = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function seedContacts() {
  const firsts = ["Claire", "Julien", "Sophie", "Marc", "Nadia", "Thomas", "Élise", "Karim", "Laure"];
  const lasts = ["Martin", "Bernard", "Roux", "Faure", "Girard", "Blanc", "Garnier", "Chevalier", "Lopez", "Mercier", "Aubert", "Perrin", "Colin"];
  const months = [3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 19, 21, 22, 23, 26, 28, 30, 33, 36, 40, 44, 48, 52, 56, 60, 4, 7];
  return months.map((monthsAgo, index) => {
    const first = firsts[index % firsts.length];
    const last = lasts[(index * 7) % lasts.length];
    return {
      id: `c${String(index + 1).padStart(2, "0")}`,
      name: `${first} ${last}`,
      email: `${slug(first)}.${slug(last)}@client-exemple.example`,
      monthsAgo,
      consent: index % 9 === 4 ? "non" : index % 7 === 6 ? "inconnu" : "oui",
    };
  });
}

function contactStatus(contact) {
  if (contact.consent === "non") return { ok: false, reason: "S'est opposé au recontact" };
  if (contact.consent !== "oui") return { ok: false, reason: "Accord de recontact inconnu" };
  if (contact.monthsAgo > CONTACT_MAX_AGE_MONTHS)
    return { ok: false, reason: `Dernier échange il y a ${contact.monthsAgo} mois (limite ${CONTACT_MAX_AGE_MONTHS})` };
  return { ok: true, reason: "Recontactable" };
}

function eligibleContacts(state) {
  return state.contacts
    .filter((contact) => contactStatus(contact).ok)
    .sort((a, b) => a.monthsAgo - b.monthsAgo);
}

function sampleCsv() {
  const rows = seedContacts().map(
    (contact) => `${contact.name.split(" ")[0]};${contact.name.split(" ")[1]};${contact.email};${contact.monthsAgo};${contact.consent}`,
  );
  return ["prenom;nom;email;mois_depuis_dernier_contact;recontact", ...rows].join("\n");
}

// Aucune donnée réelle : seules les adresses en .example sont acceptées.
function parseContactsCsv(text) {
  const lines = String(text).replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Le fichier est vide ou ne contient que l'en-tête.");
  if (lines.length > 201) throw new Error("200 contacts au maximum dans cette maquette.");
  const separator = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].toLowerCase().split(separator).map((cell) => cell.trim());
  const needed = ["prenom", "nom", "email", "mois_depuis_dernier_contact", "recontact"];
  const index = needed.map((name) => header.indexOf(name));
  if (index.some((position) => position < 0))
    throw new Error(`Colonnes attendues, dans cet ordre : ${needed.join(separator)}.`);
  const rows = lines.slice(1).map((line) => line.split(separator).map((cell) => cell.trim()));
  if (rows.some((cells) => !/^[^@\s]+@[^@\s]+\.example$/i.test(cells[index[2]] || "")))
    throw new Error(
      "Cette maquette n'accepte que des adresses en .example. Ne chargez pas de vraies données personnelles.",
    );
  const contacts = [];
  const skipped = [];
  rows.forEach((cells, position) => {
    const months = Number(cells[index[3]]);
    const name = `${cells[index[0]]} ${cells[index[1]]}`.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
    if (!name || !Number.isInteger(months) || months < 0 || months > 240) {
      skipped.push(`Ligne ${position + 2} ignorée : nom ou ancienneté invalide.`);
      return;
    }
    const consent = ["oui", "non", "inconnu"].includes((cells[index[4]] || "").toLowerCase())
      ? cells[index[4]].toLowerCase()
      : "inconnu";
    contacts.push({
      id: `i${String(position + 1).padStart(3, "0")}`,
      name,
      email: cells[index[2]].toLowerCase(),
      monthsAgo: months,
      consent,
    });
  });
  if (!contacts.length) throw new Error("Aucune ligne exploitable dans ce fichier.");
  return { contacts, skipped };
}

function channelLabel(channel) {
  return { facebook: "Facebook", gmail: "Gmail", site: "Site web" }[channel] || channel;
}

function goalLabel(goal) {
  if (goal.statement) return goal.statement;
  if (goal.growth) return `+${goal.growth} % de chiffre d'affaires${goal.months ? ` en ${goal.months} mois` : ""}`;
  return "Cap à définir avec Paul";
}

const definitionsFor = (state) => ({ ...missionDefinitions, ...state.customMissions });
const templateOf = (state, id) => state.customMissions?.[id]?.template || id;
const missionTarget = (state, id) => state.missionEdits?.[id]?.target || definitionsFor(state)[id].target;

const signature = (profile) => (profile.firstName ? `${profile.firstName} · ${profile.name}` : profile.name);

function buildDocuments(profile, scope, brand) {
  const sign = signature(profile);
  const project = PROJECTS.find((item) => item.id === scope.proof.project) || PROJECTS[0];
  const base = (agent) => ({
    by: "agent",
    agent,
    companyName: profile.name,
    color: brand.color,
    accent: brand.accent,
    tone: brand.tone,
    logo: brand.logo || null,
  });
  const document = (mission, channel, version) => ({
    mission,
    channel,
    approved: null,
    scheduled: null,
    rights: false,
    counters: { approvals: 0, userEdits: 0 },
    versions: [{ number: 1, ...version }],
  });
  return {
    email: document("agencies", "gmail", {
      title: "Un partenaire rénovation pour vos acquéreurs",
      body: `Bonjour,\n\nJe dirige ${profile.name}, à ${profile.area.split(" · ")[0]}. Nous accompagnons les particuliers dans leurs projets d'isolation et de pompe à chaleur.\n\nJe vous propose un premier échange pour voir comment nous pourrions accompagner vos acquéreurs après leur achat. Seriez-vous disponible pour en parler la semaine prochaine ?\n\nBien à vous,\n${sign}`,
      headline: "Un projet bien accompagné.",
      note: "Première proposition de Jean-Claude, coordonnée par Paul",
      ...base("Jean-Claude"),
    }),
    post: document("proof", "facebook", {
      title: "Du confort, pour longtemps.",
      body: `Un projet de rénovation commence par une maison que l'on connaît et des priorités bien définies.\n\nÀ ${profile.area.split(" · ")[0]} et dans les environs, nous vous accompagnons pour choisir les travaux adaptés à votre logement. Parlons de votre projet.\n\nChantier à l'honneur : ${project.title}\n\n${profile.name} · ${profile.offers}`,
      headline: "Du confort,\npour longtemps.",
      note: "Première proposition de Camille, issue du brief de marque",
      ...base("Camille"),
    }),
    followup: document("leads", "gmail", {
      title: "Où en est votre projet de rénovation ?",
      body: `Bonjour,\n\nVous nous aviez contactés pour un projet de rénovation. Est-il toujours d'actualité ? Je suis disponible pour faire le point sur vos priorités.\n\nSi vous ne souhaitez plus être recontacté, un simple retour suffit.\n\n${sign}`,
      headline: "Reprenons votre projet.",
      note: "Brouillon de Jean-Claude, à adapter après le choix des contacts",
      ...base("Jean-Claude"),
    }),
  };
}

function initialState() {
  const seed = {
    schema: SEED_VERSION,
    started: false,
    onboarded: false,
    diagnosticReady: false,
    step: 1,
    profile: {
      firstName: "",
      name: "Dupont Rénovation",
      location: "Aix-en-Provence",
      url: "https://dupont-renovation.example",
      activity: "Rénovation énergétique",
      area: "Aix-en-Provence · 30 km",
      clients: "Particuliers et syndics",
      offers: "Isolation et pompes à chaleur",
      offersRefined: false,
    },
    goal: { statement: "", growth: null, months: null, budget: 0, hiring: false },
    brand: { color: "#24564b", accent: "#e4bc61", tone: "Clair, concret, rassurant", confirmed: false, logo: null },
    account: { email: "", credits: 20, ledger: [] },
    signedIn: false,
    missionEdits: {},
    customMissions: {},
    channels: { facebook: false, gmail: false, site: false },
    delegation: "review",
    priority: "agencies",
    missions: { agencies: "proposed", proof: "proposed", leads: "proposed" },
    contacts: seedContacts(),
    contactsSource: "declared",
    contactsConfirmed: false,
    scope: {
      agencies: { ids: ["cours", "sud"] },
      leads: { ids: [] },
      proof: { project: "p1" },
    },
    documents: null,
    publications: [],
    reports: {},
    decisions: {},
    ideas: [],
    journal: [],
    conversations: {},
    ideaCount: 0,
    preference: "balanced",
    session: { id: "", startedAt: new Date().toISOString(), events: [], feedback: {} },
  };
  seed.scope.leads.ids = eligibleContacts(seed).slice(0, LEADS_MAX).map((contact) => contact.id);
  seed.documents = buildDocuments(seed.profile, seed.scope, seed.brand);
  return seed;
}

function restoreState(saved) {
  const seed = initialState();
  if (![1, 2, SEED_VERSION].includes(saved?.schema) || !saved.documents || !saved.profile || !saved.scope) return seed;
  const restored = { ...seed, ...saved, schema: SEED_VERSION };
  for (const key of ["profile", "goal", "brand", "account", "session", "missionEdits"])
    restored[key] = { ...seed[key], ...saved[key] };
  if (saved.schema < SEED_VERSION) {
    if (restored.step === 6) restored.step = 5;
    else if (restored.step === 5) restored.step = 4;
    else if (restored.step === 4 && !restored.diagnosticReady) restored.step = 3;
  }
  if (!restored.goal.statement && restored.goal.growth)
    restored.goal.statement = goalLabel(restored.goal);
  delete restored.goal.time;
  delete restored.goal.capacity;
  if (restored.onboarded && !restored.account.email) {
    restored.onboarded = false;
    restored.started = true;
    restored.diagnosticReady = true;
    restored.step = 4;
  }
  restored.signedIn = restored.onboarded && Boolean(saved.signedIn ?? true);
  return restored;
}

function onboardingRoute(current) {
  return current.step === 5 ? "inscription" : current.step === 4 ? "diagnostic" : "bienvenue";
}

function resolveView(current, requested) {
  if (requested === "decouvrir") return requested;
  if (!current.onboarded) return current.started ? onboardingRoute(current) : "decouvrir";
  if (!current.signedIn) return "decouvrir";
  return ["paul", "missions", "atelier", "entreprise", "resultats", "compte"].includes(requested) ? requested : "paul";
}

function currentVersion(documentState) {
  return documentState.versions[documentState.versions.length - 1];
}

const isDiffused = (state, documentId, version) =>
  state.publications.some((item) => item.document === documentId && item.version === version);

const missionOfDocument = (state, documentId) => state.documents[documentId].mission;

function recipientsOf(state, documentId) {
  const mission = missionOfDocument(state, documentId);
  if (templateOf(state, mission) === "agencies") return AGENCIES.filter((agency) => state.scope[mission].ids.includes(agency.id));
  if (templateOf(state, mission) === "leads") return state.contacts.filter((contact) => state.scope[mission].ids.includes(contact.id));
  return [];
}

function scopeSummary(state, id) {
  if (templateOf(state, id) === "agencies") {
    const names = recipientsOf(state, definitionsFor(state)[id].document).map((agency) => agency.name);
    return names.length ? names.join(" et ") : "Aucune agence choisie";
  }
  if (templateOf(state, id) === "leads") {
    const total = state.contacts.length;
    return `${state.scope[id].ids.length} contact${state.scope[id].ids.length > 1 ? "s" : ""} sur ${total} ${state.contactsSource === "import" ? "importés" : "déclarés"} (${eligibleContacts(state).length} recontactables)`;
  }
  return (PROJECTS.find((item) => item.id === state.scope[id].project) || PROJECTS[0]).title;
}

function scopeLock(state, id) {
  const missionDefinitions = definitionsFor(state);
  if (state.missions[id] === "dismissed") return "Mission écartée du plan : remettez-la d'abord au plan.";
  if (state.missions[id] === "stopped") return "Mission arrêtée : le périmètre est figé.";
  const documentId = missionDefinitions[id].document;
  const doc = state.documents[documentId];
  if (doc.scheduled) return "Une diffusion est programmée : annulez-la avant de modifier le périmètre.";
  if (isDiffused(state, documentId, currentVersion(doc).number))
    return "Ce contenu a déjà été diffusé : le périmètre est figé. Créez une nouvelle version dans l'atelier pour repartir sur un autre périmètre.";
  return "";
}

function spendCredits(next, amount, label) {
  if (next.account.credits < amount)
    throw new Error(`Crédits insuffisants : il en faut ${amount}, il vous en reste ${next.account.credits}. Rechargez dans Mon compte.`);
  next.account.credits -= amount;
  next.account.ledger.unshift({ date: new Date().toISOString(), label, delta: -amount });
}

function journeyStage(state, id) {
  const missionDefinitions = definitionsFor(state);
  const status = state.missions[id];
  if (status === "dismissed") return "dismissed";
  if (status === "stopped") return "closed";
  if (status !== "active") return "launch";
  const documentId = missionDefinitions[id].document;
  const doc = state.documents[documentId];
  const version = currentVersion(doc).number;
  const count = state.publications.filter((item) => missionOfDocument(state, item.document) === id).length;
  if (doc.scheduled) return "scheduled";
  if (isDiffused(state, documentId, version)) {
    if (state.reports[id]?.atPublications !== count) return "report";
    if (state.decisions[id]?.atPublications !== count) return "decide";
    return "next-round";
  }
  if (doc.approved === version) return state.channels[doc.channel] ? "publish" : "connect";
  return "approve";
}

function journeyProgress(state, id) {
  const stage = journeyStage(state, id);
  const position = { launch: 0, approve: 2, connect: 3, publish: 3, scheduled: 3, report: 4, decide: 5 }[stage];
  return JOURNEY.map((label, index) => ({
    label,
    state: position === undefined || index < position ? "done" : index === position ? "current" : "todo",
  }));
}

function nextStep(state) {
  const missionDefinitions = definitionsFor(state);
  const order = [state.priority, ...Object.keys(missionDefinitions).filter((id) => id !== state.priority)];
  const actionable = ["approve", "connect", "publish", "report", "decide"];
  const found = order.find((id) => actionable.includes(journeyStage(state, id)));
  const id = found || order.find((candidate) => journeyStage(state, candidate) === "launch") || order.find((candidate) => !["closed", "dismissed"].includes(journeyStage(state, candidate)));
  if (!id) {
    return { stage: "idle", title: "Aucune mission en cours", detail: "Toutes vos missions sont closes ou écartées. Explorez une nouvelle idée avec Paul pour lancer un prochain test.", label: "Explorer une idée", action: "paul-idea" };
  }
  const stage = journeyStage(state, id);
  const def = missionDefinitions[id];
  const documentId = def.document;
  const doc = state.documents[documentId];
  const common = { stage, mission: id, document: documentId };
  switch (stage) {
    case "launch":
      return { ...common, title: `Examiner « ${def.short} »`, detail: `${missionTarget(state, id)}.`, label: "Examiner cette mission", route: `missions/${id}` };
    case "approve":
      return { ...common, title: "Relire et valider le contenu", detail: `${def.short} · V${currentVersion(doc).number} attend votre accord. Valider n'envoie rien.`, label: "Ouvrir l'atelier", route: `atelier/${documentId}` };
    case "connect":
      return { ...common, title: `Connecter ${channelLabel(doc.channel)}`, detail: "Le contenu est validé. Il manque seulement le canal de diffusion (aucun envoi à cette étape).", label: `Connecter ${channelLabel(doc.channel)}`, action: "connect", channel: doc.channel };
    case "publish":
      return { ...common, title: doc.channel === "gmail" ? "Confirmer l'envoi" : "Confirmer la publication", detail: `${def.short} · V${doc.approved} est validée et ${channelLabel(doc.channel)} est connecté. Rien ne part sans votre confirmation.`, label: "Ouvrir l'atelier", route: `atelier/${documentId}` };
    case "scheduled":
      return { ...common, title: "Diffusion programmée", detail: "Rien à faire pour l'instant. Vous pouvez encore l'annuler dans l'atelier.", label: "Voir la programmation", route: `atelier/${documentId}` };
    case "report":
      return { ...common, title: "Renseigner le bilan", detail: `${def.short} : notez les réponses reçues. Sans bilan, impossible de décider de la suite.`, label: "Renseigner mon bilan", action: "report" };
    case "decide":
      return { ...common, title: "Décider de la suite", detail: `${def.short} : poursuivre, adapter avec Paul ou arrêter, au regard de votre bilan.`, label: "Décider la suite", action: "decide-next" };
    default:
      return { ...common, title: "Préparer la série suivante", detail: "Vous avez décidé de poursuivre : une nouvelle version du contenu démarre un nouveau cycle.", label: "Ouvrir l'atelier", route: `atelier/${documentId}` };
  }
}

function validateGoal(value) {
  Object.entries(value).forEach(([key, number]) => {
    const limit = GOAL_LIMITS[key];
    if (!limit || number === null) return;
    if (!Number.isFinite(number) || number < limit.min || number > limit.max)
      throw new Error(`${limit.label} doit être compris entre ${limit.min} et ${limit.max} ${limit.unit}.`);
  });
}

function toCount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000000)
    throw new Error("Utilisez des nombres entiers positifs, sans décimale.");
  return number;
}

const variantLabel = (variant) => ({ shorter: "plus court", warmer: "plus humain", angle: "autre angle" })[variant] || variant;

function proposedRevision(state, documentId, variant) {
  const current = currentVersion(state.documents[documentId]);
  const name = state.profile.name;
  const sign = signature(state.profile);
  const place = state.profile.area.split(" · ")[0];
  const mission = state.documents[documentId].mission;
  const visual = templateOf(state, mission) === "proof";
  const lead = templateOf(state, mission) === "leads";
  const project = PROJECTS.find((item) => item.id === state.scope[mission].project) || PROJECTS[0];
  const bodies = visual
    ? {
        shorter: `Votre projet de rénovation à ${place}. Des choix clairs, un accompagnement de proximité.\n\nChantier à l'honneur : ${project.title}\n\n${name}`,
        warmer: `On sait qu'une rénovation soulève beaucoup de questions. Par où commencer ? Quels travaux choisir ?\n\nChantier à l'honneur : ${project.title}\n\nChez ${name}, nous prenons le temps d'en parler avec vous.`,
        angle: `Et si le premier chantier, c'était d'y voir plus clair ?\n\nAvant de parler travaux, parlons de vos priorités. ${name} vous accompagne à ${place}.\n\nChantier à l'honneur : ${project.title}`,
      }
    : {
        shorter: lead
          ? `Bonjour,\n\nVotre projet de rénovation est-il toujours d'actualité ? Je suis disponible pour en reparler.\n\nVous ne souhaitez plus être recontacté ? Un simple retour suffit.\n\n${sign}`
          : `Bonjour,\n\n${name} accompagne les projets de rénovation à ${place}. Seriez-vous disponible pour un échange sur l'accompagnement de vos acquéreurs ?\n\nBien à vous,\n${sign}`,
        warmer: lead
          ? `Bonjour,\n\nJe reprends de vos nouvelles au sujet de votre projet. Vos envies ou votre calendrier ont peut-être évolué. Prenons le temps de faire le point, si cela vous est utile.\n\nUn simple retour suffit si vous préférez ne plus être contacté.\n\n${sign}`
          : `Bonjour,\n\nUn achat immobilier s'accompagne souvent de beaucoup de questions sur les travaux. C'est notre quotidien chez ${name}.\n\nJ'aimerais faire votre connaissance et voir si nous pouvons être utiles à vos acquéreurs. Un échange la semaine prochaine vous conviendrait-il ?\n\n${sign}`,
        angle: lead
          ? `Bonjour,\n\nQu'est-ce qui compte le plus pour votre maison aujourd'hui ? Si votre projet a changé, nous pouvons en reparler sans engagement.\n\nPour ne plus être recontacté, répondez simplement à ce message.\n\n${sign}`
          : `Bonjour,\n\nVos acquéreurs vous posent-ils des questions sur les travaux après leur achat ? Nous pourrions réfléchir à un relais local simple pour les orienter.\n\nJe serais heureux d'en discuter avec vous.\n\n${sign}`,
      };
  const headline = visual
    ? variant === "shorter"
      ? "Votre maison.\nVos priorités."
      : variant === "warmer"
        ? "On en parle,\nsimplement ?"
        : "D'abord,\ny voir clair."
    : current.headline;
  return {
    title: visual ? headline.replace(/\n/g, " ") : current.title,
    body: bodies[variant],
    headline,
    note: `Préparée avec Paul : ${variantLabel(variant)}`,
  };
}

function transition(current, event) {
  const next = structuredClone(current);
  const missionDefinitions = definitionsFor(current);
  const documentState = event.document ? next.documents[event.document] : null;
  if (event.document && !documentState) throw new Error("Contenu inconnu.");
  if (
    documentState &&
    event.expectedVersion &&
    event.expectedVersion !== currentVersion(documentState).number
  )
    throw new Error("Cette version a changé. Réexaminez le contenu avant de confirmer.");
  if (event.mission && !missionDefinitions[event.mission]) throw new Error("Mission inconnue.");
  const log = (text, actor = "vous") =>
    next.journal.unshift({ text, actor, date: new Date().toISOString() });
  const countPublications = (mission) =>
    next.publications.filter((item) => missionOfDocument(next, item.document) === mission).length;

  switch (event.type) {
    case "create-mission": {
      const base = missionDefinitions[event.template];
      if (!["agencies", "proof", "leads"].includes(event.template)) throw new Error("Choisissez un type de mission proposé.");
      const title = String(event.title || "").replace(/\s+/g, " ").trim();
      const target = String(event.target || "").replace(/\s+/g, " ").trim();
      const rationale = String(event.rationale || "").replace(/\s+/g, " ").trim();
      if (title.length < 5 || title.length > 80 || target.length < 5 || target.length > 120 || rationale.length < 10 || rationale.length > 300 || /[<>]/.test(title + target + rationale))
        throw new Error("Précisez le titre (5 à 80 caractères), le résultat (5 à 120) et le constat (10 à 300), sans balise HTML.");
      if (Object.keys(next.customMissions).length >= 10) throw new Error("La maquette accepte jusqu'à 10 missions personnalisées.");
      const id = `custom-${Object.keys(next.customMissions).length + 1}`;
      const documentId = `document-${id}`;
      next.customMissions[id] = { ...base, title, short: title, target, rationale, evidence: rationale, template: event.template, document: documentId, certainty: ["Proposée par vous", "amber"] };
      next.missions[id] = "proposed";
      next.scope[id] = structuredClone(next.scope[event.template]);
      const document = buildDocuments(next.profile, next.scope, next.brand)[base.document];
      document.mission = id;
      document.versions[0].note = "Premier brouillon à adapter à votre mission";
      next.documents[documentId] = document;
      if (event.ideaId) next.ideas = next.ideas.filter((idea) => idea.id !== event.ideaId);
      log(`Mission créée avec Paul : ${title}. Périmètre et brouillon à vérifier avant lancement.`);
      break;
    }
    case "begin":
      next.started = true;
      break;
    case "profile": {
      const before = current.profile;
      next.profile = { ...before, ...event.value };
      if ("offers" in event.value && event.value.offers !== before.offers) next.profile.offersRefined = true;
      const changed = Object.entries(event.value).some(([key, value]) => value !== before[key]);
      if (!changed) break;
      if (!current.onboarded) {
        next.documents = buildDocuments(next.profile, next.scope, next.brand);
        break;
      }
      Object.values(next.documents).forEach((item) => {
        const previous = currentVersion(item);
        let body = previous.body.replaceAll(before.name, next.profile.name);
        if (before.firstName && before.firstName.length > 1)
          body = body.replaceAll(before.firstName, next.profile.firstName);
        item.versions.push({
          ...previous,
          body,
          number: previous.number + 1,
          companyName: next.profile.name,
          by: "système",
          note: "Profil corrigé : informations du contenu à vérifier",
        });
        item.approved = null;
        item.scheduled = null;
        item.profileNeedsReview = true;
      });
      log("Profil corrigé. Les contenus doivent être relus et les programmations ont été annulées.");
      break;
    }
    case "goal": {
      validateGoal(event.value);
      next.goal = { ...next.goal, ...event.value };
      if (current.onboarded) log(`Cap mis à jour avec Paul : ${goalLabel(next.goal)}.`);
      break;
    }
    case "account": {
      const email = String(event.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Indiquez une adresse e-mail valide.");
      next.account.email = email;
      break;
    }
    case "signin": {
      const email = String(event.email || "").trim().toLowerCase();
      if (!current.onboarded || current.account.email !== email)
        throw new Error("Aucun compte avec cet e-mail dans ce navigateur. Créez-le avec « C'est parti ».");
      next.signedIn = true;
      break;
    }
    case "signout":
      next.signedIn = false;
      break;
    case "recharge": {
      if (!CREDIT_PACKS.includes(event.amount)) throw new Error("Pack de crédits inconnu.");
      next.account.credits += event.amount;
      next.account.ledger.unshift({ date: new Date().toISOString(), label: `Recharge de ${event.amount} crédits (simulation, aucun paiement)`, delta: event.amount });
      break;
    }
    case "diagnose":
      if (!next.started || next.step < 3 || !next.goal.statement.trim())
        throw new Error("Confirmez votre profil et votre ambition avant le diagnostic.");
      if (event.delegation !== undefined) {
        if (!["prepare", "review", "bounded"].includes(event.delegation))
          throw new Error("Choisissez un cadre de collaboration.");
        next.delegation = event.delegation;
      }
      next.diagnosticReady = true;
      next.step = 4;
      break;
    case "interest":
      if (!next.diagnosticReady || next.step !== 4)
        throw new Error("Consultez d'abord le résumé du diagnostic.");
      next.step = 5;
      break;
    case "onboard":
      if (!next.profile.firstName.trim()) throw new Error("Indiquez votre prénom pour que Paul puisse vous parler.");
      if (!next.profile.name.trim()) throw new Error("Indiquez le nom de votre entreprise.");
      if (!next.diagnosticReady || next.step !== 5)
        throw new Error("Consultez le diagnostic, puis confirmez « Ça m'intéresse » avant de créer votre compte.");
      if (!next.account.email) throw new Error("Indiquez votre e-mail : c'est votre identifiant de connexion.");
      if (next.onboarded) throw new Error("Votre compte existe déjà. Retrouvez-le avec la connexion.");
      next.onboarded = true;
      next.signedIn = true;
      log("Profil et ambition confirmés. Aucune mission lancée.");
      break;
    case "brand": {
      const visuals = Object.values(next.documents).filter((doc) => doc.channel === "facebook");
      if (visuals.some((doc) => doc.scheduled))
        throw new Error("Annulez la programmation avant de modifier la marque.");
      next.brand = { ...next.brand, ...event.value };
      visuals.forEach((doc) => {
        doc.versions.push({
          ...currentVersion(doc),
          number: currentVersion(doc).number + 1,
          color: next.brand.color,
          accent: next.brand.accent,
          tone: next.brand.tone,
          by: "système",
          note: "Kit de marque actualisé",
        });
        doc.approved = null;
      });
      log("Identité de marque confirmée. Le visuel doit être validé à nouveau.");
      break;
    }
    case "logo": {
      const visuals = Object.values(next.documents).filter((doc) => doc.channel === "facebook");
      if (visuals.some((doc) => doc.scheduled)) throw new Error("Annulez la programmation avant de modifier le logo.");
      if (event.logo && !/^data:image\/(png|jpeg|webp);base64,/.test(event.logo)) throw new Error("Le logo doit être un PNG, un JPG ou un WebP.");
      next.brand.logo = event.logo || null;
      visuals.forEach((doc) => {
        doc.versions.push({
          ...currentVersion(doc),
          number: currentVersion(doc).number + 1,
          logo: next.brand.logo,
          by: "vous",
          note: event.logo ? "Logo ajouté par vous" : "Logo retiré par vous",
        });
        doc.approved = null;
      });
      log(event.logo ? "Logo ajouté à votre marque. Le visuel doit être validé à nouveau." : "Logo retiré de votre marque. Le visuel doit être validé à nouveau.");
      break;
    }
    case "channel": {
      next.channels[event.channel] = event.connected;
      let cancelled = 0;
      if (!event.connected)
        Object.values(next.documents)
          .filter((item) => item.channel === event.channel && item.scheduled)
          .forEach((item) => {
            item.scheduled = null;
            cancelled += 1;
          });
      log(
        `${channelLabel(event.channel)} ${event.connected ? "connecté (simulation)" : `déconnecté${cancelled ? ` : ${cancelled} programmation${cancelled > 1 ? "s" : ""} annulée${cancelled > 1 ? "s" : ""}` : ""}`}.`,
      );
      break;
    }
    case "strategy":
      if (next.missions[event.priority] === "dismissed") throw new Error("Cette mission est écartée : remettez-la d'abord au plan.");
      next.priority = event.priority;
      next.preference = event.preference || next.preference;
      log(`Priorité confirmée avec Paul : ${missionDefinitions[event.priority].short}. Aucune mission lancée automatiquement.`);
      break;
    case "dismiss": {
      const id = event.mission;
      if (next.missions[id] === "active") throw new Error("Cette mission est en cours : mettez-la en pause ou arrêtez-la avant de l'écarter.");
      if (next.missions[id] === "stopped") throw new Error("Cette mission est arrêtée : elle reste dans l'historique.");
      if (next.missions[id] === "dismissed") break;
      next.missionEdits[id] = { ...next.missionEdits[id], previousStatus: next.missions[id] };
      next.missions[id] = "dismissed";
      next.documents[missionDefinitions[id].document].scheduled = null;
      if (next.priority === id) next.priority = Object.keys(next.missions).find((other) => next.missions[other] !== "dismissed") || id;
      log(`Mission écartée du plan : ${missionDefinitions[id].short}.`);
      break;
    }
    case "restore":
      if (next.missions[event.mission] !== "dismissed") throw new Error("Cette mission n'est pas écartée.");
      next.missions[event.mission] = next.missionEdits[event.mission]?.previousStatus === "paused" ? "paused" : "proposed";
      log(`Mission remise au plan : ${missionDefinitions[event.mission].short}.`);
      break;
    case "mission-edit": {
      const target = String(event.target || "").replace(/\s+/g, " ").trim();
      if (target.length < 5 || target.length > 120) throw new Error("Décrivez le résultat recherché en 5 à 120 caractères.");
      if (next.missions[event.mission] === "stopped") throw new Error("Cette mission est arrêtée : son objectif est figé.");
      next.missionEdits[event.mission] = { ...next.missionEdits[event.mission], target };
      log(`Objectif modifié · ${missionDefinitions[event.mission].short} : « ${target} ».`);
      break;
    }
    case "scope": {
      const id = event.mission;
      const template = templateOf(next, id);
      const lock = scopeLock(current, id);
      if (lock) throw new Error(lock);
      const unique = (list) => [...new Set(list)];
      if (template === "agencies") {
        const ids = unique(event.value.ids).filter((value) => AGENCIES.some((agency) => agency.id === value));
        if (ids.length < 1 || ids.length > AGENCIES_MAX) throw new Error(`Choisissez 1 ou ${AGENCIES_MAX} agences.`);
        next.scope[id].ids = ids;
      } else if (template === "leads") {
        const ids = unique(event.value.ids);
        const allowed = eligibleContacts(next).map((contact) => contact.id);
        if (ids.length < 1 || ids.length > LEADS_MAX || ids.some((value) => !allowed.includes(value)))
          throw new Error(`Choisissez de 1 à ${LEADS_MAX} contacts recontactables.`);
        next.scope[id].ids = ids;
        next.contactsConfirmed = false;
      } else {
        const project = PROJECTS.find((item) => item.id === event.value.project);
        if (!project) throw new Error("Réalisation inconnue.");
        const previous = PROJECTS.find((item) => item.id === current.scope[id].project);
        next.scope[id].project = project.id;
        const post = next.documents[missionDefinitions[id].document];
        const latest = currentVersion(post);
        const body = latest.body.replaceAll(previous.title, project.title);
        if (post.approved !== null || next.missions[id] === "active") {
          post.versions.push({ ...latest, body, number: latest.number + 1, by: "vous", note: `Réalisation changée : ${project.title}` });
          post.approved = null;
          post.rights = false;
        } else latest.body = body;
      }
      const documentState = next.documents[missionDefinitions[id].document];
      if (template !== "proof" && (next.missions[id] === "active" || documentState.approved !== null)) {
        const latest = currentVersion(documentState);
        documentState.versions.push({ ...latest, number: latest.number + 1, by: "vous", note: "Destinataires modifiés" });
        documentState.approved = null;
        documentState.rights = false;
      }
      log(`Périmètre modifié · ${missionDefinitions[id].short} : ${scopeSummary(next, id)}.${documentState.approved === null && current.documents[missionDefinitions[id].document].approved !== null ? " Validation à renouveler." : ""}`);
      break;
    }
    case "contacts": {
      const leadMissions = Object.keys(next.missions).filter((id) => templateOf(next, id) === "leads");
      const lock = leadMissions.map((id) => scopeLock(current, id)).find(Boolean);
      if (lock) throw new Error(lock);
      if (!Array.isArray(event.contacts) || !event.contacts.length) throw new Error("Aucun contact à importer.");
      next.contacts = event.contacts;
      next.contactsSource = "import";
      next.contactsConfirmed = false;
      leadMissions.forEach((id) => {
        next.scope[id].ids = eligibleContacts(next).slice(0, LEADS_MAX).map((contact) => contact.id);
        next.documents[missionDefinitions[id].document].approved = null;
      });
      log(`Fichier prospects importé (simulation) : ${next.contacts.length} contacts, ${eligibleContacts(next).length} recontactables après contrôle de l'ancienneté et du droit de recontact.`);
      break;
    }
    case "idea": {
      const text = String(event.text || "").trim().slice(0, 200);
      if (!text) throw new Error("Décrivez votre idée en une phrase.");
      if (next.ideas.length >= 10) throw new Error("10 idées au maximum : écartez-en une avant d'en noter une autre.");
      next.ideas.push({ id: `i${Date.now()}`, text, date: new Date().toISOString() });
      log(`Idée notée avec Paul : « ${text} ». À cadrer avant tout lancement.`);
      break;
    }
    case "outcome": {
      const id = event.mission;
      if (next.missions[id] !== "active") throw new Error("Seule une mission en cours peut être soldée.");
      const count = countPublications(id);
      if (!count) throw new Error("Faites d'abord une première diffusion : sans retour, il n'y a rien à juger.");
      if (event.outcome === "continue" && next.reports[id]?.atPublications !== count)
        throw new Error("Renseignez d'abord le bilan de cette mission : poursuivre sans chiffres n'a pas de sens.");
      next.decisions[id] = { outcome: event.outcome, date: new Date().toISOString(), atPublications: count };
      if (event.outcome === "stop") {
        next.missions[id] = "stopped";
        Object.values(next.documents)
          .filter((item) => item.mission === id)
          .forEach((item) => {
            item.scheduled = null;
          });
      }
      log(`Décision de fin de test · ${missionDefinitions[id].short} : ${event.outcome === "stop" ? "arrêt, programmations annulées" : "poursuite, mêmes limites"}.`);
      break;
    }
    case "report": {
      const id = event.mission;
      const count = countPublications(id);
      if (!count) throw new Error("Faites d'abord une première diffusion de cette mission : sans envoi, il n'y a rien à mesurer.");
      const leads = toCount(event.leads);
      const meetings = toCount(event.meetings);
      const revenue = toCount(event.revenue);
      if (leads === null || meetings === null)
        throw new Error("Renseignez les demandes qualifiées et les rendez-vous (0 s'il n'y en a aucun).");
      if (meetings > leads)
        throw new Error("Vous ne pouvez pas avoir plus de rendez-vous que de demandes qualifiées. Vérifiez vos chiffres.");
      next.reports[id] = {
        leads,
        meetings,
        revenue,
        note: String(event.note || "").trim().slice(0, 600),
        date: new Date().toISOString(),
        atPublications: count,
      };
      log(`Bilan déclaré · ${missionDefinitions[id].short} : ${leads} demande${leads > 1 ? "s" : ""}, ${meetings} rendez-vous${revenue === null ? "" : `, ${revenue} € signés`}. Attribution déclarative, non vérifiée.`);
      break;
    }
    case "start": {
      const id = event.mission;
      if (next.missions[id] === "stopped") throw new Error("Cette mission est arrêtée. Proposez un nouveau test à Paul.");
      if (next.missions[id] === "dismissed") throw new Error("Cette mission est écartée du plan : remettez-la d'abord au plan.");
      if (next.missions[id] === "active") return next;
      if (templateOf(next, id) === "leads") {
        if (event.confirmContacts) next.contactsConfirmed = true;
        if (!next.scope[id].ids.length) throw new Error("Choisissez d'abord au moins un contact recontactable.");
        if (!next.contactsConfirmed)
          throw new Error("Confirmez la pertinence et le droit de recontact des destinataires.");
      }
      if (next.missions[id] === "proposed") spendCredits(next, CREDIT_COST.start, `Lancement de la mission « ${missionDefinitions[id].short} »`);
      next.missions[id] = "active";
      log(`Mission lancée : ${missionDefinitions[id].short}. Paul confie la préparation à ${missionDefinitions[id].owner}.`);
      break;
    }
    case "pause":
      if (next.missions[event.mission] !== "active") throw new Error("Seule une mission en cours peut être mise en pause.");
      next.missions[event.mission] = "paused";
      Object.values(next.documents)
        .filter((item) => item.mission === event.mission)
        .forEach((item) => {
          item.scheduled = null;
        });
      log(`Mission suspendue : ${missionDefinitions[event.mission].short}. Programmations annulées.`);
      break;
    case "revision": {
      if (["stopped", "dismissed"].includes(next.missions[documentState.mission])) throw new Error("La mission est arrêtée ou écartée. Son contenu reste en lecture seule.");
      if (documentState.scheduled)
        throw new Error("Annulez la programmation avant de retravailler cette version.");
      const latest = currentVersion(documentState);
      if (isDiffused(next, event.document, latest.number) && !event.reopen)
        throw new Error(`V${latest.number} a été diffusée : elle est en lecture seule. Créez une nouvelle version pour la modifier.`);
      const by = event.by === "paul" ? "paul" : "vous";
      if (by === "paul") spendCredits(next, CREDIT_COST.paulRevision, `Version préparée par ${missionDefinitions[documentState.mission].owner} avec Paul`);
      const number = latest.number + 1;
      const defaultNote = event.reopen
        ? `Nouvelle version créée à partir de V${latest.number}, déjà diffusée`
        : by === "paul"
          ? "Préparée avec Paul"
          : "Retouche directe par vous";
      documentState.versions.push({ ...latest, ...event.value, number, by, note: event.value?.note || defaultNote });
      documentState.approved = null;
      documentState.rights = false;
      documentState.profileNeedsReview = false;
      if (by === "vous") documentState.counters.userEdits += 1;
      log(
        by === "paul"
          ? `V${number} préparée avec Paul (${missionDefinitions[documentState.mission].owner}). Validation à renouveler.`
          : event.reopen
            ? `V${number} créée à partir de V${latest.number} déjà diffusée. Validation à renouveler.`
            : `V${number} retouchée par vous. Validation à renouveler.`,
        by === "paul" ? "Paul" : "vous",
      );
      break;
    }
    case "approve": {
      const latest = currentVersion(documentState);
      if (next.missions[documentState.mission] !== "active")
        throw new Error("Lancez ou reprenez la mission avant de valider son contenu.");
      if (documentState.profileNeedsReview)
        throw new Error("Le profil a changé. Relisez le texte et enregistrez une nouvelle version avant validation.");
      if (documentState.channel !== "facebook" && !recipientsOf(next, event.document).length)
        throw new Error("Aucun destinataire dans le périmètre de cette mission.");
      if (templateOf(next, documentState.mission) === "leads" && !next.contactsConfirmed)
        throw new Error("Confirmez d'abord la pertinence et le droit de recontact des contacts.");
      if (documentState.channel === "facebook" && (!next.brand.confirmed || !event.rights))
        throw new Error("Confirmez la marque et les droits du visuel avant validation.");
      if (documentState.scheduled) throw new Error("Cette version est déjà programmée.");
      if (isDiffused(next, event.document, latest.number)) throw new Error("Cette version est déjà diffusée.");
      documentState.rights = Boolean(event.rights);
      documentState.approved = latest.number;
      documentState.counters.approvals += 1;
      log(`V${latest.number} validée : ${latest.title}. Aucun envoi effectué.`);
      break;
    }
    case "publish": {
      const latest = currentVersion(documentState);
      if (next.delegation === "prepare")
        throw new Error("Votre règle autorise uniquement la préparation. Diffusez vous-même ou modifiez les règles.");
      if (next.missions[documentState.mission] !== "active") throw new Error("La mission doit être active.");
      if (!next.channels[documentState.channel]) throw new Error("Connectez le canal de destination avant de poursuivre.");
      if (documentState.approved !== latest.number) throw new Error("Validez la version courante avant de poursuivre.");
      if (documentState.scheduled) throw new Error("Une programmation existe déjà pour cette version.");
      if (isDiffused(next, event.document, documentState.approved))
        throw new Error("Cette version a déjà été diffusée dans la simulation.");
      const recipients = recipientsOf(next, event.document);
      if (documentState.channel !== "facebook" && !recipients.length) throw new Error("Aucun destinataire dans le périmètre.");
      if (event.date) {
        if (!Number.isFinite(Date.parse(event.date)) || Date.parse(event.date) <= Date.now())
          throw new Error("Choisissez une date et une heure futures.");
        documentState.scheduled = new Date(event.date).toISOString();
        documentState.scheduledTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        log(`V${documentState.approved} programmée sur ${channelLabel(documentState.channel)}. Simulation uniquement.`);
      } else {
        next.publications.unshift({
          document: event.document,
          version: documentState.approved,
          date: new Date().toISOString(),
          channel: documentState.channel,
          title: latest.title,
          recipients: recipients.length,
        });
        log(`V${documentState.approved} : ${documentState.channel === "gmail" ? "envoi simulé" : "publication simulée"} sur ${channelLabel(documentState.channel)}${recipients.length ? ` · ${recipients.length} destinataire${recipients.length > 1 ? "s" : ""}` : ""}. Version désormais en lecture seule.`);
      }
      break;
    }
    case "cancel-schedule":
      documentState.scheduled = null;
      log("Programmation annulée. La version reste validée.");
      break;
    default:
      throw new Error("Action inconnue.");
  }
  return next;
}
