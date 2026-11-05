import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clearSession, getSessionEmail } from "@/lib/session";
import { passwordPolicyError } from "@/lib/password-policy";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (typeof body.currentPassword !== "string" || body.currentPassword.length > 1024) {
    return NextResponse.json({ error: "Mot de passe actuel invalide" }, { status: 400 });
  }
  const passwordError = passwordPolicyError(body.newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { ownerEmail: email } });
  if (!company?.passwordHash || !(await verifyPassword(body.currentPassword, company.passwordHash))) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
  }

  const updated = await prisma.company.updateMany({
    where: { id: company.id, passwordHash: company.passwordHash, sessionVersion: company.sessionVersion },
    data: {
      passwordHash: await hashPassword(body.newPassword as string),
      sessionVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: "La session a changé. Reconnectez-vous." }, { status: 409 });
  }

  await clearSession();
  return NextResponse.json({ passwordChanged: true, reconnectRequired: true });
}