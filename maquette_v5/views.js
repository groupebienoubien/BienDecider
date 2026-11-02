"use strict";

// Rendu des écrans de la maquette V5. Dépend de state.js et paul.js (portée globale).

let state;
const ui = {
  view: "paul",
  tab: "audit",
  mission: "agencies",
  document: "post",
  filter: "all",
  scan: "idle",
  scanStep: 0,
  scanTimer: null,
  selectedVersion: null,
  preview: "social",
  thread: "strategy",
  proposals: {},
  toastTimer: null,
  editorDrafts: {},
  returnTo: null,
  feedback: null,
  dialogDone: false,
  dialogTitle: "",
  viewSince: Date.now(),
};

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
const icon = (name) => `<i data-lucide="${name}" class="icon" aria-hidden="true"></i>`;
const badge = (text, tone = "", symbol = "") =>
  `<span class="badge ${tone}">${symbol ? icon(symbol) : ""}${escapeHTML(text)}</span>`;
const button = (action, text, tone = "", symbol = "", extra = "") =>
  `<button type="button" class="btn ${tone}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ""}${text}</button>`;
const navButton = (route, text, tone = "", symbol = "") =>
  button("navigate", text, tone, symbol, `data-route="${route}"`);
const paulButton = (context, text = "En discuter avec Paul", tone = "") =>
  button("paul", text, tone, "message-circle", `data-context="${escapeHTML(context)}"`);
const brandLogo = () =>
  `<div class="company-logo">${icon("house")}<span>${escapeHTML(state.profile.name)}</span></div>`;
const wordmark = () =>
  `<a href="#/paul" class="wordmark" aria-label="BienDecider, accueil"><span class="mark" aria-hidden="true">b.</span><span>Bien<em>Decider</em></span></a>`;
const formatDate = (date) =>
  new Date(date).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const statusText = (status) =>
  ({ proposed: "À décider", active: "En cours", paused: "En pause", stopped: "Arrêtée" })[status];
const delegationText = () =>
  ({ prepare: "Préparation seule", review: "Validation avant action", bounded: "Autonomie encadrée" })[state.delegation];
const goalText = () => `+${state.goal.growth} % de chiffre d'affaires en ${state.goal.months} mois`;
const firstInitial = () => (state.profile.firstName || "V").slice(0, 1).toUpperCase();
const plural = (count, one, many) => `${count} ${count > 1 ? many : one}`;
const agentClass = { Paul: "paul", "Jean-Claude": "jean", Camille: "camille", Martine: "martine" };

const AGENT_TEAM = [
  ["Martine", "martine", "Diagnostic & positionnement", "Relève les sources, la concurrence et les signaux. Sépare les faits des hypothèses."],
  ["Camille", "camille", "Contenus & visuels", "Décline votre marque. Prépare les textes et visuels, sans jamais les publier."],
  ["Jean-Claude", "jean", "Partenariats & prospection", "Choisit les cibles, rédige les premiers messages et prépare les prises de contact, sous vos règles."],
];

