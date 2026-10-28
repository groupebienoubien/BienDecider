"use strict";

const STORAGE_KEY = "biendecider-maquette-v3";
const SEED_VERSION = 1;
const missionDefinitions = {
  agencies: {
    title: "Ouvrir la porte des agences locales",
    short: "Partenariats agences",
    target: "1 rendez-vous qualifié en 30 jours",
    owner: "Jean-Claude",
    image: "agences.webp",
    document: "email",
    evidence: "6 agences repérées dans votre zone",
    rationale:
      "Deux créneaux disponibles, un réseau de prescripteurs à construire. Un test limité à 2 agences, sans budget média.",
    risk: "Premier contact commercial : votre accord reste obligatoire.",
    cost: 24,
  },
  proof: {
    title: "Faire parler vos réalisations",
    short: "Preuves & réalisations",
    target: "Publier 1 cas chantier, puis mesurer les demandes",
    owner: "Camille",
    image: "reputation.webp",
    document: "post",
    evidence: "4 réalisations visibles sur 18 déclarées",
    rationale:
      "Votre savoir-faire est peu visible. Une réalisation documentée peut rassurer les prospects et soutenir les partenariats.",
    risk: "Photo et témoignage : droits à confirmer avant publication.",
    cost: 16,
  },
  leads: {
    title: "Renouer avec les bons prospects",
    short: "Réactivation prospects",
    target: "Tester 8 contacts, viser 2 échanges qualifiés",
    owner: "Jean-Claude",
    image: "prospects.webp",
    document: "followup",
    evidence: "27 anciens contacts déclarés, fichier non vérifié",
    rationale:
      "Repartir de relations existantes avant d'acheter du trafic. La pertinence et le droit de recontact sont à vérifier.",
    risk: "Aucun envoi avant vérification de la liste et de la base légale.",
    cost: 20,
  },
};

function initialState() {
  const seed = {
    schema: SEED_VERSION,
    onboarded: false,
    step: 1,
    profile: {
      name: "Dupont Rénovation",
      url: "https://dupont-renovation.example",
      activity: "Rénovation énergétique",
      area: "Aix-en-Provence · 30 km",
      clients: "Particuliers et syndics",
      offers: "Isolation et pompes à chaleur",
    },
    goal: {
      growth: 20,
      months: 12,
      budget: 200,
      time: 2,
      capacity: 2,
      hiring: false,
    },
    brand: {
      color: "#24564b",
      accent: "#e4bc61",
      tone: "Clair, concret, rassurant",
      confirmed: false,
    },
    channels: { facebook: false, gmail: false, site: false },
    delegation: "review",
    priority: "agencies",
    missions: { agencies: "proposed", proof: "proposed", leads: "proposed" },
    contactsConfirmed: false,
    documents: {
      email: {
        mission: "agencies",
        channel: "gmail",
        approved: null,
        scheduled: null,
        rights: false,
        versions: [
          {
            number: 1,
            title: "Un partenaire rénovation pour vos acquéreurs",
            body: "Bonjour,\n\nJe dirige Dupont Rénovation, à Aix-en-Provence. Nous accompagnons les particuliers dans leurs projets d'isolation et de pompe à chaleur.\n\nJe vous propose un premier échange pour voir comment nous pourrions accompagner vos acquéreurs après leur achat. Seriez-vous disponible pour en parler la semaine prochaine ?\n\nBien à vous,\nRémi · Dupont Rénovation",
            headline: "Un projet bien accompagné.",
            note: "Première proposition de Camille, coordonnée par Paul",
          },
        ],
      },
      post: {
        mission: "proof",
        channel: "facebook",
        approved: null,
        scheduled: null,
        rights: false,
        versions: [
          {
            number: 1,
            title: "Du confort, pour longtemps.",
            body: "Un projet de rénovation commence par une maison que l'on connaît et des priorités bien définies.\n\nÀ Aix-en-Provence et dans les environs, nous vous accompagnons pour choisir les travaux adaptés à votre logement. Parlons de votre projet.\n\nDupont Rénovation · Isolation & pompes à chaleur",
            headline: "Du confort,\npour longtemps.",
            note: "Première proposition de Camille, issue du brief de marque",
          },
        ],
      },
      followup: {
        mission: "leads",
        channel: "gmail",
        approved: null,
        scheduled: null,
        rights: false,
        versions: [
          {
            number: 1,
            title: "Où en est votre projet de rénovation ?",
            body: "Bonjour,\n\nVous nous aviez contactés pour un projet de rénovation. Est-il toujours d'actualité ? Je suis disponible pour faire le point sur vos priorités.\n\nSi vous ne souhaitez plus être recontacté, un simple retour suffit.\n\nRémi · Dupont Rénovation",
            headline: "Reprenons votre projet.",
            note: "Brouillon à adapter après qualification des contacts",
          },
        ],
      },
    },
    publications: [],
    journal: [],
    messages: [],
    preference: "balanced",
  };
  Object.values(seed.documents).forEach((item) => {
    Object.assign(item.versions[0], {
      companyName: seed.profile.name,
      color: seed.brand.color,
      accent: seed.brand.accent,
      tone: seed.brand.tone,
    });
  });
  return seed;
}

function currentVersion(documentState) {
  return documentState.versions[documentState.versions.length - 1];
}

function transition(current, event) {
  const next = structuredClone(current);
  const documentState = event.document ? next.documents[event.document] : null;
  if (
    documentState &&
    event.expectedVersion &&
    event.expectedVersion !== currentVersion(documentState).number
  )
    throw new Error(
      "Cette version a changé. Réexaminez la production avant de confirmer.",
    );
  const log = (text) =>
    next.journal.unshift({ text, date: new Date().toISOString() });
  switch (event.type) {
    case "profile":
      next.profile = { ...next.profile, ...event.value };
      if (
        Object.entries(event.value).some(
          ([key, value]) => value !== current.profile[key],
        )
      ) {
        Object.values(next.documents).forEach((item) => {
          const previous = currentVersion(item);
          const updated = {
            ...previous,
            companyName: next.profile.name,
            body: previous.body.replaceAll(
              current.profile.name,
              next.profile.name,
            ),
            note: "Profil corrigé, informations de la production à vérifier",
          };
          if (current.onboarded)
            item.versions.push({ ...updated, number: previous.number + 1 });
          else item.versions[item.versions.length - 1] = updated;
          item.approved = null;
          item.scheduled = null;
          item.profileNeedsReview = current.onboarded;
        });
        if (current.onboarded)
          log(
            "Profil corrigé. Les productions doivent être revues et les programmations ont été annulées.",
          );
      }
      break;
    case "goal":
      next.goal = { ...next.goal, ...event.value };
      break;
    case "onboard":
      next.onboarded = true;
      log(
        "Profil, ambition et règles de collaboration confirmés. Aucune mission lancée.",
      );
      break;
    case "brand":
      next.brand = { ...next.brand, ...event.value };
      if (next.documents.post.scheduled)
        throw new Error(
          "Annulez la programmation avant de modifier la marque.",
        );
      next.documents.post.versions.push({
        ...currentVersion(next.documents.post),
        number: currentVersion(next.documents.post).number + 1,
        color: next.brand.color,
        accent: next.brand.accent,
        tone: next.brand.tone,
        note: "Kit de marque actualisé",
      });
      next.documents.post.approved = null;
      log(
        "Identité de marque confirmée. Le visuel doit être validé à nouveau.",
      );
      break;
    case "channel":
      next.channels[event.channel] = event.connected;
      if (!event.connected) {
        Object.values(next.documents)
          .filter((item) => item.channel === event.channel)
          .forEach((item) => {
            item.scheduled = null;
          });
      }
      log(
        `${channelLabel(event.channel)} ${event.connected ? "connecté dans la simulation" : "déconnecté ; programmations annulées"}.`,
      );
      break;
    case "strategy":
      next.priority = event.priority;
      next.preference = event.preference || next.preference;
      log(
        `Priorité confirmée avec Paul : ${missionDefinitions[event.priority].short}. Aucune mission lancée automatiquement.`,
      );
      break;
    case "start":
      if (event.mission === "leads" && !next.contactsConfirmed)
        throw new Error(
          "Confirmez la pertinence et le droit de recontact des 8 destinataires.",
        );
      if (next.missions[event.mission] === "active") return next;
      next.missions[event.mission] = "active";
      log(
        `Mission lancée : ${missionDefinitions[event.mission].short}. Paul confie la préparation à ${missionDefinitions[event.mission].owner}.`,
      );
      break;
    case "pause":
      next.missions[event.mission] = "paused";
      Object.values(next.documents)
        .filter((item) => item.mission === event.mission)
        .forEach((item) => {
          item.scheduled = null;
        });
      log(
        `Mission suspendue : ${missionDefinitions[event.mission].short}. Programmations annulées.`,
      );
      break;
    case "revision":
      if (documentState.scheduled)
        throw new Error(
          "Annulez la programmation avant de retravailler cette version.",
        );
      documentState.versions.push({
        ...currentVersion(documentState),
        ...event.value,
        number: currentVersion(documentState).number + 1,
      });
      documentState.approved = null;
      documentState.rights = false;
      documentState.profileNeedsReview = false;
      log(
        `Nouvelle version V${currentVersion(documentState).number} préparée avec Paul. Validation à renouveler.`,
      );
      break;
    case "approve":
      if (next.missions[documentState.mission] !== "active")
        throw new Error(
          "Lancez ou reprenez la mission avant de valider sa production.",
        );
      if (documentState.profileNeedsReview)
        throw new Error(
          "Le profil a changé. Relisez le texte et enregistrez une nouvelle version avant validation.",
        );
      if (event.document === "post" && (!next.brand.confirmed || !event.rights))
        throw new Error(
          "Confirmez la marque et les droits du visuel avant validation.",
        );
      if (documentState.scheduled)
        throw new Error("Cette version est déjà programmée.");
      documentState.rights = Boolean(event.rights);
      documentState.approved = currentVersion(documentState).number;
      log(
        `V${documentState.approved} validée : ${currentVersion(documentState).title}. Aucun envoi effectué.`,
      );
      break;
    case "publish":
      if (next.delegation === "prepare")
        throw new Error(
          "Votre règle autorise uniquement la préparation. Diffusez vous-même ou modifiez les règles.",
        );
      if (next.missions[documentState.mission] !== "active")
        throw new Error("La mission doit être active.");
      if (!next.channels[documentState.channel])
        throw new Error(
          "Connectez le canal de destination avant de poursuivre.",
        );
      if (documentState.approved !== currentVersion(documentState).number)
        throw new Error("Validez la version courante avant de poursuivre.");
      if (documentState.scheduled)
        throw new Error("Une programmation existe déjà pour cette version.");
      if (
        next.publications.some(
          (item) =>
            item.document === event.document &&
            item.version === documentState.approved,
        )
      )
        throw new Error(
          "Cette version a déjà été exécutée dans la simulation.",
        );
      if (event.date) {
        if (
          !Number.isFinite(Date.parse(event.date)) ||
          Date.parse(event.date) <= Date.now()
        )
          throw new Error("Choisissez une date et une heure futures.");
        documentState.scheduled = new Date(event.date).toISOString();
        documentState.scheduledTimezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone;
        log(
          `V${documentState.approved} programmée sur ${channelLabel(documentState.channel)}. Simulation uniquement.`,
        );
      } else {
        next.publications.unshift({
          document: event.document,
          version: documentState.approved,
          date: new Date().toISOString(),
          channel: documentState.channel,
          title: currentVersion(documentState).title,
        });
        log(
          `V${documentState.approved} : ${documentState.channel === "gmail" ? "envoi simulé" : "publication simulée"} sur ${channelLabel(documentState.channel)}.`,
        );
      }
      break;
    case "cancel-schedule":
      documentState.scheduled = null;
      log("Programmation annulée. La version reste validée.");
      break;
    default:
      throw new Error("Action inconnue.");
  }
  return next;
}

function channelLabel(channel) {
  return (
    { facebook: "Facebook", gmail: "Gmail", site: "Site web" }[channel] ||
    channel
  );
}

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const icon = (name) =>
  `<i data-lucide="${name}" class="icon" aria-hidden="true"></i>`;
const badge = (text, tone = "", symbol = "") =>
  `<span class="badge ${tone}">${symbol ? icon(symbol) : ""}${escapeHTML(text)}</span>`;
const button = (action, text, tone = "", symbol = "", extra = "") =>
  `<button type="button" class="btn ${tone}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ""}${text}</button>`;
const navButton = (route, text, tone = "", symbol = "") =>
  button("navigate", text, tone, symbol, `data-route="${route}"`);
const paulButton = (context, text = "En discuter avec Paul", tone = "") =>
  button(
    "paul",
    text,
    tone,
    "message-circle",
    `data-context="${escapeHTML(context)}"`,
  );
const brandLogo = () =>
  `<div class="company-logo">${icon("house")}<span>${escapeHTML(state.profile.name)}</span></div>`;
const wordmark = () =>
  `<a href="#/paul" class="wordmark" aria-label="BienDecider, accueil"><span class="mark">${icon("compass")}</span><span>Bien<em>Decider</em></span></a>`;
const formatDate = (date) =>
  new Date(date).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const statusText = (status) =>
  ({ proposed: "À décider", active: "En cours", paused: "En pause" })[status];
const delegationText = () =>
  ({
    prepare: "Préparation seule",
    review: "Validation avant action",
    bounded: "Autonomie encadrée",
  })[state.delegation];
let state;
const ui = {
  view: "paul",
  tab: "audit",
  mission: "agencies",
  document: "post",
  filter: "all",
  scan: "idle",
  selectedVersion: null,
  studioTab: "edit",
  preview: "social",
  context: "Votre stratégie",
  proposal: null,
  toastTimer: null,
  editorDrafts: {},
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast(
      "Stockage local indisponible : vos changements restent dans cette session.",
    );
  }
}

