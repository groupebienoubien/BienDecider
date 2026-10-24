import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { OpenPaulButton } from "@/components/open-paul-button";
import { PageHeading } from "@/components/mockup-ui";
import { PersonaAvatar } from "@/components/persona-avatar";
import { DirectionForm } from "@/components/direction-form";
import { SitePhotos } from "@/components/site-photos";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { prisma } from "@/lib/prisma";
import { getRetainedFeedback } from "@/lib/retained-feedback";
import { getSessionCompany } from "@/lib/session";
import { getShellProps } from "@/lib/shell-data";
import { listSitePhotos, sitePhotoStorage } from "@/lib/site/photo-store";

export const dynamic = "force-dynamic";

const TEAM: { key: AgentKey; role: string }[] = [
  { key: "co_ceo", role: "Coordination" },
  { key: "marketing", role: "Diagnostic & marketing" },
  { key: "contenu", role: "Contenus & site" },
  { key: "demarchage", role: "Prospection" },
];

export default async function EntreprisePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  const { tab } = await searchParams;
  const [shell, connections, feedback, sitePhotos] = await Promise.all([
    getShellProps(company),
    prisma.channelConnection.findMany({ where: { companyId: company.id } }),
    getRetainedFeedback(company.id),
    listSitePhotos(company.id),
  ]);
  const facebook = facebookConnectionView(connections.find((connection) => connection.channel === "facebook"), company.id);
  const gmailConnected = connections.some((connection) => connection.channel === "gmail" && connection.status === "connecte");
  const channels = [
    { name: "Facebook", connected: facebook.status === "connected", detail: facebook.status === "connected" ? `Page « ${facebook.pageName} » · actif` : "Aucune autorisation" },
    { name: "Gmail", connected: gmailConnected, detail: gmailConnected ? "Envoi autorisé · actif" : "Aucune autorisation" },
    { name: "Site", connected: Boolean(company.siteSlug), detail: company.siteSlug ? `/site/${company.siteSlug} · publié` : "Aucune page publiée" },
  ];

  return (
    <AppShell {...shell}>
      <PageHeading kicker="MON ENTREPRISE" title="Le contexte commun à votre équipe." description="Informations, objectif, agents et connexions." />
      <div className="settings-grid">
        <section className="setting-section">
          <h2>{company.name}</h2>
          <p>{[company.trade, company.servingArea].filter(Boolean).join(" · ")}</p>
          <label className="field">Objectif de ce mois
            <input value={company.objective ?? ""} placeholder="Aucun objectif renseigné" readOnly />
          </label>
          <Link className="btn" href="/entreprise?tab=objectifs#modifier">Modifier l’objectif</Link>
          <h2>Votre équipe</h2>
          {TEAM.map(({ key, role }) => (
            <div key={key} className="connection">
              <span className="team-member"><PersonaAvatar agentKey={key} size={36} /><span><strong style={{ color: `var(--bd-agent-${key})` }}>{PERSONAS[key].name}</strong><small>{role}</small></span></span>
              {key === "co_ceo" ? <OpenPaulButton>Échanger</OpenPaulButton> : <Link className="btn" href={key === "marketing" ? "/diagnostic" : "/equipe"}>{key === "marketing" ? "Diagnostic" : "Demande"}</Link>}
            </div>
          ))}
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
