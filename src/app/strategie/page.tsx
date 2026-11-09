import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading, Tag } from "@/components/mockup-ui";
import { MissionTags } from "@/components/mission-ui";
import { MissionActions, PaulButton } from "@/components/mission-actions";
import { getShellProps } from "@/lib/shell-data";
import { prisma } from "@/lib/prisma";
import { firstNameOf, requireWorkspaceCompany } from "@/lib/workspace";
import { loadMissionViews, priorityOf } from "@/lib/missions/view";
import { learningsOf } from "@/lib/missions/results-view";
import { loadCancelledSchedules } from "@/lib/contents/view";
import { nextStep } from "@/lib/missions/stage";
import { LAUNCH_COST_CREDITS } from "@/lib/missions/rules";
import { asDelegationLevel } from "@/lib/delegation-level";
import { listOpenIdeas } from "@/lib/ideas";
import { missionProvenance } from "@/lib/findings/certainty";
import { IdeaActions } from "./idea-actions";
import { FindingSource } from "./finding-source";
import { PrepareMissions } from "./prepare-missions";
import { getLatestAuditFindings } from "@/lib/audit-findings";

export const dynamic = "force-dynamic";

/** Stratégie (FR-13 à FR-15, spécification §13.1) : une seule décision utile, ce qui attend une validation, et d'où viennent les missions. */
export default async function StrategiePage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const [missions, ideas, currentFindings] = await Promise.all([loadMissionViews(company.id), listOpenIdeas(company.id), getLatestAuditFindings(company.id, { take: 1 })]);
  // « Préparer mes missions » (#284) : seulement avec un diagnostic courant ; sinon un lien vers le diagnostic.
  const hasDiagnostic = currentFindings.length > 0;
  const empty = missions.length === 0 && ideas.length === 0;
  const connected = await prisma.channelConnection.count({ where: { companyId: company.id, status: "connecte" } });
  const step = nextStep(missions, asDelegationLevel(company.delegationLevel), priorityOf(missions));
  const stepMission = missions.find((mission) => mission.id === step.missionId) ?? null;
  const stepProvenance = stepMission ? missionProvenance(stepMission) : null;
  const toValidate = missions.filter((mission) => (mission.stage === "approve" || mission.stage === "verify" || mission.stage === "scheduled") && mission.contentId);
  const cancelledSchedules = await loadCancelledSchedules(company.id);
  // Marque à confirmer (#283, #290) : tant qu'elle ne l'est pas, aucun visuel ne se valide. Montrée dès qu'un contenu peut porter un visuel.
  const brandToConfirm = company.brandConfirmedAt === null && (await prisma.missionContent.count({ where: { companyId: company.id, format: "social_post", currentNumber: { gt: 0 } } })) > 0;
  const STAGE_LINE: Partial<Record<string, [string, string]>> = { verify: ["diffusion à vérifier", "Vérifier"], scheduled: ["diffusion programmée", "Voir la programmation"] };
  const firstName = firstNameOf(company.ownerName);
  const learnings = learningsOf(missions);

  return (
    <AppShell {...shell}>
      <PageHeading
        kicker="Votre stratégie avec Paul"
        title={firstName ? `Bonjour ${firstName}.` : "Bonjour."}
        description="Votre stratégie relie votre ambition, les constats, les missions et les apprentissages."
        actions={<>
          <PaulButton label="Challenger le plan" />
          {!empty && <PrepareMissions hasDiagnostic={hasDiagnostic} />}
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
            <div><dt>Preuve utilisée</dt><dd>{stepProvenance ? `${stepProvenance.title} · ${stepProvenance.certainty}` : "—"}{stepProvenance?.source && <> <FindingSource source={stepProvenance.source} /></>}</dd></div>
            <div><dt>À vérifier</dt><dd>{stepMission.scopeSummary === "À préciser" ? "Le périmètre de la mission" : "—"}</dd></div>
            <div><dt>Résultat recherché</dt><dd>{stepMission.outcome}</dd></div>
          </dl>
        )}
        <div className="heading-actions">
          {step.target.kind === "link"
            ? <Link className="btn primary" href={step.target.href}>{step.target.label}<Icon name="arrow-right" /></Link>
            : <PaulButton label={step.target.label} className="primary" idea />}
          {stepMission && <PaulButton label="Challenger avec Paul" mission={stepMission} />}
        </div>
        <small>Rien ne sera lancé ou diffusé sans votre accord.</small>
      </section>

      {learnings.length > 0 && (
        <section className="section-space" aria-labelledby="learnings-title">
          <div className="section-title">
            <h2 id="learnings-title">Ce que Paul apprend</h2>
            <p>Vos bilans comparés au résultat recherché de chaque mission. Rien n&apos;est appliqué sans votre confirmation.</p>
          </div>
          {learnings.map(({ mission, reading }) => (
            <article key={mission.id} className="stack" aria-label={`Ce que Paul apprend : ${mission.title}`}>
              <h3>{mission.title}</h3>
              <dl className="learning-grid">
                <div><dt>Observé</dt><dd>{reading.observed}</dd></div>
                <div><dt>Ce que cela suggère</dt><dd>{reading.suggests}</dd></div>
                <div><dt>Ce que cela ne prouve pas</dt><dd>{reading.notProven}</dd></div>
                <div><dt>Impact sur le plan</dt><dd>{reading.impact}</dd></div>
              </dl>
              <div className="heading-actions">
                {mission.status === "active" && <Link className="btn" href={`/resultats?mission=${mission.id}`}>Décider la suite</Link>}
                <PaulButton label="En parler avec Paul" mission={mission} />
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="section-space" aria-labelledby="to-validate-title">
        <div className="section-title"><h2 id="to-validate-title">À valider par vous</h2></div>
        {toValidate.length === 0 && cancelledSchedules.length === 0 ? (
          <div className="decision">
            <Icon name="panels-top-left" />
            <span>Aucun contenu à valider pour le moment. Les contenus de vos missions en cours arriveront dans l&apos;atelier.</span>
          </div>
        ) : toValidate.map((mission) => (
          <div key={mission.id} className="decision">
            <Icon name="panels-top-left" />
            <span><strong>{mission.title}</strong> · V{mission.content?.number} · {mission.channelLabel} · {STAGE_LINE[mission.stage]?.[0] ?? "prête à relire"}</span>
            <Link href={`/atelier/${mission.contentId}`}>{STAGE_LINE[mission.stage]?.[1] ?? "Relire et valider"}</Link>
          </div>
        ))}
        {cancelledSchedules.map((item) => (
          <div key={item.contentId} className="decision">
            <Icon name="refresh-cw" />
            <span><strong>{item.missionTitle}</strong> · V{item.versionNumber} · programmation annulée : {item.reason}</span>
            <Link href={`/atelier/${item.contentId}`}>Voir le contenu</Link>
          </div>
        ))}
        {brandToConfirm && (
          <div className="decision">
            <Icon name="pencil" />
            <span><strong>Votre marque</strong> · à confirmer avant de valider un visuel</span>
            <Link href="/entreprise#ma-marque">Confirmer ma marque</Link>
          </div>
        )}
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
        {empty ? (
          <div className="empty">
            <Icon name="flag" />
            <h3>Aucune mission pour le moment</h3>
            <p>{hasDiagnostic ? "Paul peut préparer vos missions à partir de votre diagnostic, ou vous pouvez en créer une vous-même." : "Paul prépare vos missions à partir de votre diagnostic : lancez-le d'abord, ou créez une mission vous-même."}</p>
            <div className="heading-actions">
              <PrepareMissions hasDiagnostic={hasDiagnostic} />
              <Link className="btn" href="/missions/nouvelle"><Icon name="plus" />Créer une mission</Link>
              <PaulButton label="Explorer une idée" idea />
            </div>
          </div>
        ) : (
          <>
            <div className="finding-flow" aria-hidden="true">
              <span>1 · Ce que nous avons observé</span><span>2 · Ce que Paul en déduit</span><span>3 · La mission qui en découle</span>
            </div>
            {missions.map((mission) => {
              // Colonnes 1 et 2 (#168) : constat relié, mission de Paul sans constat, ou mission du dirigeant.
              const provenance = missionProvenance(mission);
              return (
              <article key={mission.id} className="finding-row" aria-label={mission.title}>
                <div>
                  <p><strong>{provenance.title}</strong></p>
                  <p className="small muted">{provenance.origin}</p>
                  <Tag color={provenance.tone}>{provenance.certainty}</Tag>
                  <p>{provenance.note}</p>
                  {provenance.source && <FindingSource source={provenance.source} />}
                </div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div><p>{provenance.deduction}</p></div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div>
                  <MissionTags status={mission.status} priority={mission.priority} />
                  <h3>{mission.title}</h3>
                  <p className="target"><Icon name="target" />{mission.outcome}</p>
                  <p className="small muted">{mission.templateLabel} · {mission.scopeSummary}</p>
                  {(mission.responsibleLabel || mission.risk) && (
                    <p className="small muted">{[mission.responsibleLabel, mission.risk && `Risque ou limite : ${mission.risk}`].filter(Boolean).join(" · ")}</p>
                  )}
                  <MissionActions mission={mission.actions} credits={company.creditBalance} launchCost={LAUNCH_COST_CREDITS} variant="row" />
                </div>
              </article>
              );
            })}
            {/* Idées notées avec Paul (US #312) : après les missions, à cadrer avant tout lancement. */}
            {ideas.map((idea) => (
              <article key={idea.id} className="finding-row idea-row" aria-label={`Idée : ${idea.text}`}>
                <div>
                  <p>{idea.text}</p>
                  <Tag color="gray">Idée notée avec Paul</Tag>
                </div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div><p>Pas encore une mission : il faut un constat, un périmètre et un résultat attendu.</p></div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div>
                  <Tag color="orange">À cadrer</Tag>
                  <p className="small muted">Confirmez le constat, le type d&apos;action et le résultat avant de créer la mission.</p>
                  <IdeaActions idea={{ id: idea.id, text: idea.text }} />
                </div>
              </article>
            ))}
          </>
        )}
      </section>
    </AppShell>
  );
}
