import Link from "next/link";

export function CompanySections({ active, onProfileTab }: {
  active: "informations" | "objectifs" | "equipe" | "connexions";
  onProfileTab?: (tab: "informations" | "objectifs") => void;
}) {
  return <nav className="section-tabs" aria-label="Rubriques de mon entreprise">
    {([['informations', 'Informations'], ['objectifs', 'Objectifs']] as const).map(([tab, label]) => onProfileTab
      ? <button key={tab} type="button" aria-current={active === tab ? "page" : undefined} onClick={() => onProfileTab(tab)}>{label}</button>
      : <Link key={tab} href={`/entreprise${tab === "objectifs" ? "?tab=objectifs" : ""}`} aria-current={active === tab ? "page" : undefined}>{label}</Link>)}
    <Link href="/equipe" aria-current={active === "equipe" ? "page" : undefined}>Équipe</Link>
    <Link href="/connexions" aria-current={active === "connexions" ? "page" : undefined}>Connexions</Link>
  </nav>;
}