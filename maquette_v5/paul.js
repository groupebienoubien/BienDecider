"use strict";

// Paul : réponses par intention, une conversation par contexte. Aucune IA : des règles lisibles, qui lisent et proposent de modifier l'état.

const DOC_LABEL = {
  post: "Visuel & publication",
  email: "E-mail aux agences",
  followup: "E-mail aux prospects",
};

const norm = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function parseContext(key) {
  const [kind, id] = String(key).split(":");
  return { key, kind, id };
}

function contextLabel(key, state = { customMissions: {} }) {
  const { kind, id } = parseContext(key);
  switch (kind) {
    case "ambition":
      return "Votre ambition";
    case "positionnement":
      return "Votre positionnement";
    case "concurrence":
      return "La concurrence locale";
    case "sources":
      return "Fiabilité des sources";
    case "results":
      return "Bilan et prochaine décision";
    case "mission":
      return `Mission · ${definitionsFor(state)[id]?.short || id}`;
    case "atelier":
      return `Atelier · ${DOC_LABEL[id] || id}`;
    case "idea":
      return `Nouvelle idée n°${id}`;
    default:
      return "Votre stratégie";
  }
}

const routeLink = (label, route) => ({ label, route });

function creditText(state) {
  return `Il vous reste ${state.account.credits} crédit${state.account.credits > 1 ? "s" : ""}. Lancer une mission en coûte ${CREDIT_COST.start}, une version préparée avec Paul ${CREDIT_COST.paulRevision}. Vos retouches, vos validations et vos diffusions sont gratuites.`;
}

