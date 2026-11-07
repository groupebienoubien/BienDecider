import { redirect } from "next/navigation";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { getSessionCompany } from "@/lib/session";

/**
 * Ancienne étape de profil (#279) : sans session, le parcours d'entrée ; avec une entreprise nommée, la stratégie.
 * Seul un ancien compte sans nom garde ce formulaire ; il n'est jamais renvoyé dans /bienvenue.
 */
export default async function OnboardingPage() {
  const company = await getSessionCompany();
  if (!company) redirect("/bienvenue");
  if (company.name) redirect("/strategie");
  return <CompanyProfileForm guided />;
}