function commit(event) {
  state = transition(state, event);
  save();
  render();
}

function hydrateIcons() {
  if (globalThis.lucide)
    globalThis.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function toast(text) {
  const element = document.querySelector("#toast");
  element.textContent = text;
  element.classList.add("visible");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => element.classList.remove("visible"), 4500);
}

function goalText() {
  return `+${state.goal.growth} % de chiffre d'affaires en ${state.goal.months} mois`;
}

function profileFields() {
  const fields = [
    ["name", "Entreprise"],
    ["activity", "Activité"],
    ["area", "Zone d'intervention"],
    ["clients", "Clients prioritaires"],
    ["offers", "Offres principales"],
  ];
  return fields
    .map(
      ([key, title]) =>
        `<label class="field ${key === "name" ? "full" : ""}"><span>${title}</span><input name="${key}" value="${escapeHTML(state.profile[key])}" required maxlength="100"><small>${key === "clients" ? "Hypothèse à confirmer" : state.profile.url ? "Prérempli depuis le relevé d'exemple" : "À renseigner par vous"}</small></label>`,
    )
    .join("");
}

function goalFields() {
  return `<div class="form-grid"><label class="field"><span>Croissance du CA visée (%)</span><input name="growth" type="number" min="1" max="200" required value="${state.goal.growth}"></label><label class="field"><span>Horizon (mois)</span><input name="months" type="number" min="1" max="36" required value="${state.goal.months}"></label><label class="field"><span>Budget média maximum (€/mois)</span><input name="budget" type="number" min="0" max="100000" required value="${state.goal.budget}"></label><label class="field"><span>Votre temps disponible (h/semaine)</span><input name="time" type="number" min="1" max="40" required value="${state.goal.time}"></label><label class="field"><span>Chantiers supplémentaires possibles</span><input name="capacity" type="number" min="1" max="100" required value="${state.goal.capacity}"><small>Sur les 30 prochains jours</small></label><label class="check" style="align-self:center"><input type="checkbox" name="noHiring" ${!state.goal.hiring ? "checked" : ""}>Sans recrutement</label></div>`;
}

function delegationChoices() {
  return `<div class="stack-sm">${[
    [
      "prepare",
      "Préparer seulement",
      "Paul analyse et prépare. Vous récupérez les contenus et publiez vous-même.",
    ],
    [
      "review",
      "Valider avant chaque action",
      "Paul prépare, vous validez la version, puis confirmez chaque envoi ou publication.",
    ],
    [
      "bounded",
      "Déléguer dans un cadre précis",
      "Analyses et brouillons autonomes dans les missions actives. Publications, premiers contacts et dépenses restent à confirmer.",
    ],
  ]
    .map(
      ([value, title, description]) =>
        `<label class="choice"><input type="radio" name="delegation" value="${value}" ${state.delegation === value ? "checked" : ""}><div><strong>${title}</strong><p>${description}</p>${value === "review" ? badge("Conseillé pour démarrer", "blue") : ""}</div></label>`,
    )
    .join("")}</div>`;
}

function sourcePreview() {
  return `<section class="source-preview"><div class="browser-chrome">${icon("globe")}<span>${state.profile.url ? escapeHTML(state.profile.url.replace(/^https?:\/\//, "")) : "Aucun site renseigné"} · aperçu d'exemple</span></div><img src="chantier.jpg" alt="Maison contemporaine, photographie illustrative"><div class="source-inner" style="--brand:${state.brand.color}">${brandLogo()}<h3>Bien chez vous.<br>Durablement.</h3><div class="palette"><span class="swatch"><i style="background:${state.brand.color}"></i>Vert profond</span><span class="swatch"><i style="background:${state.brand.accent}"></i>Ocre</span></div><p class="muted small" style="margin-top:14px">${state.profile.url ? "Palette proposée à partir du site. Logo recomposé, à confirmer." : "Identité proposée, non issue d'un site."}</p></div></section>`;
}

function onboarding() {
  const steps = [
    ["Découverte", "Votre point de départ"],
    ["Compréhension", "Ce qui vous ressemble"],
    ["Ambition", "Votre cap et vos limites"],
    ["Collaboration", "Vous gardez la main"],
  ];
  let content = "";
  if (state.step === 1)
    content = `<div class="onboard-title"><span class="eyebrow">FAISONS CONNAISSANCE</span><h1>Votre entreprise.<br>Notre point de départ.</h1><p>Commençons par ce qui existe déjà.</p></div><div class="brief"><span class="avatar paul">P</span><p><strong>Bonjour, je suis Paul.</strong> Donnez-moi le nom de votre entreprise et son site. Je vous proposerai une première lecture, à corriger ensemble.</p></div><form data-form="discover" class="stack"><label class="field"><span>Nom de l'entreprise</span><input name="name" required maxlength="100" autocomplete="organization" value="${escapeHTML(state.profile.name)}"></label><label class="field"><span>Site internet <span class="muted">· facultatif</span></span><input name="url" type="url" placeholder="https://votre-entreprise.fr" value="${escapeHTML(state.profile.url)}"><small>Aucun mot de passe ni accès privé nécessaire.</small></label><div class="form-error" role="alert"></div>${ui.scan === "idle" ? `<div class="actions"><button class="btn primary" type="submit">${icon("scan-line")}Découvrir mon entreprise</button>${button("no-site", "Je n'ai pas de site", "text")}</div>` : `<div class="analysis" aria-live="polite">${["Site et offres", "Informations publiques", "Zone et clients", "Identité visuelle"].map((label, index) => `<div class="row">${icon(ui.scan === "running" && index > 1 ? "loader-circle" : "circle-check")}<span>${label}</span>${index === 0 && !state.profile.url ? badge("Non disponible", "amber") : badge(ui.scan === "running" && index > 1 ? "En cours" : "Relevé d'exemple", "green")}</div>`).join("")}</div>${ui.scan === "ready" ? button("step", "Vérifier ce que Paul a compris", "primary", "arrow-right", 'data-step="2"') : '<p class="muted small">Préparation de votre aperçu…</p>'}`}</form><div class="trust-note">${icon("shield-check")}Aucun compte connecté. Aucune action extérieure.</div><div class="onboard-bottom"><small>Données illustratives, aucune analyse web réelle.</small>${button("demo", "Explorer l'espace de démonstration", "text", "arrow-up-right")}</div>`;
  if (state.step === 2)
    content = `<div class="onboard-title"><span class="eyebrow">UN PORTRAIT À VALIDER ENSEMBLE</span><h1>Est-ce bien vous ?</h1><p>Une première lecture n'est pas une certitude. Corrigez ce qui doit l'être avant d'aller plus loin.</p></div><div class="equal-col"><form data-form="understand" class="stack"><div class="form-grid">${profileFields()}</div><div class="notice amber">${icon("circle-help")}<p>5 concurrents potentiels repérés dans l'exemple. Leur pertinence reste à confirmer dans l'audit.</p></div><label class="check"><input type="checkbox" name="brandConfirmed" ${state.brand.confirmed ? "checked" : ""}>Cette palette correspond à mon entreprise.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">Confirmer ces informations ${icon("arrow-right")}</button></form><aside class="stack">${sourcePreview()}<p class="muted small">La marque reste modifiable dans Entreprise. Aucun témoignage, label ou résultat commercial n'est déduit automatiquement.</p></aside></div>`;
  if (state.step === 3)
    content = `<div class="onboard-title"><span class="eyebrow">DE L'ENVIE À UN CAP CONCRET</span><h1>Qu'aimeriez-vous changer ?</h1><p>Un objectif utile tient aussi compte de votre temps et de votre capacité.</p></div><form data-form="ambition" class="stack"><label class="field"><span>Votre ambition, avec vos mots</span><textarea name="statement" maxlength="600" rows="2">${escapeHTML(state.goal.statement || "Je voudrais augmenter mon chiffre d'affaires de 20 % cette année, sans embaucher.")}</textarea></label>${goalFields()}<div class="goal-summary"><span class="eyebrow">LE CAP PROPOSÉ</span><strong id="goal-live">${goalText()}</strong><p>Le point de départ et la marge seront à préciser. C'est une cible, pas une promesse de résultat.</p></div><div class="actions"><button class="btn primary" type="submit">Confirmer mon ambition ${icon("arrow-right")}</button>${paulButton("Votre ambition", "En discuter")}</div></form>`;
  if (state.step === 4)
    content = `<div class="onboard-title"><span class="eyebrow">UNE COLLABORATION CLAIRE</span><h1>À vous de fixer le cadre.</h1><p>Je coordonne l'équipe. Vous gardez la maîtrise de ce qui engage votre entreprise.</p></div><form data-form="finish" class="stack">${delegationChoices()}<div class="notice green">${icon("shield-check")}<p>Aucun canal n'est connecté pour le moment. La création de votre espace ne lance aucune mission.</p></div><div class="row"><div><strong>${escapeHTML(state.profile.name)}</strong><p>${goalText()} · ${state.goal.time} h/semaine · ${state.goal.budget} € média max.</p></div>${button("step", "Modifier", "small", "pencil", 'data-step="3"')}</div><button class="btn primary" type="submit">Créer mon espace ${icon("arrow-right")}</button></form>`;
  return `<div class="onboarding"><aside class="onboard-side">${wordmark()}<h2>Faisons avancer<br>votre entreprise.</h2><p>Un cap clair. Des actions utiles.<br>Paul à vos côtés.</p><ol class="steps">${steps.map(([title, detail], index) => `<li class="${state.step === index + 1 ? "active" : state.step > index + 1 ? "done" : ""}" ${state.step === index + 1 ? 'aria-current="step"' : ""}><span>${state.step > index + 1 ? icon("check") : index + 1}</span><div><strong>${title}</strong><small>${detail}</small></div></li>`).join("")}</ol><footer>Maquette V3 · Données d'exemple<br>Vos choix restent dans ce navigateur.</footer></aside><main id="main" class="onboard-main" tabindex="-1"><div class="onboard-top">${state.step > 1 ? button("step", "Retour", "text", "arrow-left", `data-step="${state.step - 1}"`) : '<span class="badge blue">Votre première rencontre avec Paul</span>'}<span class="small muted">${state.step} sur 4</span></div><div class="onboard-content ${state.step !== 2 ? "narrow" : ""}">${content}</div></main></div>`;
}

