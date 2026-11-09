import { NextRequest, NextResponse, after } from "next/server";
import { getSessionEmail, setSessionEmail } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { readJsonObject } from "@/lib/request-body";
import { readSignupControl, releaseSignupSlot, reserveSignupSlot, todaySignupCount } from "@/lib/signup-control";
import { sendVerificationEmail } from "@/lib/email-verification";
import { passwordPolicyError } from "@/lib/password-policy";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE, secondsUntilNextSignupDay, signupAvailability } from "@/lib/signup-rules";
import { ADDRESS_UNAVAILABLE_MESSAGE, ONBOARDING_MESSAGES, RECOVER_ACCOUNT_HREF, checkDraftForAccount, confirmedOrigin, isValidEmail, starterPlan, stepHref, synthesisUsage } from "@/lib/onboarding/draft-rules";
import { cleanOwnerName, type ProfileOrigins } from "@/lib/company-profile";
import { clearDraftCookie, loadDraft } from "@/lib/onboarding/draft";
import { brandProposalFromAnalysis } from "@/lib/brand/rules";
import { analysisUsage, firstFindingRecords } from "@/lib/onboarding/analysis-rules";
import { createMissionIn } from "@/lib/missions/service";
import { writeJournal } from "@/lib/journal";
import { ensureCreditGrant } from "@/lib/credits";
import { startOnboardingAudit } from "@/lib/agents/onboarding-audit";
import { AgentRunConflictError, AgentRunQuotaError } from "@/lib/agents/agent-errors";
import { findCompanyByOwnerEmail, normalizeOwnerEmail } from "@/lib/owner-email";

function signupFull() {
  return NextResponse.json({ error: SIGNUP_FULL_MESSAGE }, { status: 429, headers: { "Retry-After": String(secondsUntilNextSignupDay(new Date())) } });
}

