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

function contextLabel(key) {
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
      return `Mission · ${missionDefinitions[id]?.short || id}`;
    case "atelier":
      return `Atelier · ${DOC_LABEL[id] || id}`;
    case "idea":
      return `Nouvelle idée n°${id}`;
    default:
      return "Votre stratégie";
  }
}

const routeLink = (label, route) => ({ label, route });

function loadText(state) {
  const load = capacityLoad(state);
  const active = Object.keys(state.missions).filter((id) => state.missions[id] === "active").length;
  return `${active} mission${active > 1 ? "s" : ""} en cours : ${formatHours(load.hours)} par semaine au plus, pour ${formatHours(load.hoursMax)} disponibles. Temps déjà consommé : ${formatMinutes(load.usedMinutes)} sur ${formatMinutes(load.plannedMinutes)} prévus. Projets possibles si tout réussit : ${load.projects} pour ${load.projectsMax} que vous pouvez prendre.`;
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
  const def = missionDefinitions[id];
  switch (kind) {
    case "ambition":
      return `Vous visez +${state.goal.growth} % de chiffre d'affaires en ${state.goal.months} mois, avec ${state.goal.time} h par semaine. Qu'est-ce qui doit primer : le temps gagné, des retours rapides ou une présence plus solide ? Nous ajusterons le cap avant de le confirmer.`;
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
      return `${def.short} : ${def.target}. Périmètre actuel : ${scopeSummary(state, id)}.${lock ? ` ${lock}` : ""}\n\nJe peux réduire le périmètre, vous expliquer les risques, ou mettre la mission en pause. Étape en cours : ${nextStepLabel(stage)}.`;
    }
    case "atelier": {
      const doc = state.documents[id];
      if (!doc) return "Choisissez un contenu dans l'atelier pour que je le retravaille avec vous.";
      const latest = currentVersion(doc);
      const diffused = isDiffused(state, id, latest.number);
      return `Je transmets vos consignes à ${missionDefinitions[doc.mission].owner}. Dites-moi ce que vous souhaitez changer : plus court, plus humain, un autre angle.${diffused ? ` V${latest.number} est déjà diffusée : toute retouche créera V${latest.number + 1}, à valider à nouveau.` : " Toute retouche crée une nouvelle version à valider à nouveau."}`;
    }
    case "idea":
      return "Racontez-moi votre idée en une phrase. Je la compare aux trois missions, à votre temps et à votre capacité, puis je vous propose de la noter ou de la rattacher à une mission.";
    default: {
      const step = nextStep(state);
      return `Ma priorité actuelle : ${missionDefinitions[state.priority].short.toLowerCase()}. Elle s'appuie sur le diagnostic, ${state.goal.capacity} projets clients possibles et ${state.goal.budget} € de budget média maximum.\n\nProchain pas : ${step.title.toLowerCase()}. Rien ne sera lancé à la suite de cette discussion sans votre accord.`;
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
        ctx.id === "agencies" ? "Réduis à 1 agence" : ctx.id === "leads" ? "Limite à 5 contacts" : "Combien de temps ça prend ?",
        "Mets cette mission en pause",
      ];
    case "results":
      return ["Que faire maintenant ?", "Comment mesurer ?", "Comparer les pistes"];
    case "ambition":
      return ["Est-ce réaliste ?", "Quel budget prévoir ?", "Combien de temps ça prend ?"];
    case "idea":
      return ["Combien ça coûte ?", "Quel risque ?"];
    case "positionnement":
    case "concurrence":
    case "sources":
      return ["Que faut-il en retenir ?", "Comparer les pistes"];
    default:
      return ["Que faire maintenant ?", "Combien ça coûte ?", "J'ai peu de temps", "Quel risque ?", "Comparer les pistes"];
  }
}

function missionFrom(text, ctx, state) {
  if (/agence|partenar|prescripteur/.test(text)) return "agencies";
  if (/realisation|preuve|photo|visuel|facebook|publication/.test(text)) return "proof";
  if (/prospect|contact|reactiv|ancien|relance/.test(text)) return "leads";
  if (ctx.kind === "mission") return ctx.id;
  if (ctx.kind === "atelier") return state.documents[ctx.id]?.mission || null;
  const active = Object.keys(state.missions).filter((id) => state.missions[id] === "active");
  return active.length === 1 ? active[0] : null;
}

