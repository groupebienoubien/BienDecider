import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PublishRefusedError } from "@/lib/execution-error";
import { sitePhotoStorage } from "@/lib/site/photo-store";
import { SITE_PHOTO_UNAVAILABLE, type SitePhotoCheck } from "@/lib/site/photos";
import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { markBrandChanged } from "@/lib/contents/service";
import {
  brandLogoPathname, checkBrandInput, isBrandComposition, readBrandLogo, isBrandTone, normalizeHex, proposeBrand, readBrandOrigins, readBrandProposal, readBrandSnapshot,
  type BrandChecked, type BrandKit, type BrandLogo, type BrandOrigins, type BrandStatus,
} from "@/lib/brand/rules";
import { renderVisual } from "@/lib/brand/render";
import { readVisualPhoto } from "@/lib/brand/photo";

type BrandColumns = { brandPrimary: string | null; brandAccent: string | null; brandTone: string | null; brandOrigins: Prisma.JsonValue | null; brandProposal: Prisma.JsonValue | null; brandConfirmedAt: Date | null; id?: string; brandLogo?: Prisma.JsonValue | null };

export type BrandView = {
  status: BrandStatus;
  kit: BrandKit;
  origins: BrandOrigins;
  /** Faux quand l'identité est proposée sans site : l'interface le dit. */
  fromSite: boolean;
  /** Origine du site, si une palette y a été lue. */
  source: string | null;
  confirmedAt: string | null;
  /** Logo importé par le dirigeant (#290), s'il y en a un. */
  logo: BrandLogo | null;
};

/** La marque telle que l'interface l'affiche : le kit confirmé, sinon la proposition de départ (site ou identité proposée). */
export function brandViewOf(company: BrandColumns): BrandView {
  const proposal = readBrandProposal(company.brandProposal);
  const proposed = proposeBrand(proposal);
  const primary = normalizeHex(company.brandPrimary);
  const accent = normalizeHex(company.brandAccent);
  const logo = company.id ? readBrandLogo(company.brandLogo, company.id) : null;
  if (company.brandConfirmedAt && primary && accent && isBrandTone(company.brandTone)) {
    return { status: "confirmed", kit: { primary, accent, tone: company.brandTone }, origins: readBrandOrigins(company.brandOrigins), fromSite: proposed.fromSite, source: proposal?.source ?? null, confirmedAt: company.brandConfirmedAt.toISOString(), logo };
  }
  return { status: "to_confirm", kit: proposed.kit, origins: proposed.origins, fromSite: proposed.fromSite, source: proposal?.source ?? null, confirmedAt: null, logo };
}

export type ConfirmBrandResult = { ok: true; changed: boolean } | { ok: false; errors: Extract<BrandChecked, { ok: false }>["errors"] };

/**
 * Confirmer la marque (#290), une transaction : contrôle du formulaire, refus s'il existe un visuel programmé (M-94),
 * enregistrement, nouvelle version de chaque visuel à valider à nouveau, puis J-32. Rien n'est écrit si la marque est inchangée.
 */
export async function confirmBrand(companyId: string, body: unknown): Promise<ConfirmBrandResult> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { brandPrimary: true, brandAccent: true, brandTone: true, brandOrigins: true, brandProposal: true, brandConfirmedAt: true } });
  const view = brandViewOf(company);
  const checked = checkBrandInput(body, { kit: view.kit, origins: view.origins });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const { primary, accent, tone, origins } = checked.value;
  const unchanged = view.status === "confirmed" && view.kit.primary === primary && view.kit.accent === accent && view.kit.tone === tone;
  if (unchanged) return { ok: true, changed: false };
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: { brandPrimary: primary, brandAccent: accent, brandTone: tone, brandOrigins: { ...origins }, brandConfirmedAt: new Date() },
    });
    await markBrandChanged(tx, companyId);
    await writeJournal(tx, { companyId, code: "J-32", params: {}, actor: "owner" });
  }, { maxWait: 5000, timeout: 20000 });
  return { ok: true, changed: true };
}

