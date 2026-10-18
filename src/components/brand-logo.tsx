/** Logo de la maquette : pastille « b. » et mot-symbole Sora. */
export function BrandLogo({ light = false, slogan = false }: { light?: boolean; slogan?: boolean }) {
  return (
    <span className={`brand-logo ${light ? "brand-logo-light" : ""}`}>
      <span className="brand-mark" aria-hidden="true">b.</span>
      <span><span className="brand-wordmark">BienDecider<span aria-hidden="true">.</span></span>
        {slogan && <span className="brand-slogan">Vous décidez. Votre activité avance.</span>}
      </span>
    </span>
  );
}