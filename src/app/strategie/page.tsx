import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading, Tag } from "@/components/mockup-ui";
import { MissionTags } from "@/components/mission-ui";
import { MissionActions, PaulButton } from "@/components/mission-actions";
import { getShellProps } from "@/lib/shell-data";
import { prisma } from "@/lib/prisma";
import { firstNameOf, requireWorkspaceCompany } from "@/lib/workspace";
import { loadMissionViews } from "@/lib/missions/view";
import { nextStep } from "@/lib/missions/stage";
import { LAUNCH_COST_CREDITS } from "@/lib/missions/rules";

export const dynamic = "force-dynamic";

/** Stratégie (FR-13 à FR-15, spécification §13.1) : une seule décision utile, ce qui attend une validation, et d'où viennent les missions. */
export default async function StrategiePage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const missions = await loadMissionViews(company.id);
  const connected = await prisma.channelConnection.count({ where: { companyId: company.id, status: "connecte" } });
  const step = nextStep(missions);
  const stepMission = missions.find((mission) => mission.id === step.missionId) ?? null;
  const toValidate = missions.filter((mission) => mission.stage === "approve" && mission.contentId);
  const firstName = firstNameOf(company.ownerName);

  return (
    <AppShell {...shell}>
      <PageHeading
        kicker="Votre stratégie avec Paul"
        title={firstName ? `Bonjour ${firstName}.` : "Bonjour."}
        description="Votre stratégie relie votre ambition, les constats, les missions et les apprentissages."
        actions={<>
          <PaulButton label="Challenger le plan" />
          <Link className="btn" href="/missions/nouvelle"><Icon name="plus" />Créer une mission</Link>
        </>}
      />

      <section className="next-step" aria-labelledby="next-step-title">
        <div className="eyebrow">Votre prochaine décision{stepMission ? ` · ${stepMission.title}` : ""}</div>
        <h2 id="next-step-title">{step.title}</h2>
        <p>{step.detail}</p>
        {stepMission && (
          <dl className="decision-reasons">
            <div><dt>Pourquoi maintenant</dt><dd>{stepMission.finding}</dd></div>
            <div><dt>Preuve utilisée</dt><dd>{stepMission.createdBy === "owner" ? "Déclaré par vous" : "Constat relevé par Paul"}</dd></div>
            <div><dt>À vérifier</dt><dd>{stepMission.scopeSummary === "À préciser" ? "Le périmètre de la mission" : "—"}</dd></div>
            <div><dt>Résultat recherché</dt><dd>{stepMission.outcome}</dd></div>
          </dl>
        )}
        <div className="heading-actions">
          {step.target.kind === "link"
            ? <Link className="btn primary" href={step.target.href}>{step.target.label}<Icon name="arrow-right" /></Link>
            : <PaulButton label={step.target.label} className="primary" />}
          {stepMission && <PaulButton label="Challenger avec Paul" mission={stepMission} />}
        </div>
        <small>Rien ne sera lancé ou diffusé sans votre accord.</small>
      </section>

      <section className="section-space" aria-labelledby="to-validate-title">
        <div className="section-title"><h2 id="to-validate-title">À valider par vous</h2></div>
        {toValidate.length === 0 ? (
          <div className="decision">
            <Icon name="panels-top-left" />
            <span>Aucun contenu à valider pour le moment. Les contenus de vos missions en cours arriveront dans l&apos;atelier.</span>
          </div>
        ) : toValidate.map((mission) => (
          <div key={mission.id} className="decision">
            <Icon name="panels-top-left" />
            <span><strong>{mission.title}</strong> · V{mission.content?.number} · {mission.channelLabel} · prête à relire</span>
            <Link href={`/atelier/${mission.contentId}`}>Relire et valider</Link>
          </div>
        ))}
        <div className="decision">
          <Icon name="refresh-cw" />
          <span>{connected === 0 ? "Aucun canal connecté." : `${connected} canal${connected > 1 ? "aux" : ""} connecté${connected > 1 ? "s" : ""}.`}</span>
          <Link href="/connexions">Gérer les connexions</Link>
        </div>
        <p className="small muted">Une validation de contenu n&apos;est jamais une autorisation de diffusion.</p>
      </section>

      <section className="section-space" aria-labelledby="grouped-title">
        <div className="section-title">
          <h2 id="grouped-title">Vos missions regroupées</h2>
          <p>Chaque mission part d&apos;un constat et le teste dans un cadre limité.</p>
        </div>
        {missions.length === 0 ? (
          <div className="empty">
            <Icon name="flag" />
            <h3>Aucune mission pour le moment</h3>
            <p>Créez votre première mission à partir d&apos;un constat, ou explorez une idée avec Paul.</p>
            <div className="heading-actions">
              <Link className="btn" href="/missions/nouvelle"><Icon name="plus" />Créer une mission</Link>
              <PaulButton label="Explorer une idée" />
            </div>
          </div>
        ) : (
          <>
            <div className="finding-flow" aria-hidden="true">
              <span>1 · Ce que nous avons observé</span><span>2 · Ce que Paul en déduit</span><span>3 · La mission qui en découle</span>
            </div>
            {missions.map((mission) => (
              <article key={mission.id} className="finding-row" aria-label={mission.title}>
                <div>
                  <p>{mission.finding}</p>
                  <Tag color="gray">{mission.createdBy === "owner" ? "Déclaré par vous" : "Observé"}</Tag>
                </div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div><p>{mission.createdBy === "owner" ? "Vous avez choisi de le tester." : "—"}</p></div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div>
                  <MissionTags status={mission.status} priority={mission.priority} />
                  <h3>{mission.title}</h3>
                  <p className="target"><Icon name="target" />{mission.outcome}</p>
                  <p className="small muted">{mission.templateLabel} · {mission.scopeSummary}</p>
                  <MissionActions mission={mission.actions} credits={company.creditBalance} launchCost={LAUNCH_COST_CREDITS} variant="row" />
                </div>
              </article>
            ))}
          </>
        )}
      </section>
    </AppShell>
  );
}
