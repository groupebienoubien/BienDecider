import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { markBrandChanged } from "@/lib/contents/service";
import {
  checkBrandInput, isBrandComposition, isBrandTone, normalizeHex, proposeBrand, readBrandOrigins, readBrandProposal, readBrandSnapshot,
  type BrandChecked, type BrandKit, type BrandOrigins, type BrandStatus,
} from "@/lib/brand/rules";
import { renderVisual } from "@/lib/brand/render";
import { readVisualPhoto } from "@/lib/brand/photo";

type BrandColumns = { brandPrimary: string | null; brandAccent: string | null; brandTone: string | null; brandOrigins: Prisma.JsonValue | null; brandProposal: Prisma.JsonValue | null; brandConfirmedAt: Date | null };

export type BrandView = {
  status: BrandStatus;
  kit: BrandKit;
  origins: BrandOrigins;
  /** Faux quand l'identité est proposée sans site : l'interface le dit. */
  fromSite: boolean;
  /** Origine du site, si une palette y a été lue. */
  source: string | null;
  confirmedAt: string | null;
};

/** La marque telle que l'interface l'affiche : le kit confirmé, sinon la proposition de départ (site ou identité proposée). */
export function brandViewOf(company: BrandColumns): BrandView {
  const proposal = readBrandProposal(company.brandProposal);
  const proposed = proposeBrand(proposal);
  const primary = normalizeHex(company.brandPrimary);
  const accent = normalizeHex(company.brandAccent);
  if (company.brandConfirmedAt && primary && accent && isBrandTone(company.brandTone)) {
    return { status: "confirmed", kit: { primary, accent, tone: company.brandTone }, origins: readBrandOrigins(company.brandOrigins), fromSite: proposed.fromSite, source: proposal?.source ?? null, confirmedAt: company.brandConfirmedAt.toISOString() };
  }
  return { status: "to_confirm", kit: proposed.kit, origins: proposed.origins, fromSite: proposed.fromSite, source: proposal?.source ?? null, confirmedAt: null };
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
    select: { visualComposition: true, currentNumber: true, company: { select: { name: true, brandPrimary: true, brandAccent: true, brandTone: true, brandOrigins: true, brandProposal: true, brandConfirmedAt: true } }, versions: { where: { number }, select: { title: true, brandSnapshot: true, photo: true } } },
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
  return { svg: renderVisual({ ...view.kit, composition: content.visualComposition, headline: version.title, signature: content.company.name, photoUrl: photo?.url ?? null, photoAlt: photo?.alt ?? null }), preview: true };
}
