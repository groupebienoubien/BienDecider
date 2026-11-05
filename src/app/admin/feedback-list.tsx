import { prisma } from "@/lib/prisma";
import { FEEDBACK_KIND_LABELS, isFeedbackKind } from "@/lib/feedback";
import { FeedbackHandledButton } from "./feedback-handled-button";

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Signalements des dirigeants, à traiter d'abord (story 7.4). Le texte est affiché tel quel, jamais interprété. */
export async function FeedbackList() {
  const items = await prisma.feedback.findMany({
    orderBy: [{ handledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 50,
    include: { company: { select: { name: true, ownerEmail: true } } },
  });
  const pending = items.filter((item) => !item.handledAt).length;
  return (
    <section aria-labelledby="feedback-heading" className="setting-section">
      <h2 id="feedback-heading">Signalements des dirigeants</h2>
      <p>{items.length === 0 ? "Aucun signalement pour le moment." : `${pending} à traiter sur ${items.length} récents.`}</p>
      {items.length > 0 && (
        <table>
          <thead>
            <tr><th>Date</th><th>Page</th><th>Type</th><th>Entreprise</th><th>Message</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} data-feedback-id={item.id}>
                <td>{DATE.format(item.createdAt)}</td>
                <td><code>{item.page}</code></td>
                <td>{isFeedbackKind(item.kind) ? FEEDBACK_KIND_LABELS[item.kind] : item.kind}</td>
                <td>{item.company.name || item.company.ownerEmail}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{item.text}</td>
                <td>{item.handledAt ? "Traité" : "À traiter"} <FeedbackHandledButton id={item.id} handled={Boolean(item.handledAt)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