function shell(content) {
  const pages = [
    ["paul", "Avec Paul", "messages-square"],
    ["missions", "Missions", "flag"],
    ["studio", "Studio", "panels-top-left"],
    ["entreprise", "Entreprise", "building-2"],
    ["resultats", "Résultats", "chart-no-axes-combined"],
  ];
  const active = pages.find(([key]) => key === ui.view) || pages[0];
  return `<div class="mobile-nav-overlay" data-action="menu-close"></div><aside class="sidebar" aria-label="Navigation principale">${wordmark()}<div class="workspace-switch"><span class="avatar company">DR</span><div><strong>${escapeHTML(state.profile.name)}</strong><small>Espace dirigeant</small></div></div><nav>${pages.map(([key, title, symbol]) => `<button class="nav-item ${key === ui.view ? "active" : ""}" data-action="navigate" data-route="${key}" ${key === ui.view ? 'aria-current="page"' : ""}>${icon(symbol)}${title}${key === "missions" ? `<span class="count">${Object.values(state.missions).filter((value) => value === "active").length}</span>` : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="goal-mini"><span class="eyebrow">VOTRE CAP</span><strong>+${state.goal.growth} % de CA</strong><small class="muted">${state.goal.months} mois · ${state.goal.hiring ? "Recrutement possible" : "Sans recruter"}</small><div class="goal-line"><span></span></div><small class="muted">Mesure à établir avec vous</small></div><button class="nav-item" data-action="settings">${icon("settings-2")}Mon espace</button><div class="inline" style="margin-top:15px"><span class="avatar">R</span><div><strong class="small">Rémi</strong><div class="muted small">Dirigeant</div></div></div><p class="demo-label">Maquette V3 · Données d'exemple</p></div></aside><div class="app-main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Ouvrir le menu">${icon("menu")}</button><div class="breadcrumb"><span>Votre espace</span>${icon("chevron-right")}<strong>${active[1]}</strong></div><div class="actions"><span class="small muted date">Mercredi 28 octobre 2026</span><span class="badge demo-top">Démonstration</span>${paulButton(pageContext(), "Parler à Paul", "primary")}</div></header><main id="main" class="page" tabindex="-1">${content}<footer class="page-footer"><span>Maquette interactive · Données et exécutions simulées · Aucun envoi réel</span><span>Vos choix sont enregistrés sur cet appareil.</span></footer></main></div>`;
}

function pageHead(title, description, eyebrow = "", action = "") {
  return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1><p>${description}</p></div>${action ? `<div class="actions">${action}</div>` : ""}</div>`;
}

function missionCard(id) {
  const mission = missionDefinitions[id];
  return `<article class="mission-card"><img src="${mission.image}" alt="${escapeHTML(mission.short)}, illustration" loading="lazy"><div class="mission-card-body"><div class="spread">${badge(statusText(state.missions[id]), state.missions[id] === "active" ? "green" : "amber")}${state.priority === id ? badge("Priorité de Paul", "blue") : ""}</div><h2>${mission.title}</h2><p>${mission.evidence}</p><div class="target">${icon("target")} ${mission.target}</div><div class="inline"><span class="avatar ${id === "proof" ? "camille" : "jean"}">${mission.owner[0]}</span><span class="small muted">Paul coordonne ${mission.owner}</span></div><div class="actions">${navButton(`missions/${id}`, "Voir la mission", state.priority === id ? "primary" : "", "arrow-up-right")}</div></div></article>`;
}

function paulPage() {
  const priority = missionDefinitions[state.priority];
  const pending = Object.values(state.documents).filter(
    (item) =>
      state.missions[item.mission] === "active" &&
      item.approved !== currentVersion(item).number,
  );
  const priorityDocument = state.documents[priority.document];
  return `${pageHead("Bonjour Rémi.", "Votre cap reste le même. Choisissons le prochain pas qui compte.", "VOTRE POINT AVEC PAUL", navButton("entreprise/audit", "Voir mon diagnostic", "", "scan-eye"))}<div class="brief"><span class="avatar paul large">P</span><p>${state.journal.length > 1 ? "Nous avançons avec un cadre clair." : "J'ai croisé votre ambition avec les premiers constats."} Avec <strong>${state.goal.capacity} chantiers possibles</strong> et <strong>${state.goal.time} h par semaine</strong>, je recommande un test ciblé avant d'élargir. ${state.preference === "time" ? "Vous avez choisi de privilégier le temps gagné." : "Les résultats nous diront ce qu'il faut poursuivre."}</p></div><div class="metrics"><div class="metric"><span>Votre ambition</span><strong>+${state.goal.growth} %</strong><span>de CA sur ${state.goal.months} mois</span></div><div class="metric"><span>Missions en cours</span><strong>${Object.values(state.missions).filter((value) => value === "active").length}<span> / 3 proposées</span></strong><span>un périmètre, un résultat attendu</span></div><div class="metric"><span>Votre attention</span><strong>${pending.length}</strong><span>production${pending.length > 1 ? "s" : ""} à examiner</span></div></div><div class="two-col"><section><div class="section-heading"><h2>Le prochain pas</h2>${badge("Recommandation", "blue", "sparkles")}</div><article class="focus-mission"><div class="focus-content"><span class="eyebrow">${escapeHTML(priority.evidence)}</span><h2>${priority.title}</h2><p>${priority.rationale}</p><div class="evidence-list">${badge("Sans achat média", "green")}${badge("Test de 30 jours")}</div><div class="actions">${navButton(`missions/${state.priority}`, state.missions[state.priority] === "active" ? "Ouvrir la mission" : "Examiner cette mission", "primary", "arrow-right")}${paulButton("Challenger la priorité", "Challenger avec Paul", "text")}</div></div><img src="${priority.image}" alt="${escapeHTML(priority.short)}, illustration"></article></section><aside><div class="section-heading"><h2>À décider avec vous</h2></div><div class="decision">${icon("flag")}<div><strong class="small">${state.missions[state.priority] === "active" ? "Votre production est prête" : "Une mission à confirmer"}</strong><p>${state.missions[state.priority] === "active" ? `V${currentVersion(priorityDocument).number} · ${priorityDocument.approved ? "Validée, pas nécessairement exécutée" : "Votre regard avant toute action"}` : "Périmètre, résultat attendu et limites."}</p>${navButton(state.missions[state.priority] === "active" ? `studio/${priority.document}` : `missions/${state.priority}`, "Examiner", "text", "arrow-up-right")}</div></div>${!state.brand.confirmed ? `<div class="decision">${icon("palette")}<div><strong class="small">Votre identité visuelle</strong><p>La palette détectée vous ressemble-t-elle ?</p>${navButton("entreprise/marque", "Confirmer ma marque", "text", "arrow-up-right")}</div></div>` : ""}<div class="decision">${icon("plug")}<div><strong class="small">${Object.values(state.channels).filter(Boolean).length} canal connecté</strong><p>Les autorisations sont distinctes des validations de contenu.</p>${navButton("entreprise/canaux", "Gérer les connexions", "text", "arrow-up-right")}</div></div></aside></div><section class="section-space"><div class="section-heading"><div><h2>Et si on prenait un autre chemin ?</h2><p>Ces pistes restent des propositions. Rien ne se lance sans votre décision.</p></div></div><div class="equal-col">${Object.entries(
    missionDefinitions,
  )
    .filter(([id]) => id !== state.priority)
    .map(
      ([id, mission]) =>
        `<article class="panel"><div class="spread"><span class="eyebrow">${id === "proof" ? "CONFIANCE" : id === "leads" ? "RELATION CLIENT" : "ACQUISITION LOCALE"}</span>${icon("arrow-up-right")}</div><h3 style="margin:10px 0">${mission.title}</h3><p class="muted small">${mission.evidence}</p><div class="actions" style="margin-top:16px">${paulButton(`Priorité ${id}`, "Comparer avec Paul", "small")}${navButton(`missions/${id}`, "Voir le détail", "text")}</div></article>`,
    )
    .join(
      "",
    )}</div></section><section class="section-space"><div class="section-heading"><h2>En coulisses, une équipe. Avec vous, Paul.</h2>${navButton("entreprise/equipe", "Voir les contributions", "text", "arrow-right")}</div><div class="three-col"><div class="inline"><span class="avatar martine">M</span><div><strong class="small">Martine · Diagnostic</strong><p class="muted small">Constats, sources et points à vérifier</p></div></div><div class="inline"><span class="avatar camille">C</span><div><strong class="small">Camille · Création</strong><p class="muted small">Marque, contenus et réalisations</p></div></div><div class="inline"><span class="avatar jean">J</span><div><strong class="small">Jean-Claude · Acquisition</strong><p class="muted small">Ciblage, partenariats et suivi</p></div></div></div></section>`;
}

function missionsPage() {
  if (ui.mission && location.hash.split("/")[2]) return missionDetail();
  const ids = [
    state.priority,
    ...Object.keys(missionDefinitions).filter((id) => id !== state.priority),
  ].filter((id) => ui.filter === "all" || state.missions[id] === ui.filter);
  return `${pageHead("Des missions, pas une liste de tâches.", "Chaque mission relie un constat, un résultat attendu et des actions concrètes.", goalText(), paulButton("Une nouvelle idée de mission", "Explorer une idée"))}<div class="tabs" role="tablist" aria-label="Filtrer les missions">${[
    ["all", "Toutes"],
    ["active", "En cours"],
    ["proposed", "À décider"],
    ["paused", "En pause"],
  ]
    .map(
      ([value, title]) =>
        `<button role="tab" aria-selected="${ui.filter === value}" class="${ui.filter === value ? "active" : ""}" data-action="filter" data-filter="${value}">${title} ${value === "all" ? "3" : Object.values(state.missions).filter((status) => status === value).length}</button>`,
    )
    .join(
      "",
    )}</div>${ids.length ? `<div class="three-col">${ids.map(missionCard).join("")}</div>` : `<div class="empty">${icon("flag")}<h2>Aucune mission dans cette vue</h2><p>Les propositions restent disponibles dans Toutes.</p>${button("filter", "Voir les propositions", "", "arrow-right", 'data-filter="all"')}</div>`}<div class="notice section-space">${icon("shield-check")}<p><strong>${delegationText()}.</strong> Une mission active autorise la préparation, pas un envoi implicite. Budget média : ${state.goal.budget} €/mois maximum, aucune dépense engagée.</p></div>`;
}

function missionDetail() {
  const id = ui.mission;
  const mission = missionDefinitions[id];
  const doc = state.documents[mission.document];
  const published = state.publications.some(
    (item) =>
      item.document === mission.document &&
      item.version === currentVersion(doc).number,
  );
  const active = state.missions[id] === "active";
  const approved = doc.approved === currentVersion(doc).number;
  const task = (number, title, description, label, action, done = false) =>
    `<div class="task ${done ? "done" : ""}"><span class="task-num">${done ? icon("check") : number}</span><div><strong>${title}</strong><p>${description}</p>${badge(label, done ? "green" : number === 3 ? "amber" : "")}</div>${action}</div>`;
  return `${navButton("missions", "Toutes les missions", "text", "arrow-left")}<div class="mission-heading"><div><div class="actions" style="margin-top:16px">${badge(statusText(state.missions[id]), active ? "green" : "amber")}${badge("Paul coordonne", "blue")}</div><h1>${mission.title}</h1><p>${mission.target}</p><div class="actions" style="margin-top:18px">${!active ? button("start-mission", state.missions[id] === "paused" ? "Reprendre la mission" : "Confirmer et lancer", "primary", "play", `data-mission="${id}"`) : button("pause-mission", "Mettre en pause", "", "pause", `data-mission="${id}"`)}${paulButton(`Mission ${id}`, "Ajuster avec Paul")}</div></div><img src="${mission.image}" alt="${escapeHTML(mission.short)}, illustration"></div><div class="two-col"><section><div class="section-heading"><h2>Pourquoi cette mission ?</h2>${navButton("entreprise/audit", "Revenir aux constats", "text", "arrow-up-right")}</div><p class="muted">${mission.rationale}</p><div class="flow-line" style="margin:20px 0">${badge(mission.evidence)}${icon("arrow-right")}${badge("Test limité", "blue")}${icon("arrow-right")}${badge("Apprendre avant d'élargir", "green")}</div><div class="section-heading section-space"><h2>Les actions de la mission</h2><span class="small muted">${published ? 4 : approved ? 3 : active ? 2 : 0} / 5 étapes</span></div><div class="task-list">${task(1, id === "proof" ? "Choisir la réalisation et ses preuves" : "Confirmer les destinataires", id === "proof" ? "Camille · photo illustrative, aucun témoignage inventé." : id === "leads" ? "Jean-Claude · 8 contacts, pertinence et base légale à confirmer." : "Jean-Claude · 2 agences de démonstration : Agence du Cours et Maison Sud.", active ? "Périmètre confirmé" : "À cadrer", button("mission-inputs", "Examiner", "small", "eye", `data-mission="${id}"`), active)}${task(2, "Préparer une première proposition", "Paul transmet le brief à Camille, avec votre marque et vos contraintes.", active ? "Brouillon disponible" : "Aperçu de proposition", navButton(`studio/${mission.document}`, "Ouvrir le Studio", "small", "panels-top-left"), active)}${task(3, "Relire et valider la version", "Vous · le contenu, le visuel et les mentions qui engagent votre entreprise.", approved ? `V${doc.approved} validée` : "Votre décision", navButton(`studio/${mission.document}`, approved ? "Voir la version" : "Examiner", "small", "check"), approved)}${task(4, id === "proof" ? "Publier sur Facebook" : "Envoyer par Gmail", `${channelLabel(doc.channel)} · ${state.channels[doc.channel] ? "canal connecté dans la démo" : "connexion nécessaire"}. Confirmation distincte de la validation.`, published ? "Exécution simulée" : doc.scheduled ? "Programmée" : "Non exécutée", navButton(`studio/${mission.document}`, "Gérer la diffusion", "small", "send"), published)}${task(5, "Faire le point, puis ajuster", "Paul · à J+7 : retours observés. À J+30 : poursuivre, adapter ou arrêter.", "À mesurer", navButton("resultats", "Voir les résultats", "small", "chart-no-axes-combined"))}</div></section><aside class="contract"><h3>Notre contrat de mission</h3><dl><dt>Résultat recherché</dt><dd>${mission.target}</dd><dt>Votre implication</dt><dd>${state.goal.time} h/semaine au total, toutes missions</dd><dt>Enveloppe de préparation</dt><dd>${mission.cost} crédits maximum · démo</dd><dt>Dépenses externes</dt><dd>0 € prévu. Aucun achat autorisé.</dd><dt>Règle d'arrêt</dt><dd>${id === "proof" ? "Bilan après 7 jours. Pas de nouvelle série sans bilan." : "2 contacts ou 8 prospects selon la mission. Aucune relance automatique."}</dd><dt>Délégation</dt><dd>${delegationText()}</dd></dl><div class="notice amber" style="margin-top:24px">${icon("shield-alert")}<p>${mission.risk}</p></div><div class="section-space"><h3>Le relais de Paul</h3><div class="timeline"><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul cadre le test</strong><p>Votre ambition, les limites, la décision.</p></div><div class="timeline-item"><span class="avatar ${id === "proof" ? "camille" : "jean"}">${mission.owner[0]}</span><strong>${mission.owner} prépare</strong><p>Le travail spécialisé, sous ce cadre.</p></div><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul vous restitue</strong><p>Une proposition à examiner, pas une action cachée.</p></div></div></div></aside></div>`;
}

