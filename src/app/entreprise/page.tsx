import { Fragment } from "react";
import Link from "next/link";
import { capLabel, readAmbitionTerms } from "@/lib/ambition-rules";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { AmbitionEditor } from "@/components/ambition-editor";
import { BrandForm } from "@/components/brand-form";
import { brandViewOf } from "@/lib/brand/service";
import { hasScheduledVisual } from "@/lib/contents/service";
import { Icon } from "@/components/icon";
import { PageHeading, Tag } from "@/components/mockup-ui";
import { DirectionForm } from "@/components/direction-form";
import { GooglePlaceLine } from "@/components/google-place";
import { FacebookPageLine } from "@/components/facebook-page";
import { placeMapsLink } from "@/lib/google-places";
import { SitePhotos } from "@/components/site-photos";
import { FindingSource } from "@/app/strategie/finding-source";
import { getAuditFindingsView } from "@/lib/audit-findings";
import { formatReadDate } from "@/lib/findings/certainty";
import { decisionRows, diagnosticSummary, missingInputs } from "@/lib/findings/decisions";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { prisma } from "@/lib/prisma";
import { getRetainedFeedback } from "@/lib/retained-feedback";
import { getSessionCompany } from "@/lib/session";
import { getShellProps } from "@/lib/shell-data";
import { listSitePhotos, sitePhotoStorage } from "@/lib/site/photo-store";
import { AskPaulPositioning, DiscussFinding } from "./diagnostic-actions";
import { FindingCorrection } from "./finding-correction";
import { CapacityEditor } from "./capacity-editor";
import { previousVersions } from "@/lib/findings/correction-service";
import { capacityState } from "@/lib/capacity";
import { clientGapLabel, computeBusinessTarget, formatEuros } from "@/lib/business-target";

export const dynamic = "force-dynamic";

