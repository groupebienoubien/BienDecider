import assert from "node:assert/strict";
import test from "node:test";
import { CERTAINTY_LABELS, CERTAINTY_LEVELS, CERTAINTY_TONES, isCertainty, normalizeCertainty } from "../src/lib/findings/certainty.ts";
import { CORRECTION_BOUNDS, checkCorrection, clearsReview, correctedFields, journalQuote, reviewSuite, versionFields } from "../src/lib/findings/correction.ts";
import { CAPACITY_RECONFIRM_DAYS, capacityLabel, capacityPromptLine, capacityState, checkCapacity } from "../src/lib/capacity.ts";
import { businessTargetLines, computeBusinessTarget } from "../src/lib/business-target.ts";
import { competitorRows, dismissedCompetitorNames } from "../src/lib/findings/competitors.ts";

const current = { title: "Votre site ne montre aucune réalisation.", content: "Vos clients ne voient pas ce que vous savez faire." };
const finding = { ...current, whatWorks: "Un site clair", toImprove: "Montrer des chantiers", actionItems: [{ agent: "contenu", title: "Publier" }], sourceUrl: "https://atelier.test/", sourceStatus: "consultée", certainty: "observe", correctedAt: null };

test("« Déclaré par vous » est une certitude de l'interface, jamais de l'agent", () => {
  assert.deepEqual([...CERTAINTY_LEVELS], ["observe", "piste", "a_verifier"]);
  assert.equal(isCertainty("declare"), true);
  assert.equal(CERTAINTY_LABELS.declare, "Déclaré par vous");
  assert.equal(CERTAINTY_TONES.declare, "gray");
  // Une correction reste déclarée, même sans source ; « Observé » sans source consultée reste ramené à « À vérifier ».
  assert.equal(normalizeCertainty("declare", null, null), "declare");
  assert.equal(normalizeCertainty("observe", null, "https://atelier.test/"), "a_verifier");
});

test("une correction est bornée, sans balise, et doit changer quelque chose", () => {
  assert.deepEqual(checkCorrection({ title: "  Mon site montre   douze chantiers.  ", content: "Les réalisations sont\r\n\r\n\r\ndans l'onglet Chantiers." }, current), {
    ok: true, value: { title: "Mon site montre douze chantiers.", content: "Les réalisations sont\n\ndans l'onglet Chantiers." },
  });
  assert.deepEqual(checkCorrection({ title: "Site", content: current.content }, current), { ok: false, code: "M-99", field: "title" });
  assert.deepEqual(checkCorrection({ title: "a".repeat(CORRECTION_BOUNDS.titleMax + 1), content: current.content }, current), { ok: false, code: "M-99", field: "title" });
  assert.deepEqual(checkCorrection({ title: "Mon site est complet", content: "court" }, current), { ok: false, code: "M-99", field: "content" });
  assert.deepEqual(checkCorrection({ title: "Mon site est complet", content: "<script>alert(1)</script> chantiers" }, current), { ok: false, code: "M-99", field: "content" });
  assert.deepEqual(checkCorrection({ title: 12, content: current.content }, current), { ok: false, code: "M-99", field: "title" });
  assert.deepEqual(checkCorrection(null, current), { ok: false, code: "M-99", field: "title" });
  // Renvoyé à l'identique (aux espaces près) : rien n'est corrigé.
  assert.deepEqual(checkCorrection({ title: ` ${current.title} `, content: `${current.content}  ` }, current), { ok: false, code: "M-98" });
});

test("le constat corrigé est déclaré et sans source ; la version archivée garde tout, et y revenir retire le signal seulement pour Paul", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  assert.deepEqual(correctedFields({ title: "Mon site montre douze chantiers.", content: "Dans l'onglet Chantiers." }, now), {
    title: "Mon site montre douze chantiers.", content: "Dans l'onglet Chantiers.", whatWorks: null, toImprove: null, actionItems: null, sourceUrl: null, sourceStatus: null, certainty: "declare", correctedAt: now,
  });
  assert.deepEqual(versionFields({ ...finding, extra: "ignoré" }), finding);
  assert.equal(clearsReview(finding), true);
  assert.equal(clearsReview({ certainty: "declare" }), false);
});

test("J-34 dit combien de missions sont à réexaminer, et cite le constat sur une ligne", () => {
  assert.equal(reviewSuite(0), "Aucune mission concernée.");
  assert.equal(reviewSuite(1), "1 mission à réexaminer, rien n'est relancé.");
  assert.equal(reviewSuite(3), "3 missions à réexaminer, rien n'est relancé.");
  assert.equal(journalQuote("Un constat\nsur deux lignes"), "Un constat sur deux lignes");
  assert.equal(journalQuote("a".repeat(100)).length, 80);
});