function enterprisePage() {
  const tabs = [
    ["audit", "Diagnostic & positionnement"],
    ["marque", "Ma marque"],
    ["canaux", "Canaux & délégation"],
    ["equipe", "En coulisses"],
  ];
  let content = "";
  if (ui.tab === "audit")
    content = `<div class="spread wrap" style="margin-bottom:20px"><div class="actions">${badge("Relevé du 28 oct. 2026")}${badge("Données d'exemple", "amber")}</div>${button("profile", "Corriger mon profil", "small", "pencil")}</div><div class="two-col"><section><h2>Un savoir-faire solide.<br>Une preuve encore trop discrète.</h2><p class="muted" style="margin-top:13px">La première lecture suggère de rendre votre expertise plus tangible et de tester les prescripteurs locaux, avant d'investir dans l'acquisition payante.</p><div class="positioning"><span class="eyebrow">POSITIONNEMENT PROPOSÉ · À CHALLENGER</span><blockquote>« ${escapeHTML(state.profile.name)}, le partenaire de proximité pour rénover avec des choix clairs et un accompagnement concret. »</blockquote><p>Pas de promesse d'économie chiffrée, de certification ou de délai sans preuve.</p>${paulButton("Votre positionnement", "Affiner ce positionnement", "text")}</div></section><aside><h3>Votre boussole</h3><div class="row"><div><span class="muted small">Ambition</span><p style="color:var(--ink)">${goalText()}</p></div>${button("goal", "Modifier", "small", "pencil")}</div><div class="row"><div><span class="muted small">Territoire</span><p style="color:var(--ink)">${escapeHTML(state.profile.area)}</p></div>${badge("Confirmé", "green")}</div><div class="row"><div><span class="muted small">Clients</span><p style="color:var(--ink)">${escapeHTML(state.profile.clients)}</p></div>${badge("Confirmé", "green")}</div><div class="row"><div><span class="muted small">Capacité disponible</span><p style="color:var(--ink)">${state.goal.capacity} chantiers · à reconfirmer dans 30 jours</p></div></div></aside></div><section><div class="section-heading"><h2>Des constats aux décisions</h2><span class="small muted">Les sources, pas un score opaque</span></div><div class="table-scroll"><table class="source-table"><thead><tr><th>Constat</th><th>Niveau de certitude</th><th>Ce que Paul en déduit</th><th>Suite proposée</th></tr></thead><tbody><tr><td><strong>4 réalisations visibles</strong><p>Pages publiques du site · relevé d'exemple</p>${button("source", "Voir la source", "text", "external-link", 'data-source="site"')}</td><td>${badge(state.profile.url ? "Observation" : "Non vérifié", state.profile.url ? "green" : "amber")}<p>18 réalisations au total : déclaration du dirigeant</p></td><td>Documenter une réalisation avant de multiplier les contenus.</td><td>${navButton("missions/proof", "Preuves & réalisations", "text", "arrow-right")}</td></tr><tr><td><strong>6 agences dans la zone</strong><p>Annuaire local · échantillon de démonstration</p>${button("source", "Voir la source", "text", "external-link", 'data-source="agencies"')}</td><td>${badge("Piste à qualifier", "amber")}<p>Aucun besoin confirmé à ce stade</p></td><td>Tester 2 agences, puis juger les retours.</td><td>${navButton("missions/agencies", "Partenariats agences", "text", "arrow-right")}</td></tr><tr><td><strong>27 anciens prospects</strong><p>Déclaré à Paul · fichier non importé</p></td><td>${badge(state.contactsConfirmed ? "Échantillon confirmé" : "À vérifier", state.contactsConfirmed ? "green" : "amber")}<p>Adéquation, ancienneté, droit de recontact</p></td><td>Vérifier 8 contacts avant le moindre envoi.</td><td>${navButton("missions/leads", "Réactivation prospects", "text", "arrow-right")}</td></tr></tbody></table></div></section><section class="section-space"><div class="section-heading"><h2>Votre environnement</h2>${paulButton("La concurrence locale", "Que faut-il en retenir ?", "small")}</div><div class="equal-col"><div><h3>Concurrence : un échantillon, pas tout le marché</h3><p class="muted small" style="margin:10px 0">5 acteurs potentiels, 3 mettent les aides en avant dans l'exemple. Cela ne démontre ni leur performance ni la demande du marché.</p><div class="actions">${badge("ÉcoHabitat Provence · exemple")}${badge("Maison Thermique · exemple")}${button("competitors", "Voir les 5 acteurs", "text", "arrow-right")}</div></div><div><h3>Ce qu'il nous manque encore</h3><ul class="list-clean small muted"><li>${icon("circle-help")}Marge par offre et CA de départ</li><li>${icon("circle-help")}Trafic, conversion et provenance des demandes</li><li>${icon("circle-help")}Performance réelle des concurrents : non accessible</li></ul></div></div></section>`;
  if (ui.tab === "marque")
    content = `<div class="two-col">
      <section class="stack">
        <div><h2>Votre marque, pas celle de Paul.</h2><p class="muted small" style="margin-top:8px">${state.profile.url ? "Proposition issue du relevé d'exemple du site." : "Aucun site renseigné : identité suggérée, sans source observée."} Chaque élément reste à confirmer.</p></div>
        <div class="brand-preview" style="--brand:${state.brand.color}">${brandLogo()}<h2>Des choix clairs.<br>Une maison qui vous ressemble.</h2><div class="palette"><span class="swatch"><i style="background:${state.brand.color}"></i>${state.brand.color}</span><span class="swatch"><i style="background:${state.brand.accent}"></i>${state.brand.accent}</span></div></div>
        <div class="row"><div><strong class="small">Origine des éléments</strong><p>Palette : ${state.profile.url ? "exemple de site" : "proposition sans source"} · Signature : proposition · Photo : illustration Unsplash</p></div>${badge(state.brand.confirmed ? "Confirmé par vous" : "À confirmer", state.brand.confirmed ? "green" : "amber")}</div>
        <div><h3>À préserver dans les productions</h3><ul class="list-clean small"><li>${icon("check")}Une parole simple, sans jargon technique</li><li>${icon("check")}Des réalisations et des faits vérifiables</li><li>${icon("check")}Aucun avis, label ou gain inventé</li></ul></div>
      </section>
      <form data-form="brand" class="stack"><h3>Le kit de référence</h3>
        <div class="form-grid"><label class="field"><span>Couleur principale</span><input type="color" name="color" value="${state.brand.color}"></label><label class="field"><span>Accent</span><input type="color" name="accent" value="${state.brand.accent}"></label><label class="field full"><span>Ton de la marque</span><select name="tone">${["Clair, concret, rassurant", "Chaleureux et accessible", "Précis et expert"].map((tone) => `<option ${state.brand.tone === tone ? "selected" : ""}>${tone}</option>`).join("")}</select></label></div>
        <div class="row"><div><span class="muted small">Typographie proposée</span><h3>Manrope</h3><p>Choix de la maquette, police du site non vérifiée.</p></div><span style="font-size:38px">Aa</span></div>
        <label class="check"><input type="checkbox" name="confirmed" required ${state.brand.confirmed ? "checked" : ""}>Je confirme ces éléments pour les prochaines créations.</label>
        <div class="form-error" role="alert"></div><button type="submit" class="btn primary">${icon("check")}Enregistrer ma marque</button>
        ${navButton("studio/post", "Voir le rendu dans le Studio", "", "arrow-up-right")}
        <p class="muted small">Une modification de marque impose une nouvelle validation du visuel avant diffusion.</p>
      </form>
    </div>`;
  if (ui.tab === "canaux")
    content = `<div class="two-col"><section><div class="section-heading"><div><h2>Les canaux de votre entreprise</h2><p>Connexion de démonstration, aucun accès réel à vos comptes.</p></div></div>${Object.keys(
      state.channels,
    )
      .map(
        (channel) =>
          `<div class="row"><div class="inline"><span class="avatar ${channel === "gmail" ? "camille" : ""}">${icon(channel === "facebook" ? "contact" : channel === "gmail" ? "mail" : "globe")}</span><div><strong>${channelLabel(channel)}</strong><p>${channel === "facebook" ? "Page " + escapeHTML(state.profile.name) : channel === "gmail" ? "contact@dupont-renovation.example" : "Accès en lecture · publication du site hors périmètre"}</p>${badge(state.channels[channel] ? "Connecté · démo" : "Non connecté", state.channels[channel] ? "green" : "")}</div></div>${button(state.channels[channel] ? "disconnect" : "connect", state.channels[channel] ? "Déconnecter" : "Connecter", "small", state.channels[channel] ? "unplug" : "plug", `data-channel="${channel}"`)}</div>`,
      )
      .join(
        "",
      )}<div class="notice section-space">${icon("lock-keyhole")}<p>Connecter un canal n'autorise aucun envoi. Le compte, la version et le moment sont confirmés séparément.</p></div></section><form data-form="delegation" class="stack"><h2>Votre niveau de délégation</h2>${delegationChoices()}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer les règles</button><p class="muted small">Passer en préparation seule annule les programmations. Le budget média ne constitue jamais une autorisation de dépense.</p></form></div>`;
  if (ui.tab === "equipe")
    content = `<div class="brief"><span class="avatar paul large">P</span><div><h2>Vous n'avez qu'un interlocuteur.</h2><p style="margin-top:9px">Je transforme nos décisions en briefs, je répartis les tâches et je vous restitue les travaux. L'équipe ne vous demande pas de la piloter.</p></div></div><div class="three-col section-space">${[
      [
        "Martine",
        "martine",
        "Diagnostic & positionnement",
        "Sources, concurrence et signaux. Sépare les faits des hypothèses.",
      ],
      [
        "Camille",
        "camille",
        "Contenus & design",
        "Décline votre marque. Prépare les textes et visuels sans les publier.",
      ],
      [
        "Jean-Claude",
        "jean",
        "Partenariats & prospection",
        "Qualifie les cibles et prépare les prises de contact, sous vos règles.",
      ],
    ]
      .map(
        ([name, cls, role, description]) =>
          `<article class="panel"><span class="avatar ${cls}">${name[0]}</span><h3 style="margin-top:15px">${name}</h3><p class="small blue" style="margin:4px 0 12px">${role}</p><p class="muted small">${description}</p></article>`,
      )
      .join(
        "",
      )}</div><section class="section-space"><div class="section-heading"><h2>Le journal de vos décisions</h2>${badge("Traçabilité")}</div>${journalHTML()}</section>`;
  return `${pageHead("Une entreprise bien comprise.", "Votre diagnostic, votre identité et les règles qui guident les décisions de Paul.", escapeHTML(state.profile.name))}<div class="tabs" role="tablist" aria-label="Dossier entreprise">${tabs.map(([key, title]) => `<button role="tab" aria-selected="${ui.tab === key}" class="${ui.tab === key ? "active" : ""}" data-action="navigate" data-route="entreprise/${key}">${title}</button>`).join("")}</div>${content}`;
}

function artwork(version) {
  const color = version.color || state.brand.color;
  return `<div class="artwork ${version.layout === "editorial" ? "editorial" : ""}" style="--brand:${color};--accent:${version.accent || state.brand.accent}"><img src="${escapeHTML(version.photo || "chantier.jpg")}" alt="Maison illustrative pour la création de ${escapeHTML(version.companyName || state.profile.name)}"><div class="art-copy"><strong>${escapeHTML(version.headline)}</strong><small><span>${escapeHTML(version.companyName || state.profile.name)}</span><span>PARLONS DE VOTRE PROJET ${icon("arrow-up-right")}</span></small></div></div>`;
}

