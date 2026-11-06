/** Programmations annulées par une déconnexion (#10) : dites avant de confirmer. */
export function ScheduledList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-slate-600">Aucune programmation en cours sur ce canal.</p>;
  return (
    <div className="text-xs">
      <p className="font-medium">Ces programmations seront annulées :</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
