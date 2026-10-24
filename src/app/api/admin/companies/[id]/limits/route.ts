import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionEmail } from "@/lib/session";
import { isExplicitAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const limitsSchema = z.object({
  dailyAgentRunLimit: z.number().int().min(0).max(10000),
  monthlyAgentRunLimit: z.number().int().min(0).max(100000),
  dailyChatMessageLimit: z.number().int().min(0).max(10000),
  monthlyChatMessageLimit: z.number().int().min(0).max(100000),
  dailySpendLimitUsd: z.number().finite().min(0).max(100000),
  monthlySpendLimitUsd: z.number().finite().min(0).max(1000000),
}).strict().refine((limits) => limits.dailyAgentRunLimit <= limits.monthlyAgentRunLimit, {
  message: "Le plafond journalier de lancements ne peut pas dépasser le plafond mensuel.",
}).refine((limits) => limits.dailyChatMessageLimit <= limits.monthlyChatMessageLimit, {
  message: "Le plafond journalier de messages à Paul ne peut pas dépasser le plafond mensuel.",
}).refine((limits) => limits.dailySpendLimitUsd <= limits.monthlySpendLimitUsd, {
  message: "Le plafond journalier de dépense ne peut pas dépasser le plafond mensuel.",
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const email = await getSessionEmail();
  if (!isExplicitAdminEmail(email)) return NextResponse.json({ error: "Accès administrateur explicite requis." }, { status: 403 });

  const parsed = limitsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Plafonds invalides." }, { status: 400 });

  const { id } = await params;
  const updated = await prisma.company.updateMany({ where: { id }, data: parsed.data });
  if (updated.count !== 1) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
  return NextResponse.json({ companyId: id, ...parsed.data });
}