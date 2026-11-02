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
  `<div class="company-logo">${state.brand.logo ? `<img src="${state.brand.logo}" alt="Logo de ${escapeHTML(state.profile.name)}">` : icon("house")}<span>${escapeHTML(state.profile.name)}</span></div>`;
const wordmark = () =>
  `<a href="#/paul" class="wordmark" aria-label="BienDecider, accueil"><span class="mark" aria-hidden="true">b.</span><span>Bien<em>Decider</em></span></a>`;
const formatDate = (date) =>
  new Date(date).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const statusText = (status) =>
  ({ proposed: "À décider", active: "En cours", paused: "En pause", stopped: "Arrêtée", dismissed: "Écartée" })[status];
const delegationText = () =>
  ({ prepare: "Préparation seule", review: "Validation avant action", bounded: "Autonomie encadrée" })[state.delegation];
const goalText = () => goalLabel(state.goal);
const firstInitial = () => (state.profile.firstName || "V").slice(0, 1).toUpperCase();
const plural = (count, one, many) => `${count} ${count > 1 ? many : one}`;
const agentClass = { Paul: "paul", "Paul": "jean", Paul: "camille", Paul: "martine" };

const AGENT_TEAM = [
  ["Paul", "martine", "Diagnostic & positionnement", "Relève les sources, la concurrence et les signaux. Sépare les faits des hypothèses."],
  ["Paul", "camille", "Contenus & visuels", "Décline votre marque. Prépare les textes et visuels, sans jamais les publier."],
  ["Paul", "jean", "Partenariats & prospection", "Choisit les cibles, rédige les premiers messages et prépare les prises de contact, sous vos règles."],
];

function journeyTracker(id) {
  return `<ol class="journey" aria-label="Avancement de la mission ${escapeHTML(definitionsFor(state)[id].short)}">${journeyProgress(state, id)
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
  return `<article class="next-step"><span class="eyebrow">LE PROCHAIN PAS${step.mission ? ` · ${escapeHTML(definitionsFor(state)[step.mission].short.toUpperCase())}` : ""}</span><h2>${escapeHTML(step.title)}</h2><p>${escapeHTML(step.detail)}</p><div class="actions">${cta}${paulButton(step.mission ? `mission:${step.mission}` : "strategy", "En discuter avec Paul", "text")}</div></article>`;
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
  const hasSpace = state.onboarded && state.signedIn;
  const start = hasSpace
    ? navButton("paul", "Retourner à mon espace", "primary big", "arrow-right")
    : button("begin", "C'est parti", "primary big", "arrow-right");
  const loginHint = hasSpace ? "" : `<p class="small muted">Vous avez déjà un compte ? ${button("login", "Retrouver mon compte", "text small")}</p>`;
  const team = [["Paul", "paul", "votre copilote unique : il comprend, recommande, prépare et apprend avec vous"]];
  const plan = [
    ["Paul", "paul", "Faire parler vos réalisations", "Un chantier documenté, publié sur votre Page Facebook."],
    ["Paul", "paul", "Ouvrir la porte des agences locales", "Un message individuel à deux agences, sans relance automatique."],
    ["Paul", "paul", "Renouer avec d'anciens prospects", "Huit contacts recontactables, vérifiés avant tout envoi."],
  ];
  const control = [
    ["Vous fixez l'objectif", "« +20 % de chiffre d'affaires en 12 mois, sans embaucher » : Paul construit le plan à partir de votre but, pas d'une liste de conseils."],
    ["Vous relisez chaque contenu", "Un contenu à la fois : vous validez, vous modifiez ou vous refusez. Une fois diffusé, il ne bouge plus : toute retouche crée une nouvelle version."],
    ["Rien ne part sans vous", "Chaque publication ou envoi attend votre confirmation explicite. Connecter un compte ne déclenche jamais rien."],
  ];
  const steps = [
    "Vous présentez votre entreprise et votre cap",
    "Paul propose trois missions ; vous choisissez celles que vous lancez",
    "Un contenu est préparé dans l'atelier",
    "Vous le relisez, le validez, puis confirmez la diffusion",
    "Vous notez les résultats obtenus",
    "Vous décidez : poursuivre, adapter ou arrêter",
  ];
  return `<div class="landing"><header class="landing-top">${wordmark()}<div class="actions">${hasSpace ? navButton("paul", "Mon espace", "small", "arrow-right") : button("begin", "C'est parti", "small", "arrow-right")}</div></header>
  <main id="main" tabindex="-1">
    <section class="landing-hero" aria-labelledby="promesse"><h1 id="promesse">Vous décidez.<br>Votre activité avance.</h1><p>Paul prépare le travail pour atteindre votre objectif : plan, messages, visuels, prospection. Vous gardez le dernier mot.</p><div class="actions center">${start}</div>${loginHint}<small class="muted">Aucun envoi réel. Vos choix restent dans ce navigateur.</small></section>
    <section class="landing-team" aria-labelledby="equipe"><h2 id="equipe" class="sr-only">L'équipe qui prépare le travail</h2><ul class="team-grid">${team.map(([name, cls, does]) => `<li><span class="avatar large ${cls}">${name[0]}</span><strong>${name}</strong><span class="small muted">${does}</span></li>`).join("")}</ul></section>
    <section class="landing-band" aria-labelledby="exemple"><span class="eyebrow">UN EXEMPLE CONCRET</span><h2 id="exemple">Une entreprise de rénovation qui veut plus de projets</h2><p class="muted">Objectif : <strong>+20 % de chiffre d'affaires en 12 mois</strong>.</p><div class="equal-col landing-example"><div><h3>Le plan proposé par Paul</h3><ol class="plan-list">${plan.map(([owner, cls, title, detail], index) => `<li><span class="task-num">${index + 1}</span><div><strong>${title}</strong><p>${detail} <span class="agent-tag ${cls}">· ${owner}</span></p></div></li>`).join("")}</ol></div><div><h3>Ce que Paul vous propose</h3><div class="landing-sample"><p class="inline small"><span class="avatar paul">P</span><span><strong>Paul</strong> prépare un post Facebook</span></p><p>Un projet de rénovation commence par une maison que l'on connaît et des priorités bien définies. Parlons de votre projet.</p><p class="small muted">Vous validez le texte, puis confirmez sa publication sur votre Page.</p></div></div></div></section>
    <section class="landing-band" aria-labelledby="controle"><h2 id="controle">Vous gardez la main</h2><ul class="three-col control-list">${control.map(([title, text]) => `<li class="panel"><h3>${title}</h3><p class="small muted">${text}</p></li>`).join("")}</ul></section>
    <section class="landing-band" aria-labelledby="parcours"><span class="eyebrow">VOTRE TEST, DE BOUT EN BOUT</span><h2 id="parcours">Six étapes, une seule boucle</h2><ol class="landing-steps">${steps.map((text, index) => `<li><span class="task-num">${index + 1}</span>${text}</li>`).join("")}</ol></section>
    <section class="landing-band reality" aria-labelledby="reel"><h2 id="reel">Ce que vous jugez, ce qui est simulé</h2><div class="equal-col"><div class="panel"><h3>${icon("badge-check")} Réel : c'est ce que vous jugez</h3><ul class="list-clean small"><li>${icon("check")}La logique du parcours et ses garde-fous (validation, droits, verrouillage)</li><li>${icon("check")}Vos saisies : prénom, entreprise, ambition, règles, périmètre</li><li>${icon("check")}Le journal de vos décisions</li></ul></div><div class="panel"><h3>${icon("flask-conical")} Simulé : des données d'exemple</h3><ul class="list-clean small"><li>${icon("circle-help")}L'analyse du site, le diagnostic et la concurrence</li><li>${icon("circle-help")}Les agences, les contacts et les adresses (toutes en .example)</li><li>${icon("circle-help")}Les canaux, les envois, les programmations et les résultats</li></ul></div></div></section>
    <section class="landing-final" aria-labelledby="commencer"><h2 id="commencer">Quel est votre objectif ?</h2><p class="muted">Dites-le à Paul. Paul s'occupe du reste, vous décidez.</p><div class="actions center">${start}</div></section>
  </main><footer class="landing-foot small muted">Maquette V5.2 · Données et envois simulés · Aucun envoi réel</footer></div>`;
}

/* ---------- Première connexion ---------- */

function profileFields(mode = "full") {
  const fields = [
    ["firstName", "Votre prénom", "input"],
    ["name", "Entreprise", "input"],
    ["location", "Localisation de l'entreprise", "input"],
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
          : key === "location"
            ? "Ville ou commune du siège"
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

function ambitionForm(formName, label = "Votre ambition, avec vos mots") {
  const text = ui.ambition?.text ?? state.goal.statement;
  return `<form data-form="${formName}" class="stack"><label class="field"><span>${label}</span><textarea name="statement" rows="5" maxlength="600" required placeholder="Ex. Je voudrais augmenter mon chiffre d'affaires de 20 % cette année, sans embaucher.">${escapeHTML(text)}</textarea><small>Un gain, une durée, vos limites : dites ce que vous voulez, comme à un collaborateur. Rien n'est figé, Paul le lit et vous le reformule.</small></label><div class="form-error" role="alert"></div><div class="actions"><button class="btn ${ui.ambition ? "" : "primary"}" type="submit">${icon("message-circle")}Demander à Paul de comprendre</button></div></form>`;
}

