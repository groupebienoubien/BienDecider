"use strict";

// Actions, dialogues, conversation avec Paul et démarrage. Dépend de state.js, paul.js et views.js.

const FEEDBACK_QUESTIONS = {
  onboarding: "Cette première connexion vous a-t-elle aidé à comprendre ce que fait BienDecider ?",
  launch: "Le cadrage de la mission (périmètre, temps, limites) vous a-t-il aidé à décider ?",
  approve: "La relecture avant validation vous a-t-elle donné confiance ?",
  publish: "La confirmation de diffusion était-elle claire ?",
  report: "Ce bilan vous aide-t-il à décider de la suite ?",
  decide: "Cette décision de fin de test vous a-t-elle paru logique ?",
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast("Stockage local indisponible : vos changements restent dans cette session.");
  }
}

function track(type, detail = "") {
  const events = state.session.events;
  events.push({ t: new Date().toISOString(), type, detail });
  if (events.length > 400) events.splice(0, events.length - 400);
}

function commit(event) {
  state = transition(state, event);
  ui.dialogDone = true;
  save();
  render();
}

function hydrateIcons() {
  if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function toast(text) {
  const element = document.querySelector("#toast");
  element.textContent = text;
  element.classList.add("visible");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => {
    element.classList.remove("visible");
    element.textContent = "";
  }, 4500);
}

/* ---------- Avis et session de test ---------- */

function askFeedback(key) {
  if (state.session.feedback[key]) return;
  ui.feedback = key;
  renderFeedback();
}

function renderFeedback() {
  const element = document.querySelector("#feedback");
  if (!ui.feedback) {
    element.hidden = true;
    element.innerHTML = "";
    return;
  }
  element.hidden = false;
  element.innerHTML = `<p><strong>Un avis rapide ?</strong> ${FEEDBACK_QUESTIONS[ui.feedback]}</p><div class="actions">${["Oui", "Un peu", "Non"].map((answer) => button("feedback", answer, "small", "", `data-answer="${answer}"`)).join("")}${button("feedback-skip", "Plus tard", "small text")}</div><details><summary class="small">Ajouter un mot</summary><label class="field"><span class="sr-only">Un mot pour préciser</span><input id="feedback-note" maxlength="200" placeholder="Un mot pour préciser (facultatif)"></label></details>`;
}

function exportSession() {
  const events = state.session.events;
  const views = {};
  events
    .filter((item) => item.type === "view")
    .forEach((item, index, list) => {
      const end = list[index + 1] ? Date.parse(list[index + 1].t) : Date.now();
      const key = item.detail.split("/")[0];
      views[key] = (views[key] || 0) + Math.max(0, Math.round((end - Date.parse(item.t)) / 1000));
    });
  const abandons = {};
  events.filter((item) => item.type === "abandon").forEach((item) => (abandons[item.detail] = (abandons[item.detail] || 0) + 1));
  const payload = {
    session: state.session.id || "(sans identifiant)",
    schema: "biendecider-maquette-v5",
    startedAt: state.session.startedAt,
    exportedAt: new Date().toISOString(),
    secondsPerView: views,
    abandonedDialogs: abandons,
    feedback: state.session.feedback,
    decisions: [...state.journal].reverse().map((item) => ({ date: item.date, actor: item.actor || "vous", text: item.text })),
    summary: {
      onboarded: state.onboarded,
      goal: state.goal,
      delegation: state.delegation,
      missions: state.missions,
      scope: { agencies: state.scope.agencies.ids.length, leads: state.scope.leads.ids.length, proof: state.scope.proof.project },
      diffusions: state.publications.length,
      reports: state.reports,
    },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `biendecider-session-${slug(state.session.id || "test")}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Journal de session exporté. Il ne contient ni contacts ni coordonnées.");
}

/* ---------- Rendu ---------- */

const PAGE_RENDERERS = { paul: paulPage, missions: missionsPage, atelier: atelierPage, entreprise: enterprisePage, resultats: resultsPage };

function render(options = {}) {
  ui.animate = Boolean(options.animate);
  captureEditorDraft();
  const scrollY = window.scrollY;
  let html;
  if (ui.view === "decouvrir") html = landing();
  else if (!state.onboarded) html = state.started ? onboarding() : landing();
  else html = shell((PAGE_RENDERERS[ui.view] || paulPage)());
  document.querySelector("#app").innerHTML = html;
  const titles = { paul: "Avec Paul", missions: "Missions", atelier: "Atelier", entreprise: "Entreprise", resultats: "Résultats" };
  document.title = ui.view === "decouvrir" || (!state.onboarded && !state.started)
    ? "BienDecider · Vous décidez, votre activité avance"
    : `BienDecider · ${state.onboarded ? titles[ui.view] || "Votre espace" : "Faisons connaissance"}`;
  const editor = document.querySelector('form[data-form="edit-document"]');
  if (editor) {
    editor.dataset.document = ui.document;
    editor.dataset.version = currentVersion(state.documents[ui.document]).number;
    const draft = ui.editorDrafts[ui.document];
    if (draft && (!ui.selectedVersion || ui.selectedVersion === currentVersion(state.documents[ui.document]).number)) {
      for (const [key, value] of Object.entries(draft.values)) if (editor.elements[key]) editor.elements[key].value = value;
      editor.dataset.version = draft.version;
    }
    if (state.documents[ui.document].profileNeedsReview)
      editor.insertAdjacentHTML("afterbegin", '<div class="notice amber">Le profil a changé. Vérifiez le contenu, puis enregistrez une nouvelle version.</div>');
    refreshDraftPreview();
  }
  document.querySelectorAll('form[data-form="scope"]').forEach(updatePickCount);
  hydrateIcons();
  fitArtworkText();
  syncMobileMenu();
  if (!options.animate) window.scrollTo(0, scrollY);
}

function captureEditorDraft() {
  const form = document.querySelector('form[data-form="edit-document"]');
  if (!form?.dataset.document || form.elements.title.disabled) return;
  const documentId = form.dataset.document;
  const latest = currentVersion(state.documents[documentId]);
  if (Number(form.dataset.version) !== latest.number) return;
  const values = Object.fromEntries(new FormData(form));
  const changed =
    values.title !== (documentId === "post" ? latest.headline.replace(/\n/g, " ") : latest.title) ||
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
    form.insertAdjacentHTML("afterbegin", '<div class="notice amber draft-note">Retouches non enregistrées. La validation porte sur la dernière version enregistrée.</div>');
  if (!draft) form.querySelector(".draft-note")?.remove();
  const version = currentVersion(state.documents[form.dataset.document]);
  const values = draft?.values || { title: form.dataset.document === "post" ? version.headline : version.title, body: version.body, layout: version.layout };
  const stage = document.querySelector(".preview-stage");
  const body = stage.querySelector(".social-text, .email-body");
  if (body) body.textContent = values.body;
  const title = stage.querySelector(".art-copy strong, dd strong");
  if (title) title.textContent = values.title;
  stage.querySelector(".artwork")?.classList.toggle("editorial", values.layout === "editorial");
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
    const signatureNode = container.querySelector("small");
    heading.style.fontSize = "";
    let size = parseFloat(getComputedStyle(heading).fontSize);
    while (heading.getBoundingClientRect().bottom + 8 > signatureNode.getBoundingClientRect().top && size > 12) {
      size -= 1;
      heading.style.fontSize = `${size}px`;
    }
  });
}

/* ---------- Navigation ---------- */

function navigate(route) {
  ui.dialogDone = true;
  closeDialog("modal");
  if (location.hash === `#/${route}`) readRoute();
  else location.hash = `/${route}`;
}

function readRoute() {
  if (location.hash && !location.hash.startsWith("#/")) return;
  captureEditorDraft();
  ui.dialogDone = true;
  closeDialog("modal");
  closeDialog("paul-dialog");
  const [, rawView, detail] = location.hash.split("/");
  const view = rawView === "studio" ? "atelier" : rawView;
  if (view === "bienvenue") {
    if (!state.onboarded) {
      if (!state.started) {
        state = transition(state, { type: "begin" });
        save();
      }
      history.replaceState(null, "", "#/paul");
      ui.view = "paul";
    } else {
      ui.view = "paul";
      render();
      handleAction({ dataset: { action: "reset" } });
      return;
    }
  } else if (view === "decouvrir") ui.view = "decouvrir";
  else ui.view = ["paul", "missions", "atelier", "entreprise", "resultats"].includes(view) ? view : "paul";
  if (ui.view === "entreprise") ui.tab = ["audit", "marque", "canaux", "equipe"].includes(detail) ? detail : "audit";
  if (ui.view === "atelier") {
    ui.document = Object.hasOwn(state.documents, detail || "") ? detail : ui.document;
    ui.selectedVersion = null;
  }
  if (ui.view === "missions") ui.mission = Object.hasOwn(missionDefinitions, detail || "") ? detail : "agencies";
  const marker = `${ui.view}${detail ? "/" + detail : ""}`;
  if (ui.lastView !== marker) {
    track("view", marker);
    ui.lastView = marker;
    save();
  }
  render({ animate: true });
  window.scrollTo(0, 0);
  document.querySelector("#main")?.focus({ preventScroll: true });
}

/* ---------- Fenêtres ---------- */

function openModal(title, content, footer = "") {
  const dialog = document.querySelector("#modal");
  ui.dialogDone = false;
  ui.dialogTitle = title.replace(/<[^>]+>/g, "");
  track("dialog", ui.dialogTitle);
  document.querySelector("#modal-body").innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fermer la fenêtre">${icon("x")}</button></div><div class="modal-content">${content}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelectorAll('form[data-form="approve"],form[data-form="publish"]').forEach((form) => {
    form.dataset.document = ui.document;
    form.dataset.version = currentVersion(state.documents[ui.document]).number;
  });
  hydrateIcons();
  fitArtworkText();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog.open) dialog.close();
}

