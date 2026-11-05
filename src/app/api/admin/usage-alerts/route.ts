import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readUsageAlertThresholds, saveUsageAlertThresholds } from "@/lib/usage-alerts";
import { parseUsageAlertInput } from "@/lib/usage-alert-rules";

// Seuils d'alerte de consommation (story 7.3) : réservés aux administrateurs, écriture avec contrôle d'origine.
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const email = await getSessionEmail();
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const parsed = parseUsageAlertInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await saveUsageAlertThresholds(parsed.value, email!);
  return NextResponse.json(await readUsageAlertThresholds());
}
