import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { isGoogleOAuthConfigured } from "@/lib/oauth/google";
import { facebookConnectionView, isMetaOAuthConfigured, META_ERROR_MESSAGES } from "@/lib/oauth/meta";
import { FacebookPanel } from "./facebook-panel";
import { decryptGmailAccount, isGmailConfigured } from "@/lib/oauth/gmail";
import { GmailPanel } from "./gmail-panel";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";
import { LinkedInPanel } from "./linkedin-panel";
import { decryptLinkedInAccount, isLinkedInConfigured, LINKEDIN_ERROR_MESSAGES } from "@/lib/oauth/linkedin";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";
import { CompanySections } from "@/components/company-sections";

export const dynamic = "force-dynamic";

const CHANNELS = [
  {
    channel: "google_business_profile",
    label: CHANNEL_CAPABILITIES.googleBusiness.label,
    startUrl: "/api/oauth/google/start",
    configured: isGoogleOAuthConfigured(),
    unavailable: CHANNEL_CAPABILITIES.googleBusiness.availability,
  },
] as const;

async function getConnectionSnapshot(companyId: string) {
  const connections = await prisma.channelConnection.findMany({ where: { companyId } });
  let gmailEmail: string | null = null;
  const gmail = connections.find((connection) => connection.channel === "gmail");
  try {
    if (gmail?.refreshToken) gmailEmail = decryptGmailAccount(gmail.refreshToken, companyId).email;
  } catch {
    gmailEmail = null;
  }
  return { connections, checkedAt: Date.now(), gmailEmail };
}

export default async function ConnexionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const { connected, error } = await searchParams;
  const pendingCount = await getPendingDecisionCount(company.id);

  const { connections: existing, checkedAt, gmailEmail } = await getConnectionSnapshot(company.id);
  const byChannel = new Map(existing.map((c) => [c.channel, c]));
  const linkedin = byChannel.get("linkedin");
  let linkedinName: string | null = null;
  let linkedinStatus: "authorized" | "expired" | "error" | "disconnected" = "disconnected";
  if (linkedin) {
    try {
      if (linkedin.status !== "connecte" || !linkedin.accessToken || !linkedin.expiresAt) throw new Error("Autorisation incomplète.");
      linkedinName = decryptLinkedInAccount(linkedin.accessToken, company.id).name;
      linkedinStatus = linkedin.expiresAt.getTime() <= checkedAt ? "expired" : "authorized";
    } catch {
      linkedinStatus = "error";
    }
  }
  const linkedInErrors: Record<string, string> = {
    ...LINKEDIN_ERROR_MESSAGES,
    linkedin_config: "LinkedIn n'est pas encore configuré sur ce déploiement.",
    linkedin_start: "Impossible de démarrer la connexion LinkedIn. Réessayez.",
    linkedin_state: "Cette demande LinkedIn a expiré ou n'est pas valide. Recommencez depuis Connexions.",
    linkedin_denied: "L'autorisation LinkedIn a été annulée. Votre connexion précédente, si elle existe, est conservée.",
    linkedin_exchange: "Impossible de vérifier l'identité et les permissions LinkedIn. Recommencez l'autorisation.",
    ...META_ERROR_MESSAGES,
  };
  const facebookView = facebookConnectionView(byChannel.get("facebook"), company.id, checkedAt);

  return (
    <AppShell companyName={company.name} pendingCount={pendingCount}>
      <div className="w-full">
        <h1 className="text-2xl font-semibold">Connexions</h1>
        <CompanySections active="connexions" />
        <p className="mt-2 text-sm text-gray-600">
          Relier un compte autorise un accès précis ; cela ne confie pas une activité et ne permet pas automatiquement de publier. Vous ne saisissez jamais le mot de passe de vos comptes fournisseurs ici.
        </p>
        <section className="mt-4 border-y border-slate-200 py-4" aria-labelledby="channel-capabilities">
          <h2 id="channel-capabilities" className="text-sm font-medium text-slate-900">Capacités disponibles</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {[
              CHANNEL_CAPABILITIES.gmail,
              CHANNEL_CAPABILITIES.facebook,
              CHANNEL_CAPABILITIES.site,
              CHANNEL_CAPABILITIES.googleBusiness,
              CHANNEL_CAPABILITIES.linkedin,
              CHANNEL_CAPABILITIES.instagram,
            ].map((capability) => <li key={capability.label}><span className="font-medium">{capability.label} :</span> {capability.availability}</li>)}
          </ul>
        </section>

        {connected && (
          <p role="status" className="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">
            {connected === "gmail" ? "Gmail relié. Vous pouvez rédiger et confirmer des envois individuels." : connected === "linkedin" ? "Profil LinkedIn relié. Aucune publication n'a été effectuée." : connected === "facebook_selection" ? "Accès Facebook autorisé. Choisissez la Page à relier." : "Accès Google autorisé ; la fiche établissement reste à vérifier."}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {linkedInErrors[error] ?? "La connexion a échoué. Réessayez ou contactez le support."}
          </p>
        )}

        <GmailPanel
          configured={isGmailConfigured()}
          authorized={byChannel.get("gmail")?.status === "connecte" && gmailEmail !== null}
          failed={byChannel.get("gmail")?.status === "erreur" || (byChannel.has("gmail") && !gmailEmail)}
          senderEmail={gmailEmail}
        />

        <LinkedInPanel
          configured={isLinkedInConfigured()}
          status={linkedinStatus}
          name={linkedinName}
          expiresAt={linkedin?.expiresAt?.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) ?? null}
          hasConnection={Boolean(linkedin)}
        />
        <FacebookPanel configured={isMetaOAuthConfigured()} view={facebookView} />
        <ul className="mt-6 space-y-3">
          {CHANNELS.map((c) => {
            const connection = byChannel.get(c.channel);
            const expired = connection?.expiresAt ? connection.expiresAt.getTime() <= checkedAt : false;
            const connected = connection?.status === "connecte";
            const statusLabel = connection?.status === "erreur"
              ? "Connexion à renouveler"
              : connected && expired
                ? "Connexion expirée · reliez de nouveau le compte"
                : connected
                  ? "Accès autorisé · fiche établissement à vérifier"
                  : "Compte non relié";
            return (
              <li
                key={c.channel}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-gray-500">
                    {statusLabel}
                  </p>
                  {connection?.expiresAt && <p className="mt-1 text-xs text-gray-500">Autorisation valable jusqu&apos;au {connection.expiresAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)</p>}
                  {!c.configured && (
                    <p className="mt-1 text-xs text-amber-600">
                      {c.unavailable} Aucun accès à la fiche établissement n&apos;est encore vérifié.
                    </p>
                  )}
                </div>
                {c.configured ? (
                  <a
                    href={c.startUrl}
                    className="shrink-0 rounded bg-black px-3 py-1.5 text-sm text-white"
                  >
                      {connected ? "Relier de nouveau le compte Google" : "Relier mon compte Google"}
                  </a>
                ) : (
                  <button
                    disabled
                    className="shrink-0 cursor-not-allowed rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-500"
                  >
                    Bientôt disponible
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-xs text-slate-600">
          Avant un envoi ou une publication, le canal, la destination et l&apos;étape à confirmer sont indiqués avec la proposition.
        </p>
      </div>
    </AppShell>
  );
}