function startMissionDialog(id) {
  const def = missionDefinitions[id];
  const load = capacityLoad(state, id);
  const before = capacityLoad(state);
  const blocked = load.overTime;
  openModal(
    "Confirmer le cadre de la mission",
    `<form data-form="start-mission" data-mission="${id}" class="stack"><h3>${def.title}</h3>
    <div class="row"><span class="muted small">Résultat recherché</span><strong class="small">${def.target}</strong></div>
    <div class="row"><span class="muted small">Périmètre</span><strong class="small">${escapeHTML(scopeSummary(state, id))}</strong></div>
    <div class="row"><span class="muted small">Votre temps</span><strong class="small">${def.time}</strong></div>
    <div class="row"><span class="muted small">Dépenses externes</span><strong class="small">0 € engagé</strong></div>
    <div class="row"><span class="muted small">Règle d'arrêt</span><strong class="small">${def.stopRule}</strong></div>
    ${gauge("Temps réservé par semaine, avec cette mission", load.hours, load.hoursMax, `${formatHours(before.hours)} → ${formatHours(load.hours)} sur ${formatHours(load.hoursMax)}`, load.overTime)}
    ${gauge("Projets clients possibles, avec cette mission", load.projects, load.projectsMax, `${before.projects} → ${load.projects} sur ${load.projectsMax}`, load.overProjects)}
    ${blocked ? `<div class="notice amber">${icon("triangle-alert")}<p><strong>Lancement impossible.</strong> Cette mission porterait votre temps à ${formatHours(load.hours)} par semaine, pour ${formatHours(load.hoursMax)} disponibles. Mettez une mission en pause, ou ajustez votre temps disponible.</p></div><div class="actions">${navButton("missions", "Voir mes missions en cours", "small", "flag")}${button("goal", "Ajuster mon temps", "small", "pencil")}</div>` : ""}
    ${!blocked && load.overProjects ? `<div class="notice amber">${icon("triangle-alert")}<p>Si tout se passe bien, vos missions peuvent amener jusqu'à ${load.projects} projets pour ${load.projectsMax} que vous pouvez prendre. À vous de juger si c'est acceptable.</p></div><label class="check"><input type="checkbox" name="capacity" required>J'accepte ce risque de dépasser ma capacité.</label>` : ""}
    <div class="notice">${icon("shield-check")}<p>Paul coordonne la préparation. Chaque envoi ou publication reste soumis à confirmation.</p></div>
    ${id === "leads" ? `<label class="check"><input type="checkbox" name="contacts" required ${state.contactsConfirmed ? "checked" : ""}>Je confirme, dans ce scénario, la pertinence des ${state.scope.leads.ids.length} contacts choisis, leur droit de recontact et la possibilité de s'opposer.</label>` : ""}
    <div class="form-error" role="alert"></div><button class="btn primary" type="submit" ${blocked ? "disabled" : ""}>${icon("play")}Confirmer le lancement</button></form>`,
  );
}

function approvalDialog() {
  const doc = state.documents[ui.document];
  const version = currentVersion(doc);
  const recipients = recipientsOf(state, ui.document);
  openModal(
    `Valider la version V${version.number}`,
    `<form data-form="approve" class="stack"><p><strong>${escapeHTML(version.title)}</strong></p><p class="muted small">Cette validation concerne le contenu de V${version.number}. Elle ne publie ni n'envoie rien.</p>${ui.document === "post" ? `<label class="check"><input type="checkbox" name="rights" required>Je confirme le visuel et les droits d'utilisation dans ce scénario de démonstration.</label>${!state.brand.confirmed ? `<div class="notice amber">${icon("palette")}<p>La marque doit être confirmée avant de valider ce visuel.</p></div>${navButton("entreprise/marque", "Confirmer ma marque", "", "arrow-right")}` : ""}` : `<div class="notice">${icon("mail")}<p>${plural(recipients.length, "destinataire", "destinataires")} d'exemple : ${recipients.map((item) => escapeHTML(item.name)).join(", ")}. Aucun prix ni relance automatique.</p></div>`}<label class="check"><input type="checkbox" name="reviewed" required>J'ai relu le contenu et vérifié les informations qui engagent mon entreprise.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit" ${ui.document === "post" && !state.brand.confirmed ? "disabled" : ""}>${icon("check")}Valider sans diffuser</button></form>`,
  );
}

