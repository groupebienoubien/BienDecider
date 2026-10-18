import { CompanyProfileForm } from "@/components/company-profile-form";
import { redirect } from "next/navigation";
import { getSessionCompany } from "@/lib/session";

export default async function EntreprisePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  const { tab } = await searchParams;
  return <CompanyProfileForm initialTab={tab === "objectifs" ? "objectifs" : "informations"} />;
}