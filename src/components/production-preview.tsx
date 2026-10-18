import { proposalChannel } from "@/lib/proposal-channel";

function companyInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toLocaleUpperCase()).join("");
}

/** Aperçu de la production selon son canal (Facebook, mail, site), comme dans la maquette. */
export function ProductionPreview({ kind, title, content, version, companyName, siteDestination }: {
  kind: string;
  title: string;
  content: string;
  version: number;
  companyName: string;
  siteDestination?: string | null;
}) {
  const channel = proposalChannel(kind);
  if (channel === "Facebook") {
    return (
      <div className="preview">
        <div className="social-header"><span className="company-avatar" aria-hidden="true">{companyInitials(companyName)}</span><div><strong>{companyName}</strong><small>Page Facebook · Public</small></div></div>
        <div className="social-copy">{content}</div>
        <div className="social-footer"><span>J’aime</span><span>Commenter</span><span>Partager</span></div>
      </div>
    );
  }
  if (channel === "Gmail") {
    let recipient: string | null = null;
    let text = content;
    if (kind === "gmail_email") {
      try {
        const message: unknown = JSON.parse(content);
        if (message && typeof message === "object" && "to" in message && "text" in message && typeof message.to === "string" && typeof message.text === "string") {
          recipient = message.to;
          text = message.text;
        }
      } catch { /* contenu brut conservé */ }
    }
    return (
      <div className="preview">
        <div className="email-meta">
          {recipient && <div><span>À</span> {recipient}</div>}
          <div><span>Objet</span> {title}</div>
        </div>
        <div className="email-copy">{text}</div>
      </div>
    );
  }
  if (channel === "Site") {
    return (
      <div className="preview site-preview">
        <div className="site-nav">{companyName.toLocaleUpperCase()} <span>Collection / Contact</span></div>
        <h3>{title}</h3>
        <p>{content}</p>
        <div className="social-footer">{siteDestination ?? "Site public de votre entreprise"} · Version {version}</div>
      </div>
    );
  }
  return (
    <div className="preview">
      <div className="email-copy">{content}</div>
    </div>
  );
}
