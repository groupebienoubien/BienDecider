import { SectionTitle, Tag } from "@/components/mockup-ui";
import type { CoverageItem } from "@/lib/source-coverage";

/** Ce que le dernier diagnostic a réellement lu, enregistré par le code : jamais une déclaration du modèle. */
export function SourceCoverage({ items }: { items: CoverageItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Sources lues pour ce diagnostic">
      <SectionTitle title="Sources lues pour ce diagnostic" />
      <ul className="feedback-list">
        {items.map((item) => (
          <li key={item.id}>
            <Tag color={item.status === "lue" ? "green" : "gray"}>{item.status === "lue" ? "Lue" : "Non lue"}</Tag> <strong>{item.label}</strong> · {item.detail}
          </li>
        ))}
      </ul>
      <p className="legend">Source des avis : Google Maps. Source des informations de la Page : Facebook, par votre connexion. Pour le site et les autres réseaux sociaux, l’état de consultation est indiqué dans chaque constat, tel que déclaré par l’analyse.</p>
    </section>
  );
}
