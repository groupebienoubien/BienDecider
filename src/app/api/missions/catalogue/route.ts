import { NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { channelLabel } from "@/lib/missions/channels";
import { availableTemplates, enabledChannels } from "@/lib/missions/templates";

// Catalogue proposé au dirigeant (story 9.2) : seulement les modèles ouverts qui ont au moins un canal actif, plus « Sur mesure ».
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour voir le catalogue." }, { status: 401 });
  return NextResponse.json({
    templates: availableTemplates().map((template) => ({
      key: template.key,
      label: template.label,
      contentFormat: template.contentFormat,
      defaultOutcome: template.defaultOutcome,
      stopRuleDays: template.stopRuleDays,
      channels: enabledChannels(template).map((channel) => ({ key: channel, label: channelLabel(channel) })),
      offGridAllowed: template.key === "custom",
    })),
  });
}