/** Adresse déjà utilisée : message neutre (FR-9), le brouillon est conservé et aucun compte n'est créé. */
function addressUnavailable() {
  return NextResponse.json({ error: ADDRESS_UNAVAILABLE_MESSAGE, code: "address_unavailable", recoverHref: RECOVER_ACCOUNT_HREF }, { status: 409 });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * Étape 5 du parcours d'entrée (#279) : le compte est créé en dernier, à partir du brouillon arrivé à l'étape 5
 * avec le diagnostic prêt. Une transaction crée l'entreprise, ses trois missions « À décider » et J-04, puis efface le brouillon.
 */
export async function POST(request: NextRequest) {
  // Une session ouverte ne crée jamais un second compte ni ne bascule de session.
  if (await getSessionEmail()) return NextResponse.json({ error: "Vous êtes déjà connecté.", href: "/strategie" }, { status: 409 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const email = typeof body.email === "string" ? normalizeOwnerEmail(body.email) : "";
  const { password, passwordConfirmation } = body;

  if (!isValidEmail(email)) return NextResponse.json({ error: ONBOARDING_MESSAGES["M-11"], code: "M-11", field: "email" }, { status: 400 });
  const passwordError = passwordPolicyError(password);
  if (passwordError) return NextResponse.json({ error: passwordError, code: "M-12", field: "password" }, { status: 400 });
  if (passwordConfirmation !== password) return NextResponse.json({ error: ONBOARDING_MESSAGES["M-13"], code: "M-13", field: "passwordConfirmation" }, { status: 400 });

  const control = await readSignupControl();
  const availability = signupAvailability(control, await todaySignupCount());
  if (availability === "closed") return NextResponse.json({ error: SIGNUP_CLOSED_MESSAGE }, { status: 403 });
  if (availability === "full") return signupFull();

  const ipAttempt = await consumeIpAttempt(request, "signup");
  if (ipAttempt?.limited) {
    return NextResponse.json(
      { error: "Trop de tentatives d'inscription depuis cette connexion. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipAttempt.retryAfterSeconds) } },
    );
  }

  const draft = await loadDraft();
  if (!draft) return NextResponse.json({ error: ONBOARDING_MESSAGES["M-10"], code: "M-10", step: 1, href: stepHref(1) }, { status: 409 });
  const ready = checkDraftForAccount(draft.state);
  if (!ready.ok) return NextResponse.json({ error: ready.error, code: ready.code, step: ready.step, href: stepHref(ready.step) }, { status: 409 });

  if (await findCompanyByOwnerEmail(email)) return addressUnavailable();

  // Une adresse déjà utilisée ne consomme pas d'emplacement : la réservation vient après ce contrôle.
  const slotDay = await reserveSignupSlot(control.dailyCap);
  if (!slotDay) return signupFull();

  const { profile, ambition } = draft.state;
  const passwordHash = await hashPassword(password as string);
  let company;
  try {
    company = await prisma.$transaction(async (tx) => {
      // Le brouillon est effacé dans la transaction : deux envois simultanés ne créent qu'un compte.
      const claimed = await tx.onboardingDraft.deleteMany({ where: { id: draft.id, step: 5, diagnosticReady: true, profileConfirmed: true } });
      if (claimed.count === 0) return null;
      const now = new Date();
      const created = await tx.company.create({
        data: {
          ownerEmail: email,
          passwordHash,
          name: profile.companyName,
          trade: profile.trade,
          servingArea: profile.servingArea,
          website: profile.website || null,
          // Normalisé comme sur Entreprise (#169) : renvoyer le formulaire tel quel n'est pas une correction.
          firstName: cleanOwnerName(profile.firstName),
          ownerName: cleanOwnerName(profile.firstName),
          location: profile.location,
          targetClients: profile.targetClients,
          offers: profile.offers,
          profileConfirmedAt: now,
          // Origine de chaque information confirmée (#169) : l'étape 1 est saisie par le dirigeant ; l'étape 2 garde celle de l'analyse si la valeur est restée telle quelle.
          profileOrigins: {
            firstName: profile.firstName ? "declared" : "missing",
            name: profile.companyName ? "declared" : "missing",
            location: profile.location ? "declared" : "missing",
            trade: confirmedOrigin(draft.state, "trade"),
            servingArea: confirmedOrigin(draft.state, "servingArea"),
            targetClients: confirmedOrigin(draft.state, "targetClients"),
            offers: confirmedOrigin(draft.state, "offers"),
          } satisfies ProfileOrigins,
          // Palette lue sur le site : proposée, jamais confirmée (#290) ; le dirigeant confirme sa marque dans Entreprise.
          brandProposal: brandProposalFromAnalysis(draft.state.analysis) ?? undefined,
          ambitionText: ambition?.text ?? null,
          ambitionTerms: ambition ? { ...ambition.terms } : undefined,
          ambitionConfirmedAt: ambition ? now : null,
          // « Votre cap » de la navigation lit l'objectif déclaré.
          objective: ambition?.text ?? null,
          // Seule l'inscription crée un compte non confirmé (le défaut de la colonne confirme les autres) ; le lien part après la réponse.
          emailVerifiedAt: null,
          loginCount: 1,
          lastLoginAt: now,
        },
      });
      await ensureCreditGrant(tx, created.id);
      // Premiers constats de l'analyse anonyme (#292) : ils forment le diagnostic de départ, jusqu'au premier audit terminé.
      const constats = firstFindingRecords(draft.state.analysis);
      if (constats.length) await tx.auditFinding.createMany({ data: constats.map((constat) => ({ companyId: created.id, ...constat })) });
      // Le coût de l'analyse anonyme revient au compte, une seule fois : le brouillon vient d'être effacé dans cette transaction.
      const usage = analysisUsage(draft.state.analysis);
      if (usage) await tx.usageEvent.create({ data: { companyId: created.id, ...usage } });
      // « Ce que nous retenons » rédigé par le modèle avant compte (#284) : son coût revient aussi au compte.
      const synthesis = synthesisUsage(ambition);
      if (synthesis) await tx.usageEvent.create({ data: { companyId: created.id, ...synthesis } });
      await writeJournal(tx, { companyId: created.id, code: "J-04", params: {}, actor: "owner" });
      // Les missions de l'étape 4, dans le même ordre, « À décider » ; la première devient la priorité, sans J-08 ni lancement (#284).
      let priorityMissionId: string | null = null;
      for (const starter of starterPlan(draft.state).missions) {
        const { template, channel, title, outcome, finding, scope, stopRuleDays, deduction, responsibleAgent, risk } = starter;
        const mission = await createMissionIn(tx, created.id, { template, channel, title, outcome, finding, scope, stopRuleDays }, "paul", undefined, { deduction, responsibleAgent, risk });
        priorityMissionId ??= mission.id;
      }
      if (priorityMissionId) await tx.company.update({ where: { id: created.id }, data: { priorityMissionId } });
      return created;
    }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    await releaseSignupSlot(slotDay);
    if (isUniqueViolation(error)) return addressUnavailable();
    throw error;
  }
  if (!company) {
    await releaseSignupSlot(slotDay);
    return NextResponse.json({ error: ONBOARDING_MESSAGES["M-10"], code: "M-10", step: 1, href: stepHref(1) }, { status: 409 });
  }

  await setSessionEmail(email);
  await clearDraftCookie();

  // Premier audit, au mieux : un refus (quota, adresse à confirmer, conflit) ne bloque pas l'inscription.
  try {
    await startOnboardingAudit(company.id);
  } catch (error) {
    if (error instanceof AgentRunQuotaError || error instanceof AgentRunConflictError) {
      console.error(`Premier audit refusé au lancement (${error.reason ?? "conflit"}) : ${error.message}`);
    } else {
      console.error("Erreur inattendue à la création du premier audit :", error);
    }
  }

  // Le lien part après la réponse : un envoi lent ou impossible ne retarde ni ne fait échouer l'inscription (le bandeau permet de le renvoyer).
  const recipient = { id: company.id, ownerEmail: company.ownerEmail };
  after(async () => {
    try { await sendVerificationEmail(recipient); } catch { console.warn("Lien de confirmation non envoyé après l'inscription."); }
  });

  return NextResponse.json({ hasCompany: true, companyId: company.id, href: "/strategie" }, { status: 201 });
}
