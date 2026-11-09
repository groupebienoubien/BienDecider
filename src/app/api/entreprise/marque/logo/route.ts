import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { MissionError } from "@/lib/missions/messages";
import { PublishRefusedError } from "@/lib/execution-error";
import { checkSitePhoto } from "@/lib/site/photos";
import { BRAND_LOGO_MAX_BYTES, BRAND_LOGO_TOO_LARGE } from "@/lib/brand/rules";
import { setBrandLogo } from "@/lib/brand/service";

export const maxDuration = 30;

function guard(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  return null;
}

async function apply(companyId: string, upload: Parameters<typeof setBrandLogo>[1]) {
  try {
    const logo = await setBrandLogo(companyId, upload);
    return NextResponse.json({ logo }, { status: upload ? 201 : 200 });
  } catch (error) {
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof PublishRefusedError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur logo de la marque:", error);
    return NextResponse.json({ error: "Le logo n’a pas pu être enregistré. Réessayez." }, { status: 502 });
  }
}

/**
 * Logo de la marque (#290) : POST multipart `file` pour ajouter ou remplacer, DELETE pour retirer.
 * Le fichier est contrôlé avant tout stockage : 500 Ko au plus, PNG, JPEG ou WebP d'après son contenu, en-tête image lisible.
 */
export async function POST(request: NextRequest) {
  const refused = guard(request);
  if (refused) return refused;
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > BRAND_LOGO_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: BRAND_LOGO_TOO_LARGE }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choisissez un logo à envoyer." }, { status: 400 });
  if (file.size > BRAND_LOGO_MAX_BYTES) return NextResponse.json({ error: BRAND_LOGO_TOO_LARGE }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > BRAND_LOGO_MAX_BYTES) return NextResponse.json({ error: BRAND_LOGO_TOO_LARGE }, { status: 413 });
  const check = checkSitePhoto(bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  return apply(company.id, { bytes, check });
}

export async function DELETE(request: NextRequest) {
  const refused = guard(request);
  if (refused) return refused;
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  return apply(company.id, null);
}
