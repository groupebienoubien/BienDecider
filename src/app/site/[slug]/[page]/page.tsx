import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadPage(slug: string, page: string) {
  const company = await prisma.company.findUnique({ where: { siteSlug: slug }, select: { id: true, name: true, trade: true, servingArea: true, siteHtml: true } });
  if (!company) return null;
  const sitePage = await prisma.sitePage.findUnique({ where: { companyId_slug: { companyId: company.id, slug: page } } });
  return sitePage ? { company, sitePage } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; page: string }> }): Promise<Metadata> {
  const { slug, page } = await params;
  const loaded = await loadPage(slug, page);
  return loaded ? { title: `${loaded.sitePage.title} · ${loaded.company.name}` } : {};
}

/**
 * Page du site vitrine mise en ligne par une diffusion (#172) : exactement la version validée et confirmée,
 * rendue en texte (aucun HTML du contenu n'est interprété), sans nouvel appel au modèle.
 */
export default async function PublicSitePage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params;
  const loaded = await loadPage(slug, page);
  if (!loaded) notFound();
  const { company, sitePage } = loaded;
  const paragraphs = sitePage.body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 text-[17px] leading-relaxed text-[var(--bd-ink)]">
      <header className="mb-8 flex flex-col gap-1 border-b border-[var(--bd-line)] pb-4 text-sm">
        {company.siteHtml ? <Link className="font-semibold" href={`/site/${slug}`}>{company.name}</Link> : <strong>{company.name}</strong>}
        <span className="text-[var(--bd-muted)]">{company.trade} · {company.servingArea}</span>
      </header>
      <article className="break-words">
        <h1 className="mb-6 font-[family-name:var(--font-sora)] text-3xl font-semibold leading-tight">{sitePage.title}</h1>
        {paragraphs.map((paragraph, index) => <p key={index} className="mb-4 whitespace-pre-line">{paragraph}</p>)}
      </article>
      <footer className="mt-12 border-t border-[var(--bd-line)] pt-4 text-xs text-[var(--bd-muted)]">
        Mis à jour le {sitePage.publishedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })} · Site hébergé par BienDecider
      </footer>
    </main>
  );
}
