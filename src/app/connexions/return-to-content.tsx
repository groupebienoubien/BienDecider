"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

const KEY = "biendecider:retour-diffusion";
const noSubscription = () => () => undefined;
const isContentPath = (value: string | null): value is string => typeof value === "string" && /^\/atelier\/[A-Za-z0-9_-]{1,40}$/.test(value);

/**
 * Connexion lancée depuis une confirmation de diffusion (#293) : l'adresse du contenu est gardée pendant l'autorisation
 * chez le fournisseur, puis un lien y ramène. Rien n'est diffusé en revenant.
 */
export function ReturnToContent({ retour }: { retour: string | null }) {
  useEffect(() => {
    if (isContentPath(retour)) window.sessionStorage.setItem(KEY, retour);
  }, [retour]);
  const stored = useSyncExternalStore(noSubscription, () => window.sessionStorage.getItem(KEY), () => null);
  const target = isContentPath(retour) ? retour : isContentPath(stored) ? stored : null;
  if (!target) return null;
  return (
    <p className="notice">
      Une fois le canal connecté, revenez à votre contenu pour confirmer sa diffusion : rien ne part sans vous.{" "}
      <Link href={target} onClick={() => window.sessionStorage.removeItem(KEY)}>Revenir au contenu</Link>
    </p>
  );
}