function strategyProposal(state, priority, preference, text) {
  const def = missionDefinitions[priority];
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
      text: `Avec plaisir${state.profile.firstName ? `, ${state.profile.firstName}` : ""}. Dites-moi ce que vous voulez trancher : le budget, le temps, les risques ou la prochaine étape.`,
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
        text: `Je transmets cette consigne à ${missionDefinitions[doc.mission].owner} : ${variantLabel(variant)}. Dans cette maquette, la variante est illustrative. Elle ne remplace pas votre version tant que vous ne l'avez pas retenue.`,
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
      const mission = /agence/.test(match[2]) ? "agencies" : "leads";
      const def = missionDefinitions[mission];
      const lock = scopeLock(state, mission);
      if (lock) return { text: `Je ne peux pas modifier « ${def.short} » : ${lock}` };
      const ids = state.scope[mission].ids;
      const max = mission === "agencies" ? AGENCIES_MAX : LEADS_MAX;
      if (count < 1 || count > max) return { text: `Le périmètre de « ${def.short} » va de 1 à ${max}. Dites-moi un nombre dans cette plage.` };
      if (count >= ids.length)
        return { text: `Le périmètre contient déjà ${ids.length} ${mission === "agencies" ? "agence" : "contact"}${ids.length > 1 ? "s" : ""}. Pour en changer, utilisez la page de la mission.`, links: [routeLink("Ouvrir la mission", `missions/${mission}`)] };
      return {
        text: `Je réduis volontiers le test : moins de destinataires, moins de temps à suivre. Je garde les ${count} premiers de votre sélection ; vous pourrez en choisir d'autres dans la mission.`,
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
        return { text: `Quelle mission suspendre ? ${active.map((id) => missionDefinitions[id].short).join(" ou ")}.`, links: active.map((id) => routeLink(missionDefinitions[id].short, `missions/${id}`)) };
      return {
        text: `Suspendre « ${missionDefinitions[mission].short} » arrête la préparation et annule ses programmations. Les diffusions déjà faites restent dans l'historique. Vous pourrez la reprendre.`,
        proposal: {
          title: `Mettre en pause : ${missionDefinitions[mission].short}`,
          description: "Annule les programmations de cette mission. Libère du temps pour une autre.",
          event: { type: "pause", mission },
          done: `Mission suspendue : ${missionDefinitions[mission].short}.`,
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
        text: `Aucune des trois missions ne demande de budget média : elles coûtent votre temps (${loadText(state).split(". ")[0]}). Votre plafond est de ${state.goal.budget} € par mois ; il n'autorise aucune dépense, chacune resterait à confirmer.\n\nPour le changer, dites par exemple « mets le budget à 100 ».`,
        links: [routeLink("Voir le cadre des missions", "missions")],
      };
    },
  },
  {
    id: "time",
    test: (t) => /temps|heure|disponib|occupe|deborde|charge|\d+\s*h\b/.test(t),
    reply: (t, message, ctx, state) => {
      const amount = numberIn(t);
      if (amount !== null && /(\d+(?:[.,]\d+)?)\s*(h|heures?)\b/.test(t) && /(passe|mets|monte|augmente|baisse|reduis|je peux|dispose|disponible)/.test(t)) {
        const limit = GOAL_LIMITS.time;
        if (amount < limit.min || amount > limit.max)
          return { text: `Votre temps disponible va de ${limit.min} à ${limit.max} h par semaine dans cette maquette.` };
        return {
          text: `Je peux régler votre temps disponible à ${amount} h par semaine. ${loadText(state)}`,
          proposal: {
            title: `Temps disponible : ${amount} h/semaine`,
            description: "Les missions en cours ne changent pas ; une nouvelle mission sera comparée à ce temps.",
            event: { type: "goal", value: { time: amount } },
            done: `Temps disponible : ${amount} h par semaine.`,
          },
        };
      }
      if (/peu de temps|deborde|occupe|surcharge|pas le temps/.test(t))
        return strategyProposal(state, "proof", "time", "Si votre temps est la contrainte principale, je commencerais par une réalisation. Camille prépare, vous relisez, puis nous décidons de la diffusion. Les agences restent une piste, mais demandent plus de suivi.");
      return {
        text: loadText(state),
        links: [routeLink("Voir les missions", "missions")],
      };
    },
  },
  {
    id: "capacity",
    test: (t) => /capacite|projets? clients?|absorber|trop de demandes|trop de clients/.test(t),
    reply: (t, message, ctx, state) => ({
      text: `Vous pouvez prendre ${state.goal.capacity} projets clients supplémentaires sur 30 jours. Chaque mission indique ce qu'elle peut amener si tout réussit (agences 1, réalisations 1, prospects 2). ${loadText(state)}\n\nSi la somme dépasse votre capacité, je vous le dis avant le lancement, et c'est à vous de décider.`,
    }),
  },
  {
    id: "risk",
    test: (t) => /risque|legal|rgpd|consent|droit|opposition|securit|donnees|licence|responsab/.test(t),
    reply: (t, message, ctx, state) => {
      const mission = missionFrom(t, ctx, state) || state.priority;
      const def = missionDefinitions[mission];
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
        text: reports.map(([id, r]) => `${missionDefinitions[id].short} : ${r.leads} demandes, ${r.meetings} rendez-vous (recherché : ${missionDefinitions[id].target.toLowerCase()}).`).join("\n") + "\n\nCes chiffres sont déclaratifs : avant d'élargir, vérifions leur origine.",
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
      text: "Trois chemins, trois compromis :\n\n1. Agences : un nouveau canal, mais des contacts à qualifier. Test limité à 2 agences.\n2. Réalisations : peu de temps de suivi, mais un effet commercial indirect. Une seule publication d'abord.\n3. Anciens prospects : potentiellement rapide, mais la liste et le droit de recontact sont à vérifier.\n\nJe ne changerais pas votre priorité sans choisir ensemble le compromis qui vous convient.",
    }),
  },
  {
    id: "realism",
    test: (t, ctx) => ctx.kind === "ambition" && /realiste|ambitieux|trop|atteignable|objectif|plafond/.test(t),
    reply: (t, message, ctx, state) => ({
      text: state.goal.growth > 20
        ? `+${state.goal.growth} % en ${state.goal.months} mois dépasse les repères usuels (5 à 20 %) : cela suppose plus de projets que vos ${state.goal.capacity} possibles. Je vous conseillerais de viser plus bas ou de revoir votre capacité.`
        : `+${state.goal.growth} % en ${state.goal.months} mois reste dans les repères usuels (5 à 20 %). C'est une cible, pas une promesse : nous la confronterons à vos résultats réels.`,
    }),
  },
  {
    id: "summary",
    test: (t) => /retenir|resume|synthese|explique|pourquoi|comment ca marche/.test(t),
    reply: (t, message, ctx, state) => {
      if (ctx.kind === "mission") return { text: `${missionDefinitions[ctx.id].rationale}\n\nPreuve : ${missionDefinitions[ctx.id].evidence}. Niveau de certitude : ${missionDefinitions[ctx.id].certainty[0].toLowerCase()}.`, links: [routeLink("Voir les constats", "entreprise/audit")] };
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
  const ideaFirst = ctx.kind === "idea" && words >= 4 && !/budget|cout|temps|risque|resultat|bilan/.test(t);
  if (ideaFirst) {
    const mission = /agence|partenar/.test(t) ? "agencies" : /realisation|photo|visuel|facebook|preuve/.test(t) ? "proof" : /prospect|ancien|contact|reactiv/.test(t) ? "leads" : null;
    return {
      text: mission
        ? `Votre idée rejoint la mission « ${missionDefinitions[mission].short} ». Je peux la noter pour la cadrer avec vous, ou ouvrir directement cette mission.`
        : "Cette idée ne correspond à aucune des trois missions prêtes. Je ne peux pas la lancer telle quelle dans cette maquette : je peux la noter pour la cadrer ensuite (périmètre, temps, risque).",
      proposal: {
        title: "Noter cette idée",
        description: "Elle apparaît dans Missions, sous « Vos idées à cadrer ». Rien n'est lancé.",
        accept: "Noter l'idée",
        event: { type: "idea", text: message },
        done: "Idée notée dans Missions. Nous la cadrerons avant tout lancement.",
      },
      links: mission ? [routeLink("Ouvrir la mission", `missions/${mission}`)] : [],
    };
  }
  const intent = intents.find((item) => item.test(t, ctx, state));
  if (intent) return intent.reply(t, message, ctx, state);
  const step = nextStep(state);
  return {
    text: `Cette question sort de ce que je peux traiter ici : dans cette maquette, je réponds sur le budget, le temps, les risques, les missions, les canaux et les résultats.\n\nCe que nous pouvons faire maintenant : ${step.title.toLowerCase()}, ajuster une mission, ou regarder les résultats.`,
    links: [...stepLinks(step), routeLink("Ajuster une mission", "missions"), routeLink("Voir les résultats", "resultats")].slice(0, 3),
  };
}
