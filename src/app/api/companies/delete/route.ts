import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany, clearSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { MAX_ATTEMPTS, recordFailedAttempt } from "@/lib/auth-throttle";
import { revokeCompanyAuthorizations } from "@/lib/account-deletion";
import { readJsonObject } from "@/lib/request-body";
import { deleteCompanySitePhotoFiles } from "@/lib/site/photo-store";

/**
 * Droit à l'effacement : supprime l'entreprise, ce qui efface en cascade toutes ses données
 * liées (cf. onDelete: Cascade dans prisma/schema.prisma), y compris les jetons chiffrés.
 * Exige le mot de passe (un cookie volé ne suffit pas) et la confirmation explicite.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const body = await readJsonObject(request);
  if (body?.confirmed !== true) return NextResponse.json({ error: "Confirmez la suppression définitive de votre compte." }, { status: 400 });
  if (company.passwordHash) {
    if (typeof body.password !== "string" || !body.password || body.password.length > 1024) {
      return NextResponse.json({ error: "Saisissez votre mot de passe pour confirmer." }, { status: 400 });
    }
    if (company.lockedUntil && company.lockedUntil > new Date()) {
      return NextResponse.json({ error: "Trop de tentatives échouées. Réessayez dans quelques minutes." }, { status: 429 });
    }
    if (!(await verifyPassword(body.password, company.passwordHash))) {
      const attempts = await recordFailedAttempt(company.id);
      return NextResponse.json({ error: "Mot de passe incorrect." }, { status: attempts >= MAX_ATTEMPTS ? 429 : 401 });
    }
  }

  const activeRuns = await prisma.agentRun.count({ where: { companyId: company.id, status: { in: ["queued", "running"] } } });
  if (activeRuns > 0) {
    return NextResponse.json({ error: "Un agent travaille encore pour vous. Réessayez quand son travail est terminé." }, { status: 409 });
  }

  const revocations = await revokeCompanyAuthorizations(company.id);
  await deleteCompanySitePhotoFiles(company.id);
  await prisma.company.delete({ where: { id: company.id } });
  await clearSession();
  return NextResponse.json({ deleted: true, revocations });
}
