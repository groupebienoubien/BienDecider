import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { visualOfVersion } from "@/lib/brand/service";

/** Visuel d'une version (#290) : GET `?n=<numéro>`, image SVG composée d'après la marque conservée avec la version. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const number = Number(request.nextUrl.searchParams.get("n"));
  if (!Number.isInteger(number) || number < 1) return NextResponse.json({ error: "Version invalide" }, { status: 400 });
  const { id } = await params;
  const visual = await visualOfVersion(company.id, id, number);
  if (!visual) return NextResponse.json({ error: "Aucun visuel pour cette version" }, { status: 404 });
  return new NextResponse(visual.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src https:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