/**
 * Le visuel d'une version (#290) : le même rendu pour l'aperçu de l'atelier et pour la route d'image, d'après l'instantané de marque
 * conservé avec la version. Une version qui n'a pas d'instantané (marque alors non confirmée) n'est montrée, pour la version courante,
 * qu'avec la marque proposée ; une archive sans instantané n'a pas de visuel.
 */
export async function visualOfVersion(companyId: string, contentId: string, number: number): Promise<{ svg: string; preview: boolean } | null> {
  const content = await prisma.missionContent.findFirst({
    where: { id: contentId, companyId },
    select: { visualComposition: true, currentNumber: true, company: { select: { id: true, name: true, brandPrimary: true, brandAccent: true, brandTone: true, brandOrigins: true, brandProposal: true, brandConfirmedAt: true, brandLogo: true } }, versions: { where: { number }, select: { title: true, brandSnapshot: true, photo: true } } },
  });
  const version = content?.versions[0];
  if (!content || !version) return null;
  const snapshot = readBrandSnapshot(version.brandSnapshot);
  // La photo est celle que le dirigeant a importée dans cette version et dont il a confirmé les droits (#291) ; sans photo, illustration neutre.
  const photo = readVisualPhoto(version.photo, companyId);
  if (snapshot) return { svg: renderVisual({ ...snapshot, headline: version.title, signature: snapshot.name, photoUrl: photo?.url ?? null, photoAlt: photo?.alt ?? null }), preview: false };
  // Pas d'instantané : seule la version courante d'un contenu qui a un visuel est montrée, avec la marque proposée.
  if (number !== content.currentNumber || !isBrandComposition(content.visualComposition)) return null;
  const view = brandViewOf(content.company);
  return { svg: renderVisual({ ...view.kit, composition: content.visualComposition, headline: version.title, signature: content.company.name, photoUrl: photo?.url ?? null, photoAlt: photo?.alt ?? null, logoUrl: view.logo?.url ?? null }), preview: true };
}

/**
 * Ajouter, remplacer ou retirer le logo (#290), une transaction : refus s'il existe un visuel programmé (M-94), puis une version
 * de chaque visuel à valider à nouveau et J-33. Le fichier est contrôlé avant l'appel (type réel, taille) ; l'ancien fichier est
 * supprimé seulement si aucune version ne l'utilise plus, et le nouveau l'est si la transaction échoue.
 */
export async function setBrandLogo(companyId: string, upload: { bytes: Uint8Array; check: Extract<SitePhotoCheck, { ok: true }> } | null): Promise<BrandLogo | null> {
  const before = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { brandLogo: true } });
  const previous = readBrandLogo(before.brandLogo, companyId);
  if (!upload && !previous) return null;
  if (!sitePhotoStorage.isConfigured()) throw new PublishRefusedError(SITE_PHOTO_UNAVAILABLE, 503);
  let next: BrandLogo | null = null;
  if (upload) {
    const stored = await sitePhotoStorage.put(brandLogoPathname(companyId, randomUUID(), upload.check.type.extension), upload.bytes, upload.check.type.mime);
    next = { url: stored.url, pathname: stored.pathname, width: upload.check.width, height: upload.check.height };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: companyId }, data: { brandLogo: next ? { ...next } : Prisma.DbNull } });
      await markBrandChanged(tx, companyId);
      await writeJournal(tx, { companyId, code: "J-33", params: { action: !next ? "retiré" : previous ? "remplacé" : "ajouté" }, actor: "owner" });
    }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    if (next) await sitePhotoStorage.del(next.url).catch(() => undefined);
    throw error;
  }
  // Les archives affichent l'ancien logo : il n'est supprimé que si aucun instantané ne le cite plus.
  if (previous) {
    const used = await prisma.contentVersion.count({ where: { content: { companyId }, brandSnapshot: { path: ["logoUrl"], equals: previous.url } } });
    if (used === 0) await sitePhotoStorage.del(previous.url).catch((error) => console.error("Ancien logo non supprimé:", previous.pathname, error));
  }
  return next;
}