function gauge(label, value, max, text, over = false) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<div class="gauge ${over ? "over" : ""}"><div class="spread"><span class="small">${label}</span><strong class="small">${text}</strong></div><div class="gauge-bar" role="img" aria-label="${label} : ${text}"><span style="width:${percent}%"></span></div></div>`;
}

function capacityPanel() {
  const load = capacityLoad(state);
  const none = !load.plannedMinutes;
  return `<section class="panel capacity" aria-label="Votre capacité"><h3>${icon("gauge")} Votre capacité</h3>${gauge("Temps réservé, pic par semaine", load.hours, load.hoursMax, `${formatHours(load.hours)} sur ${formatHours(load.hoursMax)}`, load.overTime)}${gauge("Temps déjà consommé", load.usedMinutes, load.plannedMinutes, none ? "Aucune mission en cours" : `${formatMinutes(load.usedMinutes)} sur ${formatMinutes(load.plannedMinutes)} prévus`)}${gauge("Projets clients possibles", load.projects, load.projectsMax, `${load.projects} sur ${load.projectsMax}`, load.overProjects)}${load.overTime ? `<div class="notice amber">${icon("triangle-alert")}<p>Vos missions en cours demandent plus de temps que vous n'en avez réservé. Mettez-en une en pause ou ajustez votre temps disponible.</p></div>${button("goal", "Ajuster mon temps", "small", "pencil")}` : ""}</section>`;
}

function journeyTracker(id) {
  return `<ol class="journey" aria-label="Avancement de la mission ${escapeHTML(missionDefinitions[id].short)}">${journeyProgress(state, id)
    .map((step, index) => `<li class="${step.state}" ${step.state === "current" ? 'aria-current="step"' : ""}><span>${step.state === "done" ? icon("check") : index + 1}</span>${step.label}</li>`)
    .join("")}</ol>`;
}

function nextStepCard(step) {
  let cta = "";
  if (step.route) cta = navButton(step.route, step.label, "primary", "arrow-right");
  else if (step.action === "connect") cta = button("connect", step.label, "primary", "plug", `data-channel="${step.channel}"`);
  else if (step.action === "report") cta = button("report", step.label, "primary", "pencil", `data-mission="${step.mission}"`);
  else if (step.action === "decide-next") cta = button("decide-next", step.label, "primary", "git-fork", `data-mission="${step.mission}"`);
  else cta = paulButton("idea:new", step.label, "primary");
  return `<article class="next-step"><span class="eyebrow">LE PROCHAIN PAS${step.mission ? ` · ${escapeHTML(missionDefinitions[step.mission].short.toUpperCase())}` : ""}</span><h2>${step.title}</h2><p>${step.detail}</p><div class="actions">${cta}${paulButton(step.mission ? `mission:${step.mission}` : "strategy", "En discuter avec Paul", "text")}</div></article>`;
}

function journalHTML(limit = 12) {
  if (!state.journal.length) return '<p class="muted">Aucune décision enregistrée pour le moment.</p>';
  return `<div class="timeline">${state.journal
    .slice(0, limit)
    .map((item) => {
      const actor = item.actor || "vous";
      const cls = agentClass[actor] || (actor === "vous" ? "company" : "");
      const initial = actor === "vous" ? firstInitial() : actor === "Système" || actor === "système" ? "S" : actor[0];
      const who = actor === "vous" ? "Vous" : actor;
      return `<div class="timeline-item"><span class="avatar ${cls}" title="${escapeHTML(who)}">${initial}</span><strong>${escapeHTML(item.text)}</strong><p>${who} · ${formatDate(item.date)}</p></div>`;
    })
    .join("")}</div>`;
}

/* ---------- Page de découverte (concept) ---------- */

function landing() {
  const hasSpace = state.onboarded;
  const start = hasSpace
    ? navButton("paul", "Retourner à mon espace", "primary big", "arrow-right")
    : button("begin", "C'est parti", "primary big", "arrow-right");
  const team = [
    ["Paul", "paul", "fixe le cap avec vous et décide des priorités"],
    ["Martine", "martine", "analyse votre présence en ligne et vos concurrents"],
    ["Camille", "camille", "écrit vos messages et prépare vos visuels"],
    ["Jean-Claude", "jean", "trouve des partenaires et des clients à contacter"],
  ];
  const plan = [
    ["Camille", "camille", "Faire parler vos réalisations", "Un chantier documenté, publié sur votre Page Facebook."],
    ["Jean-Claude", "jean", "Ouvrir la porte des agences locales", "Un message individuel à deux agences, sans relance automatique."],
    ["Jean-Claude", "jean", "Renouer avec d'anciens prospects", "Huit contacts recontactables, vérifiés avant tout envoi."],
  ];
  const control = [
    ["Vous fixez l'objectif", "« +20 % de chiffre d'affaires en 12 mois, sans embaucher » : Paul construit le plan à partir de votre but, pas d'une liste de conseils."],
    ["Vous relisez chaque contenu", "Un contenu à la fois : vous validez, vous modifiez ou vous refusez. Une fois diffusé, il ne bouge plus : toute retouche crée une nouvelle version."],
    ["Rien ne part sans vous", "Chaque publication ou envoi attend votre confirmation explicite. Connecter un compte ne déclenche jamais rien."],
  ];
  const steps = [
    "Vous présentez votre entreprise et votre cap",
    "Paul propose trois missions ; vous en lancez dans la limite de votre temps",
    "Un contenu est préparé dans l'atelier",
    "Vous le relisez, le validez, puis confirmez la diffusion",
    "Vous notez les résultats obtenus",
    "Vous décidez : poursuivre, adapter ou arrêter",
  ];
  return `<div class="landing"><header class="landing-top">${wordmark()}<div class="actions">${hasSpace ? navButton("paul", "Mon espace", "small", "arrow-right") : ""}</div></header>
  <main id="main" tabindex="-1">
    <section class="landing-hero" aria-labelledby="promesse"><span class="eyebrow">L'ÉQUIPE IA DES INDÉPENDANTS ET DES TPE</span><h1 id="promesse">Vous décidez.<br>Votre activité avance.</h1><p>Paul et son équipe préparent le travail pour atteindre votre objectif : plan, messages, visuels, prospection. Vous gardez le dernier mot.</p><div class="actions center">${start}</div><small class="muted">Aucun compte à créer. Aucun envoi réel. Vos choix restent dans ce navigateur.</small></section>
    <section class="landing-team" aria-labelledby="equipe"><h2 id="equipe" class="sr-only">L'équipe qui prépare le travail</h2><ul class="team-grid">${team.map(([name, cls, does]) => `<li><span class="avatar large ${cls}">${name[0]}</span><strong>${name}</strong><span class="small muted">${does}</span></li>`).join("")}</ul></section>
    <section class="landing-band" aria-labelledby="exemple"><span class="eyebrow">UN EXEMPLE CONCRET</span><h2 id="exemple">Une entreprise de rénovation qui veut plus de projets</h2><p class="muted">Objectif : <strong>+20 % de chiffre d'affaires en 12 mois</strong>, avec 2 h par semaine.</p><div class="equal-col landing-example"><div><h3>Le plan proposé par Paul</h3><ol class="plan-list">${plan.map(([owner, cls, title, detail], index) => `<li><span class="task-num">${index + 1}</span><div><strong>${title}</strong><p>${detail} <span class="agent-tag ${cls}">· ${owner}</span></p></div></li>`).join("")}</ol></div><div><h3>Ce que Camille vous propose</h3><div class="landing-sample"><p class="inline small"><span class="avatar camille">C</span><span><strong>Camille</strong> propose un post Facebook</span></p><p>Un projet de rénovation commence par une maison que l'on connaît et des priorités bien définies. Parlons de votre projet.</p><p class="small muted">Vous validez le texte, puis confirmez sa publication sur votre Page.</p></div></div></div></section>
    <section class="landing-band" aria-labelledby="controle"><h2 id="controle">Vous gardez la main</h2><ul class="three-col control-list">${control.map(([title, text]) => `<li class="panel"><h3>${title}</h3><p class="small muted">${text}</p></li>`).join("")}</ul></section>
    <section class="landing-band" aria-labelledby="parcours"><span class="eyebrow">VOTRE TEST, DE BOUT EN BOUT</span><h2 id="parcours">Six étapes, une seule boucle</h2><ol class="landing-steps">${steps.map((text, index) => `<li><span class="task-num">${index + 1}</span>${text}</li>`).join("")}</ol></section>
    <section class="landing-band reality" aria-labelledby="reel"><h2 id="reel">Ce que vous jugez, ce qui est simulé</h2><div class="equal-col"><div class="panel"><h3>${icon("badge-check")} Réel : c'est ce que vous jugez</h3><ul class="list-clean small"><li>${icon("check")}La logique du parcours et ses garde-fous (temps, validation, droits, verrouillage)</li><li>${icon("check")}Vos saisies : prénom, entreprise, ambition, règles, périmètre</li><li>${icon("check")}Le journal de vos décisions</li></ul></div><div class="panel"><h3>${icon("flask-conical")} Simulé : des données d'exemple</h3><ul class="list-clean small"><li>${icon("circle-help")}L'analyse du site, le diagnostic et la concurrence</li><li>${icon("circle-help")}Les agences, les contacts et les adresses (toutes en .example)</li><li>${icon("circle-help")}Les canaux, les envois, les programmations et les résultats</li></ul></div></div></section>
    <section class="landing-final" aria-labelledby="commencer"><h2 id="commencer">Quel est votre objectif ?</h2><p class="muted">Dites-le à Paul. L'équipe s'occupe du reste, vous décidez.</p><div class="actions center">${start}</div></section>
  </main><footer class="landing-foot small muted">Maquette V5 · Données et envois simulés · Aucun envoi réel</footer></div>`;
}

/* ---------- Première connexion ---------- */

function profileFields(mode = "full") {
  const fields = [
    ["firstName", "Votre prénom", "input"],
    ["name", "Entreprise", "input"],
    ["activity", "Activité", "input"],
    ["area", "Zone d'intervention", "area"],
    ["clients", "Clients prioritaires", "area"],
    ["offers", "Offres principales", "area"],
  ].filter(([key]) => (mode === "essential" ? ["activity", "area", "clients"].includes(key) : mode === "refine" ? key === "offers" : true));
  return fields
    .map(([key, title, kind]) => {
      const hint =
        key === "firstName"
          ? "Ce que Paul utilisera pour vous parler"
          : key === "clients"
            ? "Hypothèse à confirmer"
            : key === "offers" && !state.profile.offersRefined
              ? "À affiner : première lecture, non vérifiée"
              : state.profile.url
                ? "Prérempli depuis le relevé d'exemple"
                : "À renseigner par vous";
      const control =
        kind === "area"
          ? `<textarea name="${key}" rows="2" required maxlength="100">${escapeHTML(state.profile[key])}</textarea>`
          : `<input name="${key}" value="${escapeHTML(state.profile[key])}" required maxlength="100" ${key === "firstName" ? 'autocomplete="given-name"' : ""}>`;
      return `<label class="field"><span>${title}</span>${control}<small>${hint}</small></label>`;
    })
    .join("");
}

function goalFields() {
  const field = (key, label, hint = "") => {
    const limit = GOAL_LIMITS[key];
    return `<label class="field"><span>${label}</span><input name="${key}" type="number" min="${limit.min}" max="${limit.max}" required value="${state.goal[key]}"><small>Usuel : ${limit.usual} · plafond ${limit.max} ${limit.unit}${hint ? ` · ${hint}` : ""}</small></label>`;
  };
  return `<div class="form-grid">${field("growth", "Croissance du CA visée (%)")}${field("months", "Horizon (mois)")}${field("budget", "Budget média maximum (€/mois)", "aucune dépense sans votre accord")}${field("time", "Votre temps disponible (h/semaine)")}${field("capacity", "Projets clients que vous pouvez prendre en plus", "sur les 30 prochains jours")}<label class="check" style="align-self:center"><input type="checkbox" name="noHiring" ${!state.goal.hiring ? "checked" : ""}>Sans recrutement</label></div>`;
}

function delegationChoices() {
  return `<div class="stack-sm">${[
    ["prepare", "Préparer seulement", "Paul analyse et prépare. Vous récupérez les contenus et diffusez vous-même."],
    ["review", "Valider avant chaque action", "Paul prépare, vous validez la version, puis confirmez chaque envoi ou publication."],
    ["bounded", "Déléguer dans un cadre précis", "Analyses et brouillons autonomes dans les missions en cours. Publications, premiers contacts et dépenses restent à confirmer."],
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
  if (state.step === 1) {
    const scanLabels = ["Site et offres", "Informations publiques", "Zone et clients", "Identité visuelle"];
    const running = ui.scan === "running";
    content = `<div class="onboard-title"><span class="eyebrow">FAISONS CONNAISSANCE</span><h1>Votre entreprise.<br>Notre point de départ.</h1><p>Commençons par ce qui existe déjà.</p></div><div class="brief"><span class="avatar paul">P</span><p><strong>Bonjour, je suis Paul.</strong> Dites-moi votre prénom, le nom de votre entreprise et son site. Je vous proposerai une première lecture, à corriger ensemble.</p></div>
    <section class="reality-card" aria-label="Réel et simulé"><div><strong class="small">${icon("badge-check")} Réel : ce que vous jugez</strong><p>La logique du parcours, les garde-fous et vos propres saisies.</p></div><div><strong class="small">${icon("flask-conical")} Simulé : des données d'exemple</strong><p>Analyse du site, agences, contacts, canaux, envois et résultats.</p></div></section>
    <form data-form="discover" class="stack">
      <div class="form-grid"><label class="field"><span>Votre prénom</span><input name="firstName" required maxlength="40" autocomplete="given-name" value="${escapeHTML(state.profile.firstName)}"></label><label class="field"><span>Nom de l'entreprise</span><input name="name" required maxlength="100" autocomplete="organization" value="${escapeHTML(state.profile.name)}"></label></div>
      <label class="field"><span>Site internet <span class="muted">· facultatif</span></span><input name="url" type="url" placeholder="https://votre-entreprise.fr" value="${escapeHTML(state.profile.url)}"><small>Aucun mot de passe ni accès privé nécessaire.</small></label>
      <details class="refine"><summary>Je participe à une session de test</summary><label class="field"><span>Identifiant de session <span class="muted">· facultatif</span></span><input name="sessionId" maxlength="30" placeholder="Ex. T-014" value="${escapeHTML(state.session.id)}"><small>Relie vos retours à cette session. Ne saisissez pas de nom ni de coordonnées.</small></label></details>
      <div class="form-error" role="alert"></div>
      ${ui.scan === "idle" ? `<div class="actions"><button class="btn primary" type="submit">${icon("scan-line")}Découvrir mon entreprise</button>${button("no-site", "Je n'ai pas de site", "text")}</div>` : `<div class="analysis"><progress max="4" value="${ui.scanStep}" aria-label="Avancement de la lecture"></progress><div>${scanLabels.map((label, index) => { const done = ui.scanStep > index; return `<div class="row">${icon(done ? "circle-check" : index === ui.scanStep && running ? "loader-circle" : "circle")}<span>${label}</span>${index === 0 && !state.profile.url ? badge("Non disponible", "amber") : badge(done ? "Relevé d'exemple" : "En cours", done ? "green" : "")}</div>`; }).join("")}</div></div>${button("step", "Vérifier ce que Paul a compris", "primary", "arrow-right", 'data-step="2"')}`}
    </form><div class="trust-note">${icon("shield-check")}Aucun compte connecté. Aucune action extérieure.</div><div class="onboard-bottom"><small>Données illustratives, aucune analyse web réelle.</small>${button("demo", "Explorer l'espace de démonstration", "text", "arrow-up-right")}</div>`;
  }
  if (state.step === 2)
    content = `<div class="onboard-title"><span class="eyebrow">UN PORTRAIT À VALIDER ENSEMBLE</span><h1>Est-ce bien vous, ${escapeHTML(state.profile.firstName || "")} ?</h1><p>Trois informations suffisent pour démarrer. Corrigez ce qui doit l'être, le reste s'affine plus tard.</p></div><div class="equal-col"><form data-form="understand" class="stack"><div class="stack">${profileFields("essential")}</div><details class="refine"><summary>À affiner plus tard <span class="badge amber">1 point</span></summary><div class="stack" style="margin-top:12px">${profileFields("refine")}</div></details><div class="notice amber">${icon("circle-help")}<p>5 concurrents potentiels repérés dans l'exemple. Leur pertinence reste à confirmer dans le diagnostic.</p></div><label class="check"><input type="checkbox" name="brandConfirmed" ${state.brand.confirmed ? "checked" : ""}>Cette palette correspond à mon entreprise.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">Confirmer ces informations ${icon("arrow-right")}</button></form><aside class="stack">${sourcePreview()}<p class="muted small">La marque reste modifiable dans Entreprise. Aucun témoignage, label ou résultat commercial n'est déduit automatiquement.</p></aside></div>`;
  if (state.step === 3)
    content = `<div class="onboard-title"><span class="eyebrow">DE L'ENVIE À UN CAP CONCRET</span><h1>Qu'aimeriez-vous changer ?</h1><p>Un objectif utile tient aussi compte de votre temps et de votre capacité. Les repères indiquent les valeurs usuelles.</p></div><form data-form="ambition" class="stack"><label class="field"><span>Votre ambition, avec vos mots</span><textarea name="statement" maxlength="600" rows="2">${escapeHTML(state.goal.statement || "Je voudrais augmenter mon chiffre d'affaires de 20 % cette année, sans embaucher.")}</textarea></label>${goalFields()}<div class="goal-summary"><span class="eyebrow">LE CAP PROPOSÉ</span><strong id="goal-live">${goalText()}</strong><p>Le point de départ et la marge seront à préciser. C'est une cible, pas une promesse de résultat.</p></div><div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">Confirmer mon ambition ${icon("arrow-right")}</button>${paulButton("ambition", "En discuter avec Paul")}</div><small class="muted">« En discuter » ouvre la conversation avec Paul sans rien modifier : vous revenez ensuite à ce formulaire.</small></form>`;
  if (state.step === 4)
    content = `<div class="onboard-title"><span class="eyebrow">UNE COLLABORATION CLAIRE</span><h1>À vous de fixer le cadre.</h1><p>Je coordonne l'équipe. Vous gardez la maîtrise de ce qui engage votre entreprise.</p></div><form data-form="finish" class="stack">${delegationChoices()}<div class="notice green">${icon("shield-check")}<p>Aucun canal n'est connecté pour le moment. La création de votre espace ne lance aucune mission.</p></div><div class="row"><div><strong>${escapeHTML(state.profile.name)}</strong><p>${goalText()} · ${state.goal.time} h/semaine · ${state.goal.budget} € média max.</p></div>${button("step", "Modifier", "small", "pencil", 'data-step="3"')}</div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">Créer mon espace ${icon("arrow-right")}</button></form>`;
  return `<div class="onboarding"><aside class="onboard-side">${wordmark()}<h2>Faisons avancer<br>votre entreprise.</h2><p>Un cap clair. Des actions utiles.<br>Paul à vos côtés.</p><ol class="steps">${steps.map(([title, detail], index) => `<li class="${state.step === index + 1 ? "active" : state.step > index + 1 ? "done" : ""}" ${state.step === index + 1 ? 'aria-current="step"' : ""}><span>${state.step > index + 1 ? icon("check") : index + 1}</span><div><strong>${title}</strong><small>${detail}</small></div></li>`).join("")}</ol><footer>Maquette V5 · Données d'exemple<br>Vos choix restent dans ce navigateur.</footer></aside><main id="main" class="onboard-main" tabindex="-1"><div class="onboard-top">${state.step > 1 ? button("step", "Retour", "text", "arrow-left", `data-step="${state.step - 1}"`) : navButton("decouvrir", "Revoir le concept", "text", "arrow-left")}<span class="small muted">${state.step} sur 4</span></div><div class="onboard-content ${state.step !== 2 ? "narrow" : ""}">${content}</div></main></div>`;
}

/* ---------- Coquille de l'espace ---------- */

const PAGES = [
  ["paul", "Avec Paul", "messages-square"],
  ["missions", "Missions", "flag"],
  ["atelier", "Atelier", "panels-top-left"],
  ["entreprise", "Entreprise", "building-2"],
  ["resultats", "Résultats", "chart-no-axes-combined"],
];

function pageContext() {
  if (ui.view === "atelier") return `atelier:${ui.document}`;
  if (ui.view === "missions" && location.hash.split("/")[2]) return `mission:${ui.mission}`;
  if (ui.view === "resultats") return "results";
  return "strategy";
}

function shell(content) {
  const active = PAGES.find(([key]) => key === ui.view) || PAGES[0];
  const load = capacityLoad(state);
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `<div class="mobile-nav-overlay" data-action="menu-close"></div><aside class="sidebar" aria-label="Navigation principale">${wordmark()}<div class="workspace-switch"><span class="avatar company">${escapeHTML(state.profile.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHTML(state.profile.name)}</strong><small>Espace de ${escapeHTML(state.profile.firstName)}</small></div></div><nav aria-label="Pages">${PAGES.map(([key, title, symbol]) => `<button class="nav-item ${key === ui.view ? "active" : ""}" data-action="navigate" data-route="${key}" ${key === ui.view ? 'aria-current="page"' : ""}>${icon(symbol)}${title}${key === "missions" ? `<span class="count" aria-label="${Object.values(state.missions).filter((value) => value === "active").length} en cours">${Object.values(state.missions).filter((value) => value === "active").length}</span>` : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="goal-mini"><span class="eyebrow">VOTRE CAP</span><strong>+${state.goal.growth} % de CA</strong><small class="muted">${state.goal.months} mois · ${state.goal.hiring ? "Recrutement possible" : "Sans recruter"}</small><div class="goal-line"><span></span></div><small class="muted">Temps réservé : ${formatHours(load.hours)} sur ${formatHours(load.hoursMax)} par semaine</small></div><button class="nav-item" data-action="settings">${icon("settings-2")}Mon espace</button><button class="nav-item" data-action="reset">${icon("rotate-ccw")}Revoir la première connexion</button><div class="inline" style="margin-top:15px"><span class="avatar">${firstInitial()}</span><div><strong class="small">${escapeHTML(state.profile.firstName)}</strong><div class="muted small">Dirigeant</div></div></div><p class="demo-label">Maquette V5 · Données d'exemple</p></div></aside><div class="app-main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Ouvrir le menu">${icon("menu")}</button><div class="breadcrumb"><span>Votre espace</span>${icon("chevron-right")}<strong>${active[1]}</strong></div><div class="actions"><span class="small muted date">${date}</span>${state.session.id ? `<span class="badge">Session ${escapeHTML(state.session.id)}</span>` : ""}<span class="badge demo-top">Démonstration</span>${paulButton(pageContext(), "Parler à Paul", "primary")}</div></header><main id="main" class="page ${ui.animate ? "enter" : ""}" tabindex="-1">${content}<footer class="page-footer"><span>Maquette interactive · Données et envois simulés · Aucun envoi réel</span><span>Vos choix sont enregistrés sur cet appareil.</span></footer></main></div>`;
}

function pageHead(title, description, eyebrow = "", action = "") {
  return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1><p>${description}</p></div>${action ? `<div class="actions">${action}</div>` : ""}</div>`;
}

/* ---------- Accueil : Avec Paul ---------- */

function paulBrief() {
  const def = missionDefinitions[state.priority];
  const active = Object.values(state.missions).filter((value) => value === "active").length;
  if (!active && !state.publications.length)
    return `J'ai croisé votre ambition (${goalText()}) avec les premiers constats. Avec <strong>${state.goal.capacity} projets clients possibles</strong> et <strong>${state.goal.time} h par semaine</strong>, je recommande un test ciblé avant d'élargir : <strong>${def.short}</strong>. ${state.preference === "time" ? "Vous avez choisi de privilégier le temps gagné." : "Les résultats nous diront ce qu'il faut poursuivre."}`;
  const load = capacityLoad(state);
  return `Nous avançons avec un cadre clair : ${plural(active, "mission en cours", "missions en cours")}, ${formatHours(load.hours)} par semaine réservées sur ${formatHours(load.hoursMax)}. ${load.overTime ? "Attention : c'est au-dessus de votre temps disponible." : "Votre temps est respecté."}`;
}

function validationList() {
  const rows = [
    ...Object.entries(state.documents)
      .filter(([id, item]) => state.missions[item.mission] === "active" && !item.scheduled && !isDiffused(state, id, currentVersion(item).number))
      .map(([id, item]) => {
        const validated = item.approved === currentVersion(item).number;
        return `<div class="decision">${icon("file-check-2")}<div><strong class="small">${missionDefinitions[item.mission].short} · ${validated ? "validé" : "prêt"}</strong><p>V${currentVersion(item).number} · ${validated ? "Validé, pas encore diffusé" : "Votre regard avant toute action"}</p>${navButton(`atelier/${id}`, "Examiner", "text", "arrow-up-right")}</div></div>`;
      }),
    ...Object.entries(state.documents)
      .filter(([, item]) => item.scheduled)
      .map(([id, item]) => `<div class="decision">${icon("calendar-clock")}<div><strong class="small">Programmé · ${escapeHTML(currentVersion(item).title)}</strong><p>${channelLabel(item.channel)} · ${formatDate(item.scheduled)}</p>${navButton(`atelier/${id}`, "Gérer", "text", "arrow-up-right")}</div></div>`),
    !state.brand.confirmed
      ? `<div class="decision">${icon("palette")}<div><strong class="small">Votre identité visuelle</strong><p>La palette détectée vous ressemble-t-elle ?</p>${navButton("entreprise/marque", "Confirmer ma marque", "text", "arrow-up-right")}</div></div>`
      : "",
  ].filter(Boolean);
  const connected = Object.values(state.channels).filter(Boolean).length;
  rows.push(`<div class="decision">${icon("plug")}<div><strong class="small">${connected ? plural(connected, "canal connecté", "canaux connectés") : "Aucun canal connecté"}</strong><p>Les autorisations sont distinctes des validations de contenu.</p>${navButton("entreprise/canaux", "Gérer les connexions", "text", "arrow-up-right")}</div></div>`);
  return rows.join("");
}

function paulPage() {
  const step = nextStep(state);
  const focus = step.mission || state.priority;
  const evidence = [
    ["4 réalisations visibles", "Observation", "green", "missions/proof"],
    ["6 agences dans la zone", "Piste à qualifier", "amber", "missions/agencies"],
    [`${state.contacts.length} contacts ${state.contactsSource === "import" ? "importés" : "déclarés"}`, state.contactsConfirmed ? "Échantillon confirmé" : "À vérifier", state.contactsConfirmed ? "green" : "amber", "missions/leads"],
  ];
  return `${pageHead(`Bonjour ${escapeHTML(state.profile.firstName)}.`, "Votre cap reste le même. Voici où vous en êtes et le prochain pas qui compte.", "VOTRE POINT AVEC PAUL", navButton("entreprise/audit", "Voir mon diagnostic", "", "scan-eye"))}
  <div class="brief"><span class="avatar paul large">P</span><p>${paulBrief()}</p></div>
  <div class="two-col section-space"><section class="stack">${nextStepCard(step)}<div><div class="section-heading"><h2>Où en est la mission</h2>${badge(missionDefinitions[focus].short, "blue")}</div>${journeyTracker(focus)}</div>${capacityPanel()}</section>
  <aside><div class="section-heading"><div><h2>À valider par vous</h2><p class="small muted">Valider un contenu n'est pas une décision de direction.</p></div></div>${validationList()}<div class="section-heading section-space"><h2>Vos missions</h2></div>${Object.keys(missionDefinitions).map((id) => `<div class="row"><div><strong class="small">${missionDefinitions[id].short}</strong><p>${scopeSummary(state, id)}</p></div>${badge(statusText(state.missions[id]), state.missions[id] === "active" ? "green" : "amber")}</div>`).join("")}</aside></div>
  <section class="section-space"><div class="section-heading"><h2>Sur quoi je m'appuie</h2>${navButton("entreprise/audit", "Voir le diagnostic complet", "text", "arrow-right")}</div><div class="three-col">${evidence.map(([text, level, tone, route]) => `<div class="panel evidence"><strong class="small">${text}</strong><div>${badge(level, tone)}</div>${navButton(route, "Voir la mission liée", "text", "arrow-right")}</div>`).join("")}</div></section>
  <section class="section-space"><div class="section-heading"><h2>En coulisses, une équipe. Avec vous, Paul.</h2>${navButton("entreprise/equipe", "Voir les contributions", "text", "arrow-right")}</div><div class="three-col">${AGENT_TEAM.map(([name, cls, role, description]) => `<div class="inline"><span class="avatar ${cls}">${name[0]}</span><div><strong class="small">${name} · ${role}</strong><p class="muted small">${description}</p></div></div>`).join("")}</div></section>`;
}

/* ---------- Missions ---------- */

function missionCard(id) {
  const def = missionDefinitions[id];
  const stage = journeyStage(state, id);
  const used = timeUsed(state, id);
  return `<article class="mission-card info"><div class="mission-card-body"><div class="spread">${badge(statusText(state.missions[id]), state.missions[id] === "active" ? "green" : "amber")}${state.priority === id ? badge("Priorité de Paul", "blue") : ""}</div><h2>${def.title}</h2><p>${def.evidence}</p><dl class="facts"><div><dt>Périmètre</dt><dd>${escapeHTML(scopeSummary(state, id))}</dd></div><div><dt>Votre temps</dt><dd>${def.time}${["active", "paused", "stopped"].includes(state.missions[id]) ? ` · consommé : ${formatMinutes(used)}` : ""}</dd></div><div><dt>Étape</dt><dd>${nextStepLabel(stage)}</dd></div></dl>${journeyTracker(id)}<div class="target">${icon("target")} ${def.target}</div><div class="inline"><span class="avatar ${def.ownerClass}">${def.owner[0]}</span><span class="small muted">Paul coordonne ${def.owner}</span></div><div class="actions">${navButton(`missions/${id}`, state.missions[id] === "proposed" ? "Examiner et lancer" : "Voir la mission", state.priority === id ? "primary" : "", "arrow-up-right")}</div></div></article>`;
}

function missionsPage() {
  if (location.hash.split("/")[2]) return missionDetail();
  const ids = [state.priority, ...Object.keys(missionDefinitions).filter((id) => id !== state.priority)].filter((id) => ui.filter === "all" || state.missions[id] === ui.filter);
  const filters = [["all", "Toutes"], ["active", "En cours"], ["proposed", "À décider"], ["paused", "En pause"], ["stopped", "Arrêtées"]];
  return `${pageHead("Des missions, pas une liste de tâches.", "Chaque mission relie un constat, un périmètre que vous choisissez, un résultat attendu et le temps qu'elle vous demande.", goalText(), paulButton("idea:new", "Explorer une idée"))}
  <div class="two-col"><div><nav class="tabs" aria-label="Filtrer les missions">${filters.map(([value, title]) => `<button class="${ui.filter === value ? "active" : ""}" aria-pressed="${ui.filter === value}" data-action="filter" data-filter="${value}">${title} ${value === "all" ? 3 : Object.values(state.missions).filter((status) => status === value).length}</button>`).join("")}</nav>${ids.length ? `<div class="mission-grid">${ids.map(missionCard).join("")}</div>` : `<div class="empty">${icon("flag")}<h2>Aucune mission dans cette vue</h2><p>Les propositions restent disponibles dans Toutes.</p>${button("filter", "Voir les propositions", "", "arrow-right", 'data-filter="all"')}</div>`}</div><aside class="stack">${capacityPanel()}<div class="notice">${icon("shield-check")}<p><strong>${delegationText()}.</strong> Une mission en cours autorise la préparation, pas un envoi implicite. Budget média : ${state.goal.budget} €/mois maximum, aucune dépense engagée.</p></div></aside></div>
  ${state.ideas.length ? `<section class="section-space"><div class="section-heading"><h2>Vos idées à cadrer</h2><span class="small muted">Notées avec Paul, pas encore des missions</span></div>${state.ideas.map((idea) => `<div class="row"><div><strong class="small">${escapeHTML(idea.text)}</strong><p>Notée le ${formatDate(idea.date)} · à cadrer : périmètre, temps, risque</p></div>${button("drop-idea", "Écarter", "small", "trash-2", `data-id="${idea.id}"`)}</div>`).join("")}</section>` : ""}`;
}

function scopeEditor(id) {
  const lock = scopeLock(state, id);
  const disabled = lock ? "disabled" : "";
  let body = "";
  if (id === "agencies")
    body = `<fieldset ${disabled}><legend>Agences à contacter · 1 ou ${AGENCIES_MAX} sur ${AGENCIES.length}</legend><div class="pick-list">${AGENCIES.map((agency) => `<label class="pick"><input type="checkbox" name="agency" value="${agency.id}" ${state.scope.agencies.ids.includes(agency.id) ? "checked" : ""}><span><strong>${agency.name}</strong><small>${agency.note} · ${agency.email}</small></span></label>`).join("")}</div></fieldset><p class="small muted pick-count" aria-live="polite">${state.scope.agencies.ids.length} sur ${AGENCIES_MAX} choisies</p>`;
  else if (id === "leads") {
    const eligible = eligibleContacts(state).length;
    body = `<fieldset ${disabled}><legend>Contacts à recontacter · 1 à ${LEADS_MAX} parmi ${eligible} recontactables sur ${state.contacts.length}</legend><div class="actions" style="margin-bottom:10px">${button("select-recent", `Choisir les ${LEADS_MAX} plus récents`, "small", "list-checks", lock ? "disabled" : "")}${button("import-contacts", "Importer un fichier", "small", "upload", lock ? "disabled" : "")}<span class="small muted">${state.contactsSource === "import" ? "Fichier importé (simulation)" : "Liste déclarée à Paul"}</span></div><div class="contact-list">${state.contacts.map((contact) => { const status = contactStatus(contact); return `<label class="pick ${status.ok ? "" : "off"}"><input type="checkbox" name="contact" value="${contact.id}" ${state.scope.leads.ids.includes(contact.id) ? "checked" : ""} ${status.ok ? "" : "disabled"}><span><strong>${escapeHTML(contact.name)}</strong><small>${escapeHTML(contact.email)} · il y a ${contact.monthsAgo} mois</small></span>${badge(status.reason, status.ok ? "green" : "amber")}</label>`; }).join("")}</div></fieldset><p class="small muted pick-count" aria-live="polite">${state.scope.leads.ids.length} sur ${LEADS_MAX} choisis</p>`;
  } else
    body = `<fieldset ${disabled}><legend>Réalisation à mettre en avant · 1 parmi ${PROJECTS.length} visibles</legend><div class="pick-list">${PROJECTS.map((project) => `<label class="pick"><input type="radio" name="project" value="${project.id}" ${state.scope.proof.project === project.id ? "checked" : ""}><span><strong>${project.title}</strong><small>Droits photo à confirmer avant publication</small></span></label>`).join("")}</div></fieldset>`;
  return `<form data-form="scope" data-mission="${id}" class="stack-sm">${lock ? `<div class="notice amber">${icon("lock")}<p>${lock}</p></div>` : ""}${body}<div class="form-error" role="alert"></div><button class="btn" type="submit" ${disabled}>${icon("save")}Enregistrer le périmètre</button></form>`;
}

function missionDetail() {
  const id = ui.mission;
  const def = missionDefinitions[id];
  const doc = state.documents[def.document];
  const version = currentVersion(doc).number;
  const status = state.missions[id];
  const active = status === "active";
  const diffused = isDiffused(state, def.document, version);
  const hasDiffusion = state.publications.some((item) => missionOfDocument(state, item.document) === id);
  const approved = doc.approved === version;
  const decided = state.decisions[id];
  const used = timeUsed(state, id);
  const stage = journeyStage(state, id);
  const task = (number, title, description, label, action, done = false) =>
    `<div class="task ${done ? "done" : ""}"><span class="task-num">${done ? icon("check") : number}</span><div><strong>${title}</strong><p>${description}</p>${badge(label, done ? "green" : "")}</div>${action}</div>`;
  const done = (count) => `${count} / 5 étapes`;
  const progress = status === "stopped" ? 5 : decided ? 5 : diffused || hasDiffusion ? 4 : approved ? 3 : active ? 2 : 0;
  const launchLabel = status === "paused" ? "Reprendre la mission" : "Confirmer et lancer";
  return `${navButton("missions", "Toutes les missions", "text", "arrow-left")}<div class="mission-heading"><div><div class="actions" style="margin-top:16px">${badge(statusText(status), active ? "green" : "amber")}${badge("Paul coordonne", "blue")}</div><h1>${def.title}</h1><p>${def.target}</p><div class="actions" style="margin-top:18px">${status === "stopped" ? badge("Bilan fait · mission close") : !active ? button("start-mission", launchLabel, "primary", "play", `data-mission="${id}"`) : button("pause-mission", "Mettre en pause", "", "pause", `data-mission="${id}"`)}${paulButton(`mission:${id}`, "Ajuster avec Paul")}</div></div><dl class="mission-status"><div><dt>Périmètre</dt><dd>${escapeHTML(scopeSummary(state, id))}</dd></div><div><dt>Temps consommé</dt><dd>${formatMinutes(used)} sur ${formatMinutes(def.minutes)}</dd></div><div><dt>Étape</dt><dd>${nextStepLabel(stage)}</dd></div></dl></div>
  ${journeyTracker(id)}
  <div class="two-col section-space"><section><div class="section-heading"><h2>Pourquoi cette mission ?</h2>${navButton("entreprise/audit", "Revenir aux constats", "text", "arrow-up-right")}</div><p class="muted">${def.rationale}</p>
  <div class="section-heading section-space"><h2>Ce que vous choisissez</h2>${decided?.outcome === "continue" && stage === "next-round" ? badge("Poursuite décidée", "green") : ""}</div>${scopeEditor(id)}
  <div class="section-heading section-space"><h2>Les actions de la mission</h2><span class="small muted">${done(progress)}</span></div><div class="task-list">
  ${task(1, "Confirmer le périmètre", `${escapeHTML(scopeSummary(state, id))}.`, active ? "Périmètre confirmé" : "À cadrer", active ? navButton(`missions/${id}`, "Revoir", "small", "eye") : button("start-mission", "Lancer", "small", "play", `data-mission="${id}"`), active)}
  ${task(2, "Préparer une première proposition", `${def.owner} prépare, Paul coordonne. Votre marque et vos contraintes sont reprises.`, active ? `V${doc.versions[0].number} disponible` : "Aperçu possible dans l'atelier", navButton(`atelier/${def.document}`, "Ouvrir l'atelier", "small", "panels-top-left"), active)}
  ${task(3, "Relire et valider la version", "Vous · le contenu, le visuel et les mentions qui engagent votre entreprise.", approved || diffused ? `V${doc.approved ?? version} validée` : "Votre décision", navButton(`atelier/${def.document}`, approved ? "Voir la version" : "Examiner", "small", "check"), approved || diffused)}
  ${task(4, doc.channel === "facebook" ? "Publier sur Facebook" : "Envoyer par Gmail", `${channelLabel(doc.channel)} · ${state.channels[doc.channel] ? "canal connecté (simulation)" : "connexion nécessaire"}. Confirmation distincte de la validation.`, hasDiffusion ? "Diffusion simulée" : doc.scheduled ? "Programmée" : "Non diffusée", navButton(`atelier/${def.document}`, "Gérer la diffusion", "small", "send"), hasDiffusion)}
  ${task(5, "Faire le bilan, puis décider la suite", "Vous notez les résultats ; vous décidez : poursuivre, adapter avec Paul ou arrêter.", status === "stopped" ? "Mission arrêtée" : decided ? "Décision prise" : hasDiffusion ? "Bilan possible" : "Après la première diffusion", hasDiffusion && active ? stage === "report" ? button("report", "Renseigner mon bilan", "small", "pencil", `data-mission="${id}"`) : button("decide-next", "Décider la suite", "small", "git-fork", `data-mission="${id}"`) : navButton("resultats", "Voir les résultats", "small", "chart-no-axes-combined"), status === "stopped" || Boolean(decided))}
  </div></section>
  <aside class="contract"><h3>Notre contrat de mission</h3><dl><dt>Résultat recherché</dt><dd>${def.target}</dd><dt>Votre implication</dt><dd>${formatHours(state.goal.time)} par semaine au total, toutes missions</dd><dt>Votre temps sur cette mission</dt><dd>${def.time} · pic de ${formatHours(def.peakHours)} par semaine</dd><dt>Dépenses externes</dt><dd>0 € prévu. Aucun achat autorisé.</dd><dt>Règle d'arrêt</dt><dd>${def.stopRule}</dd><dt>Délégation</dt><dd>${delegationText()}</dd></dl><div class="notice amber" style="margin-top:24px">${icon("shield-alert")}<p>${def.risk}</p></div><div class="section-space"><h3>Le relais de Paul</h3><div class="timeline"><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul cadre le test</strong><p>Votre ambition, les limites, la décision.</p></div><div class="timeline-item"><span class="avatar ${def.ownerClass}">${def.owner[0]}</span><strong>${def.owner} prépare</strong><p>Le travail spécialisé, sous ce cadre.</p></div><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul vous restitue</strong><p>Une proposition à examiner, pas une action cachée.</p></div></div></div></aside></div>`;
}

/* ---------- Entreprise ---------- */

function findingsTable() {
  const rows = [
    ["4 réalisations visibles", "Pages publiques du site · relevé d'exemple", button("source", "Voir la source", "text", "external-link", 'data-source="site"'), badge(state.profile.url ? "Observation" : "Non vérifié", state.profile.url ? "green" : "amber"), "18 réalisations au total : déclaration du dirigeant", "Documenter une réalisation avant de multiplier les contenus.", navButton("missions/proof", "Preuves & réalisations", "text", "arrow-right")],
    ["6 agences dans la zone", "Annuaire local · échantillon de démonstration", button("source", "Voir la source", "text", "external-link", 'data-source="agencies"'), badge("Piste à qualifier", "amber"), "Aucun besoin confirmé à ce stade", "Tester 1 ou 2 agences, puis juger les retours.", navButton("missions/agencies", "Partenariats agences", "text", "arrow-right")],
    [`${state.contacts.length} anciens prospects`, state.contactsSource === "import" ? "Fichier importé · simulation" : "Déclaré à Paul · fichier non importé", "", badge(state.contactsConfirmed ? "Échantillon confirmé" : "À vérifier", state.contactsConfirmed ? "green" : "amber"), `${eligibleContacts(state).length} recontactables : ancienneté et droit de recontact`, "Vérifier jusqu'à 8 contacts avant le moindre envoi.", navButton("missions/leads", "Réactivation prospects", "text", "arrow-right")],
  ];
  return `<section><div class="section-heading"><h2>Des constats aux décisions</h2><span class="small muted">Les sources, pas un score opaque</span></div><table class="source-table"><thead><tr><th>Constat</th><th>Niveau de certitude</th><th>Ce que Paul en déduit</th><th>Suite proposée</th></tr></thead><tbody>${rows.map(([title, origin, sourceBtn, level, levelNote, deduction, next]) => `<tr><td data-label="Constat"><strong>${title}</strong><p>${origin}</p>${sourceBtn}</td><td data-label="Niveau de certitude">${level}<p>${levelNote}</p></td><td data-label="Ce que Paul en déduit">${deduction}</td><td data-label="Suite proposée">${next}</td></tr>`).join("")}</tbody></table></section>`;
}

function enterprisePage() {
  const tabs = [["audit", "Diagnostic & positionnement"], ["marque", "Ma marque"], ["canaux", "Canaux & délégation"], ["equipe", "En coulisses"]];
  let content = "";
  if (ui.tab === "audit")
    content = `<div class="spread wrap" style="margin-bottom:20px"><div class="actions">${badge("Relevé du 28 oct. 2026")}${badge("Données d'exemple", "amber")}</div>${button("profile", "Corriger mon profil", "small", "pencil")}</div><div class="two-col"><section><h2>Un savoir-faire solide.<br>Une preuve encore trop discrète.</h2><p class="muted" style="margin-top:13px">La première lecture suggère de rendre votre expertise plus tangible et de tester les prescripteurs locaux, avant d'investir dans l'acquisition payante.</p><div class="positioning"><span class="eyebrow">POSITIONNEMENT PROPOSÉ · À CHALLENGER</span><blockquote>« ${escapeHTML(state.profile.name)}, le partenaire de proximité pour rénover avec des choix clairs et un accompagnement concret. »</blockquote><p>Pas de promesse d'économie chiffrée, de certification ou de délai sans preuve.</p>${paulButton("positionnement", "Affiner ce positionnement", "text")}</div></section><aside><h3>Vos repères</h3><div class="row"><div><span class="muted small">Ambition</span><p style="color:var(--ink)">${goalText()}</p></div>${button("goal", "Modifier", "small", "pencil")}</div><div class="row"><div><span class="muted small">Territoire</span><p style="color:var(--ink)">${escapeHTML(state.profile.area)}</p></div>${badge("Confirmé", "green")}</div><div class="row"><div><span class="muted small">Clients</span><p style="color:var(--ink)">${escapeHTML(state.profile.clients)}</p></div>${badge("Confirmé", "green")}</div><div class="row"><div><span class="muted small">Projets clients possibles</span><p style="color:var(--ink)">${state.goal.capacity} sur 30 jours · à reconfirmer dans 30 jours</p></div></div></aside></div><div class="section-space">${findingsTable()}</div><section class="section-space"><div class="section-heading"><h2>Votre environnement</h2>${paulButton("concurrence", "Que faut-il en retenir ?", "small")}</div><div class="equal-col"><div><h3>Concurrence : un échantillon, pas tout le marché</h3><p class="muted small" style="margin:10px 0">5 acteurs potentiels, 3 mettent les aides en avant dans l'exemple. Cela ne démontre ni leur performance ni la demande du marché.</p><div class="actions">${badge("ÉcoHabitat Provence · exemple")}${badge("Maison Thermique · exemple")}${button("competitors", "Voir les 5 acteurs", "text", "arrow-right")}</div></div><div><h3>Ce qu'il nous manque encore</h3><ul class="list-clean small muted"><li>${icon("circle-help")}Marge par offre et CA de départ</li><li>${icon("circle-help")}Trafic, conversion et provenance des demandes</li><li>${icon("circle-help")}Performance réelle des concurrents : non accessible</li></ul></div></div></section>`;
  if (ui.tab === "marque")
    content = `<div class="two-col"><section class="stack"><div><h2>Votre marque, pas celle de Paul.</h2><p class="muted small" style="margin-top:8px">${state.profile.url ? "Proposition issue du relevé d'exemple du site." : "Aucun site renseigné : identité suggérée, sans source observée."} Chaque élément reste à confirmer.</p></div><div class="brand-preview" style="--brand:${state.brand.color}">${brandLogo()}<h2>Des choix clairs.<br>Une maison qui vous ressemble.</h2><div class="palette"><span class="swatch"><i style="background:${state.brand.color}"></i>${state.brand.color}</span><span class="swatch"><i style="background:${state.brand.accent}"></i>${state.brand.accent}</span></div></div><div class="row"><div><strong class="small">Origine des éléments</strong><p>Palette : ${state.profile.url ? "exemple de site" : "proposition sans source"} · Signature : proposition · Photo : illustration</p></div>${badge(state.brand.confirmed ? "Confirmé par vous" : "À confirmer", state.brand.confirmed ? "green" : "amber")}</div><div><h3>À préserver dans les contenus</h3><ul class="list-clean small"><li>${icon("check")}Une parole simple, sans jargon technique</li><li>${icon("check")}Des réalisations et des faits vérifiables</li><li>${icon("check")}Aucun avis, label ou gain inventé</li></ul></div></section>
    <form data-form="brand" class="stack"><h3>Le kit de référence</h3><div class="form-grid"><label class="field"><span>Couleur principale</span><input type="color" name="color" value="${state.brand.color}"></label><label class="field"><span>Accent</span><input type="color" name="accent" value="${state.brand.accent}"></label><label class="field full"><span>Ton de la marque</span><select name="tone">${["Clair, concret, rassurant", "Chaleureux et accessible", "Précis et expert"].map((tone) => `<option ${state.brand.tone === tone ? "selected" : ""}>${tone}</option>`).join("")}</select></label></div><label class="check"><input type="checkbox" name="confirmed" required ${state.brand.confirmed ? "checked" : ""}>Je confirme ces éléments pour les prochaines créations.</label><div class="form-error" role="alert"></div><button type="submit" class="btn primary">${icon("check")}Enregistrer ma marque</button>${navButton("atelier/post", "Voir le rendu dans l'atelier", "", "arrow-up-right")}<p class="muted small">Une modification de marque impose une nouvelle validation du visuel avant diffusion.</p></form></div>`;
  if (ui.tab === "canaux") {
    const scheduledOn = (channel) => Object.values(state.documents).filter((item) => item.channel === channel && item.scheduled).length;
    content = `<div class="two-col"><section><div class="section-heading"><div><h2>Les canaux de votre entreprise</h2><p>Connexion de démonstration, aucun accès réel à vos comptes.</p></div></div>${Object.keys(state.channels).map((channel) => `<div class="row"><div class="inline"><span class="avatar ${channel === "gmail" ? "camille" : ""}">${icon(channel === "facebook" ? "contact" : channel === "gmail" ? "mail" : "globe")}</span><div><strong>${channelLabel(channel)}</strong><p>${channel === "facebook" ? "Page " + escapeHTML(state.profile.name) : channel === "gmail" ? "contact@dupont-renovation.example" : "Accès en lecture · publication du site hors périmètre"}</p>${badge(state.channels[channel] ? "Connecté · démo" : "Non connecté", state.channels[channel] ? "green" : "")}${scheduledOn(channel) ? badge(`${plural(scheduledOn(channel), "programmation", "programmations")} liée${scheduledOn(channel) > 1 ? "s" : ""}`, "blue") : ""}</div></div>${button(state.channels[channel] ? "disconnect" : "connect", state.channels[channel] ? "Déconnecter" : "Connecter", "small", state.channels[channel] ? "unplug" : "plug", `data-channel="${channel}"`)}</div>`).join("")}<div class="notice section-space">${icon("lock-keyhole")}<p>Connecter un canal n'autorise aucun envoi. Le compte, la version et le moment sont confirmés séparément. Déconnecter un canal annule ses programmations.</p></div></section><form data-form="delegation" class="stack"><h2>Votre niveau de délégation</h2>${delegationChoices()}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer les règles</button><p class="muted small">Passer en préparation seule annule les programmations. Le budget média ne constitue jamais une autorisation de dépense.</p></form></div>`;
  }
  if (ui.tab === "equipe")
    content = `<div class="brief"><span class="avatar paul large">P</span><div><h2>Vous n'avez qu'un interlocuteur.</h2><p style="margin-top:9px">Je transforme nos décisions en consignes, je répartis le travail et je vous restitue ce qui est prêt. L'équipe ne vous demande pas de la piloter.</p></div></div><div class="three-col section-space">${AGENT_TEAM.map(([name, cls, role, description]) => `<article class="panel"><span class="avatar ${cls}">${name[0]}</span><h3 style="margin-top:15px">${name}</h3><p class="small blue" style="margin:4px 0 12px">${role}</p><p class="muted small">${description}</p></article>`).join("")}</div><section class="section-space"><div class="section-heading"><h2>Le journal de vos décisions</h2>${badge("Traçabilité")}</div>${journalHTML(30)}</section>`;
  return `${pageHead("Une entreprise bien comprise.", "Votre diagnostic, votre identité et les règles qui guident les décisions de Paul.", escapeHTML(state.profile.name))}<nav class="tabs" aria-label="Dossier entreprise">${tabs.map(([key, title]) => `<button class="${ui.tab === key ? "active" : ""}" ${ui.tab === key ? 'aria-current="page"' : ""} data-action="navigate" data-route="entreprise/${key}">${title}</button>`).join("")}</nav>${content}`;
}

/* ---------- Atelier ---------- */

function artwork(version) {
  const color = version.color || state.brand.color;
  return `<div class="artwork ${version.layout === "editorial" ? "editorial" : ""}" style="--brand:${color};--accent:${version.accent || state.brand.accent}"><img src="${escapeHTML(version.photo || "chantier.jpg")}" alt="Maison illustrative pour la création de ${escapeHTML(version.companyName || state.profile.name)}"><div class="art-copy"><strong>${escapeHTML(version.headline)}</strong><small><span>${escapeHTML(version.companyName || state.profile.name)}</span><span>PARLONS DE VOTRE PROJET ${icon("arrow-up-right")}</span></small></div></div>`;
}

const authorBadge = (version) =>
  version.by === "vous" ? badge("Retouchée par vous", "blue") : version.by === "paul" ? badge(`Préparée avec Paul`, "green") : version.by === "système" ? badge("Mise à jour automatique") : badge(`${version.agent || "Agent"}, via Paul`, "green");

function atelierPage() {
  const docId = ui.document;
  const doc = state.documents[docId];
  const def = missionDefinitions[doc.mission];
  const latest = currentVersion(doc);
  const version = doc.versions.find((item) => item.number === ui.selectedVersion) || latest;
  const isOld = version.number !== latest.number;
  const visual = docId === "post";
  const diffusedLatest = isDiffused(state, docId, latest.number);
  const diffusedShown = isDiffused(state, docId, version.number);
  const approved = doc.approved === latest.number;
  const readOnly = isOld || Boolean(doc.scheduled) || diffusedLatest;
  const recipients = recipientsOf(state, docId);
  const dis = readOnly ? "disabled" : "";
  const preview = visual
    ? `<div class="social-preview"><div class="social-head"><span class="avatar company">${escapeHTML(state.profile.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHTML(version.companyName || state.profile.name)}</strong><span class="muted">Aperçu Facebook · ${diffusedShown ? "publication simulée enregistrée" : "non publié"}</span></div>${icon("ellipsis")}</div><div class="social-text">${escapeHTML(version.body)}</div>${artwork(version)}<div class="social-foot"><span>${icon("thumbs-up")} J'aime</span><span>${icon("message-circle")} Commenter</span><span>${icon("share-2")} Partager</span></div></div>`
    : `<article class="email-preview"><dl><dt>De</dt><dd>${escapeHTML(version.companyName || state.profile.name)} &lt;contact@dupont-renovation.example&gt;</dd><dt>À</dt><dd>${recipients.length ? `${recipients.map((item) => escapeHTML(item.name)).join(" ; ")} · ${plural(recipients.length, "destinataire", "destinataires")}, envois séparés` : "Aucun destinataire : choisissez le périmètre dans la mission"}</dd><dt>Objet</dt><dd><strong>${escapeHTML(version.title)}</strong></dd></dl><div class="email-body">${escapeHTML(version.body)}</div></article>`;
  const versionRows = [...doc.versions].reverse().map((item) => {
    const status = isDiffused(state, docId, item.number) ? "Diffusée" : doc.approved === item.number ? "Validée" : item.number === latest.number ? "Courante" : "Archive";
    return `<div class="row version-row ${item.number === version.number ? "selected" : ""}"><div><strong class="small">V${item.number} · ${escapeHTML(item.note)}</strong><p>${authorBadge(item)} ${badge(status, status === "Diffusée" || status === "Validée" ? "green" : "")}</p></div>${button("select-version", item.number === version.number ? "Affichée" : "Voir", "small", "eye", `data-version="${item.number}" ${item.number === version.number ? "disabled" : ""}`)}</div>`;
  }).join("");
  const lockNote = diffusedLatest
    ? `<div class="notice green">${icon("lock")}<p>V${latest.number} a été diffusée : elle est en lecture seule. Toute modification crée V${latest.number + 1}, à valider à nouveau.</p></div>${button("reopen", `Créer V${latest.number + 1} à partir de V${latest.number}`, "", "copy")}`
    : "";
  const controls = `<section><div class="spread"><h3>La consigne de création</h3>${badge(`Paul → ${def.owner}`, "blue")}</div><p class="muted small">${visual ? "Rassurer avec une réalisation. Aucun gain énergétique ni témoignage non vérifié." : "Proposer un premier échange. Pas de prix, de promesse ou de relance automatique."}</p><div class="actions" style="margin-top:14px">${paulButton(`atelier:${docId}`, "Retravailler avec Paul", "small")}</div></section><section><h3>Texte & composition</h3>${lockNote}<form data-form="edit-document" class="stack-sm"><label class="field"><span>${visual ? "Accroche du visuel" : "Objet du message"}</span><input name="title" maxlength="100" required value="${escapeHTML(visual ? version.headline.replace(/\n/g, " ") : version.title)}" ${dis}></label><label class="field"><span>${visual ? "Texte de la publication" : "Message"}</span><textarea name="body" rows="5" maxlength="3000" required ${dis}>${escapeHTML(version.body)}</textarea></label>${visual ? `<label class="field"><span>Composition</span><select name="layout" ${dis}><option value="photo" ${version.layout !== "editorial" ? "selected" : ""}>Photo & signature</option><option value="editorial" ${version.layout === "editorial" ? "selected" : ""}>Cadre éditorial</option></select></label><div class="actions"><label class="btn small upload ${readOnly ? "off" : ""}">${icon("image-plus")}Importer une photo<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Importer une photo" ${dis}></label>${navButton("entreprise/marque", "Ma marque", "small", "palette")}</div><small class="muted">JPG, PNG ou WebP · 1 Mo maximum · photo actuelle illustrative.</small>` : ""}<div class="form-error" role="alert"></div><button class="btn" type="submit" ${dis}>${icon("save")}Enregistrer une nouvelle version</button></form></section>`;
  const previous = doc.versions.length > 1 ? doc.versions[doc.versions.length - 2] : null;
  const versionNote = previous ? `<section class="version-note"><h3>Une décision, une version.</h3><p class="muted small">Vous examinez V${latest.number} (${escapeHTML(latest.note)}).${doc.approved && doc.approved !== latest.number ? ` La validation de V${doc.approved} ne vaut plus pour cette version.` : ""}</p></section>` : "";
  const displayedStatus = isOld ? (diffusedShown ? "Diffusée · démo" : "Archive") : diffusedLatest ? "Diffusée · démo" : doc.scheduled ? "Programmée" : approved ? "Validée" : "Brouillon";
  const missionOff = state.missions[doc.mission] !== "active";
  const approvalState = isOld
    ? { title: `V${version.number} · archive en lecture seule`, text: "Revenir à une ancienne version passe par une nouvelle version, à valider.", actions: badge("Archive · lecture seule") }
    : diffusedLatest
      ? { title: `V${latest.number} diffusée · lecture seule`, text: "Suivez les retours dans Résultats. Pour une nouvelle série, créez la version suivante.", actions: `${navButton("resultats", "Voir le suivi", "primary", "arrow-right")}${button("reopen", `Créer V${latest.number + 1}`, "", "copy")}` }
      : doc.scheduled
        ? { title: `Programmée le ${formatDate(doc.scheduled)}`, text: "Validation du contenu et diffusion sont deux décisions distinctes.", actions: button("cancel-schedule", "Annuler la programmation", "", "calendar-x") }
        : !approved
          ? { title: "Votre accord est nécessaire", text: "Validation du contenu et diffusion sont deux décisions distinctes.", actions: button("approve", "Valider cette version", "primary", "check", missionOff ? "disabled" : "") }
          : { title: `V${latest.number} validée`, text: state.channels[doc.channel] ? "Il reste à confirmer la diffusion." : `Il faut connecter ${channelLabel(doc.channel)} avant de diffuser.`, actions: state.delegation === "prepare" ? button("copy", "Récupérer le texte", "primary", "copy") : button("publish", visual ? "Préparer la publication" : "Préparer l'envoi", "primary", "send") };
  return `${pageHead("L'atelier", "Un contenu lié à une mission, une marque et une version précise.", "CRÉER · AFFINER · VALIDER", navButton(`missions/${doc.mission}`, "Retour à la mission", "", "arrow-left"))}
    <div class="studio-toolbar"><label class="field" style="max-width:340px;flex:1"><span class="eyebrow">CONTENU</span><select aria-label="Contenu" id="document-select"><option value="post" ${docId === "post" ? "selected" : ""}>Visuel & publication · Réalisations</option><option value="email" ${docId === "email" ? "selected" : ""}>E-mail · Partenariats agences</option><option value="followup" ${docId === "followup" ? "selected" : ""}>E-mail · Réactivation prospects</option></select></label><div class="actions">${badge(`V${version.number}${isOld ? " · archive" : " · courante"}`, "blue")}${badge(displayedStatus, diffusedShown || (!isOld && approved) ? "green" : "amber")}</div></div>
    ${missionOff ? `<div class="notice amber" style="margin-bottom:20px">${icon("info")}<p>La mission n'est pas lancée. Cet aperçu ne peut pas être validé ni diffusé.</p>${button("start-mission", "Lancer la mission", "small", "play", `data-mission="${doc.mission}"`)}</div>` : ""}
    <div class="studio-layout"><section>
      <div class="studio-toolbar"><span class="small muted">${channelLabel(doc.channel)} · ${visual ? "Visuel carré 1:1" : "Message individuel"}</span><div class="segmented" aria-label="Affichage de l'aperçu">${visual ? `<button data-action="preview" data-preview="social" class="${ui.preview === "social" ? "active" : ""}">Publication</button><button data-action="preview" data-preview="visual" class="${ui.preview === "visual" ? "active" : ""}">Visuel seul</button>` : badge("Aperçu destinataire")}</div></div>
      <div class="preview-stage">${visual && ui.preview === "visual" ? `<div style="width:100%;max-width:460px">${artwork(version)}</div>` : preview}</div>
      <div class="spread wrap" style="margin-top:13px"><span class="small muted">${visual ? "Image illustrative · droits à confirmer pour un usage réel" : "Adresses .example · aucun e-mail réel"}</span>${button("copy", "Copier le texte", "small", "copy")}</div>
      <div class="studio-approval"><div><strong class="small">${approvalState.title}</strong><p class="muted small">${approvalState.text}</p></div><div class="actions">${approvalState.actions}</div></div>
      <section class="section-space"><h3>Historique des versions</h3>${versionRows}</section>
    </section><aside><div class="editor-controls">${versionNote}${controls}<section><h3>Cadre de diffusion</h3><div class="row"><span class="small">${channelLabel(doc.channel)}</span>${state.channels[doc.channel] ? badge("Connecté · démo", "green") : button("connect", "Connecter", "small", "plug", `data-channel="${doc.channel}"`)}</div><div class="row"><span class="small">Délégation</span><strong class="small">${delegationText()}</strong></div>${doc.mission !== "proof" ? `<div class="row"><div><span class="small">Destinataires</span><p>${plural(recipients.length, "destinataire", "destinataires")}</p></div>${navButton(`missions/${doc.mission}`, "Modifier", "small", "users")}</div>` : `<div class="row"><div><span class="small">Réalisation</span><p>${escapeHTML(scopeSummary(state, "proof"))}</p></div>${navButton("missions/proof", "Changer", "small", "layers")}</div>`}${visual ? `<div class="row"><span class="small">Marque actuelle</span>${state.brand.confirmed ? badge("Confirmée", "green") : navButton("entreprise/marque", "À confirmer", "text")}</div>` : ""}</section></div></aside></div>`;
}

/* ---------- Résultats ---------- */

function resultsPage() {
  const scheduled = Object.entries(state.documents).filter(([, doc]) => doc.scheduled);
  const reports = Object.entries(state.reports);
  const total = (key) => reports.reduce((sum, [, report]) => sum + (report[key] || 0), 0);
  const revenueKnown = reports.some(([, report]) => report.revenue !== null);
  const reportable = Object.keys(missionDefinitions).filter((id) => state.publications.some((item) => missionOfDocument(state, item.document) === id));
  const missionRows = Object.keys(missionDefinitions).filter((id) => state.missions[id] !== "proposed" || state.publications.some((item) => missionOfDocument(state, item.document) === id)).map((id) => {
    const def = missionDefinitions[id];
    const report = state.reports[id];
    const count = state.publications.filter((item) => missionOfDocument(state, item.document) === id).length;
    const decision = state.decisions[id];
    return `<tr><td data-label="Mission"><strong>${def.short}</strong><p>${badge(statusText(state.missions[id]), state.missions[id] === "active" ? "green" : "amber")}</p></td><td data-label="Diffusions">${count}</td><td data-label="Bilan déclaré">${report ? `${report.leads} demande${report.leads > 1 ? "s" : ""} · ${report.meetings} rendez-vous<p>${report.revenue === null ? "CA : non renseigné" : `${report.revenue.toLocaleString("fr-FR")} € signés`}</p>` : count ? "À renseigner" : "—"}</td><td data-label="Résultat recherché">${def.target}</td><td data-label="Temps passé">${formatMinutes(timeUsed(state, id))}</td><td data-label="Suite">${decision ? badge(decision.outcome === "stop" ? "Arrêtée" : "Poursuivie", decision.outcome === "stop" ? "" : "green") : count && state.missions[id] === "active" ? button(report?.atPublications === count ? "decide-next" : "report", report?.atPublications === count ? "Décider la suite" : "Renseigner le bilan", "small", "pencil", `data-mission="${id}"`) : "—"}</td></tr>`;
  }).join("");
  return `${pageHead("L'activité n'est pas le résultat.", "Ce qui a été fait, ce qui a été observé, et ce que nous décidons ensuite.", "APPRENDRE · AJUSTER", button("report", "Renseigner mon bilan", "", "pencil"))}
  <div class="metrics"><div class="metric"><span>Diffusions simulées</span><strong>${state.publications.length}</strong><span>${plural(scheduled.length, "programmation", "programmations")} en attente</span></div><div class="metric"><span>Demandes qualifiées</span><strong>${reports.length ? total("leads") : "—"}</strong><span>${reports.length ? `Saisies dirigeant · ${plural(reports.length, "mission", "missions")}` : "À renseigner, pas à inventer"}</span></div><div class="metric"><span>Chiffre d'affaires signé</span><strong>${revenueKnown ? total("revenue").toLocaleString("fr-FR") + " €" : "—"}</strong><span>${revenueKnown ? "Saisie dirigeant · attribuée par mission" : "Aucune donnée connectée"}</span></div></div>
  <section><div class="section-heading"><h2>Résultats par mission</h2></div>${missionRows ? `<table class="source-table"><thead><tr><th>Mission</th><th>Diffusions</th><th>Bilan déclaré</th><th>Résultat recherché</th><th>Temps passé</th><th>Suite</th></tr></thead><tbody>${missionRows}</tbody></table>` : `<div class="empty">${icon("chart-no-axes-combined")}<h3>Aucune mission lancée.</h3><p>Lancez une mission : ses résultats apparaîtront ici, rattachés à elle.</p>${navButton("missions", "Voir les missions", "", "arrow-right")}</div>`}</section>
  <div class="two-col section-space"><section><div class="section-heading"><h2>La diffusion et son suivi</h2></div>${scheduled.map(([id, doc]) => `<div class="row"><div><strong>${escapeHTML(currentVersion(doc).title)}</strong><p>${channelLabel(doc.channel)} · V${doc.approved} · ${formatDate(doc.scheduled)}</p>${badge("Programmé · simulation", "blue")}</div>${navButton(`atelier/${id}`, "Gérer", "small", "calendar-clock")}</div>`).join("")}${state.publications.length ? state.publications.map((item) => `<div class="row"><div><strong>${escapeHTML(item.title)}</strong><p>${channelLabel(item.channel)} · V${item.version} · ${formatDate(item.date)}${item.recipients ? ` · ${plural(item.recipients, "destinataire", "destinataires")}` : ""}</p>${badge(item.channel === "gmail" ? "Envoi simulé" : "Publication simulée", "green")}</div>${navButton(`atelier/${item.document}`, "Voir", "small", "eye")}</div>`).join("") : !scheduled.length ? `<div class="empty">${icon("chart-no-axes-combined")}<h3>Rien n'a encore été diffusé.</h3><p>Validez un contenu, puis confirmez sa diffusion.</p>${navButton("atelier", "Ouvrir l'atelier", "", "arrow-right")}</div>` : ""}<div class="notice section-space">${icon("info")}<p>Un envoi n'est ni une lecture, ni une vente. Les chiffres renseignés sont déclaratifs et ne prouvent pas, à eux seuls, l'effet d'une mission.</p></div></section>
  <aside><h2>Le point de Paul</h2><div class="brief" style="margin-top:18px"><span class="avatar paul">P</span><p>${reports.length ? reports.map(([id, report]) => `${missionDefinitions[id].short} : ${report.leads} demande${report.leads > 1 ? "s" : ""}, ${report.meetings} rendez-vous.`).join(" ") + " Avant d'élargir, vérifions leur origine et votre capacité à les absorber." : reportable.length ? "Les diffusions ont eu lieu. Notez maintenant les réponses reçues et leur qualité, mission par mission : sans bilan, nous ne pouvons pas décider de la suite." : "Il est trop tôt pour conclure. Après la première diffusion, notons les réponses reçues et leur qualité. Nous déciderons ensuite de poursuivre ou d'ajuster."}</p></div>${reports.map(([, report]) => report.note ? `<div class="quote" style="margin-top:15px">${escapeHTML(report.note)}</div>` : "").join("")}<div class="actions" style="margin-top:20px">${paulButton("results", "Préparer le bilan", "primary")}${navButton("missions", "Revoir les missions", "text")}</div><div class="row section-space"><div><span class="eyebrow">PROCHAIN POINT</span><h3>7 jours après la première diffusion</h3><p>Qualifier les retours, vérifier les limites, décider du prochain test.</p></div></div></aside></div><section class="section-space"><div class="section-heading"><h2>Décisions & traçabilité</h2></div>${journalHTML()}</section>`;
}
