import { NextResponse } from "next/server";
import { getAuditFindingsView } from "@/lib/audit-findings";
import { getSessionCompany } from "@/lib/session";

export async function GET() {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  // Story 5.1 : dernier audit terminé et audit d'avant, pas l'accumulation de tous les constats.
  return NextResponse.json(await getAuditFindingsView(company.id));
}
