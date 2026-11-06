import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { availableTemplates, enabledChannels } from "@/lib/missions/templates";
import { channelLabel } from "@/lib/missions/channels";
import { LAUNCH_COST_CREDITS } from "@/lib/missions/rules";
import { findOpenIdea } from "@/lib/ideas";
import { NewMissionForm, type TemplateOption } from "./new-mission-form";

export const dynamic = "force-dynamic";

/**
 * « Cadrons votre nouvelle mission. » (§13.2) : seuls les modèles ouverts avec un canal actif sont proposés, plus « Sur mesure ».
 * `?idee={id}` (US #312) : le constat est prérempli avec l'idée ouverte de l'entreprise ; une idée absente,
 * d'une autre entreprise ou déjà cadrée donne le formulaire vide.
 */
export default async function NewMissionPage({ searchParams }: { searchParams: Promise<{ idee?: string | string[] }> }) {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const { idee } = await searchParams;
  const idea = typeof idee === "string" ? await findOpenIdea(company.id, idee) : null;
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
      {idea && <p className="small muted">Idée notée avec Paul : « {idea.text} ». Complétez le constat si besoin ; l&apos;idée sera retirée de Stratégie une fois la mission créée.</p>}
      <NewMissionForm key={idea?.id ?? "vide"} templates={templates} launchCost={LAUNCH_COST_CREDITS} idea={idea ? { id: idea.id, text: idea.text } : null} />
    </AppShell>
  );
}