export default async function EntreprisePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  const { tab } = await searchParams;
  const [shell, connections, feedback, sitePhotos, audits, brandLocked] = await Promise.all([
    getShellProps(company),
    prisma.channelConnection.findMany({ where: { companyId: company.id } }),
    getRetainedFeedback(company.id),
    listSitePhotos(company.id),
    getAuditFindingsView(company.id),
    hasScheduledVisual(company.id),
  ]);
  const brand = brandViewOf(company);
  // Diagnostic courant (#168) : ses constats, et les missions qui en découlent (#292).
  const linkedMissions = audits.latest.length
    ? await prisma.mission.findMany({ where: { companyId: company.id, sourceFindingId: { in: audits.latest.map((finding) => finding.id) } }, select: { id: true, title: true, status: true, sourceFindingId: true, deduction: true, findingReviewAt: true }, orderBy: { position: "asc" } })
    : [];
  // Version remplacée de chaque constat corrigé par le dirigeant (#169), montrée dans « Corriger cette information ».
  const versions = await previousVersions(company.id, audits.latest.filter((finding) => finding.correctedAt).map((finding) => finding.id));
  const rows = decisionRows(audits.latest, linkedMissions);
  const summary = diagnosticSummary(rows);
  const missing = missingInputs(company);
  const facebook = facebookConnectionView(connections.find((connection) => connection.channel === "facebook"), company.id);
  const gmailConnected = connections.some((connection) => connection.channel === "gmail" && connection.status === "connecte");
  const channels = [
    { name: "Facebook", connected: facebook.status === "connected", detail: facebook.status === "connected" ? `Page « ${facebook.pageName} » · actif` : "Aucune autorisation" },
    { name: "Gmail", connected: gmailConnected, detail: gmailConnected ? "Envoi autorisé · actif" : "Aucune autorisation" },
    { name: "Site", connected: Boolean(company.siteSlug), detail: company.siteSlug ? `/site/${company.siteSlug} · publié` : "Aucune page publiée" },
  ];

  // Repères (#169, #292, spécification §13) : ambition, localisation, zone, clients et capacité disponible, chacun avec son statut
  // et « Modifier » ; « À renseigner » quand une valeur est vide. L'écart chiffré (D8) n'apparaît que s'il est calculable.
  const ambitionTerms = readAmbitionTerms(company.ambitionTerms);
  const ambitionText = company.ambitionText?.trim() || company.objective;
  const hasAmbition = Boolean(ambitionText?.trim()) || (ambitionTerms?.gainPercent != null && ambitionTerms.horizonMonths != null);
  const filled = (value: string | null | undefined) => value?.trim() || null;
  const confirmed = <Tag color="green">Confirmé</Tag>;
  const fixProfile = (label: string) => <a className="small" href="#corriger-mon-profil">Modifier<span className="sr-only"> : {label}</span></a>;
  const profileLandmark = (label: string, value: string | null) => ({ label, value, status: value ? confirmed : null, action: fixProfile(label), note: null });
  const capacity = capacityState(company.availableCapacity, company.capacityConfirmedAt);
  const target = computeBusinessTarget(company);
  const clientGap = target ? clientGapLabel(target) : null;
  const figures = (label: string) => <a className="small" href="/entreprise?tab=objectifs#corriger-mon-profil">{label}</a>;
  const landmarks = [
    { label: "Ambition", value: hasAmbition ? capLabel(ambitionText, ambitionTerms) : null, status: hasAmbition && company.ambitionConfirmedAt ? confirmed : null, action: <a className="small" href="#modifier">Modifier avec Paul</a>, note: null },
    profileLandmark("Localisation", filled(company.location)),
    profileLandmark("Zone", filled(company.servingArea)),
    profileLandmark("Clients", filled(company.targetClients)),
    {
      label: "Capacité disponible",
      value: capacity.status === "missing" ? null : capacity.label,
      status: capacity.status === "confirmed" ? confirmed : capacity.status === "stale" ? <Tag color="orange">À reconfirmer</Tag> : null,
      action: <CapacityEditor capacity={capacity.status === "missing" ? null : capacity.capacity} />,
      note: capacity.status === "missing" || !capacity.confirmedAt ? null : `Déclarée par vous le ${formatReadDate(capacity.confirmedAt)}${capacity.status === "confirmed" ? `, à reconfirmer avant le ${formatReadDate(capacity.reconfirmBy)}` : ""}.`,
    },
    target
      ? {
        label: "Écart à combler",
        value: `${target.gap >= 0 ? "+" : ""}${formatEuros(target.gap)} par mois${clientGap ? `, ${clientGap.text}` : ""}`,
        status: <Tag color="gray">Calculé</Tag>,
        action: figures("Modifier mes chiffres"),
        note: `Calculé à partir de vos chiffres déclarés${target.basis === "ambition" ? " et de votre ambition" : ""}.`,
      }
      : { label: "Chiffrage", value: null, status: null, action: figures("Ajouter mes chiffres"), note: "Facultatif : votre chiffre d'affaires actuel et la valeur moyenne d'un client suffisent pour calculer l'écart." },
  ];

  return (
    <AppShell {...shell}>
      <PageHeading kicker={company.name} title="Une entreprise bien comprise." description="Votre diagnostic, votre identité et les règles qui guident les décisions de Paul." />
      <section aria-labelledby="diagnostic-title" className="section-space">
        <div className="section-title">
          <h2 id="diagnostic-title">Diagnostic &amp; positionnement</h2>
          <p>{audits.latestAt ? `Relevé du ${formatReadDate(audits.latestAt)} : chaque constat dit d'où il vient et à quel point il est sûr.` : "Aucun diagnostic pour le moment : Paul n'a encore rien relevé sur votre entreprise."}</p>
        </div>
        <dl className="decision-reasons">
          <div><dt>Constats</dt><dd>{summary.findings}</dd></div>
          <div><dt>Sources lues</dt><dd>{summary.sources}</dd></div>
          <div><dt>Missions qui en découlent</dt><dd>{summary.missions}</dd></div>
        </dl>
        <div className="heading-actions">
          <a className="btn" href="#corriger-mon-profil"><Icon name="pencil" />Corriger mon profil</a>
          <Link className="btn" href="/strategie">Voir les constats et les missions<Icon name="arrow-right" /></Link>
          <AskPaulPositioning />
          <Link className="btn" href="/diagnostic">{audits.latestAt ? "Voir le diagnostic détaillé" : "Lancer le diagnostic"}</Link>
        </div>
        {rows.length > 0 && (
          <>
            <h3>Des constats aux décisions</h3>
            <div className="finding-flow" aria-hidden="true">
              <span>1 · Le constat et sa certitude</span><span>2 · Ce que Paul en déduit</span><span>3 · La suite proposée</span>
            </div>
            {rows.map((row) => (
              <article key={row.finding.id} className="finding-row" aria-label={`Constat : ${row.finding.title}`}>
                <div>
                  <p><strong>{row.finding.title}</strong></p>
                  <p className="small muted">{row.origin} · {row.finding.correctedAt ? `corrigé par vous le ${formatReadDate(row.finding.correctedAt)}` : `lu le ${formatReadDate(row.finding.createdAt)}`}</p>
                  <Tag color={row.tone}>{row.certainty}</Tag>
                  <FindingSource source={row.finding} />
                  <FindingCorrection finding={{ id: row.finding.id, title: row.finding.title, content: row.finding.content, certainty: row.certainty }} previous={versions.get(row.finding.id) ?? null} />
                </div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div><p>{row.deduction ?? "—"}</p></div>
                <Icon name="arrow-right" className="finding-arrow" />
                <div>
                  {row.missions.length
                    ? row.missions.map((mission) => <p key={mission.id}><Link href={`/missions/${mission.id}`}>{mission.title}</Link>{mission.review && <> <Tag color="orange">À réexaminer</Tag></>}</p>)
                    : <DiscussFinding id={row.finding.id} title={row.finding.title} />}
                </div>
              </article>
            ))}
          </>
        )}
        <h3>Ce qu&apos;il nous manque</h3>
        <ul className="feedback-list">{missing.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <BrandForm name={company.name} status={brand.status} kit={brand.kit} origins={brand.origins} fromSite={brand.fromSite} source={brand.source} locked={brandLocked} logo={brand.logo && { url: brand.logo.url }} logoAvailable={sitePhotoStorage.isConfigured()} />
      <div className="settings-grid section-space">
        <section className="setting-section">
          <h2>{company.name}</h2>
          <p>{[company.trade, company.servingArea].filter(Boolean).join(" · ")}</p>
          <section aria-labelledby="reperes-title" className="flex flex-col gap-3">
            <h3 id="reperes-title">Vos repères</h3>
            <dl className="modal-details">
              {landmarks.map((landmark) => (
                <Fragment key={landmark.label}>
                  <dt>{landmark.label}</dt>
                  <dd>
                    {landmark.value ?? <span className="muted">À renseigner</span>}
                    {landmark.note && <span className="block small muted">{landmark.note}</span>}
                    <span className="flex flex-wrap items-center gap-2">{landmark.status}{landmark.action}</span>
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
          <section id="modifier" aria-labelledby="ambition-title" className="flex flex-col gap-3">
            <h3 id="ambition-title">Votre ambition</h3>
            <AmbitionEditor target="entreprise" initialText={company.ambitionText ?? company.objective ?? ""} />
          </section>
          {company.googlePlaceId && <GooglePlaceLine link={placeMapsLink(company.googlePlaceId)} />}
          {company.facebookPageUrl && <FacebookPageLine url={company.facebookPageUrl} />}
          <h2>Consigne durable</h2>
          <p>Relue par Paul et les agents à chaque préparation. Pour une question ou un échange, utilisez la conversation avec Paul.</p>
          <DirectionForm initialDirection={company.direction} />
        </section>
        <section className="setting-section">
          <h2>Connexions</h2>
          {channels.map((channel) => (
            <div key={channel.name} className="connection">
              <span><strong>{channel.name}</strong><small>{channel.detail}</small></span>
              {channel.connected ? <span className="tag green">Connecté</span> : <Link className="btn" href="/connexions">Connecter</Link>}
            </div>
          ))}
          <p><Link href="/connexions">Gérer les connexions →</Link></p>
          <h2>Retours retenus</h2>
          <p>{feedback.length ? "Préférences confirmées par vous :" : "Aucune nouvelle préférence confirmée."}</p>
          <ul className="feedback-list">{feedback.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      </div>
      <div style={{ marginTop: 40 }}>
        <SitePhotos initialPhotos={sitePhotos} available={sitePhotoStorage.isConfigured()} siteSlug={company.siteHtml ? company.siteSlug : null} />
      </div>
      <div style={{ marginTop: 40 }}>
        <CompanyProfileForm embedded initialTab={tab === "objectifs" ? "objectifs" : "informations"} />
      </div>
    </AppShell>
  );
}
