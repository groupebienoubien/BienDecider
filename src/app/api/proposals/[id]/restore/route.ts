import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { restoreProposalVersion } from "@/lib/proposal-studio";

/** Retour à une version précédente (US #258) : son contenu devient une nouvelle version, rien n'est supprimé. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = await readJsonObject(request);
  const version = body?.version;
  const expectedVersion = body?.expectedVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version à reprendre et la version attendue sont obligatoires." }, { status: 400 });
  }

  const { id } = await params;
  const result = await restoreProposalVersion(company.id, id, version, expectedVersion);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ version: result.version });
}
