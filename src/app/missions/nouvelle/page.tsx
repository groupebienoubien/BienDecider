import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { availableTemplates, enabledChannels } from "@/lib/missions/templates";
import { channelLabel } from "@/lib/missions/channels";
import { LAUNCH_COST_CREDITS } from "@/lib/missions/rules";
import { NewMissionForm, type TemplateOption } from "./new-mission-form";

export const dynamic = "force-dynamic";

/** « Cadrons votre nouvelle mission. » (§13.2) : seuls les modèles ouverts avec un canal actif sont proposés, plus « Sur mesure ». */
export default async function NewMissionPage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const templates: TemplateOption[] = availableTemplates().map((template) => ({
    key: template.key,
    label: template.label,
    contentFormat: template.contentFormat,
    defaultOutcome: template.defaultOutcome,
    stopRuleDays: template.stopRuleDays,
    channels: [
      ...enabledChannels(template).map((key) => ({ key, label: channelLabel(key) })),
      ...(template.key === "custom" ? [{ key: "", label: "Hors canal, diffusion déclarée" }] : []),
    ],
  }));

  return (
    <AppShell {...shell}>
      <Link href="/missions" className="back-link"><Icon name="arrow-right" className="flip" />Toutes les missions</Link>
      <PageHeading kicker="Avec Paul" title="Cadrons votre nouvelle mission." description="Une mission part d'un fait que vous avez constaté et le teste dans un cadre limité." />
      <p className="paul-brief">Quel fait vous donne envie d&apos;agir ? Nous choisissons ensuite un type d&apos;action. Vous vérifiez le périmètre avant le lancement.</p>
      <NewMissionForm templates={templates} launchCost={LAUNCH_COST_CREDITS} />
    </AppShell>
  );
}