// Lecture d'une ambition en texte libre : des règles lisibles, pas une IA.
function interpretAmbition(text) {
  const t = norm(text);
  const notes = [];
  const found = [];
  let growth = null;
  let months = null;
  let budget = null;
  let hiring = false;
  const percent = t.match(/(\d+(?:[.,]\d+)?)\s*(%|pour ?cent|pourcent)/);
  const revenueGoal = /chiffre d'affaires|\bca\b/.test(t) && !/reduire|baisser|diminuer/.test(t);
  if (percent && revenueGoal) growth = Math.round(Number(percent[1].replace(",", ".")));
  else if (/doubl/.test(t) && revenueGoal) growth = 100;
  if (growth !== null && growth < 1) growth = null;
  if (growth !== null && growth > GOAL_LIMITS.growth.max) {
    notes.push(`${growth} % dépasse la plage interprétée dans cette maquette. Votre ambition est conservée telle quelle, sans la ramener à un autre chiffre.`);
    growth = null;
  }
  const inMonths = t.match(/(\d+)\s*mois/);
  const inYears = t.match(/(\d+)\s*ans?\b/);
  if (inMonths) months = Number(inMonths[1]);
  else if (inYears) months = Number(inYears[1]) * 12;
  else if (/cette annee|un an|annee prochaine|l'annee/.test(t)) months = 12;
  else if (/semestre/.test(t)) months = 6;
  else if (/trimestre/.test(t)) months = 3;
  if (months !== null && (months < GOAL_LIMITS.months.min || months > GOAL_LIMITS.months.max)) {
    notes.push(`L'horizon de ${months} mois reste dans votre formulation, sans conversion automatique dans cette maquette.`);
    months = null;
  }
  if (/(sans|pas de|aucun) budget/.test(t)) budget = 0;
  else {
    const euros = t.match(/(\d+)\s*(€|euros?)/);
    if (euros) budget = Math.min(GOAL_LIMITS.budget.max, Number(euros[1]));
  }
  if (/sans (embauch|recrut)|pas d'embauch|sans personne/.test(t)) hiring = false;
  else if (/embauch|recrut/.test(t)) hiring = true;
  if (growth !== null) found.push(`Gain : +${growth} % de chiffre d'affaires`);
  if (months !== null) found.push(`Horizon : ${months} mois`);
  found.push(budget ? `Budget média : ${budget} € par mois` : "Budget média : aucun (0 €)");
  found.push(hiring ? "Recrutement possible" : /sans (embauch|recrut)|pas d'embauch|sans personne/.test(t) ? "Sans recrutement" : "Recrutement non précisé : aucune embauche supposée");
  const questions = [];
  if (growth === null) questions.push("Quel gain visez-vous ? Par exemple +20 % de chiffre d'affaires, ou 10 devis par mois.");
  if (months === null) questions.push("Sur quelle durée ? Par exemple 12 mois.");
  return { growth, months, budget: budget ?? 0, hiring, found, notes, questions, statement: String(text).trim() };
}

function stepLinks(step) {
  if (step.route) return [routeLink(step.label, step.route)];
  if (step.action === "connect") return [routeLink("Gérer les connexions", "entreprise/canaux")];
  if (step.action === "report") return [routeLink("Aller aux résultats", "resultats")];
  if (step.action === "decide-next") return [routeLink("Voir la mission", `missions/${step.mission}`)];
  return [];
}

function paulIntro(state, ctx) {
  const { kind, id } = ctx;
  const def = definitionsFor(state)[id];
  switch (kind) {
    case "ambition":
      return `Vous m'avez dit : « ${state.goal.statement || "…"} ». Ce que j'en retiens : ${goalLabel(state.goal)}. Qu'est-ce qui doit primer : des retours rapides ou une présence plus solide ? Nous ajusterons le cap avant de le confirmer.`;
    case "positionnement":
      return "Votre proximité et votre clarté peuvent faire la différence. Les aides sont déjà très présentes chez les concurrents de l'exemple. Préférez-vous mettre en avant l'accompagnement, les réalisations ou l'expertise technique ?";
    case "concurrence":
      return "Martine a relevé 5 acteurs potentiels dans l'exemple. Leurs messages ne démontrent pas leurs performances. Je propose de les utiliser pour affiner votre différence, pas pour copier leurs promesses.";
    case "sources":
      return "Un constat n'a de valeur que par sa source. Dites-moi lequel vous paraît fragile : je distingue ce qui est observé, déclaré par vous ou simplement supposé.";
    case "results": {
      if (!state.publications.length && !Object.keys(state.reports).length)
        return "Rien n'a encore été diffusé : il est trop tôt pour conclure. Après la première diffusion, notez les réponses reçues et rattachez-les à la mission concernée. Gardons le test limité plutôt que d'augmenter le budget.";
      return "Regardons d'abord la qualité des retours et leur origine. Une publication n'est pas une vente. Si nous manquons de chiffres, gardons le test limité plutôt que d'augmenter le budget.";
    }
    case "mission": {
      const stage = journeyStage(state, id);
      const lock = scopeLock(state, id);
      return `${def.short} : ${missionTarget(state, id)}. Périmètre actuel : ${scopeSummary(state, id)}.${lock ? ` ${lock}` : ""}\n\nJe peux réduire le périmètre, vous expliquer les risques, mettre la mission en pause ou l'écarter du plan. Étape en cours : ${nextStepLabel(stage)}.`;
    }
    case "atelier": {
      const doc = state.documents[id];
      if (!doc) return "Choisissez un contenu dans l'atelier pour que je le retravaille avec vous.";
      const latest = currentVersion(doc);
      const diffused = isDiffused(state, id, latest.number);
      return `Je transmets vos consignes à ${definitionsFor(state)[doc.mission].owner}. Dites-moi ce que vous souhaitez changer : plus court, plus humain, un autre angle.${diffused ? ` V${latest.number} est déjà diffusée : toute retouche créera V${latest.number + 1}, à valider à nouveau.` : " Toute retouche crée une nouvelle version à valider à nouveau."}`;
    }
    case "idea":
      return "Racontez-moi votre idée en une phrase. Nous préciserons son constat, son résultat attendu et le type d'action avant de créer une mission. Vous confirmerez ensuite son périmètre et son lancement.";
    default: {
      const step = nextStep(state);
      return `Ma priorité actuelle : ${definitionsFor(state)[state.priority].short.toLowerCase()}. Elle s'appuie sur le diagnostic et sur votre cap : ${goalLabel(state.goal)}.\n\nProchain pas : ${step.title.toLowerCase()}. Rien ne sera lancé à la suite de cette discussion sans votre accord. Je peux aussi remettre en question une mission, la modifier ou l'écarter.`;
    }
  }
}

function nextStepLabel(stage) {
  return (
    {
      launch: "à lancer",
      approve: "contenu à valider",
      connect: "canal à connecter",
      publish: "diffusion à confirmer",
      scheduled: "diffusion programmée",
      report: "bilan à renseigner",
      decide: "décision de fin de test",
      "next-round": "série suivante à préparer",
      closed: "mission close",
      dismissed: "mission écartée du plan",
    }[stage] || stage
  );
}

function suggestionsFor(state, ctx) {
  switch (ctx.kind) {
    case "atelier":
      return ["Plus court", "Plus humain", "Un autre angle", "Quel risque ?"];
    case "mission":
      return [
        "Que faire maintenant ?",
        "Quel risque ?",
        ctx.id === "agencies" ? "Réduis à 1 agence" : ctx.id === "leads" ? "Limite à 5 contacts" : "Pourquoi cette mission ?",
        "Mets cette mission en pause",
        "Écarte cette mission",
      ];
    case "results":
      return ["Que faire maintenant ?", "Comment mesurer ?", "Comparer les pistes"];
    case "ambition":
      return ["Est-ce réaliste ?", "Quel budget prévoir ?"];
    case "idea":
      return ["Combien ça coûte ?", "Quel risque ?"];
    case "positionnement":
    case "concurrence":
    case "sources":
      return ["Que faut-il en retenir ?", "Comparer les pistes"];
    default:
      return ["Que faire maintenant ?", "Combien ça coûte ?", "Quelle mission écarter ?", "Quel risque ?", "Comparer les pistes"];
  }
}

function missionFrom(text, ctx, state) {
  if (ctx.kind === "mission" && state.customMissions?.[ctx.id]) return ctx.id;
  if (ctx.kind === "atelier" && state.customMissions?.[state.documents[ctx.id]?.mission]) return state.documents[ctx.id].mission;
  if (/agence|partenar|prescripteur/.test(text)) return "agencies";
  if (/realisation|preuve|photo|visuel|facebook|publication/.test(text)) return "proof";
  if (/prospect|contact|reactiv|ancien|relance/.test(text)) return "leads";
  if (ctx.kind === "mission") return ctx.id;
  if (ctx.kind === "atelier") return state.documents[ctx.id]?.mission || null;
  const active = Object.keys(state.missions).filter((id) => state.missions[id] === "active");
  return active.length === 1 ? active[0] : null;
}

function strategyProposal(state, priority, preference, text) {
  const def = definitionsFor(state)[priority];
  return {
    text,
    proposal: {
      title: `Priorité : ${def.short}`,
      description: "Réordonne les recommandations. Ne lance aucune mission et ne suspend pas celles en cours.",
      event: { type: "strategy", priority, preference },
      done: `Priorité mise à jour : ${def.short}. Les missions déjà en cours restent inchangées.`,
    },
  };
}

function numberIn(text) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

const intents = [
  {
    id: "greeting",
    test: (t) => /^(bonjour|salut|bonsoir|merci|ok|d'accord|super|parfait)\b/.test(t) && t.split(" ").length <= 4,
    reply: (t, message, ctx, state) => ({
      text: `Avec plaisir${state.profile.firstName ? `, ${state.profile.firstName}` : ""}. Dites-moi ce que vous voulez trancher : le budget, les risques, une mission à modifier ou la prochaine étape.`,
    }),
  },
  {
    id: "revision",
    test: (t, ctx) => ctx.kind === "atelier" && /court|concis|raccourc|humain|chaleur|moins formel|simple|angle|autre entree|autrement|reformul/.test(t),
    reply: (t, message, ctx, state) => {
      const variant = /court|concis|raccourc/.test(t) ? "shorter" : /humain|chaleur|moins formel|simple/.test(t) ? "warmer" : "angle";
      const doc = state.documents[ctx.id];
      const latest = currentVersion(doc);
      if (doc.scheduled)
        return { text: "Une diffusion est programmée : annulez-la dans l'atelier avant que je prépare une nouvelle version." };
      return {
        text: `Je transmets cette consigne à ${definitionsFor(state)[doc.mission].owner} : ${variantLabel(variant)}. Dans cette maquette, la variante est illustrative. Elle ne remplace pas votre version tant que vous ne l'avez pas retenue.`,
        proposal: {
          title: `Une version ${variantLabel(variant)}`,
          description: `Même destination, même mission. Aucun envoi. Crée V${latest.number + 1}, préparée avec Paul, à relire et valider.`,
          accept: "Créer cette version",
          event: {
            type: "revision",
            document: ctx.id,
            expectedVersion: latest.number,
            by: "paul",
            reopen: isDiffused(state, ctx.id, latest.number),
            value: proposedRevision(state, ctx.id, variant),
          },
          done: `V${latest.number + 1} est prête dans l'atelier. Rien n'est diffusé. Votre validation est à renouveler.`,
        },
      };
    },
  },
  {
    id: "scope",
    test: (t) => /(\d+|\bun\b|\bune\b)\s*(agences?|contacts?|prospects?)/.test(t) && /(reduis|reduire|limite|limiter|garde|garder|seulement|uniquement|passe|mets|moins|que)/.test(t),
    reply: (t, message, ctx, state) => {
      const match = t.match(/(\d+|\bun\b|\bune\b)\s*(agences?|contacts?|prospects?)/);
      const count = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
      const template = /agence/.test(match[2]) ? "agencies" : "leads";
      const contextual = ctx.kind === "mission" ? ctx.id : ctx.kind === "atelier" ? state.documents[ctx.id]?.mission : null;
      const mission = contextual && templateOf(state, contextual) === template ? contextual : template;
      const def = definitionsFor(state)[mission];
      const lock = scopeLock(state, mission);
      if (lock) return { text: `Je ne peux pas modifier « ${def.short} » : ${lock}` };
      const ids = state.scope[mission].ids;
      const max = template === "agencies" ? AGENCIES_MAX : LEADS_MAX;
      if (count < 1 || count > max) return { text: `Le périmètre de « ${def.short} » va de 1 à ${max}. Dites-moi un nombre dans cette plage.` };
      if (count >= ids.length)
        return { text: `Le périmètre contient déjà ${ids.length} ${mission === "agencies" ? "agence" : "contact"}${ids.length > 1 ? "s" : ""}. Pour en changer, utilisez la page de la mission.`, links: [routeLink("Ouvrir la mission", `missions/${mission}`)] };
      return {
        text: `Je réduis volontiers le test : moins de destinataires, moins de suivi. Je garde les ${count} premiers de votre sélection ; vous pourrez en choisir d'autres dans la mission.`,
        proposal: {
          title: `${def.short} : ${count} ${mission === "agencies" ? "agence" : "contact"}${count > 1 ? "s" : ""}`,
          description: state.missions[mission] === "active" ? "Les destinataires changent : le contenu passe à une nouvelle version, à valider à nouveau." : "Met à jour le périmètre de la mission. Rien n'est lancé.",
          event: { type: "scope", mission, value: { ids: ids.slice(0, count) } },
          done: `Périmètre mis à jour : ${def.short}, ${count} ${mission === "agencies" ? "agence" : "contact"}${count > 1 ? "s" : ""}.`,
        },
      };
    },
  },
  {
    id: "pause",
    test: (t) => /\b(pause|suspend|suspendre|arrete|arreter|stoppe|stopper)\b/.test(t),
    reply: (t, message, ctx, state) => {
      const mission = missionFrom(t, ctx, state);
      const active = Object.keys(state.missions).filter((id) => state.missions[id] === "active");
      if (!active.length) return { text: "Aucune mission n'est en cours : il n'y a rien à suspendre pour le moment." };
      if (!mission || state.missions[mission] !== "active")
        return { text: `Quelle mission suspendre ? ${active.map((id) => definitionsFor(state)[id].short).join(" ou ")}.`, links: active.map((id) => routeLink(definitionsFor(state)[id].short, `missions/${id}`)) };
      return {
        text: `Suspendre « ${definitionsFor(state)[mission].short} » arrête la préparation et annule ses programmations. Les diffusions déjà faites restent dans l'historique. Vous pourrez la reprendre.`,
        proposal: {
          title: `Mettre en pause : ${definitionsFor(state)[mission].short}`,
          description: "Annule les programmations de cette mission. Vous pourrez la reprendre.",
          event: { type: "pause", mission },
          done: `Mission suspendue : ${definitionsFor(state)[mission].short}.`,
        },
      };
    },
  },
  {
    id: "budget",
    test: (t) => /budget|combien (ca|cela|ca va) cout|combien (ca|cela) coute|cout|tarif|prix|depense|payer|publicite|argent|\bpub\b/.test(t),
    reply: (t, message, ctx, state) => {
      const amount = numberIn(t);
      if (amount !== null && /budget/.test(t) && /(passe|mets|monte|baisse|fixe|reduis|augmente|mettre|a )/.test(t)) {
        const limit = GOAL_LIMITS.budget;
        if (amount < limit.min || amount > limit.max)
          return { text: `Le budget média va de ${limit.min} à ${limit.max} € par mois dans cette maquette. Quel montant retenez-vous ?` };
        return {
          text: `Aucune des trois missions ne dépense de budget : le plafond ne sert qu'à poser une limite. Je peux le passer à ${amount} € par mois.`,
          proposal: {
            title: `Budget média maximum : ${amount} €/mois`,
            description: "Un plafond, jamais une autorisation de dépense : chaque dépense reste à confirmer.",
            event: { type: "goal", value: { budget: amount } },
            done: `Budget média maximum : ${amount} € par mois. Aucune dépense engagée.`,
          },
        };
      }
      return {
        text: `Aucune des trois missions ne demande de budget média : elles ne coûtent que des crédits. ${creditText(state)}\n\nVotre plafond média est de ${state.goal.budget} € par mois ; il n'autorise aucune dépense, chacune resterait à confirmer. Pour le changer, dites par exemple « mets le budget à 100 ».`,
        links: [routeLink("Gérer mes crédits", "compte")],
      };
    },
  },
  {
    id: "credits",
    test: (t) => /credit|recharg|solde/.test(t),
    reply: (t, message, ctx, state) => ({
      text: creditText(state),
      links: [routeLink("Gérer mes crédits", "compte")],
    }),
  },
  {
    id: "dismiss",
    test: (t) => /\b(ecart|supprim|retire|enleve|abandonn)\w*/.test(t),
    reply: (t, message, ctx, state) => {
      const explicit = /agence|partenar|prescripteur/.test(t) ? "agencies" : /realisation|preuve|photo|visuel|facebook/.test(t) ? "proof" : /prospect|contact|reactiv|ancien/.test(t) ? "leads" : ctx.kind === "mission" ? ctx.id : ctx.kind === "atelier" ? state.documents[ctx.id]?.mission : null;
      const planned = Object.keys(state.missions).filter((id) => state.missions[id] !== "dismissed");
      if (!explicit)
        return { text: `Quelle mission écarter du plan ? ${planned.map((id) => definitionsFor(state)[id].short).join(", ")}. Une mission écartée n'est pas supprimée : vous pouvez la remettre au plan.`, links: planned.map((id) => routeLink(definitionsFor(state)[id].short, `missions/${id}`)) };
      const def = definitionsFor(state)[explicit];
      if (state.missions[explicit] === "dismissed") return { text: `« ${def.short} » est déjà écartée du plan.` };
      if (state.missions[explicit] === "active")
        return { text: `« ${def.short} » est en cours : mettez-la d'abord en pause ou arrêtez-la, puis je pourrai l'écarter.`, links: [routeLink("Ouvrir la mission", `missions/${explicit}`)] };
      return {
        text: `Écarter « ${def.short} » la retire des recommandations. Rien n'est effacé : vous pourrez la remettre au plan.`,
        proposal: {
          title: `Écarter : ${def.short}`,
          description: "La mission quitte le plan. Elle reste visible sous « Écartées ».",
          event: { type: "dismiss", mission: explicit },
          done: `Mission écartée du plan : ${def.short}.`,
        },
      };
    },
  },
  {
    id: "restore",
    test: (t) => /\b(remets|remettre|reintegr|restaur)\w*/.test(t),
    reply: (t, message, ctx, state) => {
      const dismissed = Object.keys(state.missions).filter((id) => state.missions[id] === "dismissed");
      if (!dismissed.length) return { text: "Aucune mission n'est écartée : tout est déjà au plan." };
      const mission = dismissed.find((id) => missionFrom(t, ctx, state) === id) || (dismissed.length === 1 ? dismissed[0] : null);
      if (!mission) return { text: `Quelle mission remettre au plan ? ${dismissed.map((id) => definitionsFor(state)[id].short).join(", ")}.`, links: dismissed.map((id) => routeLink(definitionsFor(state)[id].short, `missions/${id}`)) };
      return {
        text: `Je remets « ${definitionsFor(state)[mission].short} » au plan : elle redevient une proposition, sans rien lancer.`,
        proposal: { title: `Remettre au plan : ${definitionsFor(state)[mission].short}`, description: "La mission redevient « à décider ».", event: { type: "restore", mission }, done: `Mission remise au plan : ${definitionsFor(state)[mission].short}.` },
      };
    },
  },
  {
    id: "risk",
    test: (t) => /risque|legal|rgpd|consent|droit|opposition|securit|donnees|licence|responsab/.test(t),
    reply: (t, message, ctx, state) => {
      const mission = missionFrom(t, ctx, state) || state.priority;
      const def = definitionsFor(state)[mission];
      const extra =
        mission === "leads"
          ? " Pour cette mission, seuls les contacts dont l'accord de recontact est connu et récent sont retenus."
          : mission === "proof"
            ? " Aucun témoignage ni gain chiffré n'est inventé."
            : " Chaque agence reçoit un message individuel, sans relance automatique.";
      return {
        text: `Pour « ${def.short} » : ${def.risk}${extra}\n\nRègle d'arrêt : ${def.stopRule}`,
        links: [routeLink("Ouvrir la mission", `missions/${mission}`)],
      };
    },
  },
  {
    id: "results",
    test: (t) => /resultat|bilan|mesur|suivi|performan|efficace|\broi\b|chiffre|combien de demandes/.test(t),
    reply: (t, message, ctx, state) => {
      const reports = Object.entries(state.reports);
      if (!state.publications.length)
        return { text: "Rien n'a encore été diffusé : il n'y a donc rien à mesurer. Après une première diffusion, vous noterez les demandes qualifiées et les rendez-vous, rattachés à la mission concernée.", links: [routeLink("Voir les missions", "missions")] };
      if (!reports.length)
        return { text: "Des diffusions ont eu lieu, mais aucun bilan n'est renseigné. Sans chiffres, je ne peux pas comparer au résultat recherché.", links: [routeLink("Renseigner le bilan", "resultats")] };
      return {
        text: reports.map(([id, r]) => `${definitionsFor(state)[id].short} : ${r.leads} demandes, ${r.meetings} rendez-vous (recherché : ${missionTarget(state, id).toLowerCase()}).`).join("\n") + "\n\nCes chiffres sont déclaratifs : avant d'élargir, vérifions leur origine.",
        links: [routeLink("Voir les résultats", "resultats")],
      };
    },
  },
  {
    id: "next",
    test: (t) => /prochain|maintenant|ensuite|et apres|je fais quoi|par ou|que faire|quoi faire|etape/.test(t),
    reply: (t, message, ctx, state) => {
      const step = nextStep(state);
      return { text: `${step.title}. ${step.detail}`, links: stepLinks(step) };
    },
  },
  {
    id: "switch",
    test: (t) => /agence|partenar|realisation|preuve|prospect|reactiv|ancien/.test(t) && !/\d+\s*(agence|contact|prospect)/.test(t),
    reply: (t, message, ctx, state) => {
      const mission = missionFrom(t, { kind: "none" }, state);
      if (state.missions[mission] === "dismissed")
        return { text: `\u00ab ${definitionsFor(state)[mission].short} \u00bb est \u00e9cart\u00e9e du plan. Je peux la remettre au plan avant d'en faire la priorit\u00e9.`, proposal: { title: `Remettre au plan : ${definitionsFor(state)[mission].short}`, description: "La mission redevient \u00ab \u00e0 d\u00e9cider \u00bb.", event: { type: "restore", mission }, done: `Mission remise au plan : ${definitionsFor(state)[mission].short}.` } };
      if (mission === "agencies")
        return strategyProposal(state, "agencies", "balanced", "Les agences peuvent devenir des prescripteurs. Je garde un test à 2 destinataires au plus, sans relance automatique ni promesse de résultat.");
      if (mission === "leads")
        return strategyProposal(state, "leads", "balanced", "Commençons par vos relations existantes. Jean-Claude prépare un échantillon de contacts parmi les recontactables. Vous confirmerez leur pertinence et le droit de recontact avant le lancement. Aucun envoi automatique.");
      return strategyProposal(state, "proof", "balanced", "Rendre une réalisation visible peut soutenir toutes vos prises de contact. C'est cohérent avec le manque de preuves observé, mais nous n'en déduirons pas une hausse de conversion avant d'avoir des données.");
    },
  },
  {
    id: "channels",
    test: (t) => /facebook|gmail|canal|canaux|connect|oauth|e-?mail|mail\b|messagerie/.test(t),
    reply: (t, message, ctx, state) => ({
      text: `Canaux : ${Object.keys(state.channels).map((c) => `${channelLabel(c)} ${state.channels[c] ? "connecté (simulation)" : "non connecté"}`).join(", ")}. Connecter un canal n'autorise aucun envoi : le contenu, la version et le moment se confirment séparément. Déconnecter un canal annule ses programmations.`,
      links: [routeLink("Gérer les connexions", "entreprise/canaux")],
    }),
  },
  {
    id: "delegation",
    test: (t) => /autonom|deleg|automatique|sans moi|tout seul/.test(t),
    reply: (t, message, ctx, state) => ({
      text: `Votre règle actuelle : ${{ prepare: "préparation seule", review: "validation avant chaque action", bounded: "autonomie encadrée" }[state.delegation]}. Dans tous les cas, une diffusion ou un premier contact reste soumis à votre confirmation dans cette maquette.`,
      links: [routeLink("Modifier mes règles", "entreprise/canaux")],
    }),
  },
  {
    id: "compare",
    test: (t) => /compar|choix|option|piste|conseill|recommand|priorite|par quoi commenc/.test(t),
    reply: () => ({
      text: "Trois chemins, trois compromis :\n\n1. Agences : un nouveau canal, mais des contacts à qualifier. Test limité à 2 agences.\n2. Réalisations : peu de suivi, mais un effet commercial indirect. Une seule publication d'abord.\n3. Anciens prospects : potentiellement rapide, mais la liste et le droit de recontact sont à vérifier.\n\nJe ne changerais pas votre priorité sans choisir ensemble le compromis qui vous convient.",
    }),
  },
  {
    id: "realism",
    test: (t, ctx) => ctx.kind === "ambition" && /realiste|ambitieux|trop|atteignable|objectif|plafond/.test(t),
    reply: (t, message, ctx, state) => ({
      text: !state.goal.growth
        ? `Je n'ai pas de chiffre précis dans votre ambition (« ${state.goal.statement || "…"} ») : difficile de dire si elle est réaliste. Pouvez-vous préciser un gain et une durée ?`
        : state.goal.growth > 20
          ? `+${state.goal.growth} % dépasse les repères usuels (5 à 20 %) : cela suppose beaucoup plus de projets qu'aujourd'hui. Je vous conseillerais de viser plus bas ou d'allonger l'horizon.`
          : `+${state.goal.growth} % reste dans les repères usuels (5 à 20 %). C'est une cible, pas une promesse : nous la confronterons à vos résultats réels.`,
    }),
  },
  {
    id: "summary",
    test: (t) => /retenir|resume|synthese|explique|pourquoi|comment ca marche/.test(t),
    reply: (t, message, ctx, state) => {
      if (ctx.kind === "mission") return { text: `${definitionsFor(state)[ctx.id].rationale}\n\nPreuve : ${definitionsFor(state)[ctx.id].evidence}. Niveau de certitude : ${definitionsFor(state)[ctx.id].certainty[0].toLowerCase()}.`, links: [routeLink("Voir les constats", "entreprise/audit")] };
      if (["positionnement", "concurrence", "sources"].includes(ctx.kind)) return { text: paulIntro(state, ctx), links: [routeLink("Voir les constats", "entreprise/audit")] };
      return { text: "Vous fixez un cap, je propose un test limité, l'équipe prépare, vous validez chaque contenu puis chaque diffusion, et nous décidons de la suite sur la base de votre bilan.", links: [routeLink("Voir les missions", "missions")] };
    },
  },
  {
    id: "team",
    test: (t) => /\bqui\b|agent|equipe|martine|camille|jean/.test(t),
    reply: () => ({
      text: "Martine analyse (diagnostic, sources), Camille crée (textes, visuels, marque), Jean-Claude prépare les prises de contact (agences, prospects). Je coordonne et vous restitue : vous n'avez qu'un interlocuteur.",
    }),
  },
];

function paulReply(state, ctx, message) {
  const t = norm(message).trim();
  const words = t.split(/\s+/).length;
  const ideaFirst = ctx.kind === "idea" && words >= 4 && !/budget|cout|credit|risque|resultat|bilan/.test(t);
  if (ideaFirst) {
    const mission = /agence|partenar/.test(t) ? "agencies" : /realisation|photo|visuel|facebook|preuve/.test(t) ? "proof" : /prospect|ancien|contact|reactiv/.test(t) ? "leads" : null;
    return {
      text: mission
        ? `Votre idée rejoint la mission « ${definitionsFor(state)[mission].short} ». Je peux la noter pour la cadrer avec vous, ou ouvrir directement cette mission.`
        : "Précisons le constat et le résultat attendu. La maquette permet ensuite de créer une mission de partenariat, de publication Facebook ou de réactivation. Les autres types restent à étudier, sans prétendre les exécuter.",
      proposal: {
        title: "Noter cette idée",
        description: "Elle apparaît dans Missions, sous « Vos idées à cadrer ». Rien n'est lancé.",
        accept: "Noter l'idée",
        event: { type: "idea", text: message },
        done: "Idée notée. Ouvrez « Créer une mission » pour confirmer son constat, son type et son résultat attendu avant tout lancement.",
      },
      links: [routeLink("Créer une mission", "missions/nouvelle"), ...(mission ? [routeLink("Ouvrir la mission", `missions/${mission}`)] : [])],
    };
  }
  const intent = intents.find((item) => item.test(t, ctx, state));
  if (intent) return intent.reply(t, message, ctx, state);
  const step = nextStep(state);
  return {
    text: `Cette question sort de ce que je peux traiter ici : dans cette maquette, je réponds sur le budget, les crédits, les risques, les missions, les canaux et les résultats.\n\nCe que nous pouvons faire maintenant : ${step.title.toLowerCase()}, ajuster une mission, ou regarder les résultats.`,
    links: [...stepLinks(step), routeLink("Ajuster une mission", "missions"), routeLink("Voir les résultats", "resultats")].slice(0, 3),
  };
}
