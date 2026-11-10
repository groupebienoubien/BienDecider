import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { reexamineMission } from "@/lib/findings/correction-service";

/** « J'ai réexaminé cette mission » (#169) : retire le signal posé par la correction de son constat, et écrit J-36. Rien d'autre ne change. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour réexaminer une mission." }, { status: 401 });
  const { id } = await params;
  const result = await reexamineMission(company.id, id);
  if (!result.ok) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true, changed: result.changed });
}
