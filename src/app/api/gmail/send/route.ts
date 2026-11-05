import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { buildGmailMessage, decryptGmailAccount, decryptGmailToken, encryptGmailToken, gmailClient, gmailMessageSchema, isGmailConfigured } from "@/lib/oauth/gmail";
import { canExecuteAction } from "@/lib/delegation-risk";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { EMAIL_NOT_VERIFIED_MESSAGE } from "@/lib/agents/agent-errors";
import { prepareOnlyRefusal } from "@/lib/delegation-level";

const inputSchema = gmailMessageSchema.extend({ requestId: z.uuid() });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const prepareOnly = prepareOnlyRefusal(company);
  if (prepareOnly) return NextResponse.json(prepareOnly, { status: 403 });
  if (!company.emailVerifiedAt) return NextResponse.json({ error: EMAIL_NOT_VERIFIED_MESSAGE }, { status: 403 });
  if (!isGmailConfigured()) return NextResponse.json({ error: "Gmail non configuré côté serveur." }, { status: 503 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Destinataire, objet, message et confirmation requis." }, { status: 400 });
  const riskSettings = await getConfiguredRiskLevels();
  if (!canExecuteAction("gmail_email", "accompagner", input.data.confirmed, {}, riskSettings.gmail_email)) return NextResponse.json({ error: "Validation humaine requise pour cet email." }, { status: 403 });
  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "gmail" } } });
  if (connection?.status !== "connecte" || !connection.accessToken || !connection.refreshToken) return NextResponse.json({ error: "Autorisez Gmail avant l'envoi." }, { status: 409 });
  const proposalId = `gmail-${input.data.requestId}`;
  const messageContent = JSON.stringify({ to: input.data.to, text: input.data.text });
  const previous = await prisma.agentProposal.findUnique({ where: { id: proposalId } });
  if (previous) {
    if (previous.companyId === company.id && previous.kind === "gmail_email" && previous.title === input.data.subject && previous.content === messageContent && previous.status === "executee") return NextResponse.json({ sent: true });
    return NextResponse.json({ error: "Envoi déjà traité ou en cours. Vérifiez les messages envoyés dans Gmail avant toute nouvelle tentative." }, { status: 409 });
  }
  try {
    await prisma.agentProposal.create({ data: {
      id: proposalId, companyId: company.id, agent: "contenu", kind: "gmail_email", title: input.data.subject,
      content: messageContent, status: "envoi_en_cours", decidedAt: new Date(),
    } });
  } catch {
    return NextResponse.json({ error: "Envoi déjà engagé ou impossible à enregistrer." }, { status: 409 });
  }
  let dispatched = false;
  try {
    const client = gmailClient();
    const account = decryptGmailAccount(connection.refreshToken, company.id);
    client.setCredentials({
      access_token: decryptGmailToken(connection.accessToken, company.id),
      refresh_token: account.token, expiry_date: connection.expiresAt?.getTime(),
    });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("No token");
    await prisma.channelConnection.update({ where: { id: connection.id }, data: {
      accessToken: encryptGmailToken(token, company.id),
      expiresAt: client.credentials.expiry_date ? new Date(client.credentials.expiry_date) : connection.expiresAt,
    } });
    const raw = await buildGmailMessage(input.data, account.email);
    dispatched = true;
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      dispatched = response.status >= 500;
      if (response.status === 401 || response.status === 403) await prisma.channelConnection.update({ where: { id: connection.id }, data: { status: "erreur" } });
      throw new Error("Gmail send failed");
    }
    await prisma.agentProposal.update({ where: { id: proposalId }, data: {
      status: "executee", executionLog: { create: { result: "succes", detail: "Envoi Gmail confirmé par le fournisseur." } },
    } });
    return NextResponse.json({ sent: true });
  } catch {
    await prisma.agentProposal.update({ where: { id: proposalId }, data: { status: dispatched ? "envoi_incertain" : "rejetee" } }).catch(() => undefined);
    return NextResponse.json({ error: dispatched
      ? "Résultat de l'envoi incertain. Vérifiez les messages envoyés dans Gmail avant de réessayer."
      : "Envoi non effectué. Vérifiez l'API Gmail et réautorisez le compte si nécessaire." }, { status: 502 });
  }
}