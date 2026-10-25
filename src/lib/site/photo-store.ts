import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PublishRefusedError } from "@/lib/execution-error";
import {
  SITE_PHOTO_MAX_COUNT,
  SITE_PHOTO_TOO_MANY,
  SITE_PHOTO_UNAVAILABLE,
  checkSitePhoto,
  sitePhotoPathname,
} from "@/lib/site/photos";

/**
 * Photos du site (story 5.5) : stockage public Vercel Blob sous
 * `site-photos/{companyId}/`, métadonnées dans SitePhoto. Le client de
 * stockage est un objet remplaçable : les tests n'appellent jamais Vercel.
 */
export const sitePhotoStorage = {
  isConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  put: async (pathname: string, bytes: Uint8Array, contentType: string) => {
    const result = await put(pathname, Buffer.from(bytes), { access: "public", contentType, addRandomSuffix: false });
    return { url: result.url, pathname: result.pathname };
  },
  del: async (url: string) => {
    await del(url);
  },
};

export type SitePhotoView = { id: string; url: string; alt: string; width: number; height: number };

export function listSitePhotos(companyId: string): Promise<SitePhotoView[]> {
  return prisma.sitePhoto.findMany({
    where: { companyId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, url: true, alt: true, width: true, height: true },
  });
}

function assertStorage() {
  if (!sitePhotoStorage.isConfigured()) throw new PublishRefusedError(SITE_PHOTO_UNAVAILABLE, 503);
}

export async function addSitePhoto(companyId: string, bytes: Uint8Array, alt: string): Promise<SitePhotoView> {
  assertStorage();
  const check = checkSitePhoto(bytes);
  if (!check.ok) throw new PublishRefusedError(check.error, check.status);
  if (await prisma.sitePhoto.count({ where: { companyId } }) >= SITE_PHOTO_MAX_COUNT) {
    throw new PublishRefusedError(SITE_PHOTO_TOO_MANY, 409);
  }

  const id = randomUUID();
  const stored = await sitePhotoStorage.put(sitePhotoPathname(companyId, id, check.type), bytes, check.type.mime);
  try {
    // Deux envois simultanés ne dépassent pas la limite : recompte dans une transaction sérialisable.
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.sitePhoto.findMany({ where: { companyId }, select: { position: true } });
      if (existing.length >= SITE_PHOTO_MAX_COUNT) throw new PublishRefusedError(SITE_PHOTO_TOO_MANY, 409);
      const position = existing.reduce((max, photo) => Math.max(max, photo.position), -1) + 1;
      return tx.sitePhoto.create({
        data: { companyId, url: stored.url, pathname: stored.pathname, alt, width: check.width, height: check.height, position },
        select: { id: true, url: true, alt: true, width: true, height: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await sitePhotoStorage.del(stored.url).catch(() => undefined);
    const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
    throw conflict ? new PublishRefusedError("Un autre envoi est en cours. Réessayez dans un instant.", 409) : error;
  }
}

async function ownedPhoto(companyId: string, id: string) {
  const photo = await prisma.sitePhoto.findUnique({ where: { id } });
  if (!photo || photo.companyId !== companyId) throw new PublishRefusedError("Photo introuvable.", 404);
  return photo;
}

/** Retrait : le fichier puis la ligne. Une photo d'une autre entreprise est introuvable. */
export async function removeSitePhoto(companyId: string, id: string): Promise<void> {
  assertStorage();
  const photo = await ownedPhoto(companyId, id);
  // La ligne d'abord : une erreur du stockage ne laisse jamais une photo affichée vers un fichier absent.
  await prisma.sitePhoto.deleteMany({ where: { id: photo.id, companyId } });
  await sitePhotoStorage.del(photo.url).catch((error) => console.error("Fichier de photo du site non supprimé:", photo.pathname, error));
}

/**
 * Suppression du compte : les fichiers publics des photos sont supprimés avant l'entreprise
 * (meilleur effort, erreurs journalisées) ; les lignes partent avec l'entreprise.
 */
export async function deleteCompanySitePhotoFiles(companyId: string): Promise<void> {
  const photos = await prisma.sitePhoto.findMany({ where: { companyId }, select: { url: true, pathname: true } });
  if (photos.length === 0) return;
  if (!sitePhotoStorage.isConfigured()) {
    console.error("Fichiers de photos du site non supprimés : stockage non configuré.", photos.map((photo) => photo.pathname));
    return;
  }
  for (const photo of photos) {
    await sitePhotoStorage.del(photo.url).catch((error) => console.error("Fichier de photo du site non supprimé:", photo.pathname, error));
  }
}

export async function updateSitePhotoAlt(companyId: string, id: string, alt: string): Promise<SitePhotoView> {
  const photo = await ownedPhoto(companyId, id);
  return prisma.sitePhoto.update({
    where: { id: photo.id },
    data: { alt },
    select: { id: true, url: true, alt: true, width: true, height: true },
  });
}
