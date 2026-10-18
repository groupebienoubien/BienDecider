import Image from "next/image";

export function BrandLogo({ light = false, slogan = false }: { light?: boolean; slogan?: boolean }) {
  return (
    <span className={`brand-logo ${light ? "brand-logo-light" : ""}`}>
      <Image src={light ? "/brand/symbol-light.svg" : "/brand/symbol.svg"} width={36} height={36} alt="" priority />
      <span><span className="brand-wordmark">BienDecider<span aria-hidden="true">.</span></span>
        {slogan && <span className="brand-slogan">Vous décidez. Votre activité avance.</span>}
      </span>
    </span>
  );
}