test("la capacité disponible : 0 à 99, effaçable, confirmée 30 jours puis à reconfirmer", () => {
  assert.deepEqual(checkCapacity(3), { ok: true, capacity: 3 });
  assert.deepEqual(checkCapacity(" 12 "), { ok: true, capacity: 12 });
  assert.deepEqual(checkCapacity(""), { ok: true, capacity: null });
  assert.deepEqual(checkCapacity(null), { ok: true, capacity: null });
  for (const bad of [-1, 100, 2.5, "3,5", "trois", true, {}]) assert.deepEqual(checkCapacity(bad), { ok: false }, String(bad));
  assert.equal(capacityLabel(0), "Aucun nouveau projet client pour le moment");
  assert.equal(capacityLabel(1), "1 nouveau projet client par mois");
  assert.equal(capacityLabel(4), "4 nouveaux projets clients par mois");

  const confirmedAt = new Date("2026-11-01T10:00:00.000Z");
  const day = 86_400_000;
  assert.deepEqual(capacityState(null, confirmedAt), { status: "missing" });
  assert.deepEqual(capacityState(4, confirmedAt, new Date(confirmedAt.getTime() + 29 * day)), {
    status: "confirmed", capacity: 4, label: "4 nouveaux projets clients par mois", confirmedAt: confirmedAt.toISOString(), reconfirmBy: new Date(confirmedAt.getTime() + CAPACITY_RECONFIRM_DAYS * day).toISOString(),
  });
  assert.equal(capacityState(4, confirmedAt, new Date(confirmedAt.getTime() + 30 * day)).status, "stale");
  assert.equal(capacityState(4, null).status, "stale");
  assert.equal(capacityPromptLine(null, null), "");
  assert.match(capacityPromptLine(2, confirmedAt, new Date(confirmedAt.getTime() + day)), /^Capacité disponible déclarée : 2 nouveaux projets clients par mois \(confirmée il y a moins de 30 jours\)/);
  assert.match(capacityPromptLine(2, confirmedAt, new Date(confirmedAt.getTime() + 40 * day)), /à reconfirmer avec le dirigeant/);
});

test("D8 : sans CA visé, l'écart part de l'ambition ; un CA visé saisi garde la priorité", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  const base = { monthlyRevenue: 10000, revenueTarget: null, averageClientValue: 2000, newClientsPerMonth: null, targetDate: null };
  const ambition = { ambitionTerms: { gainPercent: 15, horizonMonths: 12, mediaBudgetPerMonth: null, recruitment: "unspecified" }, ambitionConfirmedAt: new Date("2026-08-09T10:00:00.000Z") };
  const fromAmbition = computeBusinessTarget({ ...base, ...ambition }, now);
  assert.equal(fromAmbition.basis, "ambition");
  assert.equal(fromAmbition.target, 11500);
  assert.equal(fromAmbition.gap, 1500);
  assert.equal(fromAmbition.gainPercent, 15);
  // Confirmée il y a trois mois : neuf mois restants.
  assert.equal(fromAmbition.monthsRemaining, 9);
  assert.equal(fromAmbition.extraClientsPerYear, 9);
  assert.match(businessTargetLines({ ...base, ...ambition }).replace(/ | /g, " "), /Objectif tiré de l'ambition \(\+15 %\) : 11 500 €\/mois/);

  const declared = computeBusinessTarget({ ...base, ...ambition, revenueTarget: 13000 }, now);
  assert.equal(declared.basis, "declared");
  assert.equal(declared.target, 13000);
  assert.equal(declared.gainPercent, null);
  // Sans CA actuel, ou sans gain dans l'ambition : aucun écart.
  assert.equal(computeBusinessTarget({ ...base, monthlyRevenue: null, ...ambition }, now), null);
  assert.equal(computeBusinessTarget({ ...base, ambitionTerms: { ...ambition.ambitionTerms, gainPercent: null } }, now), null);
  assert.equal(computeBusinessTarget({ ...base, ambitionTerms: "illisible" }, now), null);
});

test("concurrence locale : seuls les constats « concurrence » deviennent une ligne, avec son statut (#292)", () => {
  const base = { id: "f1", category: "concurrence", title: "Plomberie Martin", content: "Met en avant la rapidité d'intervention.", whatWorks: "Avis nombreux et récents", toImprove: "Pas de tarifs affichés", sourceUrl: "https://maps.example/martin", sourceStatus: "consultée", certainty: "observe" };
  const other = { id: "f2", category: "site_web", title: "Site sans réalisation", content: "—", whatWorks: null, toImprove: null, sourceUrl: null, sourceStatus: null, certainty: "piste" };
  assert.deepEqual(competitorRows([base, other]), [
    { id: "f1", actor: "Plomberie Martin", angle: "Met en avant la rapidité d'intervention.", shows: "Avis nombreux et récents", hides: "Pas de tarifs affichés", reliability: "Observé", tone: "green", status: "pending" },
  ]);
  const confirmed = competitorRows([{ ...base, competitorConfirmedAt: new Date() }]);
  assert.equal(confirmed[0].status, "confirmed");
  const dismissed = competitorRows([{ ...base, competitorConfirmedAt: new Date(), competitorDismissedAt: new Date() }]);
  // Écarté l'emporte sur confirmé si les deux dates sont posées par erreur.
  assert.equal(dismissed[0].status, "dismissed");
  // Sans whatWorks ni toImprove : repli, jamais une case vide.
  assert.deepEqual(competitorRows([{ ...base, whatWorks: "  ", toImprove: null }])[0], { ...competitorRows([base])[0], shows: "—", hides: "—" });

  assert.deepEqual(dismissedCompetitorNames([{ category: "concurrence", title: "Plomberie Martin", competitorDismissedAt: new Date() }, { category: "concurrence", title: "Plomberie Martin", competitorDismissedAt: new Date() }, { category: "concurrence", title: "Autre Plombier", competitorDismissedAt: null }, { category: "site_web", title: "Ignoré", competitorDismissedAt: new Date() }]), ["Plomberie Martin"]);
});
