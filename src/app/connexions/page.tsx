import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { facebookConnectionView, isMetaOAuthConfigured, META_ERROR_MESSAGES } from "@/lib/oauth/meta";
import { decryptGmailAccount, isGmailConfigured } from "@/lib/oauth/gmail";
import { LINKEDIN_ERROR_MESSAGES } from "@/lib/oauth/linkedin";
import { isChannelEnabled } from "@/lib/missions/channels";
import { asDelegationLevel } from "@/lib/delegation-level";
import { readChannelAccess } from "@/lib/channel-access";
import { formatMoment } from "@/lib/contents/publish";
import { FacebookPanel } from "./facebook-panel";
import { GmailPanel } from "./gmail-panel";
import { DelegationPanel } from "./delegation-panel";
import { ReturnToContent } from "./return-to-content";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  ...LINKEDIN_ERROR_MESSAGES,
  channel_unavailable: "Ce canal n'est pas disponible pour votre compte. Demandez l'accès depuis cette page.",
  google_denied: "L'autorisation Google a été refusée ou annulée. Votre connexion précédente, si elle existe, est conservée.",
  oauth_state: "Cette demande Google a expiré ou n'est pas valide. Recommencez depuis cette page.",
  oauth_exchange: "Google n'a pas pu confirmer l'autorisation. Recommencez ; votre connexion précédente, si elle existe, est conservée.",
  ...META_ERROR_MESSAGES,
};

const CONNECTED: Record<string, string> = {
  gmail: "Gmail relié. Rien n'a été envoyé.",
  facebook_selection: "Accès Facebook autorisé. Choisissez la Page à relier.",
};

async function readConnections(companyId: string) {
  const connections = await prisma.channelConnection.findMany({ where: { companyId } });
  return { connections, checkedAt: Date.now() };
}

/**
 * Entreprise › Canaux & délégation (§13.5, stories 13.1 et 13.2, #293 #301 #10) : une ligne par canal actif,
 * son état, ses programmations et sa déconnexion ; le site vitrine ; le site lu pour l'analyse ; la délégation.
 * Un canal désactivé n'apparaît pas et ne se connecte pas (§5.6).
 */
export default async function ConnexionsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; retour?: string }> }) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const { connected, error, retour } = await searchParams;

  const [{ connections, checkedAt }, scheduled, sitePages, facebookAccess, gmailAccess] = await Promise.all([
    readConnections(company.id),
    prisma.publication.findMany({ where: { companyId: company.id, status: "scheduled" }, orderBy: { scheduledAt: "asc" }, include: { content: { select: { mission: { select: { title: true } } } } } }),
    prisma.sitePage.findMany({ where: { companyId: company.id }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true } }),
    readChannelAccess(company.id, "facebook"),
    readChannelAccess(company.id, "gmail"),
  ]);
  const byChannel = new Map(connections.map((connection) => [connection.channel, connection]));
  const scheduledOn = (channel: string) => scheduled
    .filter((publication) => publication.channel === channel)
    .map((publication) => `${publication.content.mission.title} · V${publication.versionNumber} · le ${publication.scheduledAt ? formatMoment(publication.scheduledAt, publication.timezone ?? "Europe/Paris") : "—"}`);
  let gmailEmail: string | null = null;
  const gmail = byChannel.get("gmail");
  try {
    if (gmail?.refreshToken) gmailEmail = decryptGmailAccount(gmail.refreshToken, company.id).email;
  } catch {
    gmailEmail = null;
  }

  return (
    <AppShell {...await getShellProps(company)}>
      <div className="settings-stack">
        <PageHeading
          kicker="Entreprise"
          title="Canaux & délégation"
          description="Les canaux où BienDecider peut diffuser pour vous, et ce qu'il peut faire sans vous redemander. Relier un compte ne publie rien : chaque diffusion reste confirmée par vous."
          actions={<Link className="btn" href="/entreprise">Mon entreprise</Link>}
        />
        <ReturnToContent retour={retour ?? null} />
        {connected && <p role="status" className="notice">{CONNECTED[connected] ?? "Compte relié. Rien n'a été diffusé."}</p>}
        {error && <p role="alert" className="warning">{ERRORS[error] ?? "La connexion a échoué. Réessayez ou contactez le support."}</p>}

        {isChannelEnabled("facebook") && <FacebookPanel configured={isMetaOAuthConfigured()} view={facebookConnectionView(byChannel.get("facebook"), company.id, checkedAt)} access={facebookAccess} scheduled={scheduledOn("facebook")} />}

        {isChannelEnabled("gmail") && (
          <GmailPanel
            configured={isGmailConfigured()}
            authorized={gmail?.status === "connecte" && gmailEmail !== null}
            failed={gmail?.status === "erreur" || (Boolean(gmail) && !gmailEmail)}
            senderEmail={gmailEmail}
            access={gmailAccess}
            scheduled={scheduledOn("gmail")}
          />
        )}

        <section className="setting-section" aria-labelledby="site-heading">
          <h2 id="site-heading">Site vitrine · adresse publique</h2>
          {company.siteSlug && sitePages.length > 0 ? (
            <>
              <p className="text-sm">{sitePages.length} page{sitePages.length > 1 ? "s" : ""} en ligne :</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {sitePages.map((page) => <li key={page.slug}><a href={`/site/${company.siteSlug}/${page.slug}`} target="_blank" rel="noopener noreferrer">{page.title}</a> · /site/{company.siteSlug}/{page.slug}</li>)}
              </ul>
            </>
          ) : <p className="text-sm">Aucune page en ligne pour le moment : la première page diffusée crée l&apos;adresse de votre site.</p>}
          {scheduledOn("site").length > 0 && <p className="mt-1 text-xs">{scheduledOn("site").length} programmation{scheduledOn("site").length > 1 ? "s" : ""} en cours</p>}
          <p className="mt-2 text-xs text-slate-600">Toujours disponible : BienDecider héberge votre site vitrine, aucune connexion n&apos;est nécessaire.</p>
        </section>

        <section className="setting-section" aria-labelledby="analysis-heading">
          <h2 id="analysis-heading">Votre site actuel · lu pour l&apos;analyse</h2>
          <p className="text-sm">{company.website ? <span className="break-all">{company.website}</span> : "Aucun site indiqué."} Ce n&apos;est pas un canal de diffusion : Paul le lit pour son diagnostic. <Link href="/entreprise">Modifier</Link></p>
        </section>

        <DelegationPanel level={asDelegationLevel(company.delegationLevel)} />

        <p className="legend">Instagram, LinkedIn et la fiche Google ne sont pas encore disponibles : BienDecider ne sait pas encore y diffuser, ils ne sont donc pas proposés.</p>
      </div>
    </AppShell>
  );
}