function understoodCard() {
  if (!ui.ambition) return "";
  const { result } = ui.ambition;
  return `<section class="understood" aria-live="polite"><div class="brief"><span class="avatar paul">P</span><p><strong>Voici ce que je comprends.</strong> ${escapeHTML(goalLabel({ ...result, statement: result.statement }))}.</p></div><ul class="list-clean small">${result.found.map((item) => `<li>${icon("check")}${escapeHTML(item)}</li>`).join("")}</ul>${result.notes.map((note) => `<div class="notice amber">${icon("info")}<p>${escapeHTML(note)}</p></div>`).join("")}${result.questions.length ? `<div class="notice amber">${icon("circle-help")}<div><strong class="small">Pour affiner, vous pouvez préciser :</strong><ul class="list-clean small">${result.questions.map((question) => `<li>${escapeHTML(question)}</li>`).join("")}</ul></div></div>` : ""}<p class="muted small">C'est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment.</p><div class="actions">${button("confirm-ambition", "C'est bien ça", "primary", "check")}${paulButton("ambition", "Préciser avec Paul")}</div></section>`;
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
    ["Premiers constats", "Les signes que Paul a compris"],
    ["Ambition", "Votre cap et vos limites"],
    ["Mes premières missions", "Du concret à décider"],
    ["Votre compte", "Retrouver votre stratégie"],
  ];
  let content = "";
  if (state.step === 1) {
    const scanLabels = ["Site et offres", "Informations publiques", "Zone et clients", "Identité visuelle"];
    const running = ui.scan === "running";
    content = `<div class="onboard-title"><span class="eyebrow">FAISONS CONNAISSANCE</span><h1>Votre entreprise.<br>Notre point de départ.</h1><p>Commençons par ce qui existe déjà.</p></div><div class="brief"><span class="avatar paul">P</span><p><strong>Bonjour, je suis Paul.</strong> Dites-moi votre prénom, le nom de votre entreprise et son site. Je vous proposerai une première lecture, à corriger ensemble.</p></div>
    <form data-form="discover" class="stack">
      <div class="form-grid"><label class="field"><span>Votre prénom</span><input name="firstName" required maxlength="40" autocomplete="given-name" value="${escapeHTML(state.profile.firstName)}"></label><label class="field"><span>Nom de l'entreprise</span><input name="name" required maxlength="100" autocomplete="organization" value="${escapeHTML(state.profile.name)}"></label></div>
      <label class="field"><span>Localisation de l'entreprise</span><input name="location" required maxlength="100" autocomplete="address-level2" placeholder="Ville ou commune" value="${escapeHTML(state.profile.location)}"><small>Le lieu de votre entreprise, distinct de sa zone d'intervention.</small></label>
      <label class="field"><span>Site internet <span class="muted">· facultatif</span></span><input name="url" type="url" placeholder="https://votre-entreprise.fr" value="${escapeHTML(state.profile.url)}"><small>Aucun mot de passe ni accès privé nécessaire.</small></label>
      <div class="form-error" role="alert"></div>
      ${ui.scan === "idle" ? `<div class="actions"><button class="btn primary" type="submit">${icon("scan-line")}Découvrir mon entreprise</button>${button("no-site", "Je n'ai pas de site", "text")}</div>` : `<div class="analysis"><progress max="4" value="${ui.scanStep}" aria-label="Avancement de la lecture"></progress><div>${scanLabels.map((label, index) => { const done = ui.scanStep > index; return `<div class="row">${icon(done ? "circle-check" : index === ui.scanStep && running ? "loader-circle" : "circle")}<span>${label}</span>${index === 0 && !state.profile.url ? badge("Non disponible", "amber") : badge(done ? "Relevé d'exemple" : "En cours", done ? "green" : "")}</div>`; }).join("")}</div></div>${button("step", "Voir mes premiers constats", "primary", "arrow-right", 'data-step="2"')}`}
    </form><div class="trust-note">${icon("shield-check")}Aucun compte connecté. Aucune action extérieure.</div><div class="onboard-bottom"><small>Données illustratives, aucune analyse web réelle.</small>${button("demo", "Explorer l'espace de démonstration", "text", "arrow-up-right")}</div>`;
  }
  if (state.step === 2)
    content = `<div class="onboard-title"><span class="eyebrow">VOS PREMIERS CONSTATS</span><h1>Paul semble avoir compris votre entreprise.</h1><p>Avant de continuer, vérifiez ces premiers résultats. Ils servent de base aux missions proposées ensuite.</p></div><div class="brief"><span class="avatar paul">P</span><p><strong>Voici ma première lecture.</strong> Je distingue ce que j'observe, ce que j'en déduis et ce qui reste à confirmer.</p></div><div class="diagnostic-first-results"><article class="diagnostic-result"><span class="badge green">Observé</span><h3>Votre savoir-faire est peu visible</h3><p>4 réalisations visibles dans l'exemple, pour 18 réalisations déclarées.</p><small>Vos prospects voient peut-être moins de preuves que votre expérience réelle.</small></article><article class="diagnostic-result"><span class="badge amber">Piste à qualifier</span><h3>Des prescripteurs existent dans votre zone</h3><p>6 agences locales repérées dans l'échantillon de démonstration.</p><small>Tester un canal local peut être préférable à l'achat immédiat de trafic.</small></article><article class="diagnostic-result"><span class="badge amber">À confirmer</span><h3>Votre croissance doit rester maîtrisée</h3><p>Votre offre et votre zone suggèrent des tests limités et mesurables.</p><small>Il manque encore votre ambition, votre budget et vos contraintes.</small></article></div><div class="notice amber">${icon("circle-help")}<p>Dans le PoC, chaque constat réel affichera sa source, sa date et son niveau de confiance.</p></div><div class="onboard-bottom"><button class="btn primary" type="button" data-action="step" data-step="3">Oui, c'est bien moi ${icon("arrow-right")}</button>${button("step", "Non, corriger mes informations", "", "arrow-left", 'data-step="1"')}</div>`;
  if (state.step === 3)
    content = `<div class="onboard-title"><span class="eyebrow">DE L'ENVIE À UN CAP CONCRET</span><h1>Qu'aimeriez-vous changer ?</h1><p>Pas de formulaire : écrivez votre ambition avec vos mots. Paul la lit, la reformule et vous demande de confirmer.</p></div><div class="stack">${ambitionForm("ambition")}${understoodCard()}</div>`;
  if (state.step === 4) content = diagnosticSummary();
  if (state.step === 5) content = signupPage();
  return `<div class="onboarding"><aside class="onboard-side">${wordmark()}<h2>Faisons avancer<br>votre entreprise.</h2><p>Un cap clair. Des actions utiles.<br>Paul à vos côtés.</p><ol class="steps">${steps.map(([title, detail], index) => `<li class="${state.step === index + 1 ? "active" : state.step > index + 1 ? "done" : ""}" ${state.step === index + 1 ? 'aria-current="step"' : ""}><span>${state.step > index + 1 ? icon("check") : index + 1}</span><div><strong>${title}</strong><small>${detail}</small></div></li>`).join("")}</ol><footer>Maquette V5.2 · Données d'exemple<br>Vos choix restent dans ce navigateur.</footer></aside><main id="main" class="onboard-main" tabindex="-1"><div class="onboard-top">${state.step > 1 ? button("step", "Retour", "text", "arrow-left", `data-step="${state.step - 1}"`) : navButton("decouvrir", "Revoir le concept", "text", "arrow-left")}<span class="small muted">${state.step} sur ${steps.length}</span></div><div class="onboard-content ${[2, 5].includes(state.step) ? "" : "narrow"}">${content}</div></main></div>`;
}

function diagnosticSummary() {
  const items = findings().sort((first, second) => Number(second.mission === state.priority) - Number(first.mission === state.priority));
  return `<div class="onboard-title"><span class="eyebrow">VOTRE PREMIER DIAGNOSTIC</span><h1>Un cap. Trois premières pistes.</h1><p>${escapeHTML(state.profile.name)} · ${escapeHTML(state.profile.location)} · ${escapeHTML(state.profile.activity)} · ${escapeHTML(state.profile.area)}</p></div>
  <div class="brief"><span class="avatar paul">P</span><div><strong>${escapeHTML(goalText())}</strong><p>Je propose de commencer par les partenariats locaux, en appuyant votre démarche sur vos réalisations et vos relations existantes.</p></div></div>
  <section class="summary-section"><div class="section-heading"><h2>Ce que nous retenons</h2>${button("step", "Corriger mes informations", "text small", "pencil", 'data-step="2"')}</div><p>Votre proximité et vos réalisations sont deux pistes de différenciation. Dans l'échantillon de cinq concurrents, trois mettent les aides en avant. Cette première lecture reste à confirmer.</p><p class="small muted">Diagnostic illustratif : aucune analyse réelle de votre site ou de vos concurrents n'a été effectuée.</p></section>
  <section class="summary-section"><h2>Vos premières missions</h2><ol class="summary-missions">${items.map((item) => {
    const def = definitionsFor(state)[item.mission];
    return `<li><div class="spread"><span class="eyebrow">${escapeHTML(item.title)}</span>${badge(item.mission === state.priority ? "À examiner en premier" : "Autre piste", item.mission === state.priority ? "blue" : "")}</div><h3>${def.title}</h3><p>${item.deduction}</p><dl class="facts"><div><dt>Résultat recherché</dt><dd>${escapeHTML(missionTarget(state, item.mission))}</dd></div><div><dt>Périmètre proposé</dt><dd>${escapeHTML(scopeSummary(state, item.mission))}</dd></div></dl><small class="muted">Paul prépare · ${escapeHTML(item.note)}</small></li>`;
  }).join("")}</ol></section>
  <div class="summary-decision"><div><h2>On construit la suite ensemble ?</h2><p>Ces pistes restent à décider. Votre compte vous permettra de retrouver votre stratégie et de choisir vos missions avec Paul.</p><p class="small muted">Aucun canal connecté, aucune mission lancée.</p></div><div class="actions">${button("interested", "Ça m'intéresse", "primary big", "arrow-right")}${button("step", "Revoir mon ambition", "text", "pencil", 'data-step="3"')}</div></div>`;
}

function signupPage() {
  return `<div class="onboard-title"><span class="eyebrow">VOTRE COMPTE BIENDECIDER</span><h1>Retrouvez votre stratégie.</h1><p>${escapeHTML(state.profile.firstName)}, votre diagnostic et vos trois premières pistes sont prêts.</p></div>
  <form data-form="signup" class="stack"><div class="signup-recap"><strong>${escapeHTML(state.profile.name)}</strong><p>${escapeHTML(goalText())}</p></div><div class="form-grid"><label class="field"><span>Votre e-mail</span><input name="email" type="email" autocomplete="email" required maxlength="120" placeholder="vous@exemple.fr" value="${escapeHTML(state.account.email)}"></label><label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="8 caractères minimum"><small>Contrôlé dans la maquette, jamais enregistré.</small></label><label class="field full"><span>Confirmer le mot de passe</span><input name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label></div><p class="small muted">Inscription simulée : aucun compte réel, aucun e-mail envoyé et aucun mot de passe conservé.</p><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("circle-user")}Créer mon compte</button><p class="small muted">Vous arriverez sur Stratégie. Les missions ne démarrent qu'après votre confirmation. 20 crédits fictifs sont disponibles pour explorer la maquette.</p></form>`;
}

/* ---------- Coquille de l'espace ---------- */

