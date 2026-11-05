import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";

// Active ou retire l'espace V5.2 d'une entreprise pendant la bascule (addendum §1.7) : réversible, aucune donnée touchée.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  if (!isAdminEmail(await getSessionEmail())) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Indiquez si l'espace V5.2 doit être activé." }, { status: 400 });
  const { id } = await params;
  const updated = await prisma.company.updateMany({ where: { id }, data: { workspaceV52: body.enabled } });
  if (updated.count === 0) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  return NextResponse.json({ enabled: body.enabled });
}
