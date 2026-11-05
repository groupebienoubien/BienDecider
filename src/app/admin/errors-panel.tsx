import { prisma } from "@/lib/prisma";

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Paris" });

/** Erreurs serveur récentes (story 8.1) : messages déjà nettoyés de tout secret à l'enregistrement. */
export async function ErrorsPanel({ now }: { now: Date }) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [count, recent] = await Promise.all([
    prisma.errorEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return (
    <section aria-labelledby="errors-heading" className="setting-section">
      <h2 id="errors-heading">Erreurs en production</h2>
      <p>{count === 0 ? "Aucune erreur serveur ces dernières 24 heures." : `${count} erreur(s) serveur ces dernières 24 heures. Les administrateurs en sont prévenus par e-mail, une fois par erreur et par heure.`}</p>
      {recent.length > 0 && (
        <table>
          <thead>
            <tr><th>Date</th><th>Route</th><th>Message</th><th>Repère</th></tr>
          </thead>
          <tbody>
            {recent.map((item) => (
              <tr key={item.id}>
                <td>{DATE.format(item.createdAt)}</td>
                <td><code>{item.method} {item.path}</code></td>
                <td style={{ whiteSpace: "pre-wrap" }}>{item.message}</td>
                <td>{item.digest ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