const PAGES = [
  ["paul", "Stratégie", "compass", true],
  ["missions", "Missions", "flag", true],
  ["atelier", "Atelier", "panels-top-left", true],
  ["resultats", "Résultats", "chart-no-axes-combined", true],
  ["entreprise", "Entreprise", "building-2", false],
  ["compte", "Mon compte", "circle-user", false],
];

function pageContext() {
  if (ui.view === "missions" && location.hash.split("/")[2] === "nouvelle") return "idea:new";
  if (ui.view === "atelier") return `atelier:${ui.document}`;
  if (ui.view === "missions" && location.hash.split("/")[2]) return `mission:${ui.mission}`;
  if (ui.view === "resultats") return "results";
  return "strategy";
}

function shell(content) {
  const active = PAGES.find(([key]) => key === ui.view) || PAGES[0];
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const running = Object.values(state.missions).filter((value) => value === "active").length;
  const capShort = state.goal.growth ? `+${state.goal.growth} % de CA` : goalLabel(state.goal);
  const companyMark = state.brand.logo
    ? `<span class="avatar company logo"><img src="${state.brand.logo}" alt=""></span>`
    : `<span class="avatar company">${escapeHTML(state.profile.name.slice(0, 2).toUpperCase())}</span>`;
  return `<div class="mobile-nav-overlay" data-action="menu-close"></div><aside class="sidebar" aria-label="Navigation principale">${wordmark()}<button type="button" class="workspace-switch ${ui.view === "entreprise" ? "active" : ""}" data-action="navigate" data-route="entreprise" ${ui.view === "entreprise" ? 'aria-current="page"' : ""} aria-label="Mon entreprise : ${escapeHTML(state.profile.name)}">${companyMark}<span><strong>${escapeHTML(state.profile.name)}</strong><small>Voir mon entreprise</small></span></button><nav aria-label="Pages">${PAGES.filter((page) => page[3]).map(([key, title, symbol]) => `<button class="nav-item ${key === ui.view ? "active" : ""}" data-action="navigate" data-route="${key}" ${key === ui.view ? 'aria-current="page"' : ""}>${icon(symbol)}${title}${key === "missions" ? `<span class="count" aria-label="${running} en cours">${running}</span>` : ""}</button>`).join("")}</nav><button class="nav-item feedback-nav" data-action="leave-feedback">${icon("star")}Laisser un avis</button><div class="sidebar-bottom"><div class="goal-mini"><span class="eyebrow">VOTRE CAP</span><strong>${escapeHTML(capShort)}</strong><small class="muted">${state.goal.months ? `${state.goal.months} mois · ` : ""}${state.goal.hiring ? "Recrutement possible" : "Sans recruter"}</small></div><button type="button" class="account-btn ${ui.view === "compte" ? "active" : ""}" data-action="navigate" data-route="compte" ${ui.view === "compte" ? 'aria-current="page"' : ""}><span class="avatar">${firstInitial()}</span><span><strong>Mon compte</strong><small>${state.account.credits} crédit${state.account.credits > 1 ? "s" : ""}</small></span>${icon("chevron-right")}</button><p class="demo-label">Maquette V5.2 · Données d'exemple</p></div></aside><div class="app-main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Ouvrir le menu">${icon("menu")}</button><div class="breadcrumb"><span>Votre espace</span>${icon("chevron-right")}<strong>${active[1]}</strong></div><div class="actions"><span class="small muted date">${date}</span>${state.session.id ? `<span class="badge">Session ${escapeHTML(state.session.id)}</span>` : ""}${paulButton(pageContext(), "Discuter avec Paul", "primary")}</div></header><main id="main" class="page ${ui.animate ? "enter" : ""}" tabindex="-1">${content}<footer class="page-footer"><span>Maquette interactive · Données et envois simulés · Aucun envoi réel</span><span>Vos choix sont enregistrés sur cet appareil.</span></footer></main></div>`;
}

function pageHead(title, description, eyebrow = "", action = "") {
  return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1><p>${description}</p></div>${action ? `<div class="actions">${action}</div>` : ""}</div>`;
}

/* ---------- Accueil : Avec Paul ---------- */

function paulBrief() {
  const def = definitionsFor(state)[state.priority];
  const active = Object.values(state.missions).filter((value) => value === "active").length;
  if (Object.values(state.missions).every((status) => ["stopped", "dismissed"].includes(status)))
    return "Aucune mission ne reste au plan. Vous pouvez remettre une mission écartée au plan ou construire une nouvelle piste avec moi.";
  if (!active && !state.publications.length)
    return `J'ai croisé votre ambition (« ${escapeHTML(goalText())} ») avec les constats ci-dessous. Je recommande un test ciblé avant d'élargir : <strong>${def.short}</strong>. Chaque mission découle d'un constat : vous pouvez la modifier, l'écarter ou m'en proposer une autre.`;
  return `Nous avançons avec un cadre clair : ${plural(active, "mission en cours", "missions en cours")}. Les constats ci-dessous restent la base de chaque mission : challengez-les, modifiez une mission ou écartez-la.`;
}

