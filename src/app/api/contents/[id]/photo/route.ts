import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { MissionError } from "@/lib/missions/messages";
import { PublishRefusedError } from "@/lib/execution-error";
import { ContentNotFoundError, importVisualPhoto } from "@/lib/contents/service";
import { VISUAL_PHOTO_ALT_REQUIRED, VISUAL_PHOTO_MAX_BYTES, VISUAL_PHOTO_TOO_LARGE, checkVisualPhoto, cleanVisualPhotoAlt } from "@/lib/brand/photo";

export const maxDuration = 30;

/**
 * Importer une photo dans le visuel d'un contenu (#291) : POST multipart `file`, `alt`, `number` (la version vue).
 * Les contrôles du fichier (taille, type réel, en-tête image) passent avant le stockage ; une version obsolète est refusée (409).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour ajouter une photo." }, { status: 401 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > VISUAL_PHOTO_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: VISUAL_PHOTO_TOO_LARGE }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const number = Number(form?.get("number"));
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choisissez une photo à envoyer." }, { status: 400 });
  if (!Number.isInteger(number) || number < 1) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const alt = cleanVisualPhotoAlt(form?.get("alt"));
  if (alt === null) return NextResponse.json({ error: VISUAL_PHOTO_ALT_REQUIRED }, { status: 400 });
  if (file.size > VISUAL_PHOTO_MAX_BYTES) return NextResponse.json({ error: VISUAL_PHOTO_TOO_LARGE }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkVisualPhoto(bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { id } = await params;
  try {
    return NextResponse.json(await importVisualPhoto(company.id, id, number, bytes, check, alt), { status: 201 });
  } catch (error) {
    if (error instanceof ContentNotFoundError) return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof PublishRefusedError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur envoi photo du visuel:", error);
    return NextResponse.json({ error: "La photo n’a pas pu être enregistrée. Réessayez." }, { status: 502 });
  }
}
