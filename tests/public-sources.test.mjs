import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSocialSources,
  normalizeSocialProfileUrl,
  readSocialSourceDecisions,
  socialCandidatesFromLinks
} from "../src/lib/onboarding/public-sources.ts";
import { extractLinks, pickInternalPages } from "../src/lib/onboarding/site-reader.ts";

test("public social candidates keep their source and exclude shares, posts, and login pages", () => {
  const source = "https://example.test/contact";
  const readAt = "2026-11-12T10:00:00.000Z";
  const links = [
    "https://www.facebook.com/atelier.lumen",
    "https://www.facebook.com/share/abc",
    "https://www.facebook.com/login",
    "https://www.instagram.com/atelier.lumen/",
    "https://www.instagram.com/p/abc123",
    "https://www.linkedin.com/company/atelier-lumen/"
  ].map((value) => ({ url: new URL(value), text: "Profil" }));

  assert.deepEqual(
    socialCandidatesFromLinks(links, source, readAt),
    [
      { platform: "facebook", url: "https://www.facebook.com/atelier.lumen", source, readAt },
      { platform: "instagram", url: "https://instagram.com/atelier.lumen", source, readAt },
      { platform: "linkedin", url: "https://linkedin.com/company/atelier-lumen", source, readAt }
    ]
  );
});

test("social confirmation is explicit, editable, and restricted to a public profile URL", () => {
  const source = "https://example.test/contact";
  const candidates = socialCandidatesFromLinks([
    { url: new URL("https://www.facebook.com/atelier.lumen"), text: "Facebook" },
    { url: new URL("https://www.instagram.com/atelier.lumen"), text: "Instagram" }
  ], source, "2026-11-12T10:00:00.000Z");
  const submitted = [
    {
      candidateUrl: candidates[0].url,
      confirmedUrl: "https://www.facebook.com/atelier.lumen.officiel",
      status: "confirmed"
    },
    {
      candidateUrl: candidates[1].url,
      confirmedUrl: null,
      status: "rejected"
    }
  ];

  const decisions = decideSocialSources(candidates, submitted);
  assert.equal(decisions?.[0].confirmedUrl, "https://www.facebook.com/atelier.lumen.officiel");
  assert.equal(decisions?.[0].source, source);
  assert.equal(decisions?.[1].status, "rejected");
  assert.equal(decideSocialSources(candidates, submitted.slice(0, 1)), null);
  assert.equal(normalizeSocialProfileUrl("facebook", "https://www.facebook.com/share/abc"), null);
  assert.equal(
    readSocialSourceDecisions(decisions)[0].confirmedUrl,
    "https://www.facebook.com/atelier.lumen.officiel"
  );
});

test("purchase-path page selection stays bounded and spans page types", () => {
  const home = new URL("https://example.test/");
  const html = [
    '<a href="/contact">Contact</a>',
    '<a href="/services">Nos offres</a>',
    '<a href="/tarifs">Tarifs</a>',
    '<a href="/reservation">Réserver</a>',
    '<a href="/realisations">Réalisations</a>',
    '<a href="https://shop.example.test/menu">Menu externe</a>'
  ].join("");
  const selected = pickInternalPages(extractLinks(html, home), home);

  assert.deepEqual(selected.map((url) => url.pathname), [
    "/contact",
    "/services",
    "/tarifs",
    "/reservation"
  ]);
  assert.equal(selected.length, 4);
});
