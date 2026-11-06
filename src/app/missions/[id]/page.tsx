import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { Tag } from "@/components/mockup-ui";
import { MissionTags, MissionTracker } from "@/components/mission-ui";
import { MissionActions } from "@/components/mission-actions";
import { PrepareDraftButton } from "@/components/prepare-draft-button";
import { DELEGATION_LABELS, asDelegationLevel } from "@/lib/delegation-level";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { loadMissionView } from "@/lib/missions/view";
import { STAGE_LABELS, missionTracker } from "@/lib/missions/stage";
import { LAUNCH_COST_CREDITS } from "@/lib/missions/rules";
import { channelLabel } from "@/lib/missions/channels";
import { MISSION_TEMPLATES, enabledChannels } from "@/lib/missions/templates";
import { listAgencies } from "@/lib/agencies/service";
import { ScopeEditor } from "./scope-editor";

export const dynamic = "force-dynamic";

const LOCKS: Partial<Record<string, string>> = {
  dismissed: "Mission écartée du plan : remettez-la d'abord au plan.",
  stopped: "Mission arrêtée : le périmètre est figé.",
};

/** Détail d'une mission (§13.2) : pourquoi, ce que vous choisissez, les cinq actions et le contrat de mission. */
export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const company = await requireWorkspaceCompany();
  const { id } = await params;
  const mission = await loadMissionView(company.id, id);
  if (!mission) notFound();
  const shell = await getShellProps(company);
  const agencies = mission.template === "agencies" ? await listAgencies(company.id) : [];
  const template = MISSION_TEMPLATES[mission.template];
  const channels = [
    ...enabledChannels(template).map((key) => ({ key, label: channelLabel(key) })),
    ...(mission.template === "custom" ? [{ key: null, label: "Hors canal, diffusion déclarée" }] : []),
  ];
  const tracker = missionTracker(mission.stage);
  const done = (index: number) => tracker?.[index]?.state === "done";
  const contentOpen = mission.status !== "stopped" && mission.status !== "dismissed";
  const contentLink = mission.contentId
    ? <Link href={`/atelier/${mission.contentId}`}>Ouvrir le contenu (V{mission.content?.number}) dans l&apos;atelier</Link>
    : contentOpen ? <PrepareDraftButton missionId={mission.id} className="small" /> : null;
  const steps = [
    { title: "Confirmer le périmètre", text: "Vous fixez ce que la mission teste, puis vous la lancez.", done: mission.status !== "proposed" && mission.status !== "dismissed" },
    { title: "Préparer une première proposition", text: "Paul prépare le premier contenu dans l'atelier.", done: mission.contentId !== null, extra: contentLink },
    { title: "Relire et valider la version", text: "Valider n'envoie rien.", done: mission.content?.validated === true || done(2) },
    { title: mission.channel ? `Diffuser sur ${mission.channelLabel}` : "Diffuser vous-même et le déclarer", text: "Rien ne part sans votre confirmation.", done: done(3) },
    { title: "Faire le bilan, puis décider la suite", text: "Poursuivre, adapter avec Paul ou arrêter.", done: done(5) },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <AppShell {...shell}>
      <Link href="/missions" className="back-link"><Icon name="arrow-right" className="flip" />Toutes les missions</Link>
      <div className="page-heading mission-heading">
        <div>
          <div className="tags"><MissionTags status={mission.status} priority={mission.priority} /><Tag color="blue">Paul coordonne</Tag></div>
          <h1>{mission.title}</h1>
          <p><Icon name="target" /> {mission.outcome}</p>
        </div>
        <MissionActions mission={mission.actions} credits={company.creditBalance} launchCost={LAUNCH_COST_CREDITS} variant="detail" />
      </div>
      <dl className="modal-details mission-status">
        <dt>Modèle</dt><dd>{mission.templateLabel}</dd>
        <dt>Canal</dt><dd>{mission.channelLabel}</dd>
        <dt>Périmètre</dt><dd>{mission.scopeSummary}</dd>
        <dt>Étape</dt><dd>{STAGE_LABELS[mission.stage]}</dd>
      </dl>
      <MissionTracker stage={mission.stage} />

      <div className="mission-layout">
        <div>
          <section className="section-space" aria-labelledby="why-title">
            <h2 id="why-title">Pourquoi cette mission ?</h2>
            <p>{mission.finding}</p>
            <p className="small muted">{mission.createdBy === "owner" ? "Déclaré par vous" : "Constat relevé par Paul"} · un test limité d&apos;abord, pour apprendre avant d&apos;élargir.</p>
          </section>

          <section className="section-space" aria-labelledby="scope-title">
            <h2 id="scope-title">Ce que vous choisissez</h2>
            <ScopeEditor
              missionId={mission.id}
              version={mission.actions.version}
              template={mission.template}
              scope={mission.scope}
              channel={mission.channel}
              channels={channels}
              channelLocked={mission.hasValidatedVersion}
              lockedReason={LOCKS[mission.status] ?? null}
              agencies={agencies}
            />
          </section>

          <section className="section-space" aria-labelledby="steps-title">
            <h2 id="steps-title">Les actions de la mission <small>{doneCount} / 5 étapes</small></h2>
            <ol className="task-list">
              {steps.map((step, index) => (
                <li key={step.title} className={step.done ? "done" : undefined}>
                  <span className="task-num" aria-hidden="true">{step.done ? <Icon name="check" /> : index + 1}</span>
                  <div><strong>{step.title}</strong><p className="small muted">{step.text}</p>{"extra" in step && step.extra && <div className="small">{step.extra}</div>}</div>
                  <span className="sr-only">{step.done ? "fait" : "à faire"}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="contract" aria-labelledby="contract-title">
          <h2 id="contract-title">Notre contrat de mission</h2>
          <dl>
            <dt>Résultat</dt><dd>{mission.outcome}</dd>
            <dt>Coût</dt><dd>{mission.actions.launched ? "Lancée : crédits déjà réglés" : `${LAUNCH_COST_CREDITS} crédits au lancement`}</dd>
            <dt>Dépenses externes</dt><dd>0 € engagé</dd>
            <dt>Règle d&apos;arrêt</dt><dd>{mission.stopRuleDays ? `Bilan à ${mission.stopRuleDays} jours` : "—"}</dd>
            <dt>Délégation</dt><dd>{DELEGATION_LABELS[asDelegationLevel(company.delegationLevel)]} : vous validez chaque contenu ; {asDelegationLevel(company.delegationLevel) === "prepare" ? "vous le diffusez vous-même, puis le déclarez" : "rien n'est diffusé sans votre confirmation"}.</dd>
          </dl>
          <h3>Comment Paul vous accompagne</h3>
          <ol className="small">
            <li>Paul cadre le test avec vous.</li>
            <li>Paul prépare les contenus, que vous relisez et validez.</li>
            <li>Paul vous restitue ce que le test a appris.</li>
          </ol>
        </aside>
      </div>
    </AppShell>
  );
}
