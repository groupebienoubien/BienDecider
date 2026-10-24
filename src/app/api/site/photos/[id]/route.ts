import { NextRequest, NextResponse } from "next/server";
import { PublishRefusedError } from "@/lib/execution-error";
import { readJsonObject } from "@/lib/request-body";
import { getSessionCompany } from "@/lib/session";
import { removeSitePhoto, updateSitePhotoAlt } from "@/lib/site/photo-store";
import { SITE_PHOTO_ALT_MAX, cleanSitePhotoAlt } from "@/lib/site/photos";

type Context = { params: Promise<{ id: string }> };

function refused(error: unknown, fallback: string) {
  if (error instanceof PublishRefusedError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 502 });
}

/** Retrait d'une photo du site (story 5.5) : le fichier et la ligne ; une photo d'une autre entreprise est introuvable. */
export async function DELETE(request: NextRequest, { params }: Context) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  try {
    await removeSitePhoto(company.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error, "La photo n’a pas pu être retirée. Réessayez.");
  }
}

/** Texte alternatif d'une photo : ce que lit un lecteur d'écran ou un moteur de recherche. */
export async function PATCH(request: NextRequest, { params }: Context) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await readJsonObject(request);
  const alt = cleanSitePhotoAlt(body?.alt);
  if (alt === null) return NextResponse.json({ error: `Description de ${SITE_PHOTO_ALT_MAX} caractères au plus.` }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json({ photo: await updateSitePhotoAlt(company.id, id, alt) });
  } catch (error) {
    return refused(error, "La description n’a pas pu être enregistrée. Réessayez.");
  }
}