function studioPage() {
  const doc = state.documents[ui.document];
  const latest = currentVersion(doc);
  const version =
    doc.versions.find((item) => item.number === ui.selectedVersion) || latest;
  const isOld = version.number !== latest.number;
  const visual = ui.document === "post";
  const executed = state.publications.some(
    (item) => item.document === ui.document && item.version === latest.number,
  );
  const approved = doc.approved === latest.number;
  const preview = visual
    ? `<div class="social-preview"><div class="social-head"><span class="avatar company">DR</span><div><strong>${escapeHTML(version.companyName || state.profile.name)}</strong><span class="muted">Aperçu Facebook · ${state.publications.some((item) => item.document === ui.document && item.version === version.number) ? "diffusion simulée enregistrée" : "non publié"}</span></div>${icon("ellipsis")}</div><div class="social-text">${escapeHTML(version.body)}</div>${artwork(version)}<div class="social-foot"><span>${icon("thumbs-up")} J'aime</span><span>${icon("message-circle")} Commenter</span><span>${icon("share-2")} Partager</span></div></div>`
    : `<article class="email-preview"><dl><dt>De</dt><dd>${escapeHTML(version.companyName || state.profile.name)} &lt;contact@dupont-renovation.example&gt;</dd><dt>À</dt><dd>${ui.document === "email" ? "Agence du Cours ; Maison Sud · 2 destinataires d'exemple, envois séparés" : "8 contacts sélectionnés · liste de démonstration"}</dd><dt>Objet</dt><dd><strong>${escapeHTML(version.title)}</strong></dd></dl><div class="email-body">${escapeHTML(version.body)}</div></article>`;
  const editControls = `<section><div class="spread"><h3>Le brief de création</h3>${badge("Paul → Camille", "blue")}</div><p class="muted small">${visual ? "Rassurer avec une réalisation. Aucun gain énergétique ni témoignage non vérifié." : "Proposer un premier échange. Pas de prix, de promesse ou de relance automatique."}</p><div class="actions" style="margin-top:14px">${paulButton(`Studio ${ui.document}`, "Retravailler avec Paul", "small")}</div></section><section><h3>Texte & composition</h3><form data-form="edit-document" class="stack-sm"><label class="field"><span>${visual ? "Accroche du visuel" : "Objet du message"}</span><input name="title" maxlength="100" required value="${escapeHTML(visual ? version.headline.replace(/\n/g, " ") : version.title)}" ${isOld || doc.scheduled ? "disabled" : ""}></label><label class="field"><span>${visual ? "Texte de la publication" : "Message"}</span><textarea name="body" rows="5" maxlength="3000" required ${isOld || doc.scheduled ? "disabled" : ""}>${escapeHTML(version.body)}</textarea></label>${visual ? `<label class="field"><span>Composition</span><select name="layout" ${isOld || doc.scheduled ? "disabled" : ""}><option value="photo" ${version.layout !== "editorial" ? "selected" : ""}>Photo & signature</option><option value="editorial" ${version.layout === "editorial" ? "selected" : ""}>Cadre éditorial</option></select></label><div class="actions"><label class="btn small upload">${icon("image-plus")}Importer une photo<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Importer une photo" ${isOld || doc.scheduled ? "disabled" : ""}></label>${navButton("entreprise/marque", "Ma marque", "small", "palette")}</div><small class="muted">JPG, PNG ou WebP · 1 Mo maximum · photo actuelle illustrative.</small>` : ""}<div class="form-error" role="alert"></div><button class="btn" type="submit" ${isOld || doc.scheduled ? "disabled" : ""}>${icon("save")}Enregistrer une nouvelle version</button></form></section>`;
  const historyControls = `<section><h3>Une décision, une version.</h3><p class="muted small">Restaurer crée une nouvelle version à valider. Les versions précédentes restent consultables.</p></section><div class="version-list">${[
    ...doc.versions,
  ]
    .reverse()
    .map(
      (item) =>
        `<button class="version-row ${version.number === item.number ? "active" : ""}" data-action="select-version" data-version="${item.number}"><span class="badge ${version.number === item.number ? "blue" : ""}">V${item.number}</span><div><strong>${item.number === latest.number ? "Version courante" : "Version précédente"}</strong><small>${escapeHTML(item.note)}</small></div>${doc.approved === item.number ? icon("circle-check") : icon("eye")}</button>`,
    )
    .join(
      "",
    )}</div>${doc.versions.length > 1 ? button("compare", "Comparer les deux dernières", "", "columns-2") : ""}${isOld ? button("restore", `Restaurer V${version.number} comme nouvelle version`, "", "undo-2", `data-version="${version.number}" ${doc.scheduled ? "disabled" : ""}`) : ""}`;
  const displayedExecution = state.publications.some((item) => item.document === ui.document && item.version === version.number);
  const displayedStatus = isOld ? displayedExecution ? "Exécutée · démo" : "Archive" : executed ? "Exécutée · démo" : doc.scheduled ? "Programmée" : approved ? "Validée" : "Brouillon";
  return `${pageHead("Le Studio", "Une création liée à une mission, une marque et une version précise.", "CRÉER · AFFINER · VALIDER", navButton(`missions/${doc.mission}`, "Retour à la mission", "", "arrow-left"))}
    <div class="studio-toolbar">
      <label class="field" style="max-width:320px;flex:1"><span class="eyebrow">PRODUCTION</span><select aria-label="Production" id="document-select"><option value="post" ${visual ? "selected" : ""}>Visuel & publication · Réalisations</option><option value="email" ${ui.document === "email" ? "selected" : ""}>Email · Partenariats agences</option><option value="followup" ${ui.document === "followup" ? "selected" : ""}>Email · Réactivation prospects</option></select></label>
      <div class="actions">${badge(`V${version.number}${isOld ? " · archive" : " · courante"}`, "blue")}${badge(displayedStatus, displayedExecution || (!isOld && approved) ? "green" : "amber")}</div>
    </div>
    ${state.missions[doc.mission] !== "active" ? `<div class="notice amber" style="margin-bottom:20px">${icon("info")}<p>La mission n'est pas active. Cet aperçu ne peut pas être validé ni diffusé.</p>${button("start-mission", "Lancer la mission", "small", "play", `data-mission="${doc.mission}"`)}</div>` : ""}
    <div class="studio-layout"><section>
      <div class="studio-toolbar"><span class="small muted">${channelLabel(doc.channel)} · ${visual ? "Visuel carré 1:1" : "Message individuel"}</span><div class="segmented" aria-label="Affichage de l'aperçu">${visual ? `<button data-action="preview" data-preview="social" class="${ui.preview === "social" ? "active" : ""}">Publication</button><button data-action="preview" data-preview="visual" class="${ui.preview === "visual" ? "active" : ""}">Visuel seul</button>` : badge("Aperçu destinataire")}</div></div>
      <div class="preview-stage">${visual && ui.preview === "visual" ? `<div style="width:100%;max-width:460px">${artwork(version)}</div>` : preview}</div>
      <div class="spread wrap" style="margin-top:13px"><span class="small muted">${visual ? "Image illustrative · droits à confirmer pour un usage réel" : "Adresses .example · aucun email réel"}</span>${button("copy", "Copier le texte", "small", "copy")}</div>
      <div class="studio-approval"><div>
        <strong class="small">${isOld ? `V${version.number} · archive en lecture seule` : doc.scheduled ? "Programmée le " + formatDate(doc.scheduled) : approved ? `V${latest.number} validée` : "Votre accord est nécessaire"}</strong>
        <p class="muted small">${displayedExecution ? "Exécution simulée enregistrée dans Résultats." : isOld ? "Restaurer crée une nouvelle version à valider." : "Validation du contenu et diffusion sont deux décisions distinctes."}</p>
      </div><div class="actions">
        ${isOld ? badge("Archive · lecture seule") : doc.scheduled ? button("cancel-schedule", "Annuler la programmation", "", "calendar-x") : !approved ? button("approve", "Valider cette version", "primary", "check", state.missions[doc.mission] !== "active" ? "disabled" : "") : executed ? navButton("resultats", "Voir le suivi", "primary", "arrow-right") : state.delegation === "prepare" ? button("copy", "Récupérer le texte", "primary", "copy") : button("publish", visual ? "Préparer la publication" : "Préparer l'envoi", "primary", "send")}
      </div></div>
    </section><aside>
      <div class="tabs" role="tablist" aria-label="Outils du Studio"><button role="tab" aria-selected="${ui.studioTab === "edit"}" class="${ui.studioTab === "edit" ? "active" : ""}" data-action="studio-tab" data-tab="edit">Création</button><button role="tab" aria-selected="${ui.studioTab === "history"}" class="${ui.studioTab === "history" ? "active" : ""}" data-action="studio-tab" data-tab="history">Versions (${doc.versions.length})</button></div>
      <div class="editor-controls">${ui.studioTab === "edit" ? editControls : historyControls}<section><h3>Cadre de diffusion</h3>
        <div class="row"><span class="small">${channelLabel(doc.channel)}</span>${state.channels[doc.channel] ? badge("Connecté · démo", "green") : button("connect", "Connecter", "small", "plug", `data-channel="${doc.channel}"`)}</div>
        <div class="row"><span class="small">Délégation</span><strong class="small">${delegationText()}</strong></div>
        ${visual ? `<div class="row"><span class="small">Marque actuelle</span>${state.brand.confirmed ? badge("Confirmée", "green") : navButton("entreprise/marque", "À confirmer", "text")}</div>` : ""}
      </section></div>
    </aside></div>`;
}

function journalHTML() {
  return state.journal.length
    ? `<div class="timeline">${state.journal
        .slice(0, 12)
        .map(
          (item) =>
            `<div class="timeline-item"><span class="avatar paul">P</span><strong>${escapeHTML(item.text)}</strong><p>${formatDate(item.date)}</p></div>`,
        )
        .join("")}</div>`
    : '<p class="muted">Aucune décision enregistrée pour le moment.</p>';
}

function resultsPage() {
  const report = state.report;
  const scheduled = Object.entries(state.documents).filter(
    ([, doc]) => doc.scheduled,
  );
  return `${pageHead("L'activité n'est pas le résultat.", "Ce qui a été fait, ce qui a été observé, et ce que nous décidons ensuite.", "APPRENDRE · AJUSTER", button("report", "Renseigner mon bilan", "", "pencil"))}
    <div class="metrics">
      <div class="metric"><span>Exécutions simulées</span><strong>${state.publications.length}</strong><span>${scheduled.length} programmation${scheduled.length > 1 ? "s" : ""} en attente</span></div>
      <div class="metric"><span>Demandes qualifiées</span><strong>${report ? report.leads : "—"}</strong><span>${report ? "Saisie dirigeant · non attribuée" : "À renseigner, pas à inventer"}</span></div>
      <div class="metric"><span>Chiffre d'affaires signé</span><strong>${report ? Number(report.revenue).toLocaleString("fr-FR") + " €" : "—"}</strong><span>${report ? "Saisie dirigeant · non attribuée" : "Aucune donnée connectée"}</span></div>
    </div>
    <div class="two-col"><section><div class="section-heading"><h2>La diffusion et son suivi</h2></div>
      ${scheduled.map(([id, doc]) => `<div class="row"><div><strong>${escapeHTML(currentVersion(doc).title)}</strong><p>${channelLabel(doc.channel)} · V${doc.approved} · ${formatDate(doc.scheduled)}</p>${badge("Programmée · simulation", "blue")}</div>${navButton(`studio/${id}`, "Gérer", "small", "calendar-clock")}</div>`).join("")}
      ${state.publications.length ? state.publications.map((item) => `<div class="row"><div><strong>${escapeHTML(item.title)}</strong><p>${channelLabel(item.channel)} · V${item.version} · ${formatDate(item.date)}</p>${badge("Exécution simulée", "green")}</div>${navButton(`studio/${item.document}/${item.version}`, "Voir", "small", "eye")}</div>`).join("") : !scheduled.length ? `<div class="empty">${icon("chart-no-axes-combined")}<h3>Rien n'a encore été diffusé.</h3><p>Validez une production, puis confirmez sa diffusion.</p>${navButton("studio", "Ouvrir le Studio", "", "arrow-right")}</div>` : ""}
      <div class="notice section-space">${icon("info")}<p>Une exécution n'est ni une lecture, ni une vente. Les chiffres renseignés ne prouvent pas l'effet d'une mission.</p></div>
    </section><aside><h2>Le point de Paul</h2><div class="brief" style="margin-top:18px"><span class="avatar paul">P</span><p>${report ? `Vous signalez ${report.leads} demandes et ${report.meetings} rendez-vous. Avant d'élargir, vérifions leur origine et votre capacité à les absorber.` : "Il est trop tôt pour conclure. Après la première diffusion, notons les réponses reçues et leur qualité. Nous déciderons ensuite de poursuivre ou d'ajuster."}</p></div>
      ${report?.note ? `<div class="quote" style="margin-top:15px">${escapeHTML(report.note)}</div>` : ""}
      <div class="actions" style="margin-top:20px">${paulButton("Bilan et prochaine décision", "Préparer le bilan", "primary")}${navButton("missions", "Revoir les missions", "text")}</div>
      <div class="row section-space"><div><span class="eyebrow">PROCHAIN POINT</span><h3>7 jours après la première diffusion</h3><p>Qualifier les retours, vérifier les limites, décider du prochain test.</p></div></div>
    </aside></div><section class="section-space"><div class="section-heading"><h2>Décisions & traçabilité</h2></div>${journalHTML()}</section>`;
}

function pageContext() {
  return ui.view === "studio"
    ? `Studio ${ui.document}`
    : ui.view === "missions" && location.hash.split("/")[2]
      ? `Mission ${ui.mission}`
      : ui.view === "entreprise"
        ? `Entreprise ${ui.tab}`
        : ui.view === "resultats"
          ? "Bilan et prochaine décision"
          : "Votre stratégie";
}

function render() {
  captureEditorDraft();
  document.querySelector("#app").innerHTML = state.onboarded
    ? shell(
        (
          {
            paul: paulPage,
            missions: missionsPage,
            studio: studioPage,
            entreprise: enterprisePage,
            resultats: resultsPage,
          }[ui.view] || paulPage
        )(),
      )
    : onboarding();
  document.title = `BienDecider · ${state.onboarded ? { paul: "Avec Paul", missions: "Missions", studio: "Studio", entreprise: "Entreprise", resultats: "Résultats" }[ui.view] || "Votre espace" : "Faisons connaissance"}`;
  const editor = document.querySelector('form[data-form="edit-document"]');
  if (editor) {
    editor.dataset.document = ui.document;
    editor.dataset.version = currentVersion(
      state.documents[ui.document],
    ).number;
    const draft = ui.editorDrafts[ui.document];
    if (draft && (!ui.selectedVersion || ui.selectedVersion === currentVersion(state.documents[ui.document]).number)) {
      for (const [key, value] of Object.entries(draft.values))
        if (editor.elements[key]) editor.elements[key].value = value;
      editor.dataset.version = draft.version;
    }
    if (state.documents[ui.document].profileNeedsReview)
      editor.insertAdjacentHTML(
        "afterbegin",
        '<div class="notice amber">Le profil a changé. Vérifiez le contenu, puis enregistrez une nouvelle version.</div>',
      );
    refreshDraftPreview();
  }
  hydrateIcons();
  fitArtworkText();
  syncMobileMenu();
}

function captureEditorDraft() {
  const form = document.querySelector('form[data-form="edit-document"]');
  if (!form?.dataset.document || form.elements.title.disabled) return;
  const documentId = form.dataset.document;
  const latest = currentVersion(state.documents[documentId]);
  if (Number(form.dataset.version) !== latest.number) return;
  const values = Object.fromEntries(new FormData(form));
  const changed =
    values.title !==
      (documentId === "post"
        ? latest.headline.replace(/\n/g, " ")
        : latest.title) ||
    values.body !== latest.body ||
    (documentId === "post" && values.layout !== (latest.layout || "photo"));
  if (changed) ui.editorDrafts[documentId] = { values, version: latest.number };
  else delete ui.editorDrafts[documentId];
}

function refreshDraftPreview() {
  const form = document.querySelector('form[data-form="edit-document"]');
  const draft = form && ui.editorDrafts[form.dataset.document];
  if (!form || form.elements.title.disabled) return;
  if (draft && !form.querySelector(".draft-note"))
    form.insertAdjacentHTML(
      "afterbegin",
      '<div class="notice amber draft-note">Retouches non enregistrées. La validation porte sur la dernière version enregistrée.</div>',
    );
  if (!draft) form.querySelector(".draft-note")?.remove();
  const version = currentVersion(state.documents[form.dataset.document]);
  const values = draft?.values || { title: form.dataset.document === "post" ? version.headline : version.title, body: version.body, layout: version.layout };
  const stage = document.querySelector(".preview-stage");
  const body = stage.querySelector(".social-text, .email-body");
  if (body) body.textContent = values.body;
  const title = stage.querySelector(".art-copy strong, dd strong");
  if (title) title.textContent = values.title;
  stage
    .querySelector(".artwork")
    ?.classList.toggle("editorial", values.layout === "editorial");
  fitArtworkText();
}

function syncMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const mobile = matchMedia("(max-width:720px)").matches;
  const open = mobile && sidebar.classList.contains("open");
  sidebar.inert = mobile && !open;
  document.querySelector(".app-main").inert = open;
  document.querySelector(".mobile-nav-overlay").classList.toggle("visible", open);
}

function toggleMenu(open) {
  document.querySelector(".sidebar")?.classList.toggle("open", open);
  syncMobileMenu();
  document.querySelector(open ? ".sidebar .wordmark" : ".mobile-menu")?.focus();
}

function fitArtworkText() {
  document.querySelectorAll(".art-copy").forEach((container) => {
    const heading = container.querySelector("strong");
    const signature = container.querySelector("small");
    heading.style.fontSize = "";
    let size = parseFloat(getComputedStyle(heading).fontSize);
    while (
      heading.getBoundingClientRect().bottom + 8 >
        signature.getBoundingClientRect().top &&
      size > 12
    ) {
      size -= 1;
      heading.style.fontSize = `${size}px`;
    }
  });
}

function navigate(route) {
  closeDialog("modal");
  if (location.hash === `#/${route}`) readRoute();
  else location.hash = `/${route}`;
}

