import { NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { loadStudioState } from "@/lib/proposal-studio";

/** État du Studio d'une production (US #258) : versions, demandes, verrou et révision en cours. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { id } = await params;
  const state = await loadStudioState(company.id, id);
  if (!state) return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  return NextResponse.json(state);
}
