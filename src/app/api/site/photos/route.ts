import { NextRequest, NextResponse } from "next/server";
import { PublishRefusedError } from "@/lib/execution-error";
import { getSessionCompany } from "@/lib/session";
import { addSitePhoto, listSitePhotos, sitePhotoStorage } from "@/lib/site/photo-store";
import { SITE_PHOTO_ALT_MAX, SITE_PHOTO_MAX_BYTES, SITE_PHOTO_TOO_LARGE, SITE_PHOTO_UNAVAILABLE, cleanSitePhotoAlt } from "@/lib/site/photos";

/** Photos du site (story 5.5) : liste, et ajout d'une photo déjà redimensionnée par le navigateur. */
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  return NextResponse.json({ photos: await listSitePhotos(company.id), available: sitePhotoStorage.isConfigured() });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!sitePhotoStorage.isConfigured()) return NextResponse.json({ error: SITE_PHOTO_UNAVAILABLE }, { status: 503 });

  // Refus avant lecture du corps quand la taille annoncée dépasse déjà la limite (marge pour l'enveloppe multipart).
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > SITE_PHOTO_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: SITE_PHOTO_TOO_LARGE }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choisissez une photo à envoyer." }, { status: 400 });
  const alt = cleanSitePhotoAlt(form?.get("alt") ?? "");
  if (alt === null) return NextResponse.json({ error: `Description de ${SITE_PHOTO_ALT_MAX} caractères au plus.` }, { status: 400 });
  if (file.size > SITE_PHOTO_MAX_BYTES) return NextResponse.json({ error: SITE_PHOTO_TOO_LARGE }, { status: 413 });

  try {
    const photo = await addSitePhoto(company.id, new Uint8Array(await file.arrayBuffer()), alt);
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    if (error instanceof PublishRefusedError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur envoi photo du site:", error);
    return NextResponse.json({ error: "La photo n’a pas pu être enregistrée. Réessayez." }, { status: 502 });
  }
}