function readRoute() {
  if (location.hash && !location.hash.startsWith("#/")) return;
  captureEditorDraft();
  closeDialog("modal");
  closeDialog("paul-dialog");
  const [, view, detail, versionNumber] = location.hash.split("/");
  ui.view = ["paul", "missions", "studio", "entreprise", "resultats"].includes(
    view,
  )
    ? view
    : "paul";
  if (ui.view === "entreprise")
    ui.tab = ["audit", "marque", "canaux", "equipe"].includes(detail)
      ? detail
      : "audit";
  if (ui.view === "studio") {
    ui.document = Object.hasOwn(state.documents, detail || "")
      ? detail
      : "post";
    ui.selectedVersion = Number(versionNumber) || null;
    if (ui.selectedVersion) ui.studioTab = "history";
  }
  if (ui.view === "missions")
    ui.mission = Object.hasOwn(missionDefinitions, detail || "")
      ? detail
      : "agencies";
  render();
  window.scrollTo(0, 0);
  document.querySelector("#main")?.focus({ preventScroll: true });
}

function openModal(title, content, footer = "") {
  const dialog = document.querySelector("#modal");
  document.querySelector("#modal-body").innerHTML =
    `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fermer la fenêtre">${icon("x")}</button></div><div class="modal-content">${content}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
  if (!dialog.open) dialog.showModal();
  dialog
    .querySelectorAll('form[data-form="approve"],form[data-form="publish"]')
    .forEach((form) => {
      form.dataset.document = ui.document;
      form.dataset.version = currentVersion(
        state.documents[ui.document],
      ).number;
    });
  hydrateIcons();
  fitArtworkText();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog.open) dialog.close();
}

function introFor(context) {
  if (context.startsWith("Studio"))
    return "La proposition reprend votre mission et votre marque. Dites-moi ce que vous souhaitez changer : le ton, la longueur ou l'angle. Je prépare un brief pour Camille ; toute révision devra être validée à nouveau.";
  if (context.includes("ambition"))
    return `Vous visez ${goalText()}, avec ${state.goal.time} h par semaine. Qu'est-ce qui doit primer : le temps gagné, des retours rapides ou une présence plus solide ? Nous ajusterons le cap avant de le confirmer.`;
  if (context.includes("positionnement"))
    return "Votre proximité et votre clarté peuvent faire la différence. Les aides sont déjà très présentes chez les concurrents de l'exemple. Préférez-vous mettre en avant l'accompagnement, les réalisations ou l'expertise technique ?";
  if (context.includes("Bilan"))
    return "Regardons d'abord la qualité des retours et leur origine. Une publication n'est pas une vente. Si nous manquons de données, gardons le test limité plutôt que d'augmenter le budget.";
  if (context.includes("concurrence"))
    return "Martine a relevé 5 acteurs potentiels dans l'exemple. Leurs messages ne démontrent pas leurs performances. Je propose de les utiliser pour affiner votre différence, pas de copier leurs promesses.";
  return `Ma priorité actuelle : ${missionDefinitions[state.priority].short.toLowerCase()}. Elle s'appuie sur le diagnostic, ${state.goal.capacity} chantiers possibles et ${state.goal.budget} € de budget média maximum. On peut comparer les options ou partir de votre idée. Rien ne sera lancé à la suite de cette discussion sans votre accord.`;
}

function openPaul(context) {
  ui.context = context || pageContext();
  ui.proposal = null;
  if (
    !state.messages.length ||
    state.messages[state.messages.length - 1].context !== ui.context
  ) {
    state.messages.push({
      role: "paul",
      text: introFor(ui.context),
      context: ui.context,
    });
  }
  save();
  renderPaul();
  const dialog = document.querySelector("#paul-dialog");
  if (!dialog.open) dialog.showModal();
  document.querySelector("#paul-input")?.focus();
}

function renderPaul() {
  const studio = ui.context.startsWith("Studio ");
  const suggestions = studio
    ? [
        ["shorter", "Plus court"],
        ["warmer", "Plus humain"],
        ["angle", "Un autre angle"],
      ]
    : [
        ["time", "J'ai peu de temps"],
        ["agencies", "Miser sur les agences"],
        ["proof", "Miser sur mes réalisations"],
        ["leads", "Réactiver mes prospects"],
        ["compare", "Comparer les pistes"],
      ];
  const proposal = ui.proposal;
  document.querySelector("#paul-body").innerHTML =
    `<div class="modal-head"><div class="inline"><span class="avatar paul">P</span><div><h2 id="paul-title">Avec Paul</h2><span class="muted small">Votre interlocuteur, du cap à l'action</span></div></div><button class="icon-btn" data-action="close-paul" aria-label="Fermer la conversation">${icon("x")}</button></div><div class="paul-context">${icon(studio ? "panels-top-left" : "compass")} ${escapeHTML(ui.context)} · ${escapeHTML(state.profile.name)}</div><div class="chat-thread" aria-live="polite">${state.messages
      .slice(-30)
      .map(
        (message) =>
          `<div class="chat-message ${message.role === "user" ? "user" : ""}">${message.role === "paul" ? '<span class="name">Paul</span>' : ""}${escapeHTML(message.text)}${message.role === "paul" ? '<span class="chat-meta">Échange de démonstration</span>' : ""}</div>`,
      )
      .join(
        "",
      )}${proposal ? `<div class="chat-message"><span class="name">Paul · proposition à confirmer</span><div class="chat-proposal"><strong>${escapeHTML(proposal.title)}</strong><p>${escapeHTML(proposal.description)}</p><div class="actions">${button("accept-proposal", proposal.kind === "revision" ? "Créer cette version" : "Retenir cette priorité", "primary small", "check")}${button("dismiss-proposal", "Garder le cap actuel", "small")}</div></div></div>` : ""}</div><div class="chat-suggestions">${suggestions.map(([value, title]) => `<button data-action="chat-suggestion" data-suggestion="${value}">${title}</button>`).join("")}</div><div class="chat-compose"><form data-form="chat"><textarea id="paul-input" name="message" placeholder="Votre question, votre idée…" aria-label="Votre message à Paul" required maxlength="1200" rows="2"></textarea><button type="submit" class="icon-btn" aria-label="Envoyer le message">${icon("arrow-up")}</button></form><small>Simulation locale · pas d'IA connectée · aucune action implicite</small></div>`;
  hydrateIcons();
  const thread = document.querySelector(".chat-thread");
  thread.scrollTop = thread.scrollHeight;
}

function chatReply(message, suggestion) {
  state.messages.push({ role: "user", text: message, context: ui.context });
  const studio = ui.context.startsWith("Studio ");
  const lowered = message.toLocaleLowerCase("fr");
  let response;
  if (studio) {
    const documentId = ui.context.split(" ")[1];
    const doc = state.documents[documentId];
    if (!doc) throw new Error("Choisissez une production dans le Studio.");
    const kind =
      suggestion ||
      (/court|concis|raccour/.test(lowered)
        ? "shorter"
        : /humain|chaleureux|simple/.test(lowered)
          ? "warmer"
          : "angle");
    response = suggestion
      ? "Je transmets cette intention à Camille. Voici la modification proposée ; elle ne remplace pas encore votre version."
      : `Je garde votre demande : « ${message} ». Dans cette maquette, je vous propose une variante illustrative à examiner. Elle ne constitue pas une interprétation complète de votre demande.`;
    ui.proposal = {
      kind: "revision",
      document: documentId,
      expectedVersion: currentVersion(doc).number,
      variant: kind,
      title:
        kind === "shorter"
          ? "Une version plus concise"
          : kind === "warmer"
            ? "Un ton plus humain"
            : "Une autre entrée en matière",
      description:
        "Même destination, même mission. Aucun envoi. La nouvelle version devra être relue et validée.",
    };
  } else {
    const kind =
      suggestion ||
      (/temps|occup|débord/.test(lowered)
        ? "time"
        : /réalis|preuve|visib|photo/.test(lowered)
          ? "proof"
          : /prospect|réactiv|anciens contacts/.test(lowered)
            ? "leads"
            : /agence|partenar/.test(lowered)
              ? "agencies"
              : "compare");
    if (kind === "compare") {
      response =
        "Trois chemins, trois compromis :\n\n1. Agences : un nouveau canal, mais des contacts à qualifier. Test limité à 2 agences.\n2. Réalisations : peu de temps de suivi, mais un effet commercial indirect. Une seule publication d'abord.\n3. Anciens prospects : potentiellement rapide, mais la liste et le droit de recontact restent à vérifier.\n\nJe ne changerais pas votre priorité sans choisir ensemble le compromis qui vous convient.";
      ui.proposal = null;
    } else {
      const priority = ["agencies", "leads"].includes(kind) ? kind : "proof";
      response =
        kind === "time"
          ? "Si votre temps est la contrainte principale, je commencerais par une réalisation. Camille prépare, vous relisez, puis nous décidons de la diffusion. Les agences restent une piste, mais sans suivi commercial supplémentaire tout de suite."
          : priority === "proof"
            ? "Rendre une réalisation visible peut soutenir toutes vos prises de contact. C'est cohérent avec le manque de preuves observé, mais nous n'en déduirons pas une hausse de conversion avant d'avoir des données."
            : priority === "leads"
              ? "Commençons par vos relations existantes. Jean-Claude prépare un échantillon de 8 contacts. Vous devrez confirmer leur pertinence et le droit de recontact avant le lancement. Aucun envoi automatique."
              : "Les agences peuvent devenir des prescripteurs. Je garde un test à 2 destinataires, sans relance automatique ni promesse de résultat.";
      ui.proposal = {
        kind: "strategy",
        priority,
        preference: kind === "time" ? "time" : "balanced",
        title: `Priorité : ${missionDefinitions[priority].short}`,
        description:
          "Réordonne les recommandations. Ne lance aucune mission et ne suspend pas les missions déjà actives.",
      };
    }
    if (!suggestion && kind === "compare")
      response = `Je garde votre idée : « ${message} ». Pour l'arbitrer dans cette démonstration, comparons-la aux pistes préparées.\n\n${response}`;
  }
  state.messages.push({ role: "paul", text: response, context: ui.context });
  save();
  renderPaul();
}

function proposedRevision(documentId, variant) {
  const current = currentVersion(state.documents[documentId]);
  const name = state.profile.name;
  const visual = documentId === "post";
  const lead = documentId === "followup";
  const bodies = visual
    ? {
        shorter: `Votre projet de rénovation à ${state.profile.area.split(" · ")[0]}. Des choix clairs, un accompagnement de proximité.\n\nParlons de votre maison.\n${name}`,
        warmer: `On sait qu'une rénovation soulève beaucoup de questions. Par où commencer ? Quels travaux choisir ?\n\nChez ${name}, nous prenons le temps d'en parler avec vous. Racontons ensemble la suite de votre maison.`,
        angle: `Et si le premier chantier, c'était d'y voir plus clair ?\n\nAvant de parler travaux, parlons de vos priorités. ${name} vous accompagne dans votre projet, à ${state.profile.area}.`,
      }
    : {
        shorter: lead
          ? `Bonjour,\n\nVotre projet de rénovation est-il toujours d'actualité ? Je suis disponible pour en reparler.\n\nVous ne souhaitez plus être recontacté ? Un simple retour suffit.\n\nRémi · ${name}`
          : `Bonjour,\n\n${name} accompagne les projets de rénovation à ${state.profile.area}. Seriez-vous disponible pour un échange sur l'accompagnement de vos acquéreurs ?\n\nBien à vous,\nRémi`,
        warmer: lead
          ? `Bonjour,\n\nJe reprends de vos nouvelles au sujet de votre projet. Vos envies ou votre calendrier ont peut-être évolué. Prenons le temps de faire le point, si cela vous est utile.\n\nUn simple retour suffit si vous préférez ne plus être contacté.\n\nRémi · ${name}`
          : `Bonjour,\n\nUn achat immobilier s'accompagne souvent de beaucoup de questions sur les travaux. C'est notre quotidien chez ${name}.\n\nJ'aimerais faire votre connaissance et voir si nous pouvons être utiles à vos acquéreurs. Un échange la semaine prochaine vous conviendrait-il ?\n\nRémi`,
        angle: lead
          ? `Bonjour,\n\nQu'est-ce qui compte le plus pour votre maison aujourd'hui ? Si votre projet a changé, nous pouvons en reparler sans engagement.\n\nPour ne plus être recontacté, répondez simplement à ce message.\n\nRémi · ${name}`
          : `Bonjour,\n\nVos acquéreurs vous posent-ils des questions sur les travaux après leur achat ? Nous pourrions réfléchir à un relais local simple pour les orienter.\n\nJe serais heureux d'en discuter avec vous.\n\nRémi · ${name}`,
      };
  const headline = visual
    ? variant === "shorter"
      ? "Votre maison.\nVos priorités."
      : variant === "warmer"
        ? "On en parle,\nsimplement ?"
        : "D'abord,\ny voir clair."
    : current.headline;
  return {
    ...current,
    title: visual ? headline.replace(/\n/g, " ") : current.title,
    body: bodies[variant],
    headline,
    note: `Retouche coordonnée par Paul : ${variant === "shorter" ? "plus court" : variant === "warmer" ? "plus humain" : "autre angle"}`,
  };
}