function publicationDialog() {
  const doc = state.documents[ui.document];
  const visual = doc.channel === "facebook";
  const recipients = recipientsOf(state, ui.document);
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setMinutes(0, 0, 0);
  const localDate = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  if (!state.channels[doc.channel]) {
    openModal(
      "Le canal n'est pas encore connecté",
      `<div class="stack"><p>Votre contenu est validé, mais ${channelLabel(doc.channel)} n'est pas connecté. La connexion et l'autorisation de diffusion sont séparées.</p>${button("connect", `Connecter ${channelLabel(doc.channel)}`, "primary", "plug", `data-channel="${doc.channel}" data-return="publish"`)}<p class="muted small">Après la connexion, vous reviendrez directement à la confirmation de diffusion.</p></div>`,
    );
    return;
  }
  openModal(
    visual ? "Confirmer la diffusion" : "Confirmer l'envoi",
    `<form data-form="publish" class="stack"><div class="row"><span class="muted small">Version</span><strong>V${doc.approved} · ${escapeHTML(currentVersion(doc).title)}</strong></div><div class="row"><span class="muted small">Destination</span><strong class="small">${visual ? "Page " + escapeHTML(state.profile.name) : recipients.map((item) => escapeHTML(item.name)).join(", ") + " · envois séparés"} · ${channelLabel(doc.channel)}</strong></div><fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:750;margin-bottom:12px">Quand ?</legend><div class="stack-sm"><label class="check"><input type="radio" name="when" value="now" checked>Maintenant</label><label class="check"><input type="radio" name="when" value="later">Programmer</label></div></fieldset><label class="field" id="schedule-field" hidden><span>Date et heure · fuseau de cet appareil</span><input type="datetime-local" name="date" value="${localDate}" disabled></label><div class="notice amber">${icon("flask-conical")}<p>Simulation uniquement. Aucun contenu ne quitte votre navigateur. Une fois diffusée, la version passe en lecture seule.</p></div><label class="check"><input type="checkbox" name="confirmed" required>Je confirme cette version, cette destination et ce moment de diffusion.</label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("send")}Confirmer la simulation</button></form>`,
  );
}

function connectionDialog(channel) {
  openModal(
    `Connecter ${channelLabel(channel)}`,
    `<form data-form="connect" data-channel="${channel}" class="stack"><div class="notice">${icon("flask-conical")}<p>Connexion simulée, sans OAuth ni identifiant réel. Aucun compte externe ne sera modifié.</p></div><label class="field"><span>${channel === "facebook" ? "Page à utiliser" : channel === "gmail" ? "Compte d'envoi" : "Source à lire"}</span><select name="resource"><option>${channel === "facebook" ? escapeHTML(state.profile.name) + " · page de démonstration" : channel === "gmail" ? "contact@dupont-renovation.example" : escapeHTML(state.profile.url || "Site de démonstration")}</option></select></label><label class="check"><input type="checkbox" name="permissions" required>${channel === "site" ? "Autoriser la lecture de cette source dans la démonstration." : "Confirmer ce compte pour les simulations de diffusion explicitement validées."}</label><button class="btn primary" type="submit">${icon("plug")}Confirmer la connexion simulée</button></form>`,
  );
}

function disconnectDialog(channel) {
  const affected = Object.values(state.documents).filter((item) => item.channel === channel && item.scheduled);
  openModal(
    `Déconnecter ${channelLabel(channel)} ?`,
    `<div class="stack"><p>Les contenus et validations seront conservés. Aucune nouvelle diffusion ne sera possible sans reconnexion.</p>${affected.length ? `<div class="notice amber">${icon("calendar-x")}<p>${plural(affected.length, "programmation sera annulée", "programmations seront annulées")} : ${affected.map((item) => `« ${escapeHTML(currentVersion(item).title)} »`).join(", ")}. Les contenus restent validés, vous pourrez les reprogrammer.</p></div>` : `<p class="muted small">Aucune programmation n'est liée à ce canal.</p>`}</div>`,
    `${button("close-modal", "Annuler")}${button("confirm-disconnect", "Déconnecter", "danger", "unplug", `data-channel="${channel}"`)}`,
  );
}

function sourceDialog(source) {
  const data =
    source === "site"
      ? { title: "Relevé de la présence en ligne", type: "Observation d'exemple", body: "Le relevé illustratif contient 4 réalisations visibles. Les 18 réalisations au total sont une déclaration distincte, non vérifiée par le site.", origin: state.profile.url || "Aucun site renseigné", uncertainty: "Sans site renseigné, ce relevé reste un exemple et ne peut pas être traité comme une observation réelle." }
      : { title: "Échantillon d'agences locales", type: "Hypothèse à qualifier", body: `6 agences repérées dans un annuaire fictif : ${AGENCIES.map((agency) => agency.name).join(", ")}. Vous en choisissez 1 ou 2 pour le test. Aucun intérêt commercial n'est confirmé.`, origin: "Annuaire de démonstration · zone Aix-en-Provence", uncertainty: "Présence dans un annuaire ne signifie pas besoin, accord ou relation existante." };
  openModal(data.title, `<div class="stack">${badge(data.type, "amber")}<p>${data.body}</p><div class="quote">${escapeHTML(data.origin)}</div><p class="muted small">Relevé de référence : 28 octobre 2026. Aucune page n'a été visitée par cette maquette.</p><div class="notice amber">${icon("circle-help")}<p>${data.uncertainty}</p></div></div>`, paulButton("sources", "Questionner ce constat"));
}

