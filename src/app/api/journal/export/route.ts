import { NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { journalCsv, listJournal } from "@/lib/journal";

export const dynamic = "force-dynamic";

// Export du journal des décisions (#41, FR-50) : toutes les entrées de l'entreprise de la session, et seulement elles.
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour exporter votre journal." }, { status: 401 });
  const csv = journalCsv(await listJournal(company.id));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="journal-biendecider.csv"',
      "Cache-Control": "no-store",
    },
  });
}