function startMissionDialog(id) {
  const mission = missionDefinitions[id];
  openModal(
    "Confirmer le cadre de la mission",
    `<form data-form="start-mission" data-mission="${id}" class="stack"><h3>${mission.title}</h3><div class="row"><span class="muted small">Résultat recherché</span><strong class="small">${mission.target}</strong></div><div class="row"><span class="muted small">Préparation</span><strong class="small">${mission.cost} crédits maximum · démo</strong></div><div class="row"><span class="muted small">Dépenses externes</span><strong class="small">0 € engagé</strong></div><div class="notice">${icon("shield-check")}<p>Paul coordonne la préparation. Chaque envoi ou publication reste soumis à confirmation.</p></div>${id === "leads" ? `<label class="check"><input type="checkbox" name="contacts" required ${state.contactsConfirmed ? "checked" : ""}>Je confirme, dans ce scénario, la pertinence des 8 contacts, la base légale de leur recontact et la possibilité de s'opposer.</label>` : ""}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("play")}Confirmer le lancement</button></form>`,
  );
}

function approvalDialog() {
  const doc = state.documents[ui.document];
  const version = currentVersion(doc);
  openModal(
    `Valider la version V${version.number}`,
    `<form data-form="approve" class="stack"><p><strong>${escapeHTML(version.title)}</strong></p><p class="muted small">Cette validation concerne le contenu de V${version.number}. Elle ne publie ni n'envoie rien.</p>${ui.document === "post" ? `<label class="check"><input type="checkbox" name="rights" required>Je confirme le visuel et les droits d'utilisation dans ce scénario de démonstration.</label>${!state.brand.confirmed ? `<div class="notice amber">${icon("palette")}<p>La marque doit être confirmée avant de valider ce visuel.</p></div>${navButton("entreprise/marque", "Confirmer ma marque", "", "arrow-right")}` : ""}` : `<div class="notice">${icon("mail")}<p>Destinataires de démonstration uniquement. Aucun prix ni relance automatique.</p></div>`}<label class="check"><input type="checkbox" name="reviewed" required>J'ai relu le contenu et vérifié les informations qui engagent mon entreprise.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit" ${ui.document === "post" && !state.brand.confirmed ? "disabled" : ""}>${icon("check")}Valider sans diffuser</button></form>`,
  );
}