function reportDialog(preselected) {
  const reportable = Object.keys(missionDefinitions).filter((id) => state.publications.some((item) => missionOfDocument(state, item.document) === id));
  if (!reportable.length) {
    openModal("Votre bilan commercial", `<div class="stack"><div class="notice amber">${icon("info")}<p>Rien n'a encore été diffusé : il n'y a pas de résultat à rattacher. Faites d'abord une première diffusion dans l'atelier.</p></div>${navButton("atelier", "Ouvrir l'atelier", "primary", "arrow-right")}</div>`);
    return;
  }
  const chosen = reportable.includes(preselected) ? preselected : reportable[0];
  const report = state.reports[chosen];
  openModal(
    "Votre bilan commercial",
    `<form data-form="report" class="stack"><p class="muted small">Déclaration du dirigeant, rattachée à une mission. Période : depuis la première diffusion.</p><label class="field"><span>Mission concernée</span><select name="mission">${reportable.map((id) => `<option value="${id}" ${id === chosen ? "selected" : ""}>${missionDefinitions[id].short}</option>`).join("")}</select></label><div class="form-grid"><label class="field"><span>Demandes qualifiées</span><input name="leads" type="number" inputmode="numeric" min="0" max="100000" required placeholder="—" value="${report?.leads ?? ""}"></label><label class="field"><span>Rendez-vous obtenus</span><input name="meetings" type="number" inputmode="numeric" min="0" max="100000" required placeholder="—" value="${report?.meetings ?? ""}"></label><label class="field full"><span>CA signé (€) <span class="muted">· facultatif</span></span><input name="revenue" type="number" inputmode="numeric" min="0" max="100000000" placeholder="—" value="${report?.revenue ?? ""}"><small>Laissez vide si vous ne savez pas : « — » n'est pas « 0 ».</small></label></div><div class="live-warn notice amber" role="status" hidden>${icon("triangle-alert")}<p>Vous ne pouvez pas avoir plus de rendez-vous que de demandes qualifiées.</p></div><label class="field"><span>Origine des demandes et contexte</span><textarea name="note" maxlength="600" placeholder="Ex. Deux demandes via une recommandation…">${escapeHTML(report?.note || "")}</textarea></label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer le bilan</button></form>`,
  );
}

function decideDialog(id) {
  const def = missionDefinitions[id];
  const report = state.reports[id];
  const count = state.publications.filter((item) => missionOfDocument(state, item.document) === id).length;
  const fresh = report?.atPublications === count;
  openModal(
    "Décider la suite de la mission",
    `<div class="stack"><h3>${def.title}</h3><div class="row"><span class="muted small">Résultat recherché</span><strong class="small">${def.target}</strong></div><div class="row"><span class="muted small">Ce que vous avez déclaré</span><strong class="small">${fresh ? `${report.leads} demande${report.leads > 1 ? "s" : ""} · ${report.meetings} rendez-vous` : "Aucun bilan pour cette diffusion"}</strong></div><div class="row"><span class="muted small">Règle d'arrêt</span><strong class="small">${def.stopRule}</strong></div>${fresh ? "" : `<div class="notice amber">${icon("circle-help")}<p>Sans bilan, Paul ne peut pas comparer au résultat recherché : « Poursuivre » reste indisponible. ${button("report", "Renseigner mon bilan", "text", "", `data-mission="${id}"`)}</p></div>`}<p class="muted small">Poursuivre garde le même cadre et ouvre une nouvelle version dans l'atelier. Adapter passe par Paul. Arrêter clôt la mission et annule ses programmations.</p></div>`,
    `${button("confirm-outcome", "Poursuivre", "", "play", `data-mission="${id}" data-outcome="continue" ${fresh ? "" : "disabled"}`)}${paulButton(`mission:${id}`, "Adapter avec Paul")}${button("confirm-outcome", "Arrêter la mission", "danger", "square", `data-mission="${id}" data-outcome="stop"`)}`,
  );
}

function importDialog() {
  openModal(
    "Importer un fichier de prospects",
    `<div class="stack"><div class="notice amber">${icon("shield-alert")}<p><strong>Simulation, sans donnée réelle.</strong> Le fichier est lu dans votre navigateur, jamais envoyé. Seules les adresses en <code>.example</code> sont acceptées. Si de vraies données personnelles devaient être manipulées en test, le Data Privacy Officer devrait d'abord valider le dispositif.</p></div><p class="small">Colonnes attendues : <code>prenom;nom;email;mois_depuis_dernier_contact;recontact</code> (recontact : oui, non ou inconnu). Paul écarte les contacts de plus de ${CONTACT_MAX_AGE_MONTHS} mois et ceux sans accord de recontact.</p><div class="actions">${button("use-sample", "Utiliser le fichier d'exemple", "primary", "file-spreadsheet")}${button("download-sample", "Télécharger l'exemple", "small", "download")}</div><label class="field"><span>Ou choisir un fichier .csv</span><input type="file" id="csv-file" accept=".csv,text/csv"></label><div class="form-error" role="alert" id="csv-error"></div></div>`,
  );
}

function importPreviewDialog(result) {
  ui.importPreview = result;
  const probe = { contacts: result.contacts };
  const count = (predicate) => probe.contacts.filter(predicate).length;
  const ok = count((c) => contactStatus(c).ok);
  openModal(
    "Contrôle du fichier",
    `<div class="stack"><div class="row"><span>Contacts lus</span><strong>${result.contacts.length}</strong></div><div class="row"><span>Recontactables</span><strong class="green">${ok}</strong></div><div class="row"><span>Opposition au recontact</span><strong>${count((c) => c.consent === "non")}</strong></div><div class="row"><span>Accord inconnu</span><strong>${count((c) => c.consent === "inconnu")}</strong></div><div class="row"><span>Dernier échange de plus de ${CONTACT_MAX_AGE_MONTHS} mois</span><strong>${count((c) => c.consent === "oui" && c.monthsAgo > CONTACT_MAX_AGE_MONTHS)}</strong></div>${result.skipped.length ? `<div class="notice amber">${icon("info")}<p>${result.skipped.slice(0, 3).map(escapeHTML).join(" ")}${result.skipped.length > 3 ? ` (+${result.skipped.length - 3})` : ""}</p></div>` : ""}${ok ? "" : `<div class="notice amber">${icon("triangle-alert")}<p>Aucun contact recontactable : la mission ne pourra pas être lancée avec ce fichier.</p></div>`}<p class="muted small">L'import remplace la liste actuelle et vous demandera de choisir à nouveau jusqu'à ${LEADS_MAX} contacts.</p></div>`,
    `${button("close-modal", "Annuler")}${button("confirm-import", "Importer", "primary", "upload")}`,
  );
}

