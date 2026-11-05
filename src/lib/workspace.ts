import { redirect } from "next/navigation";
import { getSessionCompany } from "@/lib/session";

/**
 * Espace V5.2 (Stratégie, Missions, Atelier, Résultats), activé entreprise par entreprise pendant la bascule
 * (addendum §1.7). Sans drapeau, l'ancien parcours reste en service et les nouvelles pages renvoient vers lui.
 */
export async function requireWorkspaceCompany() {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  if (!company.workspaceV52) redirect("/dashboard");
  return company;
}

/** Ancienne adresse : redirige vers sa page V5.2 quand l'espace V5.2 est actif (addendum §9). */
export function redirectToWorkspace(company: { workspaceV52: boolean } | null, path: string) {
  if (company?.workspaceV52) redirect(path);
}

/** Prénom pour « Bonjour {prénom}. » : premier mot du nom saisi, sinon rien. */
export function firstNameOf(ownerName: string | null): string | null {
  const first = ownerName?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}
