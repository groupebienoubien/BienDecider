import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { omitPasswordHash } from "@/lib/safe-company";
import { z } from "zod";
import { readJsonObject } from "@/lib/request-body";
import { startOnboardingAudit } from "@/lib/agents/onboarding-audit";
import { AgentRunConflictError, AgentRunQuotaError } from "@/lib/agents/agent-errors";
import { PROFILE_TEXT_LIMITS, clearableText, cleanProfileText, profileTextIssue, type ProfileTextField } from "@/lib/company-profile";

// Les montants sont des entiers 32 bits en base : au-delà, la requête échouerait en erreur serveur.
const MAX_AMOUNT = 1_000_000_000;
const profileDetailsSchema = z.object({
  objective: z.string().trim().max(PROFILE_TEXT_LIMITS.objective).optional(),
  website: z.string().trim().max(PROFILE_TEXT_LIMITS.website).optional(),
  socialHandles: z.string().trim().max(PROFILE_TEXT_LIMITS.socialHandles).optional(),
  description: z.string().trim().max(PROFILE_TEXT_LIMITS.description).optional(),
  phone: z.string().trim().max(PROFILE_TEXT_LIMITS.phone).optional(),
  certifications: z.string().trim().max(PROFILE_TEXT_LIMITS.certifications).optional(),
  openingHours: z.string().trim().max(PROFILE_TEXT_LIMITS.openingHours).optional(),
  ownerName: z.string().trim().max(PROFILE_TEXT_LIMITS.ownerName).optional(),
}).strict();

export async function PATCH(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  const parsed = profileDetailsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Compléments de profil invalides" }, { status: 400 });
  const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, cleanProfileText(key as ProfileTextField, value) ?? null]));
  const updated = await prisma.company.update({ where: { id: company.id }, data });
  return NextResponse.json(omitPasswordHash(updated));
}

export async function GET() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  return NextResponse.json(company ? omitPasswordHash(company) : null);
}

export async function POST(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const {
    name: rawName,
    trade: rawTrade,
    servingArea: rawServingArea,
    website,
    socialHandles,
    objective,
    description,
    phone,
    certifications,
    openingHours,
    ownerName,
    monthlyRevenue,
    revenueTarget,
    targetDate,
    averageClientValue,
    newClientsPerMonth,
  } = body;

  const required = { name: [rawName, 160], trade: [rawTrade, 160], servingArea: [rawServingArea, 240] } as const;
  for (const [key, [value, max]] of Object.entries(required)) {
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: "name, trade et servingArea sont requis" }, { status: 400 });
    }
    if (value.length > max) return NextResponse.json({ error: `${key} est limité à ${max} caractères` }, { status: 400 });
  }
  const name = (rawName as string).trim();
  const trade = (rawTrade as string).trim();
  const servingArea = (rawServingArea as string).trim();

  const amounts = { monthlyRevenue, revenueTarget, averageClientValue };
  for (const [key, value] of Object.entries(amounts)) {
    if (value == null || value === "") continue;
    if ((typeof value !== "number" && typeof value !== "string") || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > MAX_AMOUNT) {
      return NextResponse.json({ error: `${key} doit être un entier positif (${MAX_AMOUNT.toLocaleString("fr-FR")} maximum)` }, { status: 400 });
    }
  }
  // Le rythme de nouveaux clients accepte une décimale (6 par an = 0,5 par mois) ; la virgule française est acceptée.
  const clientsRate = typeof newClientsPerMonth === "string" ? newClientsPerMonth.trim().replace(",", ".") : newClientsPerMonth;
  if (clientsRate != null && clientsRate !== "") {
    const rate = Number(clientsRate);
    if ((typeof clientsRate !== "number" && typeof clientsRate !== "string") || !Number.isFinite(rate) || rate < 0 || rate > MAX_AMOUNT || Math.abs(Math.round(rate * 10) - rate * 10) > 1e-9) {
      return NextResponse.json({ error: `newClientsPerMonth doit être un nombre positif avec une décimale au plus (${MAX_AMOUNT.toLocaleString("fr-FR")} maximum)` }, { status: 400 });
    }
  }
  const optionalTextFields = { website, socialHandles, objective, description, phone, certifications, openingHours, ownerName };
  for (const [key, value] of Object.entries(optionalTextFields) as [keyof typeof optionalTextFields, unknown][]) {
    const issue = profileTextIssue(key, value);
    if (issue === "not_text") return NextResponse.json({ error: `${key} doit être du texte` }, { status: 400 });
    if (issue === "too_long") return NextResponse.json({ error: `${key} est limité à ${PROFILE_TEXT_LIMITS[key]} caractères` }, { status: 400 });
  }
  if (targetDate != null && targetDate !== "" && typeof targetDate !== "string") {
    return NextResponse.json({ error: "targetDate invalide" }, { status: 400 });
  }
  const parsedTargetDate = targetDate ? new Date(targetDate as string) : null;
  if (parsedTargetDate && Number.isNaN(parsedTargetDate.getTime())) {
    return NextResponse.json({ error: "targetDate invalide" }, { status: 400 });
  }
  const toInt = (v: unknown) => (v == null || v === "" ? null : Number(v));

  const data = {
    name,
    trade,
    servingArea,
    website: clearableText(website),
    socialHandles: clearableText(socialHandles),
    objective: clearableText(objective),
    description: clearableText(description),
    phone: clearableText(phone),
    certifications: clearableText(certifications),
    openingHours: clearableText(openingHours),
    ownerName: cleanProfileText("ownerName", ownerName),
    monthlyRevenue: toInt(monthlyRevenue),
    revenueTarget: toInt(revenueTarget),
    targetDate: parsedTargetDate,
    averageClientValue: toInt(averageClientValue),
    newClientsPerMonth: toInt(clientsRate),
  };

  // L'inscription crée la ligne sans profil (nom vide) : la première création du profil est ce passage-là.
  const existing = await prisma.company.findUnique({ where: { ownerEmail }, select: { name: true } });
  const isFirstCreation = !existing?.name;
  const company = await prisma.company.upsert({
    where: { ownerEmail },
    create: { ownerEmail, ...data },
    update: data,
  });
  if (isFirstCreation) {
    // Un lancement refusé (quota, budget, conflit) ne bloque pas l'onboarding : l'action reste « à lancer ».
    try {
      await startOnboardingAudit(company.id);
    } catch (error) {
      if (error instanceof AgentRunQuotaError || error instanceof AgentRunConflictError) {
        console.error(`Premier audit refusé au lancement (${error.reason ?? "conflit"}) : ${error.message}`);
      } else {
        console.error("Erreur inattendue à la création du premier audit :", error);
      }
    }
  }
  return NextResponse.json(omitPasswordHash(company), { status: 201 });
}