function settingsDialog() {
  openModal(
    "Mon espace",
    `<div class="stack"><div class="inline"><span class="avatar large">${firstInitial()}</span><div><h3>${escapeHTML(state.profile.firstName)} · Dirigeant</h3><p class="muted small">${escapeHTML(state.profile.name)} · espace de démonstration</p></div></div><div class="row"><span>Mon profil</span>${button("profile", "Corriger", "small", "pencil")}</div><div class="row"><span>Règles de collaboration</span>${navButton("entreprise/canaux", "Gérer", "small", "settings-2")}</div><div class="row"><span>Votre ambition</span>${button("goal", "Modifier", "small", "pencil")}</div><div class="row"><span>Le concept BienDecider</span>${navButton("decouvrir", "Revoir", "small", "arrow-up-right")}</div><form data-form="session" class="stack-sm"><h3>Session de test</h3><label class="field"><span>Identifiant de session</span><input name="sessionId" maxlength="30" placeholder="Ex. T-014" value="${escapeHTML(state.session.id)}"><small>Relie vos retours à cette session. Ni nom ni coordonnées.</small></label><div class="actions"><button class="btn small" type="submit">${icon("save")}Enregistrer</button>${button("export-session", "Exporter le journal de session", "small", "download")}</div></form><div class="notice">${icon("hard-drive")}<p>Vos choix et échanges sont enregistrés uniquement dans ce navigateur. Aucune donnée n'est envoyée à une IA.</p></div>${button("reset", "Recommencer la première connexion", "danger", "rotate-ccw")}</div>`,
  );
}

/* ---------- Paul ---------- */

function threadFor(key) {
  state.conversations[key] ||= [];
  return state.conversations[key];
}

function openPaul(context) {
  let key = context || pageContext();
  if (key === "idea:new") {
    state.ideaCount += 1;
    key = `idea:${state.ideaCount}`;
  }
  ui.thread = key;
  const thread = threadFor(key);
  if (!thread.length) thread.push({ role: "paul", text: paulIntro(state, parseContext(key)), links: [] });
  track("paul", key);
  save();
  renderPaul();
  const dialog = document.querySelector("#paul-dialog");
  if (!dialog.open) dialog.showModal();
  document.querySelector("#paul-input")?.focus();
}

function announce(text) {
  const live = document.querySelector("#paul-live");
  if (!live) return;
  live.textContent = text;
  clearTimeout(ui.announceTimer);
  ui.announceTimer = setTimeout(() => {
    live.textContent = "";
  }, 4000);
}

const PROPOSAL_LABEL = { strategy: "Retenir cette priorité", scope: "Modifier le périmètre", pause: "Mettre en pause", goal: "Ajuster ma limite", revision: "Créer cette version", idea: "Noter l'idée" };

function renderPaul() {
  const key = ui.thread;
  const ctx = parseContext(key);
  const thread = threadFor(key);
  const proposal = ui.proposals[key];
  const others = Object.keys(state.conversations).filter((item) => state.conversations[item].length);
  const symbol = ctx.kind === "atelier" ? "panels-top-left" : ctx.kind === "mission" ? "flag" : "compass";
  document.querySelector("#paul-body").innerHTML = `<div class="modal-head"><div class="inline"><span class="avatar paul">P</span><div><h2 id="paul-title">Avec Paul</h2><span class="muted small">Votre interlocuteur, du cap à l'action</span></div></div><button class="icon-btn" data-action="close-paul" aria-label="Fermer la conversation">${icon("x")}</button></div><div class="paul-context">${icon(symbol)} ${escapeHTML(contextLabel(key))} · ${escapeHTML(state.profile.name)}${others.length > 1 ? `<label class="thread-switch"><span class="sr-only">Changer de conversation</span><select id="thread-switch">${others.map((item) => `<option value="${escapeHTML(item)}" ${item === key ? "selected" : ""}>${escapeHTML(contextLabel(item))}</option>`).join("")}</select></label>` : ""}</div><div class="chat-thread">${thread.slice(-40).map((message) => `<div class="chat-message ${message.role === "user" ? "user" : ""}">${message.role === "paul" ? '<span class="name">Paul</span>' : ""}${escapeHTML(message.text)}${message.links?.length ? `<div class="chat-links">${message.links.map((item) => button("paul-link", escapeHTML(item.label), "small", "arrow-up-right", `data-route="${item.route}"`)).join("")}</div>` : ""}${message.role === "paul" ? '<span class="chat-meta">Échange de démonstration</span>' : ""}</div>`).join("")}${proposal ? `<div class="chat-message"><span class="name">Paul · proposition à confirmer</span><div class="chat-proposal"><strong>${escapeHTML(proposal.title)}</strong><p>${escapeHTML(proposal.description)}</p><div class="actions">${button("accept-proposal", proposal.accept || PROPOSAL_LABEL[proposal.event.type], "primary small", "check")}${button("dismiss-proposal", "Garder le cap actuel", "small")}</div></div></div>` : ""}</div><div class="chat-suggestions">${suggestionsFor(state, ctx).map((label) => `<button data-action="chat-suggestion">${escapeHTML(label)}</button>`).join("")}</div><div class="chat-compose"><form data-form="chat"><textarea id="paul-input" name="message" placeholder="Votre question, votre idée…" aria-label="Votre message à Paul" required maxlength="1200" rows="2"></textarea><button type="submit" class="icon-btn" aria-label="Envoyer le message">${icon("arrow-up")}</button></form><small>Simulation locale · pas d'IA connectée · aucune action implicite</small></div><div class="sr-only" id="paul-live" aria-live="polite"></div>`;
  hydrateIcons();
  const list = document.querySelector(".chat-thread");
  list.scrollTop = list.scrollHeight;
}

function chat(message) {
  const key = ui.thread;
  const thread = threadFor(key);
  thread.push({ role: "user", text: message });
  const reply = paulReply(state, parseContext(key), message);
  thread.push({ role: "paul", text: reply.text, links: reply.links || [] });
  ui.proposals[key] = reply.proposal || null;
  if (thread.length > 60) thread.splice(0, thread.length - 60);
  save();
  renderPaul();
  announce(reply.text);
}

/* ---------- Actions ---------- */