function validationList() {
  const rows = [
    ...Object.entries(state.documents)
      .filter(([id, item]) => state.missions[item.mission] === "active" && !item.scheduled && !isDiffused(state, id, currentVersion(item).number))
      .map(([id, item]) => {
        const validated = item.approved === currentVersion(item).number;
        return `<div class="decision">${icon("file-check-2")}<div><strong class="small">${definitionsFor(state)[item.mission].short} · ${validated ? "validé" : "prêt"}</strong><p>V${currentVersion(item).number} · ${validated ? "Validé, pas encore diffusé" : "Votre regard avant toute action"}</p>${navButton(`atelier/${id}`, "Examiner", "text", "arrow-up-right")}</div></div>`;
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

function findings() {
  return [
    { mission: "proof", title: "4 réalisations visibles", origin: "Pages publiques du site · relevé d'exemple", source: "site", level: [state.profile.url ? "Observation" : "Non vérifié", state.profile.url ? "green" : "amber"], note: "18 réalisations au total : déclaration du dirigeant, non vérifiée.", deduction: "Votre savoir-faire est peu visible. Documenter une réalisation avant de multiplier les contenus." },
    { mission: "agencies", title: "6 agences dans la zone", origin: "Annuaire local · échantillon de démonstration", source: "agencies", level: ["Piste à qualifier", "amber"], note: "Aucun besoin confirmé à ce stade.", deduction: "Des prescripteurs possibles. Tester 1 ou 2 agences, puis juger les retours." },
    { mission: "leads", title: `${state.contacts.length} anciens prospects`, origin: state.contactsSource === "import" ? "Fichier importé · simulation" : "Déclaré à Paul · fichier non importé", source: "", level: [state.contactsConfirmed ? "Échantillon confirmé" : "À vérifier", state.contactsConfirmed ? "green" : "amber"], note: `${eligibleContacts(state).length} recontactables après contrôle de l'ancienneté et du droit de recontact.`, deduction: "Des relations existantes avant d'acheter du trafic. Vérifier jusqu'à 8 contacts avant le moindre envoi." },
    ...Object.entries(state.customMissions).map(([id, def]) => ({ mission: id, title: "Votre constat", origin: "Cadré avec Paul", source: "", level: ["Déclaré par vous", "amber"], note: def.evidence, deduction: `Tester cette piste : ${missionTarget(state, id)}.` })),
  ];
}

function missionActions(id, compact = false) {
  const status = state.missions[id];
  const dismissed = status === "dismissed";
  return `${navButton(`missions/${id}`, dismissed ? "Voir" : status === "proposed" ? "Examiner et lancer" : "Voir la mission", !compact && !dismissed && state.priority === id ? "primary small" : "small", "arrow-up-right")}${paulButton(`mission:${id}`, "Affiner avec Paul", "small")}${status === "stopped" ? "" : button("edit-mission", "Modifier l'objectif", "small", "pencil", `data-mission="${id}"`)}${dismissed ? button("restore-mission", "Remettre au plan", "small", "undo-2", `data-mission="${id}"`) : status === "stopped" ? "" : button("dismiss-mission", "Écarter", "small", "trash-2", `data-mission="${id}" ${status === "active" ? 'disabled title="En cours : mettez-la en pause avant de l\'écarter"' : ""}`)}`;
}

function findingsPlan() {
  return `<section class="section-space" aria-labelledby="plan-title"><div class="section-heading"><div><h2 id="plan-title">Vos missions regroupées</h2><p>Lisez chaque ligne de gauche à droite : ce que nous avons observé, ce que Paul en déduit, la mission qui en découle.</p></div></div>
  <div class="flow-head" aria-hidden="true"><span>1 · Ce que nous avons observé</span><span>2 · Ce que Paul en déduit</span><span>3 · La mission qui en découle</span></div>
  <div class="finding-list">${findings().map((item, index) => {
    const id = item.mission;
    const def = definitionsFor(state)[id];
    const status = state.missions[id];
    return `<article class="finding ${status === "dismissed" ? "dismissed" : ""}"><div class="finding-obs"><span class="finding-num">${index + 1}</span><div><strong>${item.title}</strong><p>${item.origin}</p>${badge(item.level[0], item.level[1])}<p>${item.note}</p>${item.source ? button("source", "Voir la source", "text small", "external-link", `data-source="${item.source}"`) : ""}</div></div><div class="finding-arrow" aria-hidden="true">${icon("arrow-right")}</div><div class="finding-deduction"><p>${item.deduction}</p></div><div class="finding-arrow" aria-hidden="true">${icon("arrow-right")}</div><div class="finding-mission"><div class="spread">${badge(statusText(status), status === "active" ? "green" : status === "dismissed" ? "" : "amber")}${state.priority === id && status !== "dismissed" ? badge("Priorité de Paul", "blue") : ""}</div><strong>${def.title}</strong><p class="small muted">${escapeHTML(missionTarget(state, id))}</p><p class="small">${icon("users")} ${escapeHTML(scopeSummary(state, id))}</p><div class="actions">${missionActions(id, true)}</div></div></article>`;
  }).join("")}${state.ideas.map((idea) => `<article class="finding idea"><div class="finding-obs"><span class="finding-num">${icon("lightbulb")}</span><div><strong>Idée à cadrer</strong><p>${escapeHTML(idea.text)}</p><p>Notée le ${formatDate(idea.date)}</p></div></div><div class="finding-arrow" aria-hidden="true">${icon("arrow-right")}</div><div class="finding-deduction"><p>Pas encore une mission : il faut un constat, un périmètre et un résultat attendu.</p></div><div class="finding-arrow" aria-hidden="true">${icon("arrow-right")}</div><div class="finding-mission"><div>${badge("Mission à créer", "amber")}</div><p class="small muted">Confirmez le constat, le type d'action et le résultat avant de créer la mission.</p><div class="actions">${button("new-mission", "Cadrer avec Paul", "small", "plus", `data-idea="${idea.id}"`)}${button("drop-idea", "Retirer l'idée", "small", "trash-2", `data-id="${idea.id}"`)}</div></div></article>`).join("")}</div></section>`;
}

function strategyDecisionHero(step, focus) {
 const def=definitionsFor(state)[focus]; const finding=findings().find((item)=>item.mission===focus);
 const cta=step.route?navButton(step.route,step.label,"primary","arrow-right"):step.action==="report"?button("report",step.label,"primary","pencil",`data-mission="${focus}"`):step.action==="decide-next"?button("decide-next",step.label,"primary","git-fork",`data-mission="${focus}"`):navButton(`missions/${focus}`,"Examiner cette mission","primary","arrow-right");
 return `<section class="strategy-decision"><div><span class="eyebrow">VOTRE PROCHAINE DÉCISION</span><h2>${escapeHTML(step.title)}</h2><p>${escapeHTML(step.detail)}</p><div class="decision-reasons"><div><strong>Pourquoi maintenant</strong><span>${escapeHTML(finding?.deduction||def.rationale)}</span></div><div><strong>Preuve utilisée</strong><span>${escapeHTML(def.evidence)}</span></div><div><strong>À vérifier</strong><span>${escapeHTML(def.caveat)}</span></div></div></div><aside class="strategy-decision-action">${badge(def.short,"blue")}<strong>${escapeHTML(missionTarget(state,focus))}</strong>${cta}${paulButton(`mission:${focus}`,"Challenger avec Paul","text")}<small>Rien ne sera lancé ou diffusé sans votre accord.</small></aside></section>`;
}
function strategyLearningCard(id){const report=state.reports[id];if(!report)return "";const def=definitionsFor(state)[id];return `<section class="strategy-learning"><div class="section-heading"><div><span class="eyebrow">CE QUE PAUL APPREND</span><h2>${escapeHTML(def.short)}</h2></div>${navButton("resultats","Voir le bilan","small","arrow-right")}</div><div class="learning-grid"><div><strong>Observé</strong><p>${report.leads} demande${report.leads>1?"s":""}, ${report.meetings} rendez-vous.</p></div><div><strong>Ce que cela suggère</strong><p>${report.meetings?"La piste mérite un second test limité.":"Le signal reste trop faible pour élargir."}</p></div><div><strong>Ce que cela ne prouve pas</strong><p>La répétabilité et l'attribution restent à confirmer.</p></div><div><strong>Impact sur le plan</strong><p>Réviser la priorité sans élargir automatiquement.</p></div></div></section>`;}
function paulPage(){const step=nextStep(state);const focus=step.mission||state.priority;const actions=`${paulButton("strategy","Challenger le plan")}${button("new-mission","Créer une mission","primary","plus")}`;return `${pageHead(`Bonjour ${escapeHTML(state.profile.firstName)}.`,"Votre stratégie relie votre ambition, les constats, les missions et les apprentissages.","VOTRE STRATÉGIE AVEC PAUL",actions)}${strategyDecisionHero(step,focus)}${strategyLearningCard(focus)}<section class="strategy-validations section-space"><div class="section-heading"><div><h2>À valider par vous</h2><p>Une validation de contenu n'est jamais une autorisation de diffusion.</p></div></div>${validationList()}</section>${findingsPlan()}`;}

/* ---------- Missions ---------- */

function missionCard(id) {
  const def = definitionsFor(state)[id];
  const status = state.missions[id];
  const stage = journeyStage(state, id);
  return `<article class="mission-card info ${status === "dismissed" ? "dismissed" : ""}"><div class="mission-card-body"><div class="spread">${badge(statusText(status), status === "active" ? "green" : status === "dismissed" ? "" : "amber")}${state.priority === id && status !== "dismissed" ? badge("Priorité de Paul", "blue") : ""}</div><h2>${def.title}</h2><p>${def.evidence}</p><dl class="facts"><div><dt>Périmètre</dt><dd>${escapeHTML(scopeSummary(state, id))}</dd></div><div><dt>Étape</dt><dd>${nextStepLabel(stage)}</dd></div></dl>${status === "dismissed" ? "" : journeyTracker(id)}<div class="target">${icon("target")} ${escapeHTML(missionTarget(state, id))}</div><div class="inline"><span class="avatar paul">P</span><span class="small muted">Votre copilote Paul</span></div><div class="actions">${missionActions(id)}</div></div></article>`;
}

function newMissionPage() {
  const idea = state.ideas.find((item) => item.id === ui.missionIdea);
  return `${navButton("missions", "Toutes les missions", "text", "arrow-left")}${pageHead("Cadrons votre nouvelle mission.", "Un constat, un résultat attendu et un premier test à décider ensemble.", "AVEC PAUL")}
  <div class="brief"><span class="avatar paul">P</span><p>Quel fait vous donne envie d'agir ? Nous choisissons ensuite un type d'action. Je vous proposerai un périmètre et un brouillon à vérifier avant le lancement.</p></div>
  <form data-form="create-mission" class="stack new-mission-form" data-idea="${escapeHTML(idea?.id || "")}"><label class="field"><span>Le constat de départ</span><textarea name="rationale" required minlength="10" maxlength="300" rows="3">${escapeHTML(idea?.text || "")}</textarea></label><div class="form-grid"><label class="field"><span>Nom de la mission</span><input name="title" required minlength="5" maxlength="80"></label><label class="field"><span>Type d'action</span><select name="template"><option value="agencies">Partenariat · e-mail aux agences</option><option value="proof">Réalisation · publication Facebook</option><option value="leads">Réactivation · e-mail aux prospects</option></select></label></div><label class="field"><span>Résultat recherché</span><textarea name="target" required minlength="5" maxlength="120" rows="2" placeholder="Ex. Obtenir deux échanges qualifiés"></textarea></label><p class="muted small">La création ne consomme aucun crédit et n'autorise aucun envoi. Le lancement coûtera ${CREDIT_COST.start} crédits fictifs, après vérification du périmètre.</p><div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">${icon("plus")}Créer la mission</button>${paulButton("idea:new", "En discuter avec Paul")}</div></form>`;
}

function missionsPage() {
  if (location.hash.split("/")[2] === "nouvelle") return newMissionPage();
  if (location.hash.split("/")[2]) return missionDetail();
  const ids = [state.priority, ...Object.keys(definitionsFor(state)).filter((id) => id !== state.priority)].filter((id) => ui.filter === "all" || state.missions[id] === ui.filter);
  const filters = [["all", "Toutes"], ["active", "En cours"], ["proposed", "À décider"], ["paused", "En pause"], ["stopped", "Arrêtées"], ["dismissed", "Écartées"]];
  return `${pageHead("Des missions, pas une liste de tâches.", "Chaque mission relie un constat, un périmètre que vous choisissez et un résultat attendu. Vous pouvez la modifier, l'écarter ou en créer une avec Paul.", escapeHTML(goalText()), button("new-mission", "Créer une mission avec Paul", "", "plus"))}
  <nav class="tabs" aria-label="Filtrer les missions">${filters.map(([value, title]) => `<button class="${ui.filter === value ? "active" : ""}" aria-pressed="${ui.filter === value}" data-action="filter" data-filter="${value}">${title} ${value === "all" ? Object.keys(state.missions).length : Object.values(state.missions).filter((status) => status === value).length}</button>`).join("")}</nav>${ids.length ? `<div class="mission-grid">${ids.map(missionCard).join("")}</div>` : `<div class="empty">${icon("flag")}<h2>Aucune mission dans cette vue</h2><p>Les propositions restent disponibles dans Toutes.</p>${button("filter", "Voir les propositions", "", "arrow-right", 'data-filter="all"')}</div>`}
  <div class="notice section-space">${icon("shield-check")}<p><strong>${delegationText()}.</strong> Une mission en cours autorise la préparation, pas un envoi implicite. Budget média : ${state.goal.budget} €/mois maximum, aucune dépense engagée.</p></div>
  ${state.ideas.length ? `<section class="section-space"><div class="section-heading"><h2>Vos idées à cadrer</h2><span class="small muted">Notées avec Paul, pas encore des missions</span></div>${state.ideas.map((idea) => `<div class="row"><div><strong class="small">${escapeHTML(idea.text)}</strong><p>Notée le ${formatDate(idea.date)} · à cadrer : périmètre, résultat attendu, risque</p></div>${button("drop-idea", "Retirer", "small", "trash-2", `data-id="${idea.id}"`)}</div>`).join("")}</section>` : ""}`;
}

function scopeEditor(id) {
  const template = templateOf(state, id);
  const scope = state.scope[id];
  const lock = scopeLock(state, id);
  const disabled = lock ? "disabled" : "";
  let body = "";
  if (template === "agencies")
    body = `<fieldset ${disabled}><legend>Agences à contacter · 1 ou ${AGENCIES_MAX} sur ${AGENCIES.length}</legend><div class="pick-list">${AGENCIES.map((agency) => `<label class="pick"><input type="checkbox" name="agency" value="${agency.id}" ${scope.ids.includes(agency.id) ? "checked" : ""}><span><strong>${agency.name}</strong><small>${agency.note} · ${agency.email}</small></span></label>`).join("")}</div></fieldset><p class="small muted pick-count" aria-live="polite">${scope.ids.length} sur ${AGENCIES_MAX} choisies</p>`;
  else if (template === "leads") {
    const eligible = eligibleContacts(state).length;
    body = `<fieldset ${disabled}><legend>Contacts à recontacter · 1 à ${LEADS_MAX} parmi ${eligible} recontactables sur ${state.contacts.length}</legend><div class="actions" style="margin-bottom:10px">${button("select-recent", `Choisir les ${LEADS_MAX} plus récents`, "small", "list-checks", lock ? "disabled" : "")}${button("import-contacts", "Importer un fichier", "small", "upload", lock ? "disabled" : "")}<span class="small muted">${state.contactsSource === "import" ? "Fichier importé (simulation)" : "Liste déclarée à Paul"}</span></div><div class="contact-list">${state.contacts.map((contact) => { const status = contactStatus(contact); return `<label class="pick ${status.ok ? "" : "off"}"><input type="checkbox" name="contact" value="${contact.id}" ${scope.ids.includes(contact.id) ? "checked" : ""} ${status.ok ? "" : "disabled"}><span><strong>${escapeHTML(contact.name)}</strong><small>${escapeHTML(contact.email)} · il y a ${contact.monthsAgo} mois</small></span>${badge(status.reason, status.ok ? "green" : "amber")}</label>`; }).join("")}</div></fieldset><p class="small muted pick-count" aria-live="polite">${scope.ids.length} sur ${LEADS_MAX} choisis</p>`;
  } else
    body = `<fieldset ${disabled}><legend>Réalisation à mettre en avant · 1 parmi ${PROJECTS.length} visibles</legend><div class="pick-list">${PROJECTS.map((project) => `<label class="pick"><input type="radio" name="project" value="${project.id}" ${scope.project === project.id ? "checked" : ""}><span><strong>${project.title}</strong><small>Droits photo à confirmer avant publication</small></span></label>`).join("")}</div></fieldset>`;
  return `<form data-form="scope" data-mission="${id}" class="stack-sm">${lock ? `<div class="notice amber">${icon("lock")}<p>${lock}</p></div>` : ""}${body}<div class="form-error" role="alert"></div><button class="btn" type="submit" ${disabled}>${icon("save")}Enregistrer le périmètre</button></form>`;
}

function missionDetail() {
  const id = ui.mission;
  const def = definitionsFor(state)[id];
  const doc = state.documents[def.document];
  const version = currentVersion(doc).number;
  const status = state.missions[id];
  const active = status === "active";
  const diffused = isDiffused(state, def.document, version);
  const hasDiffusion = state.publications.some((item) => missionOfDocument(state, item.document) === id);
  const approved = doc.approved === version;
  const decided = state.decisions[id];
  const stage = journeyStage(state, id);
  const task = (number, title, description, label, action, done = false) =>
    `<div class="task ${done ? "done" : ""}"><span class="task-num">${done ? icon("check") : number}</span><div><strong>${title}</strong><p>${description}</p>${badge(label, done ? "green" : "")}</div>${action}</div>`;
  const done = (count) => `${count} / 5 étapes`;
  const progress = status === "stopped" ? 5 : decided ? 5 : diffused || hasDiffusion ? 4 : approved ? 3 : active ? 2 : 0;
  const launchLabel = status === "paused" ? "Reprendre la mission" : "Confirmer et lancer";
  return `${navButton("missions", "Toutes les missions", "text", "arrow-left")}<div class="mission-heading"><div><div class="actions" style="margin-top:16px">${badge(statusText(status), active ? "green" : "amber")}${badge("Paul coordonne", "blue")}</div><h1>${def.title}</h1><p>${escapeHTML(missionTarget(state, id))}</p><div class="actions" style="margin-top:18px">${status === "stopped" ? badge("Bilan fait · mission close") : status === "dismissed" ? button("restore-mission", "Remettre au plan", "primary", "undo-2", `data-mission="${id}"`) : !active ? button("start-mission", launchLabel, "primary", "play", `data-mission="${id}"`) : button("pause-mission", "Mettre en pause", "", "pause", `data-mission="${id}"`)}${paulButton(`mission:${id}`, "Ajuster avec Paul")}${status === "stopped" ? "" : button("edit-mission", "Modifier l'objectif", "", "pencil", `data-mission="${id}"`)}${status === "dismissed" || status === "stopped" ? "" : button("dismiss-mission", "Écarter du plan", "", "trash-2", `data-mission="${id}" ${active ? 'disabled title="En cours : mettez-la en pause avant de l\'écarter"' : ""}`)}</div></div><dl class="mission-status"><div><dt>Périmètre</dt><dd>${escapeHTML(scopeSummary(state, id))}</dd></div><div><dt>Étape</dt><dd>${nextStepLabel(stage)}</dd></div></dl></div>
  ${status === "dismissed" ? `<div class="notice amber" style="margin-bottom:20px">${icon("trash-2")}<p>Cette mission est écartée du plan. Rien n'est effacé : remettez-la au plan pour la reprendre.</p></div>` : journeyTracker(id)}
  <div class="two-col section-space"><section><div class="section-heading"><h2>Pourquoi cette mission ?</h2>${navButton("paul", "Revenir aux constats", "text", "arrow-up-right")}</div><p class="muted">${def.rationale}</p>
  <div class="section-heading section-space"><h2>Ce que vous choisissez</h2>${decided?.outcome === "continue" && stage === "next-round" ? badge("Poursuite décidée", "green") : ""}</div>${scopeEditor(id)}
  <div class="section-heading section-space"><h2>Les actions de la mission</h2><span class="small muted">${done(progress)}</span></div><div class="task-list">
  ${task(1, "Confirmer le périmètre", `${escapeHTML(scopeSummary(state, id))}.`, active ? "Périmètre confirmé" : "À cadrer", active ? navButton(`missions/${id}`, "Revoir", "small", "eye") : button("start-mission", "Lancer", "small", "play", `data-mission="${id}"`), active)}
  ${task(2, "Préparer une première proposition", `Paul prépare, Paul coordonne. Votre marque et vos contraintes sont reprises.`, active ? `V${doc.versions[0].number} disponible` : "Aperçu possible dans l'atelier", navButton(`atelier/${def.document}`, "Ouvrir l'atelier", "small", "panels-top-left"), active)}
  ${task(3, "Relire et valider la version", "Vous · le contenu, le visuel et les mentions qui engagent votre entreprise.", approved || diffused ? `V${doc.approved ?? version} validée` : "Votre décision", navButton(`atelier/${def.document}`, approved ? "Voir la version" : "Examiner", "small", "check"), approved || diffused)}
  ${task(4, doc.channel === "facebook" ? "Publier sur Facebook" : "Envoyer par Gmail", `${channelLabel(doc.channel)} · ${state.channels[doc.channel] ? "canal connecté (simulation)" : "connexion nécessaire"}. Confirmation distincte de la validation.`, hasDiffusion ? "Diffusion simulée" : doc.scheduled ? "Programmée" : "Non diffusée", navButton(`atelier/${def.document}`, "Gérer la diffusion", "small", "send"), hasDiffusion)}
  ${task(5, "Faire le bilan, puis décider la suite", "Vous notez les résultats ; vous décidez : poursuivre, adapter avec Paul ou arrêter.", status === "stopped" ? "Mission arrêtée" : decided ? "Décision prise" : hasDiffusion ? "Bilan possible" : "Après la première diffusion", hasDiffusion && active ? stage === "report" ? button("report", "Renseigner mon bilan", "small", "pencil", `data-mission="${id}"`) : button("decide-next", "Décider la suite", "small", "git-fork", `data-mission="${id}"`) : navButton("resultats", "Voir les résultats", "small", "chart-no-axes-combined"), status === "stopped" || Boolean(decided))}
  </div></section>
  <aside class="contract"><h3>Notre contrat de mission</h3><dl><dt>Résultat recherché</dt><dd>${escapeHTML(missionTarget(state, id))}</dd><dt>Coût</dt><dd>${CREDIT_COST.start} crédits au lancement. Vos validations et diffusions sont gratuites.</dd><dt>Dépenses externes</dt><dd>0 € prévu. Aucun achat autorisé.</dd><dt>Règle d'arrêt</dt><dd>${def.stopRule}</dd><dt>Délégation</dt><dd>${delegationText()}</dd></dl><div class="notice amber" style="margin-top:24px">${icon("shield-alert")}<p>${def.risk}</p></div><div class="section-space"><h3>Comment Paul vous accompagne</h3><div class="timeline"><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul cadre le test</strong><p>Votre ambition, les limites, la décision.</p></div><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul prépare</strong><p>Le travail spécialisé, sous ce cadre.</p></div><div class="timeline-item"><span class="avatar paul">P</span><strong>Paul vous restitue</strong><p>Une proposition à examiner, pas une action cachée.</p></div></div></div></aside></div>`;
}

/* ---------- Entreprise ---------- */

const COMPETITOR_DETAILS = [
  ["ÉcoHabitat Provence", "Aides et financements", "Met les aides en avant dès la page d'accueil", "Peu de réalisations datées"],
  ["Maison Thermique", "Aides et accompagnement", "Parcours « clé en main » en quatre étapes", "Aucun prix indiqué"],
  ["Confort Aix", "Aides et accompagnement", "Beaucoup de témoignages de clients", "Zone d'intervention floue"],
  ["Rénovation du Sud", "Travaux et proximité", "Photos de chantiers récents", "Peu d'aides citées"],
  ["Énergie Habitat", "Travaux et expertise", "Vocabulaire technique, expertise affichée", "Ton peu accessible"],
];

const POSITIONING_AXES = [
  ["Accompagnement de proximité", "Fort", "green", "Mis en avant par 2 concurrents sur 5", "À garder comme socle"],
  ["Réalisations visibles", "Faible", "amber", "Mises en avant par 2 concurrents sur 5", "À renforcer : c'est la mission « Preuves »"],
  ["Aides et financements", "Peu présent", "amber", "Mises en avant par 3 concurrents sur 5", "Terrain encombré : à ne pas copier"],
  ["Expertise technique", "Moyen", "", "Affichée par 1 concurrent sur 5", "Piste à explorer avec Paul"],
];

function analysisSection() {
  return `<section class="analysis-block" aria-labelledby="posi-title"><div class="section-heading"><div><span class="eyebrow">LE TRAVAIL DE MARTINE · 1 SUR 2</span><h2 id="posi-title">Votre positionnement</h2><p>Ce que nous proposons de dire de vous, et pourquoi. Chaque ligne est une hypothèse à challenger.</p></div>${paulButton("positionnement", "Affiner avec Paul", "small")}</div>
  <div class="two-col"><div class="stack"><div class="positioning-card"><span class="eyebrow">POSITIONNEMENT PROPOSÉ · À CHALLENGER</span><blockquote>« ${escapeHTML(state.profile.name)}, le partenaire de proximité pour rénover avec des choix clairs et un accompagnement concret. »</blockquote><p>Pas de promesse d'économie chiffrée, de certification ou de délai sans preuve.</p></div><div class="three-col reasons"><div class="panel"><span class="badge green">Observé</span><p class="small">Votre site parle d'accompagnement, mais montre peu de réalisations (4 visibles sur 18 déclarées).</p></div><div class="panel"><span class="badge amber">Hypothèse</span><p class="small">Vos clients choisissent la proximité et la clarté plutôt que le prix ou les aides.</p></div><div class="panel"><span class="badge">À éviter</span><p class="small">Copier les promesses d'aides des concurrents, sans preuve ni chiffre vérifié.</p></div></div></div>
  <div><h3>Où vous vous situez</h3><div class="axis-list">${POSITIONING_AXES.map(([axis, level, tone, others, advice]) => `<div class="axis"><div class="spread"><strong class="small">${axis}</strong>${badge(level, tone)}</div><p class="small muted">${others}</p><p class="small">${advice}</p></div>`).join("")}</div></div></div></section>
  <section class="analysis-block section-space" aria-labelledby="conc-title"><div class="section-heading"><div><span class="eyebrow">LE TRAVAIL DE MARTINE · 2 SUR 2</span><h2 id="conc-title">La concurrence locale</h2><p>Cinq acteurs repérés. Un échantillon fictif pour la démonstration, pas une étude du marché réel.</p></div>${paulButton("concurrence", "Questionner avec Paul", "small")}</div>
  <table class="source-table competitors"><thead><tr><th>Acteur</th><th>Angle principal</th><th>Ce qu'il met en avant</th><th>Ce qu'il ne montre pas</th><th>Fiabilité</th></tr></thead><tbody>${COMPETITOR_DETAILS.map(([name, angle, shows, missing]) => `<tr><td data-label="Acteur"><strong>${name}</strong></td><td data-label="Angle principal">${angle}</td><td data-label="Ce qu'il met en avant">${shows}</td><td data-label="Ce qu'il ne montre pas">${missing}</td><td data-label="Fiabilité">${badge("À confirmer", "amber")}</td></tr>`).join("")}</tbody></table>
  <div class="three-col reasons section-space"><div class="panel"><h3>${icon("lightbulb")} Ce qu'il faut en retenir</h3><p class="small muted">Trois concurrents sur cinq parlent d'aides. Aucun ne montre clairement son accompagnement de bout en bout : c'est votre espace.</p></div><div class="panel"><h3>${icon("target")} Ce que Paul en fait</h3><p class="small muted">Priorité aux preuves (réalisations) et aux prescripteurs locaux, avant tout achat de trafic.</p>${navButton("paul", "Voir les missions qui en découlent", "text small", "arrow-right")}</div><div class="panel"><h3>${icon("circle-help")} Ce qu'il nous manque</h3><ul class="list-clean small muted"><li>Marge par offre et CA de départ</li><li>Trafic et provenance des demandes</li><li>Performance réelle des concurrents : non accessible</li></ul></div></div></section>`;
}

function enterprisePage() {
  const tabs = [["audit", "Diagnostic & positionnement"], ["marque", "Ma marque"], ["canaux", "Canaux & délégation"]];
  let content = "";
  if (ui.tab === "audit")
    content = `<div class="analysis-summary"><div><strong>5</strong><span>acteurs analysés</span></div><div><strong>3</strong><span>sources lues</span></div><div><strong>4</strong><span>réalisations repérées</span></div><div><strong>1</strong><span>positionnement proposé</span></div></div><div class="spread wrap" style="margin:18px 0 26px"><div class="actions">${badge("Relevé du 28 oct. 2026")}${badge("Données d'exemple", "amber")}</div><div class="actions">${button("profile", "Corriger mon profil", "small", "pencil")}${navButton("paul", "Voir les constats et les missions", "small", "arrow-right")}</div></div>${analysisSection()}<section class="section-space"><div class="section-heading"><h2>Vos repères</h2></div><div class="three-col"><div class="panel"><span class="muted small">Ambition</span><p>${escapeHTML(goalText())}</p>${button("goal", "Modifier avec Paul", "small", "pencil")}</div><div class="panel"><span class="muted small">Localisation</span><p>${escapeHTML(state.profile.location)}</p>${badge("Confirmé", "green")}</div><div class="panel"><span class="muted small">Territoire d'intervention</span><p>${escapeHTML(state.profile.area)}</p>${badge("Confirmé", "green")}</div><div class="panel"><span class="muted small">Clients</span><p>${escapeHTML(state.profile.clients)}</p>${badge("Confirmé", "green")}</div></div></section>`;
  if (ui.tab === "marque")
    content = `<div class="two-col"><section class="stack"><div><h2>Votre marque, pas celle de Paul.</h2><p class="muted small" style="margin-top:8px">${state.profile.url ? "Proposition issue du relevé d'exemple du site." : "Aucun site renseigné : identité suggérée, sans source observée."} Chaque élément reste à confirmer.</p></div><div class="brand-preview" style="--brand:${state.brand.color}">${brandLogo()}<h2>Des choix clairs.<br>Une maison qui vous ressemble.</h2><div class="palette"><span class="swatch"><i style="background:${state.brand.color}"></i>${state.brand.color}</span><span class="swatch"><i style="background:${state.brand.accent}"></i>${state.brand.accent}</span></div></div><div class="row"><div><strong class="small">Origine des éléments</strong><p>Palette : ${state.profile.url ? "exemple de site" : "proposition sans source"} · Signature : proposition · Logo : ${state.brand.logo ? "importé par vous" : "aucun"} · Photo : illustration</p></div>${badge(state.brand.confirmed ? "Confirmé par vous" : "À confirmer", state.brand.confirmed ? "green" : "amber")}</div><div><h3>À préserver dans les contenus</h3><ul class="list-clean small"><li>${icon("check")}Une parole simple, sans jargon technique</li><li>${icon("check")}Des réalisations et des faits vérifiables</li><li>${icon("check")}Aucun avis, label ou gain inventé</li></ul></div></section>
    <div class="stack"><section class="stack logo-panel"><h3>Votre logo</h3><div class="logo-box">${state.brand.logo ? `<img src="${state.brand.logo}" alt="Logo de ${escapeHTML(state.profile.name)}">` : `<span class="muted small">Aucun logo pour le moment</span>`}</div><div class="actions"><label class="btn small upload">${icon("image-plus")}${state.brand.logo ? "Remplacer le logo" : "Ajouter un logo"}<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" aria-label="Ajouter un logo"></label>${state.brand.logo ? button("remove-logo", "Retirer", "small", "trash-2") : ""}</div><small class="muted">PNG, JPG ou WebP · 500 Ko maximum. Un nouveau logo impose une nouvelle validation du visuel.</small></section>
    <form data-form="brand" class="stack"><h3>Le kit de référence</h3><div class="form-grid"><label class="field"><span>Couleur principale</span><input type="color" name="color" value="${state.brand.color}"></label><label class="field"><span>Accent</span><input type="color" name="accent" value="${state.brand.accent}"></label><label class="field full"><span>Ton de la marque</span><select name="tone">${["Clair, concret, rassurant", "Chaleureux et accessible", "Précis et expert"].map((tone) => `<option ${state.brand.tone === tone ? "selected" : ""}>${tone}</option>`).join("")}</select></label></div><label class="check"><input type="checkbox" name="confirmed" required ${state.brand.confirmed ? "checked" : ""}>Je confirme ces éléments pour les prochaines créations.</label><div class="form-error" role="alert"></div><button type="submit" class="btn primary">${icon("check")}Enregistrer ma marque</button>${navButton("atelier/post", "Voir le rendu dans l'atelier", "", "arrow-up-right")}<p class="muted small">Une modification de marque impose une nouvelle validation du visuel avant diffusion.</p></form></div></div>`;
  if (ui.tab === "canaux") {
    const scheduledOn = (channel) => Object.values(state.documents).filter((item) => item.channel === channel && item.scheduled).length;
    content = `<div class="two-col"><section><div class="section-heading"><div><h2>Les canaux de votre entreprise</h2><p>Connexion de démonstration, aucun accès réel à vos comptes.</p></div></div>${Object.keys(state.channels).map((channel) => `<div class="row"><div class="inline"><span class="avatar ${channel === "gmail" ? "camille" : ""}">${icon(channel === "facebook" ? "contact" : channel === "gmail" ? "mail" : "globe")}</span><div><strong>${channelLabel(channel)}</strong><p>${channel === "facebook" ? "Page " + escapeHTML(state.profile.name) : channel === "gmail" ? "contact@dupont-renovation.example" : "Accès en lecture · publication du site hors périmètre"}</p>${badge(state.channels[channel] ? "Connecté · démo" : "Non connecté", state.channels[channel] ? "green" : "")}${scheduledOn(channel) ? badge(`${plural(scheduledOn(channel), "programmation", "programmations")} liée${scheduledOn(channel) > 1 ? "s" : ""}`, "blue") : ""}</div></div>${button(state.channels[channel] ? "disconnect" : "connect", state.channels[channel] ? "Déconnecter" : "Connecter", "small", state.channels[channel] ? "unplug" : "plug", `data-channel="${channel}"`)}</div>`).join("")}<div class="notice section-space">${icon("lock-keyhole")}<p>Connecter un canal n'autorise aucun envoi. Le compte, la version et le moment sont confirmés séparément. Déconnecter un canal annule ses programmations.</p></div></section><form data-form="delegation" class="stack"><h2>Votre niveau de délégation</h2>${delegationChoices()}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer les règles</button><p class="muted small">Passer en préparation seule annule les programmations. Le budget média ne constitue jamais une autorisation de dépense.</p></form></div>`;
  }
  return `${pageHead("Une entreprise bien comprise.", "Votre diagnostic, votre identité et les règles qui guident les décisions de Paul.", escapeHTML(state.profile.name))}<nav class="tabs" aria-label="Dossier entreprise">${tabs.map(([key, title]) => `<button class="${ui.tab === key ? "active" : ""}" ${ui.tab === key ? 'aria-current="page"' : ""} data-action="navigate" data-route="entreprise/${key}">${title}</button>`).join("")}</nav>${content}`;
}

/* ---------- Mon compte ---------- */

function comptePage() {
  const ledger = state.account.ledger.slice(0, 8);
  return `${pageHead("Mon compte", "Votre identité, vos crédits et votre session. Les crédits paient la préparation par l'équipe, jamais vos validations ni vos diffusions.", "VOTRE COMPTE")}
  <div class="two-col"><section class="stack"><div class="panel account-credits"><span class="eyebrow">CRÉDITS</span><strong class="credits-count">${state.account.credits}</strong><p class="muted small">Lancer une mission coûte ${CREDIT_COST.start} crédits, une version préparée avec Paul ${CREDIT_COST.paulRevision}. Vos retouches, vos validations et vos diffusions sont gratuites.</p><div class="actions">${CREDIT_PACKS.map((amount) => button("recharge", `+${amount} crédits`, "small", "plus", `data-amount="${amount}"`)).join("")}</div><div class="notice amber">${icon("flask-conical")}<p>Simulation : aucun paiement n'est demandé.</p></div></div>
  <div><div class="section-heading"><h2>Historique des crédits</h2></div>${ledger.length ? ledger.map((item) => `<div class="row"><div><strong class="small">${escapeHTML(item.label)}</strong><p>${formatDate(item.date)}</p></div><strong class="${item.delta > 0 ? "green" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</strong></div>`).join("") : `<p class="muted small">Aucun mouvement pour le moment. Vous partez avec 20 crédits offerts.</p>`}</div></section>
  <aside class="stack"><div class="panel"><h3>${icon("circle-user")} Identité</h3><div class="row"><span class="muted small">Prénom</span><strong class="small">${escapeHTML(state.profile.firstName)}</strong></div><div class="row"><span class="muted small">E-mail</span><strong class="small">${escapeHTML(state.account.email)}</strong></div><div class="row"><span class="muted small">Entreprise</span>${navButton("entreprise", escapeHTML(state.profile.name), "text small", "arrow-up-right")}</div>${button("profile", "Corriger mon profil", "small", "pencil")}</div>
  <form data-form="session" class="panel stack-sm"><h3>${icon("list-checks")} Session de test</h3><label class="field"><span>Identifiant de session</span><input name="sessionId" maxlength="30" placeholder="Ex. T-014" value="${escapeHTML(state.session.id)}"><small>Relie vos retours à cette session. Ni nom ni coordonnées.</small></label><div class="actions"><button class="btn small" type="submit">${icon("save")}Enregistrer</button>${button("export-session", "Exporter le journal", "small", "download")}</div></form>
  <div class="panel stack-sm"><h3>${icon("hard-drive")} Vos données</h3><p class="muted small">Vos choix et échanges sont enregistrés uniquement dans ce navigateur. Aucune donnée n'est envoyée à une IA.</p><div class="actions">${navButton("decouvrir", "Revoir le concept", "small", "arrow-up-right")}${button("reset", "Recommencer la première connexion", "small danger", "rotate-ccw")}</div></div>
  ${button("signout", "Se déconnecter", "", "log-out")}</aside></div>`;
}

/* ---------- Atelier ---------- */

function artwork(version) {
  const color = version.color || state.brand.color;
  return `<div class="artwork ${version.layout === "editorial" ? "editorial" : ""}" style="--brand:${color};--accent:${version.accent || state.brand.accent}"><img src="${escapeHTML(version.photo || "chantier.jpg")}" alt="Maison illustrative pour la création de ${escapeHTML(version.companyName || state.profile.name)}">${version.logo ? `<img class="art-logo" src="${version.logo}" alt="Logo de ${escapeHTML(version.companyName || state.profile.name)}">` : ""}<div class="art-copy"><strong>${escapeHTML(version.headline)}</strong><small><span>${escapeHTML(version.companyName || state.profile.name)}</span><span>PARLONS DE VOTRE PROJET ${icon("arrow-up-right")}</span></small></div></div>`;
}

const authorBadge = (version) =>
  version.by === "vous" ? badge("Retouchée par vous", "blue") : version.by === "paul" ? badge(`Préparée avec Paul`, "green") : version.by === "système" ? badge("Mise à jour automatique") : badge(`${version.agent || "Agent"}, via Paul`, "green");

function atelierPage() {
  const docId = ui.document;
  const doc = state.documents[docId];
  const def = definitionsFor(state)[doc.mission];
  const latest = currentVersion(doc);
  const version = doc.versions.find((item) => item.number === ui.selectedVersion) || latest;
  const isOld = version.number !== latest.number;
  const visual = doc.channel === "facebook";
  const diffusedLatest = isDiffused(state, docId, latest.number);
  const diffusedShown = isDiffused(state, docId, version.number);
  const approved = doc.approved === latest.number;
  const archivedMission = ["stopped", "dismissed"].includes(state.missions[doc.mission]);
  const readOnly = isOld || Boolean(doc.scheduled) || diffusedLatest || archivedMission;
  const recipients = recipientsOf(state, docId);
  const dis = readOnly ? "disabled" : "";
  const preview = visual
    ? `<div class="social-preview"><div class="social-head"><span class="avatar company">${escapeHTML(state.profile.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHTML(version.companyName || state.profile.name)}</strong><span class="muted">Aperçu Facebook · ${diffusedShown ? "publication simulée enregistrée" : "non publié"}</span></div>${icon("ellipsis")}</div><div class="social-text">${escapeHTML(version.body)}</div>${artwork(version)}<div class="social-foot"><span>${icon("thumbs-up")} J'aime</span><span>${icon("message-circle")} Commenter</span><span>${icon("share-2")} Partager</span></div></div>`
    : `<article class="email-preview"><dl><dt>De</dt><dd>${escapeHTML(version.companyName || state.profile.name)} &lt;contact@dupont-renovation.example&gt;</dd><dt>À</dt><dd>${recipients.length ? `${recipients.map((item) => escapeHTML(item.name)).join(" ; ")} · ${plural(recipients.length, "destinataire", "destinataires")}, envois séparés` : "Aucun destinataire : choisissez le périmètre dans la mission"}</dd><dt>Objet</dt><dd><strong>${escapeHTML(version.title)}</strong></dd></dl><div class="email-body">${escapeHTML(version.body)}</div></article>`;
  const versionRows = [...doc.versions].reverse().map((item) => {
    const status = isDiffused(state, docId, item.number) ? "Diffusée" : doc.approved === item.number ? "Validée" : item.number === latest.number ? "Courante" : "Archive";
    return `<div class="row version-row ${item.number === version.number ? "selected" : ""}"><div><strong class="small">V${item.number} · ${escapeHTML(item.note)}</strong><p>${authorBadge(item)} ${badge(status, status === "Diffusée" || status === "Validée" ? "green" : "")}</p></div>${button("select-version", item.number === version.number ? "Affichée" : "Voir", "small", "eye", `data-version="${item.number}" ${item.number === version.number ? "disabled" : ""}`)}</div>`;
  }).join("");
  const lockNote = diffusedLatest && !archivedMission
    ? `<div class="notice green">${icon("lock")}<p>V${latest.number} a été diffusée : elle est en lecture seule. Toute modification crée V${latest.number + 1}, à valider à nouveau.</p></div>${button("reopen", `Créer V${latest.number + 1} à partir de V${latest.number}`, "", "copy")}`
    : "";
  const controls = `<section><div class="spread"><h3>La consigne de création</h3>${badge(`Paul → ${def.owner}`, "blue")}</div><p class="muted small">${visual ? "Rassurer avec une réalisation. Aucun gain énergétique ni témoignage non vérifié." : "Proposer un premier échange. Pas de prix, de promesse ou de relance automatique."}</p><div class="actions" style="margin-top:14px">${paulButton(`atelier:${docId}`, "Retravailler avec Paul", "small")}</div></section><section><h3>Texte & composition</h3>${lockNote}<form data-form="edit-document" class="stack-sm"><label class="field"><span>${visual ? "Accroche du visuel" : "Objet du message"}</span><input name="title" maxlength="100" required value="${escapeHTML(visual ? version.headline.replace(/\n/g, " ") : version.title)}" ${dis}></label><label class="field"><span>${visual ? "Texte de la publication" : "Message"}</span><textarea name="body" rows="5" maxlength="3000" required ${dis}>${escapeHTML(version.body)}</textarea></label>${visual ? `<label class="field"><span>Composition</span><select name="layout" ${dis}><option value="photo" ${version.layout !== "editorial" ? "selected" : ""}>Photo & signature</option><option value="editorial" ${version.layout === "editorial" ? "selected" : ""}>Cadre éditorial</option></select></label><div class="actions"><label class="btn small upload ${readOnly ? "off" : ""}">${icon("image-plus")}Importer une photo<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Importer une photo" ${dis}></label>${navButton("entreprise/marque", "Ma marque", "small", "palette")}</div><small class="muted">JPG, PNG ou WebP · 1 Mo maximum · photo actuelle illustrative.</small>` : ""}<div class="form-error" role="alert"></div><button class="btn" type="submit" ${dis}>${icon("save")}Enregistrer une nouvelle version</button></form></section>`;
  const previous = doc.versions.length > 1 ? doc.versions[doc.versions.length - 2] : null;
  const versionNote = previous ? `<section class="version-note"><h3>Une décision, une version.</h3><p class="muted small">Vous examinez V${latest.number} (${escapeHTML(latest.note)}).${doc.approved && doc.approved !== latest.number ? ` La validation de V${doc.approved} ne vaut plus pour cette version.` : ""}</p></section>` : "";
  const displayedStatus = isOld ? (diffusedShown ? "Diffusée · démo" : "Archive") : diffusedLatest ? "Diffusée · démo" : doc.scheduled ? "Programmée" : approved ? "Validée" : "Brouillon";
  const missionOff = state.missions[doc.mission] !== "active";
  const approvalState = missionOff
    ? { title: `Mission ${statusText(state.missions[doc.mission]).toLowerCase()}`, text: "Aucune diffusion tant que la mission n'est pas en cours.", actions: navButton(`missions/${doc.mission}`, "Revoir la mission", "", "arrow-right") }
    : isOld
    ? { title: `V${version.number} · archive en lecture seule`, text: "Revenir à une ancienne version passe par une nouvelle version, à valider.", actions: badge("Archive · lecture seule") }
    : diffusedLatest
      ? { title: `V${latest.number} diffusée · lecture seule`, text: "Suivez les retours dans Résultats. Pour une nouvelle série, créez la version suivante.", actions: `${navButton("resultats", "Voir le suivi", "primary", "arrow-right")}${button("reopen", `Créer V${latest.number + 1}`, "", "copy")}` }
      : doc.scheduled
        ? { title: `Programmée le ${formatDate(doc.scheduled)}`, text: "Validation du contenu et diffusion sont deux décisions distinctes.", actions: button("cancel-schedule", "Annuler la programmation", "", "calendar-x") }
        : !approved
          ? { title: "Votre accord est nécessaire", text: "Validation du contenu et diffusion sont deux décisions distinctes.", actions: button("approve", "Valider cette version", "primary", "check", missionOff ? "disabled" : "") }
          : { title: `V${latest.number} validée`, text: state.channels[doc.channel] ? "Il reste à confirmer la diffusion." : `Il faut connecter ${channelLabel(doc.channel)} avant de diffuser.`, actions: state.delegation === "prepare" ? button("copy", "Récupérer le texte", "primary", "copy") : button("publish", visual ? "Préparer la publication" : "Préparer l'envoi", "primary", "send") };
  return `${pageHead("L'atelier", "Un contenu lié à une mission, une marque et une version précise.", "CRÉER · AFFINER · VALIDER", navButton(`missions/${doc.mission}`, "Retour à la mission", "", "arrow-left"))}
    <div class="studio-toolbar"><label class="field" style="max-width:340px;flex:1"><span class="eyebrow">CONTENU</span><select aria-label="Contenu" id="document-select">${Object.entries(state.documents).map(([id, item]) => `<option value="${id}" ${docId === id ? "selected" : ""}>${item.channel === "facebook" ? "Publication" : "E-mail"} · ${escapeHTML(definitionsFor(state)[item.mission].short)}</option>`).join("")}</select></label><div class="actions">${badge(`V${version.number}${isOld ? " · archive" : " · courante"}`, "blue")}${badge(displayedStatus, diffusedShown || (!isOld && approved) ? "green" : "amber")}</div></div>
    ${missionOff ? `<div class="notice amber" style="margin-bottom:20px">${icon("info")}<p>Mission ${statusText(state.missions[doc.mission]).toLowerCase()} : aucune validation ni diffusion possible.</p>${navButton(`missions/${doc.mission}`, "Revoir la mission", "small", "arrow-right")}</div>` : ""}
    <div class="studio-layout"><section>
      <div class="studio-toolbar"><span class="small muted">${channelLabel(doc.channel)} · ${visual ? "Visuel carré 1:1" : "Message individuel"}</span><div class="segmented" aria-label="Affichage de l'aperçu">${visual ? `<button data-action="preview" data-preview="social" class="${ui.preview === "social" ? "active" : ""}">Publication</button><button data-action="preview" data-preview="visual" class="${ui.preview === "visual" ? "active" : ""}">Visuel seul</button>` : badge("Aperçu destinataire")}</div></div>
      <div class="preview-stage">${visual && ui.preview === "visual" ? `<div style="width:100%;max-width:460px">${artwork(version)}</div>` : preview}</div>
      <div class="spread wrap" style="margin-top:13px"><span class="small muted">${visual ? "Image illustrative · droits à confirmer pour un usage réel" : "Adresses .example · aucun e-mail réel"}</span>${button("copy", "Copier le texte", "small", "copy")}</div>
      <div class="studio-approval"><div><strong class="small">${approvalState.title}</strong><p class="muted small">${approvalState.text}</p></div><div class="actions">${approvalState.actions}</div></div>
      <section class="section-space"><h3>Historique des versions</h3>${versionRows}</section>
    </section><aside><div class="editor-controls">${versionNote}${controls}<section><h3>Cadre de diffusion</h3><div class="row"><span class="small">${channelLabel(doc.channel)}</span>${state.channels[doc.channel] ? badge("Connecté · démo", "green") : button("connect", "Connecter", "small", "plug", `data-channel="${doc.channel}"`)}</div><div class="row"><span class="small">Délégation</span><strong class="small">${delegationText()}</strong></div>${templateOf(state, doc.mission) !== "proof" ? `<div class="row"><div><span class="small">Destinataires</span><p>${plural(recipients.length, "destinataire", "destinataires")}</p></div>${navButton(`missions/${doc.mission}`, "Modifier", "small", "users")}</div>` : `<div class="row"><div><span class="small">Réalisation</span><p>${escapeHTML(scopeSummary(state, doc.mission))}</p></div>${navButton(`missions/${doc.mission}`, "Changer", "small", "layers")}</div>`}${visual ? `<div class="row"><span class="small">Marque actuelle</span>${state.brand.confirmed ? badge("Confirmée", "green") : navButton("entreprise/marque", "À confirmer", "text")}</div>` : ""}</section></div></aside></div>`;
}

/* ---------- Résultats ---------- */

function resultsPage() {
  const scheduled = Object.entries(state.documents).filter(([, doc]) => doc.scheduled);
  const reports = Object.entries(state.reports);
  const total = (key) => reports.reduce((sum, [, report]) => sum + (report[key] || 0), 0);
  const revenueKnown = reports.some(([, report]) => report.revenue !== null);
  const reportable = Object.keys(definitionsFor(state)).filter((id) => state.publications.some((item) => missionOfDocument(state, item.document) === id));
  const missionRows = Object.keys(definitionsFor(state)).filter((id) => state.missions[id] !== "proposed" || state.publications.some((item) => missionOfDocument(state, item.document) === id)).map((id) => {
    const def = definitionsFor(state)[id];
    const report = state.reports[id];
    const count = state.publications.filter((item) => missionOfDocument(state, item.document) === id).length;
    const decision = state.decisions[id];
    return `<tr><td data-label="Mission"><strong>${def.short}</strong><p>${badge(statusText(state.missions[id]), state.missions[id] === "active" ? "green" : "amber")}</p></td><td data-label="Diffusions">${count}</td><td data-label="Bilan déclaré">${report ? `${report.leads} demande${report.leads > 1 ? "s" : ""} · ${report.meetings} rendez-vous<p>${report.revenue === null ? "CA : non renseigné" : `${report.revenue.toLocaleString("fr-FR")} € signés`}</p>` : count ? "À renseigner" : "—"}</td><td data-label="Résultat recherché">${escapeHTML(missionTarget(state, id))}</td><td data-label="Suite">${decision ? badge(decision.outcome === "stop" ? "Arrêtée" : "Poursuivie", decision.outcome === "stop" ? "" : "green") : count && state.missions[id] === "active" ? button(report?.atPublications === count ? "decide-next" : "report", report?.atPublications === count ? "Décider la suite" : "Renseigner le bilan", "small", "pencil", `data-mission="${id}"`) : "—"}</td></tr>`;
  }).join("");
  return `${pageHead("L'activité n'est pas le résultat.", "Ce qui a été fait, ce qui a été observé, et ce que nous décidons ensuite.", "APPRENDRE · AJUSTER", button("report", "Renseigner mon bilan", "", "pencil"))}
  <div class="metrics"><div class="metric"><span>Diffusions simulées</span><strong>${state.publications.length}</strong><span>${plural(scheduled.length, "programmation", "programmations")} en attente</span></div><div class="metric"><span>Demandes qualifiées</span><strong>${reports.length ? total("leads") : "—"}</strong><span>${reports.length ? `Saisies dirigeant · ${plural(reports.length, "mission", "missions")}` : "À renseigner, pas à inventer"}</span></div><div class="metric"><span>Chiffre d'affaires signé</span><strong>${revenueKnown ? total("revenue").toLocaleString("fr-FR") + " €" : "—"}</strong><span>${revenueKnown ? "Saisie dirigeant · attribuée par mission" : "Aucune donnée connectée"}</span></div></div>
  <section><div class="section-heading"><h2>Résultats par mission</h2></div>${missionRows ? `<table class="source-table"><thead><tr><th>Mission</th><th>Diffusions</th><th>Bilan déclaré</th><th>Résultat recherché</th><th>Suite</th></tr></thead><tbody>${missionRows}</tbody></table>` : `<div class="empty">${icon("chart-no-axes-combined")}<h3>Aucune mission lancée.</h3><p>Lancez une mission : ses résultats apparaîtront ici, rattachés à elle.</p>${navButton("missions", "Voir les missions", "", "arrow-right")}</div>`}</section>
  <div class="two-col section-space"><section><div class="section-heading"><h2>La diffusion et son suivi</h2></div>${scheduled.map(([id, doc]) => `<div class="row"><div><strong>${escapeHTML(currentVersion(doc).title)}</strong><p>${channelLabel(doc.channel)} · V${doc.approved} · ${formatDate(doc.scheduled)}</p>${badge("Programmé · simulation", "blue")}</div>${navButton(`atelier/${id}`, "Gérer", "small", "calendar-clock")}</div>`).join("")}${state.publications.length ? state.publications.map((item) => `<div class="row"><div><strong>${escapeHTML(item.title)}</strong><p>${channelLabel(item.channel)} · V${item.version} · ${formatDate(item.date)}${item.recipients ? ` · ${plural(item.recipients, "destinataire", "destinataires")}` : ""}</p>${badge(item.channel === "gmail" ? "Envoi simulé" : "Publication simulée", "green")}</div>${navButton(`atelier/${item.document}`, "Voir", "small", "eye")}</div>`).join("") : !scheduled.length ? `<div class="empty">${icon("chart-no-axes-combined")}<h3>Rien n'a encore été diffusé.</h3><p>Validez un contenu, puis confirmez sa diffusion.</p>${navButton("atelier", "Ouvrir l'atelier", "", "arrow-right")}</div>` : ""}<div class="notice section-space">${icon("info")}<p>Un envoi n'est ni une lecture, ni une vente. Les chiffres renseignés sont déclaratifs et ne prouvent pas, à eux seuls, l'effet d'une mission.</p></div></section>
  <aside><h2>Le point de Paul</h2><div class="brief" style="margin-top:18px"><span class="avatar paul">P</span><p>${reports.length ? reports.map(([id, report]) => `${definitionsFor(state)[id].short} : ${report.leads} demande${report.leads > 1 ? "s" : ""}, ${report.meetings} rendez-vous.`).join(" ") + " Avant d'élargir, vérifions leur origine." : reportable.length ? "Les diffusions ont eu lieu. Notez maintenant les réponses reçues et leur qualité, mission par mission : sans bilan, nous ne pouvons pas décider de la suite." : "Il est trop tôt pour conclure. Après la première diffusion, notons les réponses reçues et leur qualité. Nous déciderons ensuite de poursuivre ou d'ajuster."}</p></div>${reports.map(([, report]) => report.note ? `<div class="quote" style="margin-top:15px">${escapeHTML(report.note)}</div>` : "").join("")}<div class="actions" style="margin-top:20px">${paulButton("results", "Préparer le bilan", "primary")}${navButton("missions", "Revoir les missions", "text")}</div><div class="row section-space"><div><span class="eyebrow">PROCHAIN POINT</span><h3>7 jours après la première diffusion</h3><p>Qualifier les retours, vérifier les limites, décider du prochain test.</p></div></div></aside></div><section class="section-space"><div class="section-heading"><h2>Décisions & traçabilité</h2></div>${journalHTML()}</section>`;
}
