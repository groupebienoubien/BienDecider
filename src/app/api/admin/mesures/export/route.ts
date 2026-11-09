import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readActivation, readVisits } from "@/lib/activation";
import { activationCsv, readPeriod } from "@/lib/activation-rules";
import { visitsCsv } from "@/lib/onboarding/visit-trace-rules";
import { channelName, rubricName, stepName, templateLabel } from "@/lib/activation-labels";

export const dynamic = "force-dynamic";

/**
 * Export agrégé des mesures (#296) ou des traces des visites (#311), réservé aux administrateurs : `?vue=visites|activation`,
 * période facultative `du` et `au` (AAAA-MM-JJ). Aucune ligne par entreprise ni par visite ; le seuil d'affichage s'applique.
 */
export async function GET(request: NextRequest) {
  if (!isAdminEmail(await getSessionEmail())) return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const view = params.get("vue");
  if (view !== "visites" && view !== "activation") return NextResponse.json({ error: "Vue inconnue : visites ou activation." }, { status: 400 });
  const period = readPeriod({ du: params.get("du") ?? undefined, au: params.get("au") ?? undefined });
  const periodLabel = `${period.from ?? "début"} → ${period.to ?? "aujourd'hui"}`;
  let csv: string;
  if (view === "visites") {
    csv = visitsCsv(await readVisits(period), { step: stepName, rubric: rubricName, template: templateLabel, period: periodLabel });
  } else {
    const report = await readActivation(period);
    csv = activationCsv(period, report.funnel, report.measures, { template: templateLabel, channel: channelName });
  }
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="biendecider-${view}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