async function handleAction(element) {
  const action = element.dataset.action;
  captureEditorDraft();
  if (["approve", "publish", "reopen"].includes(action) && ui.editorDrafts[ui.document]) {
    toast("Enregistrez vos retouches dans une nouvelle version avant cette décision.");
    document.querySelector('form[data-form="edit-document"] button[type="submit"]')?.focus();
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
    case "begin":
      navigate("bienvenue");
      break;
    case "step":
      state.step = Number(element.dataset.step);
      track("step", String(state.step));
      save();
      render({ animate: true });
      window.scrollTo(0, 0);
      break;
    case "no-site":
      document.querySelector('input[name="url"]').value = "";
      document.querySelector('form[data-form="discover"]').requestSubmit();
      break;
    case "demo": {
      const keep = state.session;
      state = initialState();
      state.session = keep;
      state.started = true;
      state.onboarded = true;
      state.profile.firstName = "Alex";
      state.documents = buildDocuments(state.profile, state.scope, state.brand);
      state.brand.confirmed = true;
      state.missions.agencies = "active";
      state.missions.proof = "active";
      state.journal.unshift({ text: "Espace de démonstration ouvert : 2 missions préparées, aucune diffusion.", actor: "Système", date: new Date().toISOString() });
      save();
      navigate("paul");
      break;
    }
    case "paul":
      openPaul(element.dataset.context);
      break;
    case "paul-idea":
      openPaul("idea:new");
      break;
    case "paul-link":
      closeDialog("paul-dialog");
      navigate(element.dataset.route);
      break;
    case "close-modal":
      closeDialog("modal");
      break;
    case "close-paul":
      closeDialog("paul-dialog");
      break;
    case "chat-suggestion":
      chat(element.textContent.trim());
      break;
    case "dismiss-proposal":
      ui.proposals[ui.thread] = null;
      threadFor(ui.thread).push({ role: "paul", text: "Nous gardons le cap actuel. Aucun changement appliqué." });
      save();
      renderPaul();
      break;
    case "accept-proposal": {
      const proposal = ui.proposals[ui.thread];
      if (!proposal) return;
      if (proposal.event.type === "revision" && ui.editorDrafts[proposal.event.document])
        throw new Error("Enregistrez d'abord vos retouches dans l'atelier, puis demandez une nouvelle proposition.");
      commit(proposal.event);
      threadFor(ui.thread).push({ role: "paul", text: proposal.done });
      ui.proposals[ui.thread] = null;
      ui.selectedVersion = null;
      save();
      renderPaul();
      break;
    }
    case "decide-next":
      decideDialog(element.dataset.mission);
      break;
    case "confirm-outcome":
      commit({ type: "outcome", mission: element.dataset.mission, outcome: element.dataset.outcome });
      closeDialog("modal");
      toast(element.dataset.outcome === "stop" ? "Mission arrêtée. La décision reste dans le journal." : "Poursuite décidée. Les limites ne changent pas.");
      askFeedback("decide");
      break;
    case "filter":
      ui.filter = element.dataset.filter;
      render();
      break;
    case "start-mission":
      startMissionDialog(element.dataset.mission);
      break;
    case "pause-mission":
      openModal("Mettre cette mission en pause ?", "<p>La préparation est suspendue. Les programmations de cette mission seront annulées. Les diffusions déjà effectuées restent dans l'historique.</p>", `${button("close-modal", "Garder en cours")}${button("confirm-pause", "Confirmer la pause", "primary", "pause", `data-mission="${element.dataset.mission}"`)}`);
      break;
    case "confirm-pause":
      commit({ type: "pause", mission: element.dataset.mission });
      closeDialog("modal");
      toast("Mission suspendue. Programmations annulées.");
      break;
    case "select-recent": {
      const form = element.closest("form");
      const recent = eligibleContacts(state).slice(0, LEADS_MAX).map((contact) => contact.id);
      form.querySelectorAll('input[name="contact"]').forEach((input) => {
        input.checked = recent.includes(input.value);
      });
      updatePickCount(form);
      break;
    }
    case "import-contacts":
      importDialog();
      break;
    case "download-sample": {
      const url = URL.createObjectURL(new Blob([sampleCsv()], { type: "text/csv" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: "prospects-exemple.csv" });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case "use-sample":
      importPreviewDialog(parseContactsCsv(sampleCsv()));
      break;
    case "confirm-import":
      commit({ type: "contacts", contacts: ui.importPreview.contacts });
      ui.importPreview = null;
      closeDialog("modal");
      toast("Fichier importé (simulation). Choisissez jusqu'à 8 contacts.");
      break;
    case "drop-idea":
      state.ideas = state.ideas.filter((idea) => idea.id !== element.dataset.id);
      save();
      render();
      break;
    case "profile":
      openModal("Corriger mon entreprise", `<form data-form="profile" class="stack"><div class="stack">${profileFields("full")}</div><div class="notice">${icon("info")}<p>Changer le nom ou une information crée de nouvelles versions à valider et annule les programmations existantes.</p></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("save")}Enregistrer les corrections</button></form>`);
      break;
    case "goal":
      openModal("Ajuster mon ambition", `<form data-form="goal" class="stack">${goalFields()}<p class="muted small">Les missions en cours ne changent pas automatiquement. Paul vous aide à réexaminer leur pertinence.</p><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon("check")}Confirmer ce cap</button></form>`);
      break;
    case "source":
      sourceDialog(element.dataset.source);
      break;
    case "competitors":
      openModal("Un échantillon à confirmer", `<p class="muted small">Acteurs fictifs pour illustrer le diagnostic. Ce n'est pas une étude du marché local réel.</p>${COMPETITORS.map((name, index) => `<div class="row"><div><strong>${name}</strong><p>${index < 3 ? "Angle illustratif : aides et accompagnement" : "Angle illustratif : travaux et proximité"}</p></div>${badge("À confirmer", "amber")}</div>`).join("")}`, paulButton("concurrence", "Affiner avec Paul"));
      break;
    case "connect":
      ui.returnTo = element.dataset.return || null;
      connectionDialog(element.dataset.channel);
      break;
    case "disconnect":
      disconnectDialog(element.dataset.channel);
      break;
    case "confirm-disconnect":
      commit({ type: "channel", channel: element.dataset.channel, connected: false });
      closeDialog("modal");
      toast("Canal déconnecté. Programmations annulées.");
      break;
    case "preview":
      ui.preview = element.dataset.preview;
      render();
      break;
    case "select-version":
      ui.selectedVersion = Number(element.dataset.version);
      render();
      break;
    case "reopen":
      commit({ type: "revision", document: ui.document, reopen: true, value: {} });
      ui.selectedVersion = null;
      render();
      toast("Nouvelle version créée à partir de la version diffusée. Validation à renouveler.");
      break;
    case "approve":
      approvalDialog();
      break;
    case "publish":
      publicationDialog();
      break;
    case "cancel-schedule":
      openModal("Annuler cette programmation ?", "<p>Le contenu restera validé. Aucune diffusion n'a eu lieu ; vous pourrez choisir un autre moment.</p>", `${button("close-modal", "Conserver")}${button("confirm-cancel", "Annuler la programmation", "danger", "calendar-x")}`);
      break;
    case "confirm-cancel":
      commit({ type: "cancel-schedule", document: ui.document });
      closeDialog("modal");
      toast("Programmation annulée, version conservée.");
      break;
    case "copy": {
      const doc = state.documents[ui.document];
      const version = doc.versions.find((item) => item.number === ui.selectedVersion) || currentVersion(doc);
      try {
        await navigator.clipboard.writeText(`${version.title}\n\n${version.body}`);
        toast("Texte copié.");
      } catch {
        openModal("Le texte de votre contenu", `<label class="field"><span>Sélectionnez le texte pour le copier</span><textarea rows="12" readonly>${escapeHTML(version.title + "\n\n" + version.body)}</textarea></label>`);
      }
      break;
    }
    case "report":
      reportDialog(element.dataset.mission);
      break;
    case "settings":
      settingsDialog();
      break;
    case "export-session":
      exportSession();
      break;
    case "reset":
      openModal("Recommencer la démonstration ?", "<p>Le profil, les échanges, les versions et les décisions de cette maquette seront effacés de ce navigateur. Aucun compte réel n'est concerné.</p>", `${button("close-modal", "Conserver mes choix")}${button("confirm-reset", "Recommencer", "danger", "rotate-ccw")}`);
      break;
    case "confirm-reset":
      clearInterval(ui.scanTimer);
      state = initialState();
      Object.assign(ui, { scan: "idle", scanStep: 0, proposals: {}, selectedVersion: null, editorDrafts: {}, feedback: null, lastView: null });
      save();
      renderFeedback();
      closeDialog("modal");
      closeDialog("paul-dialog");
      navigate("decouvrir");
      break;
    case "feedback": {
      const note = document.querySelector("#feedback-note")?.value.trim() || "";
      state.session.feedback[ui.feedback] = { answer: element.dataset.answer, note, date: new Date().toISOString() };
      track("feedback", `${ui.feedback}:${element.dataset.answer}`);
      ui.feedback = null;
      save();
      renderFeedback();
      toast("Merci pour votre retour.");
      break;
    }
    case "feedback-skip":
      ui.feedback = null;
      renderFeedback();
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
    ...(data.has("statement") ? { statement: data.get("statement").trim() } : {}),
  };
}

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

function finishDialog() {
  ui.dialogDone = true;
  closeDialog("modal");
}

async function handleForm(form) {
  const data = new FormData(form);
  const kind = form.dataset.form;
  switch (kind) {
    case "discover": {
      const firstName = clean(data.get("firstName"));
      const name = clean(data.get("name"));
      const url = clean(data.get("url"));
      if (!firstName) throw new Error("Indiquez votre prénom.");
      if (!name) throw new Error("Renseignez le nom de votre entreprise.");
      if (url && !/^https?:\/\//i.test(url)) throw new Error("Utilisez une adresse commençant par https:// ou http://.");
      state = transition(state, { type: "profile", value: { firstName, name, url } });
      state.session.id = clean(data.get("sessionId")).slice(0, 30);
      ui.scan = "running";
      ui.scanStep = 0;
      clearInterval(ui.scanTimer);
      ui.scanTimer = setInterval(() => {
        ui.scanStep += 1;
        if (ui.scanStep >= 4) {
          clearInterval(ui.scanTimer);
          ui.scan = "ready";
        }
        if (!state.onboarded && state.step === 1) render();
      }, 260);
      save();
      render();
      break;
    }
    case "understand":
    case "profile": {
      const keys = kind === "understand" ? ["activity", "area", "clients", "offers"] : ["firstName", "name", "activity", "area", "clients", "offers"];
      const profile = Object.fromEntries(keys.map((key) => [key, clean(data.get(key))]));
      if (Object.values(profile).some((value) => !value)) throw new Error("Complétez chaque information avant de confirmer.");
      state = transition(state, { type: "profile", value: profile });
      if (kind === "understand") {
        state.brand.confirmed = data.has("brandConfirmed");
        state.step = 3;
      }
      save();
      render({ animate: kind === "understand" });
      finishDialog();
      window.scrollTo(0, 0);
      if (kind === "profile") toast("Profil corrigé et contenus actualisés.");
      break;
    }
    case "ambition":
    case "goal":
      state = transition(state, { type: "goal", value: goalFromForm(data) });
      if (kind === "ambition") state.step = 4;
      save();
      render({ animate: kind === "ambition" });
      finishDialog();
      window.scrollTo(0, 0);
      if (kind === "goal") toast("Cap mis à jour. Les missions en cours restent inchangées.");
      break;
    case "finish":
      state.delegation = data.get("delegation");
      state = transition(state, { type: "onboard" });
      save();
      navigate("paul");
      askFeedback("onboarding");
      break;
    case "brand":
      commit({ type: "brand", value: { color: data.get("color"), accent: data.get("accent"), tone: data.get("tone"), confirmed: data.has("confirmed") } });
      toast("Marque enregistrée. Nouvelle version du visuel à valider.");
      break;
    case "delegation":
      state.delegation = data.get("delegation");
      if (state.delegation === "prepare")
        Object.values(state.documents).forEach((doc) => {
          doc.scheduled = null;
        });
      state.journal.unshift({ text: `Règle de collaboration mise à jour : ${delegationText()}.${state.delegation === "prepare" ? " Programmations annulées." : ""}`, actor: "vous", date: new Date().toISOString() });
      save();
      render();
      toast("Règles enregistrées.");
      break;
    case "session":
      state.session.id = clean(data.get("sessionId")).slice(0, 30);
      save();
      render();
      finishDialog();
      toast(state.session.id ? `Session ${state.session.id} enregistrée.` : "Identifiant de session retiré.");
      break;
    case "scope": {
      const id = form.dataset.mission;
      commit({ type: "scope", mission: id, value: id === "proof" ? { project: data.get("project") } : { ids: data.getAll(id === "agencies" ? "agency" : "contact") } });
      toast(`Périmètre enregistré : ${scopeSummary(state, id)}.`);
      break;
    }
    case "start-mission":
      commit({ type: "start", mission: form.dataset.mission, acceptCapacity: data.has("capacity"), confirmContacts: data.has("contacts") });
      finishDialog();
      toast("Mission lancée. La préparation est autorisée, pas la diffusion.");
      askFeedback("launch");
      break;
    case "connect": {
      commit({ type: "channel", channel: form.dataset.channel, connected: true });
      if (ui.returnTo === "publish") {
        ui.returnTo = null;
        publicationDialog();
        toast(`${channelLabel(form.dataset.channel)} connecté. Confirmez maintenant la diffusion.`);
      } else {
        finishDialog();
        toast("Connexion simulée confirmée. Aucune diffusion autorisée automatiquement.");
      }
      break;
    }
    case "edit-document": {
      const documentId = form.dataset.document;
      const title = data.get("title").trim();
      const body = data.get("body").trim();
      if (!title || !body) throw new Error("L'accroche et le contenu ne peuvent pas être vides.");
      state = transition(state, {
        type: "revision",
        document: documentId,
        expectedVersion: Number(form.dataset.version),
        by: "vous",
        value: { title, body, ...(documentId === "post" ? { headline: title, layout: data.get("layout"), color: state.brand.color } : {}) },
      });
      delete ui.editorDrafts[documentId];
      save();
      ui.selectedVersion = null;
      render();
      toast("Nouvelle version enregistrée. Validation à renouveler.");
      break;
    }
    case "approve":
      commit({ type: "approve", document: form.dataset.document, expectedVersion: Number(form.dataset.version), rights: data.has("rights") });
      finishDialog();
      toast("Version validée. Rien n'a été diffusé.");
      askFeedback("approve");
      break;
    case "publish": {
      const later = data.get("when") === "later";
      commit({ type: "publish", document: form.dataset.document, expectedVersion: Number(form.dataset.version), date: later ? data.get("date") : null });
      finishDialog();
      toast(later ? "Programmation simulée enregistrée. Aucun envoi automatique." : "Diffusion simulée enregistrée. Cette version est maintenant en lecture seule.");
      if (!later) askFeedback("publish");
      break;
    }
    case "chat": {
      const message = data.get("message").trim();
      if (message) chat(message);
      break;
    }
    case "report":
      commit({ type: "report", mission: data.get("mission"), leads: data.get("leads"), meetings: data.get("meetings"), revenue: data.get("revenue"), note: data.get("note") });
      finishDialog();
      toast("Bilan enregistré et rattaché à la mission.");
      askFeedback("report");
      break;
  }
  ui.dialogDone = true;
}

function updatePickCount(form) {
  const id = form.dataset.mission;
  const max = id === "agencies" ? AGENCIES_MAX : LEADS_MAX;
  const inputs = [...form.querySelectorAll('input[type="checkbox"]')];
  const checked = inputs.filter((input) => input.checked).length;
  inputs.forEach((input) => {
    const eligible = id !== "leads" || contactStatus(state.contacts.find((contact) => contact.id === input.value) || {}).ok;
    input.disabled = !eligible || (!input.checked && checked >= max) || Boolean(scopeLock(state, id));
  });
  const counter = form.querySelector(".pick-count");
  if (counter) counter.textContent = `${checked} sur ${max} ${id === "agencies" ? "choisies" : "choisis"}`;
}

function initialize() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    state = saved?.schema === SEED_VERSION && saved.documents && saved.profile && saved.scope ? saved : initialState();
  } catch {
    state = initialState();
  }
  if (state.step > 1) {
    ui.scan = "ready";
    ui.scanStep = 4;
  }
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
    if (element.id === "document-select") navigate(`atelier/${element.value}`);
    if (element.id === "thread-switch") {
      ui.thread = element.value;
      renderPaul();
    }
    if (element.name === "when") {
      const field = document.querySelector("#schedule-field");
      field.hidden = element.value !== "later";
      field.querySelector("input").disabled = element.value !== "later";
      field.querySelector("input").required = element.value === "later";
    }
    if (element.closest('form[data-form="scope"]') && element.type === "checkbox") updatePickCount(element.closest("form"));
    if (element.id === "csv-file" && element.files[0]) {
      const file = element.files[0];
      const errorElement = document.querySelector("#csv-error");
      if (file.size > 200 * 1024) {
        errorElement.textContent = "Fichier trop volumineux pour cette maquette (200 Ko au maximum).";
        element.value = "";
        return;
      }
      file.text().then((text) => {
        try {
          importPreviewDialog(parseContactsCsv(text));
        } catch (error) {
          errorElement.textContent = error.message;
          element.value = "";
        }
      });
      return;
    }
    if (element.type === "file" && element.files[0] && element.accept?.includes("image")) {
      const documentId = ui.document;
      const expectedVersion = currentVersion(state.documents[documentId]).number;
      const file = element.files[0];
      if (file.size > 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast("Choisissez un JPG, PNG ou WebP de moins de 1 Mo.");
        element.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          try {
            if (ui.editorDrafts[documentId]) throw new Error("Enregistrez le texte avant d'importer la photo.");
            commit({ type: "revision", document: documentId, expectedVersion, by: "vous", value: { photo: reader.result, note: "Photo importée par vous, droits à reconfirmer" } });
            if (ui.document === documentId) ui.selectedVersion = null;
            render();
            toast("Photo ajoutée à la version courante dans une nouvelle version.");
          } catch (error) {
            toast(error.message);
          }
        };
        image.onerror = () => toast("Ce fichier ne contient pas une image lisible.");
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
      document.querySelector("#goal-live").textContent = `+${form.elements.growth.value || "—"} % de chiffre d'affaires en ${form.elements.months.value || "—"} mois`;
    }
    const report = event.target.closest('form[data-form="report"]');
    if (report && ["leads", "meetings"].includes(event.target.name)) {
      const leads = Number(report.elements.leads.value);
      const meetings = Number(report.elements.meetings.value);
      report.querySelector(".live-warn").hidden = !(report.elements.leads.value !== "" && report.elements.meetings.value !== "" && meetings > leads);
    }
  });
  window.addEventListener("resize", () => {
    fitArtworkText();
    syncMobileMenu();
  });
  document.fonts.ready.then(fitArtworkText);
  window.addEventListener("beforeunload", (event) => {
    if (Object.keys(ui.editorDrafts).length) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector(".sidebar.open")) toggleMenu(false);
    if (event.target.id === "paul-input" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      event.target.closest("form").requestSubmit();
    }
  });
  ["modal", "paul-dialog"].forEach((id) => {
    const dialog = document.getElementById(id);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
  });
  document.getElementById("modal").addEventListener("close", () => {
    if (!ui.dialogDone) {
      track("abandon", ui.dialogTitle);
      save();
    }
    ui.returnTo = null;
  });
  readRoute();
}

if (typeof window !== "undefined") initialize();
