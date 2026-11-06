import type { JournalRow } from "@/lib/journal";

const VISIBLE = 5;
const WHEN = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function JournalTable({ rows, caption }: { rows: JournalRow[]; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="data-table journal-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Auteur</th><th scope="col">Mission</th><th scope="col">Décision</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Date"><time dateTime={row.createdAt.toISOString()}>{WHEN.format(row.createdAt)}</time></td>
              <td data-label="Auteur">{row.author}</td>
              <td data-label="Mission">{row.mission ?? "—"}</td>
              <td data-label="Décision">{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** « Décisions & traçabilité » (#41, FR-50) : tout ce qui a été fait en votre nom, des plus récentes aux plus anciennes. */
export function JournalSection({ rows }: { rows: JournalRow[] }) {
  const visible = rows.slice(0, VISIBLE);
  const rest = rows.slice(VISIBLE);
  return (
    <section className="section-space" aria-labelledby="journal-title">
      <h2 id="journal-title">Décisions &amp; traçabilité</h2>
      {rows.length === 0 ? (
        <p className="small muted">Aucune décision enregistrée pour l&apos;instant.</p>
      ) : (
        <>
          <JournalTable rows={visible} caption="Dernières décisions, des plus récentes aux plus anciennes" />
          {rest.length > 0 && (
            <details className="journal-more">
              <summary>Tout le journal ({rows.length})</summary>
              <JournalTable rows={rest} caption="Décisions plus anciennes" />
            </details>
          )}
          <p className="journal-export"><a className="btn" href="/api/journal/export" download>Exporter le journal (CSV)</a></p>
        </>
      )}
    </section>
  );
}
