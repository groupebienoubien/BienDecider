import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { isExplicitAdminEmail } from "@/lib/admin";
import { readSignupControl, saveSignupControl, todaySignupCount } from "@/lib/signup-control";
import { parseSignupControlInput } from "@/lib/signup-rules";

// Réglage global : seuls les administrateurs listés dans ADMIN_EMAILS, jamais l'ouverture historique de l'administration.
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const email = await getSessionEmail();
  if (!isExplicitAdminEmail(email)) return NextResponse.json({ error: "Accès administrateur explicite requis." }, { status: 403 });
  const parsed = parseSignupControlInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await saveSignupControl(parsed.value, email!);
  const [control, todayCount] = await Promise.all([readSignupControl(), todaySignupCount()]);
  return NextResponse.json({ open: control.open, dailyCap: control.dailyCap, todayCount, updatedBy: control.updatedBy, updatedAt: control.updatedAt });
}
