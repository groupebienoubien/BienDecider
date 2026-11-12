import { formatReadDate, safeSourceUrl } from "@/lib/findings/certainty";
import type { MissionEvidence } from "@/lib/missions/decision-plan";

export function MissionEvidenceList({ evidence }: { evidence: MissionEvidence[] }) {
  return (
    <ul className="stack small">
      {evidence.map((item) => {
        const source = safeSourceUrl(item.source);
        return (
          <li key={item.id}>
            <span>{item.kind === "declared" ? "Vous nous avez dit" : "Observé"} : {item.fact}</span>
            {source && <> · <a href={source} target="_blank" rel="noopener noreferrer">Source</a></>}
            {item.readAt && Number.isFinite(Date.parse(item.readAt)) && <> · {formatReadDate(item.readAt)}</>}
          </li>
        );
      })}
    </ul>
  );
}