function publicationDialog() {
  const doc = state.documents[ui.document];
  const visual = doc.channel === "facebook";
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setMinutes(0, 0, 0);
  const localDate = new Date(
    tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  if (!state.channels[doc.channel]) {
    openModal(
      "Le canal n'est pas encore connecté",
      `<div class="stack"><p>Votre contenu est validé, mais ${channelLabel(doc.channel)} n'est pas connecté. La connexion et l'autorisation de diffusion sont séparées.</p>${button("connect", `Connecter ${channelLabel(doc.channel)}`, "primary", "plug", `data-channel="${doc.channel}"`)}<p class="muted small">Vous reviendrez ensuite à la confirmation de diffusion.</p></div>`,
    );
    return;
  }
  openModal(
    visual ? "Confirmer la diffusion" : "Confirmer l'envoi",
    `<form data-form="publish" class="stack"><div class="row"><span class="muted small">Version</span><strong>V${doc.approved} · ${escapeHTML(currentVersion(doc).title)}</strong></div><div class="row"><span class="muted small">Destination</span><strong class="small">${visual ? "Page " + escapeHTML(state.profile.name) : ui.document === "email" ? "2 agences · envois séparés" : "8 contacts sélectionnés"} · ${channelLabel(doc.channel)}</strong></div><fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:750;margin-bottom:12px">Quand ?</legend><div class="stack-sm"><label class="check"><input type="radio" name="when" value="now" checked>Maintenant</label><label class="check"><input type="radio" name="when" value="later">Programmer</label></div></fieldset><label class="field" id="schedule-field" hidden><span>Date et heure · fuseau de cet appareil</span><input type="datetime-local" name="date" value="${localDate}" disabled></label><div class="notice amber">${icon("flask-conical")}<p>Simulation uniquement. Aucun contenu ne quitte votre navigateur. Une programmation n'est pas exécutée automatiquement par cette maquette.</p></div><label class="check"><input type="checkbox" name="confirmed" required>Je confirme cette version, cette destination et ce moment de diffusion.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("send")}Confirmer la simulation</button></form>`,
  );
}

function connectionDialog(channel) {
  openModal(
    `Connecter ${channelLabel(channel)}`,
    `<form data-form="connect" data-channel="${channel}" class="stack"><div class="notice">${icon("flask-conical")}<p>Connexion simulée, sans OAuth ni identifiant réel. Aucun compte externe ne sera modifié.</p></div><label class="field"><span>${channel === "facebook" ? "Page à utiliser" : channel === "gmail" ? "Compte d'envoi" : "Source à lire"}</span><select name="resource"><option>${channel === "facebook" ? escapeHTML(state.profile.name) + " · page de démonstration" : channel === "gmail" ? "contact@dupont-renovation.example" : escapeHTML(state.profile.url || "Site de démonstration")}</option></select></label><label class="check"><input type="checkbox" name="permissions" required>${channel === "site" ? "Autoriser la lecture de cette source dans la démonstration." : "Confirmer ce compte pour les simulations de diffusion explicitement validées."}</label><button class="btn primary" type="submit">${icon("plug")}Confirmer la connexion simulée</button></form>`,
  );
}

function sourceDialog(source) {
  const data =
    source === "site"
      ? {
          title: "Relevé de la présence en ligne",
          type: "Observation d'exemple",
          body: "Le relevé illustratif contient 4 réalisations visibles. Les 18 réalisations au total sont une déclaration distincte, non vérifiée par le site.",
          origin: state.profile.url || "Aucun site renseigné",
          uncertainty:
            "Sans site renseigné, ce relevé reste un exemple et ne peut pas être traité comme une observation réelle.",
        }
      : {
          title: "Échantillon d'agences locales",
          type: "Hypothèse à qualifier",
          body: "6 agences repérées dans un annuaire fictif. 2 sont retenues pour le test : Agence du Cours et Maison Sud. Aucun intérêt commercial n'est confirmé.",
          origin: "Annuaire de démonstration · zone Aix-en-Provence",
          uncertainty:
            "Présence dans un annuaire ne signifie pas besoin, accord ou relation existante.",
        };
  openModal(
    data.title,
    `<div class="stack">${badge(data.type, "amber")}<p>${data.body}</p><div class="quote">${escapeHTML(data.origin)}</div><p class="muted small">Relevé de référence : 28 octobre 2026. Aucune page n'a été visitée par cette maquette.</p><div class="notice amber">${icon("circle-help")}<p>${data.uncertainty}</p></div></div>`,
    paulButton("Fiabilité des sources", "Questionner ce constat"),
  );
}

async function handleAction(element) {
  const action = element.dataset.action;
  captureEditorDraft();
  if (
    ["approve", "publish", "restore"].includes(action) &&
    ui.editorDrafts[ui.document]
  ) {
    toast(
      "Enregistrez vos retouches dans une nouvelle version avant cette décision.",
    );
    document
      .querySelector('form[data-form="edit-document"] button[type="submit"]')
      ?.focus();
    return;
  }
  switch (action) {
    case "skip":
      document.querySelector("#main")?.focus();
      break;
    case "navigate":
      navigate(element.dataset.route);
      break;
    case "menu":
      toggleMenu(true);
      break;
    case "menu-close":
      toggleMenu(false);
      break;
    case "step":
      state.step = Number(element.dataset.step);
      save();
      render();
      window.scrollTo(0, 0);
      break;
    case "no-site":
      document.querySelector('input[name="url"]').value = "";
      document.querySelector('form[data-form="discover"]').requestSubmit();
      break;
    case "demo":
      state = initialState();
      state.onboarded = true;
      state.brand.confirmed = true;
      state.missions.agencies = "active";
      state.missions.proof = "active";
      state.journal.unshift({
        text: "Espace de démonstration ouvert : 2 missions préparées, aucune diffusion.",
        date: new Date().toISOString(),
      });
      save();
      navigate("paul");
      break;
    case "paul":
      openPaul(element.dataset.context);
      break;
    case "close-modal":
      closeDialog("modal");
      break;
    case "close-paul":
      closeDialog("paul-dialog");
      break;
    case "chat-suggestion":
      chatReply(element.textContent.trim(), element.dataset.suggestion);
      break;
    case "dismiss-proposal":
      ui.proposal = null;
      state.messages.push({
        role: "paul",
        text: "Nous gardons le cap actuel. Aucun changement appliqué.",
        context: ui.context,
      });
      save();
      renderPaul();
      break;
    case "accept-proposal": {
      const proposal = ui.proposal;
      if (!proposal) return;
      if (proposal.kind === "revision") {
        if (ui.editorDrafts[proposal.document])
          throw new Error(
            "Enregistrez d'abord vos retouches dans le Studio, puis demandez une nouvelle proposition.",
          );
        commit({
          type: "revision",
          document: proposal.document,
          expectedVersion: proposal.expectedVersion,
          value: proposedRevision(proposal.document, proposal.variant),
        });
      } else
        commit({
          type: "strategy",
          priority: proposal.priority,
          preference: proposal.preference,
        });
      state.messages.push({
        role: "paul",
        text:
          proposal.kind === "revision"
            ? "La nouvelle version est prête dans le Studio. Rien n'est publié. Votre validation est à renouveler."
            : `Priorité mise à jour : ${missionDefinitions[proposal.priority].short}. Les missions déjà actives restent inchangées.`,
        context: ui.context,
      });
      ui.proposal = null;
      ui.selectedVersion = null;
      save();
      renderPaul();
      break;
    }
    case "filter":
      ui.filter = element.dataset.filter;
      render();
      break;
    case "start-mission":
      startMissionDialog(element.dataset.mission);
      break;
    case "pause-mission":
      openModal(
        "Mettre cette mission en pause ?",
        `<p>La préparation est suspendue. Les programmations de cette mission seront annulées. Les exécutions déjà effectuées restent dans l'historique.</p>`,
        `${button("close-modal", "Garder active")}${button("confirm-pause", "Confirmer la pause", "primary", "pause", `data-mission="${element.dataset.mission}"`)}`,
      );
      break;
    case "confirm-pause":
      commit({ type: "pause", mission: element.dataset.mission });
      closeDialog("modal");
      toast("Mission suspendue. Programmations annulées.");
      break;
    case "mission-inputs": {
      const id = element.dataset.mission;
      openModal(
        "Le périmètre retenu",
        `<div class="stack"><h3>${missionDefinitions[id].title}</h3><p>${id === "proof" ? "Une réalisation, une image illustrative, aucun témoignage ou chiffre d'économie inventé. Pour l'application finale, choisir un chantier réel et une photo autorisée." : id === "agencies" ? "Agence du Cours · contact@agence-du-cours.example\nMaison Sud · contact@maison-sud.example\n\nDeux emails individuels. Aucun contact supplémentaire ni relance automatique." : "8 contacts retenus sur 27 déclarés. Le fichier et la base légale sont à confirmer. Les destinataires de cet exemple sont fictifs."}</p>${badge(id === "leads" && !state.contactsConfirmed ? "Vérification requise" : "Périmètre de démonstration", "amber")}${paulButton(`Mission ${id}`, "Revoir le périmètre avec Paul")}</div>`,
      );
      break;
    }
    case "profile":
      openModal(
        "Corriger mon entreprise",
        `<form data-form="profile" class="stack"><div class="form-grid">${profileFields()}</div><div class="notice">${icon("info")}<p>Changer le nom crée de nouvelles versions à valider et annule les programmations existantes.</p></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer les corrections</button></form>`,
      );
      break;
    case "goal":
      openModal(
        "Ajuster mon ambition",
        `<form data-form="goal" class="stack">${goalFields()}<p class="muted small">Les missions actives ne changent pas automatiquement. Paul vous aide à réexaminer leur pertinence.</p><button class="btn primary" type="submit">${icon("check")}Confirmer ce cap</button></form>`,
      );
      break;
    case "source":
      sourceDialog(element.dataset.source);
      break;
    case "competitors":
      openModal(
        "Un échantillon à confirmer",
        `<p class="muted small">Acteurs fictifs pour illustrer le diagnostic. Ce n'est pas une étude du marché local réel.</p>${["ÉcoHabitat Provence", "Maison Thermique", "Confort Aix", "Rénovation du Sud", "Énergie Habitat"].map((name, index) => `<div class="row"><div><strong>${name}</strong><p>${index < 3 ? "Angle illustratif : aides et accompagnement" : "Angle illustratif : travaux et proximité"}</p></div>${badge("À confirmer", "amber")}</div>`).join("")}`,
        paulButton("La concurrence locale", "Affiner avec Paul"),
      );
      break;
    case "connect":
      connectionDialog(element.dataset.channel);
      break;
    case "disconnect":
      openModal(
        `Déconnecter ${channelLabel(element.dataset.channel)} ?`,
        "<p>Les contenus et validations seront conservés. Les programmations sur ce canal seront annulées et aucune nouvelle diffusion ne sera possible sans reconnexion.</p>",
        `${button("close-modal", "Annuler")}${button("confirm-disconnect", "Déconnecter", "danger", "unplug", `data-channel="${element.dataset.channel}"`)}`,
      );
      break;
    case "confirm-disconnect":
      commit({
        type: "channel",
        channel: element.dataset.channel,
        connected: false,
      });
      closeDialog("modal");
      toast("Canal déconnecté. Programmations annulées.");
      break;
    case "preview":
      ui.preview = element.dataset.preview;
      render();
      break;
    case "studio-tab":
      ui.studioTab = element.dataset.tab;
      render();
      break;
    case "select-version":
      ui.selectedVersion = Number(element.dataset.version);
      render();
      break;
    case "restore": {
      const version = state.documents[ui.document].versions.find(
        (item) => item.number === Number(element.dataset.version),
      );
      commit({
        type: "revision",
        document: ui.document,
        value: {
          ...version,
          note: `Restauration de V${version.number} par vous`,
        },
      });
      ui.selectedVersion = null;
      render();
      toast(
        "Version restaurée comme nouveau brouillon. Validation nécessaire.",
      );
      break;
    }
    case "compare": {
      const versions = state.documents[ui.document].versions.slice(-2);
      openModal(
        "Comparer les versions",
        `<div class="version-diff">${versions.map((version) => `<section><h3>Version ${version.number}</h3><p class="muted small">${escapeHTML(version.note)}</p>${ui.document === "post" ? artwork(version) : ""}<pre>${escapeHTML(version.title)}\n\n${escapeHTML(version.body)}</pre></section>`).join("")}</div>`,
      );
      break;
    }
    case "approve":
      approvalDialog();
      break;
    case "publish":
      publicationDialog();
      break;
    case "cancel-schedule":
      openModal(
        "Annuler cette programmation ?",
        "<p>Le contenu restera validé. Aucune diffusion n'a eu lieu ; vous pourrez choisir un autre moment.</p>",
        `${button("close-modal", "Conserver")}${button("confirm-cancel", "Annuler la programmation", "danger", "calendar-x")}`,
      );
      break;
    case "confirm-cancel":
      commit({ type: "cancel-schedule", document: ui.document });
      closeDialog("modal");
      toast("Programmation annulée, version conservée.");
      break;
    case "copy": {
      const doc = state.documents[ui.document];
      const version =
        doc.versions.find((item) => item.number === ui.selectedVersion) ||
        currentVersion(doc);
      try {
        await navigator.clipboard.writeText(
          `${version.title}\n\n${version.body}`,
        );
        toast("Texte copié.");
      } catch {
        openModal(
          "Le texte de votre production",
          `<label class="field"><span>Sélectionnez le texte pour le copier</span><textarea rows="12" readonly>${escapeHTML(version.title + "\n\n" + version.body)}</textarea></label>`,
        );
      }
      break;
    }
    case "report":
      openModal(
        "Votre bilan commercial",
        `<form data-form="report" class="stack"><p class="muted small">Déclaration du dirigeant, non attribuée automatiquement à une mission. Période : les 30 derniers jours.</p><div class="form-grid"><label class="field"><span>Demandes qualifiées</span><input name="leads" type="number" min="0" max="100000" required value="${state.report?.leads ?? 0}"></label><label class="field"><span>Rendez-vous</span><input name="meetings" type="number" min="0" max="100000" required value="${state.report?.meetings ?? 0}"></label><label class="field full"><span>CA signé (€)</span><input name="revenue" type="number" min="0" max="100000000" required value="${state.report?.revenue ?? 0}"></label></div><label class="field"><span>Origine des demandes et contexte</span><textarea name="note" maxlength="600" placeholder="Ex. Deux demandes via une recommandation…">${escapeHTML(state.report?.note || "")}</textarea></label><button class="btn primary" type="submit">${icon("save")}Enregistrer le bilan</button></form>`,
      );
      break;
    case "settings":
      openModal(
        "Mon espace",
        `<div class="stack"><div class="inline"><span class="avatar large">R</span><div><h3>Rémi · Dirigeant</h3><p class="muted small">${escapeHTML(state.profile.name)} · espace de démonstration</p></div></div><div class="row"><span>Règles de collaboration</span>${navButton("entreprise/canaux", "Gérer", "small", "settings-2")}</div><div class="row"><span>Votre ambition</span>${button("goal", "Modifier", "small", "pencil")}</div><div class="notice">${icon("hard-drive")}<p>Vos choix et échanges sont enregistrés uniquement dans ce navigateur. Aucune donnée n'est envoyée à une IA.</p></div>${button("reset", "Recommencer la première connexion", "danger", "rotate-ccw")}</div>`,
      );
      break;
    case "reset":
      openModal(
        "Recommencer la démonstration ?",
        "<p>Le profil, les échanges, les versions et les décisions de cette maquette seront effacés de ce navigateur. Aucun compte réel n'est concerné.</p>",
        `${button("close-modal", "Conserver mes choix")}${button("confirm-reset", "Recommencer", "danger", "rotate-ccw")}`,
      );
      break;
    case "confirm-reset":
      state = initialState();
      ui.scan = "idle";
      ui.proposal = null;
      ui.selectedVersion = null;
      ui.studioTab = "edit";
      ui.editorDrafts = {};
      save();
      closeDialog("modal");
      closeDialog("paul-dialog");
      navigate("paul");
      render();
      break;
  }
}

function goalFromForm(data) {
  return {
    growth: Number(data.get("growth")),
    months: Number(data.get("months")),
    budget: Number(data.get("budget")),
    time: Number(data.get("time")),
    capacity: Number(data.get("capacity")),
    hiring: !data.has("noHiring"),
    ...(data.has("statement")
      ? { statement: data.get("statement").trim() }
      : {}),
  };
}

async function handleForm(form) {
  const data = new FormData(form);
  const kind = form.dataset.form;
  switch (kind) {
    case "discover": {
      const name = data.get("name").trim();
      const url = data.get("url").trim();
      if (!name) throw new Error("Renseignez le nom de votre entreprise.");
      if (url && !/^https?:\/\//i.test(url))
        throw new Error(
          "Utilisez une adresse commençant par https:// ou http://.",
        );
      state = transition(state, { type: "profile", value: { name, url } });
      ui.scan = "running";
      save();
      render();
      setTimeout(() => {
        ui.scan = "ready";
        if (!state.onboarded && state.step === 1) render();
      }, 950);
      break;
    }
    case "understand":
    case "profile": {
      const profile = Object.fromEntries(
        ["name", "activity", "area", "clients", "offers"].map((key) => [
          key,
          data.get(key).trim(),
        ]),
      );
      if (Object.values(profile).some((value) => !value))
        throw new Error("Complétez chaque information avant de confirmer.");
      state = transition(state, { type: "profile", value: profile });
      if (kind === "understand") {
        state.brand.confirmed = data.has("brandConfirmed");
        state.step = 3;
      }
      save();
      render();
      closeDialog("modal");
      window.scrollTo(0, 0);
      if (kind === "profile")
        toast("Profil corrigé et productions actualisées.");
      break;
    }
    case "ambition":
    case "goal":
      state = transition(state, { type: "goal", value: goalFromForm(data) });
      if (kind === "ambition") state.step = 4;
      save();
      render();
      closeDialog("modal");
      window.scrollTo(0, 0);
      if (kind === "goal")
        toast("Cap mis à jour. Les missions actives restent inchangées.");
      break;
    case "finish":
      state.delegation = data.get("delegation");
      state = transition(state, { type: "onboard" });
      save();
      navigate("paul");
      render();
      break;
    case "brand":
      commit({
        type: "brand",
        value: {
          color: data.get("color"),
          accent: data.get("accent"),
          tone: data.get("tone"),
          confirmed: data.has("confirmed"),
        },
      });
      toast("Marque enregistrée. Nouvelle version du visuel à valider.");
      break;
    case "delegation":
      state.delegation = data.get("delegation");
      if (state.delegation === "prepare")
        Object.values(state.documents).forEach((doc) => {
          doc.scheduled = null;
        });
      state.journal.unshift({
        text: `Règle de collaboration mise à jour : ${delegationText()}.${state.delegation === "prepare" ? " Programmations annulées." : ""}`,
        date: new Date().toISOString(),
      });
      save();
      render();
      toast("Règles enregistrées.");
      break;
    case "start-mission":
      if (form.dataset.mission === "leads")
        state.contactsConfirmed = data.has("contacts");
      commit({ type: "start", mission: form.dataset.mission });
      closeDialog("modal");
      toast("Mission active. La préparation est autorisée, pas la diffusion.");
      break;
    case "connect":
      commit({
        type: "channel",
        channel: form.dataset.channel,
        connected: true,
      });
      closeDialog("modal");
      toast(
        "Connexion simulée confirmée. Aucune diffusion autorisée automatiquement.",
      );
      break;
    case "edit-document": {
      const documentId = form.dataset.document;
      const title = data.get("title").trim();
      const body = data.get("body").trim();
      if (!title || !body)
        throw new Error("L'accroche et le contenu ne peuvent pas être vides.");
      state = transition(state, {
        type: "revision",
        document: documentId,
        expectedVersion: Number(form.dataset.version),
        value: {
          title,
          body,
          ...(documentId === "post"
            ? {
                headline: title,
                layout: data.get("layout"),
                color: state.brand.color,
              }
            : {}),
          note: "Retouche directe par vous",
        },
      });
      delete ui.editorDrafts[documentId];
      save();
      ui.selectedVersion = null;
      render();
      toast("Nouvelle version enregistrée. Validation à renouveler.");
      break;
    }
    case "approve":
      commit({
        type: "approve",
        document: form.dataset.document,
        expectedVersion: Number(form.dataset.version),
        rights: data.has("rights"),
      });
      closeDialog("modal");
      toast("Version validée. Rien n'a été diffusé.");
      break;
    case "publish":
      commit({
        type: "publish",
        document: form.dataset.document,
        expectedVersion: Number(form.dataset.version),
        date: data.get("when") === "later" ? data.get("date") : null,
      });
      closeDialog("modal");
      toast(
        data.get("when") === "later"
          ? "Programmation simulée enregistrée. Aucun envoi automatique."
          : "Exécution simulée enregistrée dans Résultats.",
      );
      break;
    case "chat": {
      const message = data.get("message").trim();
      if (message) chatReply(message);
      break;
    }
    case "report":
      state.report = {
        leads: Number(data.get("leads")),
        meetings: Number(data.get("meetings")),
        revenue: Number(data.get("revenue")),
        note: data.get("note").trim(),
      };
      state.journal.unshift({
        text: `Bilan déclaré : ${state.report.leads} demandes, ${state.report.meetings} rendez-vous, ${state.report.revenue} € signés. Attribution non vérifiée.`,
        date: new Date().toISOString(),
      });
      save();
      render();
      closeDialog("modal");
      toast("Bilan enregistré. Paul peut vous aider à l'interpréter.");
      break;
  }
}

function initialize() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    state =
      saved?.schema === SEED_VERSION && saved.documents && saved.profile
        ? saved
        : initialState();
  } catch {
    state = initialState();
  }
  if (state.step > 1) ui.scan = "ready";
  window.addEventListener("hashchange", readRoute);
  document.addEventListener("click", (event) => {
    const element = event.target.closest("[data-action]");
    if (!element || element.disabled) return;
    if (element.dataset.action === "skip") event.preventDefault();
    handleAction(element).catch((error) => toast(error.message));
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const errorElement = form.querySelector(".form-error");
    if (errorElement) errorElement.textContent = "";
    handleForm(form).catch((error) => {
      if (errorElement) errorElement.textContent = error.message;
      else toast(error.message);
    });
  });
  document.addEventListener("change", (event) => {
    const element = event.target;
    if (element.id === "document-select") {
      ui.studioTab = "edit";
      navigate(`studio/${element.value}`);
    }
    if (element.name === "when") {
      const field = document.querySelector("#schedule-field");
      field.hidden = element.value !== "later";
      field.querySelector("input").disabled = element.value !== "later";
      field.querySelector("input").required = element.value === "later";
    }
    if (element.type === "file" && element.files[0]) {
      const documentId = ui.document;
      const expectedVersion = currentVersion(
        state.documents[documentId],
      ).number;
      const file = element.files[0];
      if (
        file.size > 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        toast("Choisissez un JPG, PNG ou WebP de moins de 1 Mo.");
        element.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          try {
            if (ui.editorDrafts[documentId])
              throw new Error(
                "Enregistrez le texte avant d'importer la photo.",
              );
            commit({
              type: "revision",
              document: documentId,
              expectedVersion,
              value: {
                photo: reader.result,
                note: "Photo importée par vous, droits à reconfirmer",
              },
            });
            if (ui.document === documentId) ui.selectedVersion = null;
            render();
            toast(
              "Photo ajoutée à la production d'origine dans une nouvelle version.",
            );
          } catch (error) {
            toast(error.message);
          }
        };
        image.onerror = () =>
          toast("Ce fichier ne contient pas une image lisible.");
        image.src = reader.result;
      };
      reader.onerror = () => toast("Impossible de lire ce fichier.");
      reader.readAsDataURL(file);
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.closest('form[data-form="edit-document"]')) {
      captureEditorDraft();
      refreshDraftPreview();
    }
    if (event.target.closest('form[data-form="ambition"]')) {
      const form = event.target.closest("form");
      document.querySelector("#goal-live").textContent =
        `+${form.elements.growth.value || "—"} % de chiffre d'affaires en ${form.elements.months.value || "—"} mois`;
    }
  });
  window.addEventListener("resize", () => { fitArtworkText(); syncMobileMenu(); });
  document.fonts.ready.then(fitArtworkText);
  window.addEventListener("beforeunload", (event) => {
    if (Object.keys(ui.editorDrafts).length) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.querySelector(".sidebar.open")) toggleMenu(false);
    }
    if (
      event.target.id === "paul-input" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      event.target.closest("form").requestSubmit();
    }
  });
  ["modal", "paul-dialog"].forEach((id) => {
    const dialog = document.getElementById(id);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close();
      }
    });
  });
  readRoute();
}

if (typeof window !== "undefined") initialize();
