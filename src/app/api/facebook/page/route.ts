import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { channelJournalParams, writeJournal } from "@/lib/journal";
import { decryptFacebookAccount, encryptFacebookAccount, verifyFacebookPage } from "@/lib/oauth/meta";

/**
 * Choix explicite de la Page Facebook à connecter, après l'autorisation.
 * La Page est vérifiée auprès de Meta avant d'être déclarée connectée ;
 * les jetons des Pages non retenues sont alors effacés.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const pageId = typeof body?.pageId === "string" ? body.pageId : "";
  if (!pageId || pageId.length > 64) return NextResponse.json({ error: "Choisissez une Page." }, { status: 400 });

  const where = { companyId: company.id, channel: "facebook", status: "selection_requise", expiresAt: { gt: new Date() } };
  const pending = await prisma.channelConnection.findFirst({ where });
  if (!pending?.accessToken) return NextResponse.json({ error: "Aucune autorisation Facebook en attente. Recommencez l'autorisation." }, { status: 409 });
  let account;
  try {
    account = decryptFacebookAccount(pending.accessToken, company.id);
  } catch {
    return NextResponse.json({ error: "Autorisation Facebook illisible. Recommencez l'autorisation." }, { status: 409 });
  }
  const page = account.pages.find((candidate) => candidate.id === pageId);
  if (!page) return NextResponse.json({ error: "Cette Page ne fait pas partie de celles que vous avez partagées." }, { status: 400 });
  if (!page.canPublish) return NextResponse.json({ error: "Votre rôle sur cette Page ne permet pas d'y créer du contenu." }, { status: 400 });

  const verified = await verifyFacebookPage(page);
  if (!verified) return NextResponse.json({ error: "Facebook n'a pas confirmé l'accès à cette Page. Réessayez ou recommencez l'autorisation." }, { status: 502 });

  const accessToken = encryptFacebookAccount({ ...account, pages: [{ ...page, name: verified.name }], selectedPageId: page.id }, company.id);
  // Condition sur l'état en attente : deux choix simultanés ne peuvent pas s'écraser.
  // La connexion et sa trace (J-07) existent ensemble, ou aucune.
  const updated = await prisma.$transaction(async (tx) => {
    const written = await tx.channelConnection.updateMany({
      where: { ...where, id: pending.id, accessToken: pending.accessToken },
      data: { status: "connecte", accessToken, expiresAt: null },
    });
    if (written.count === 1) await writeJournal(tx, { companyId: company.id, code: "J-07", params: channelJournalParams("facebook") });
    return written;
  });
  if (updated.count !== 1) return NextResponse.json({ error: "Cette autorisation a déjà été traitée. Rechargez la page." }, { status: 409 });
  return NextResponse.json({ connected: true, pageName: verified.name });
}
