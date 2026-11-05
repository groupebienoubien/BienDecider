import { VerifyEmailForm } from "./verify-email-form";

// Le jeton vient du lien de l'e-mail ; il n'est consommé qu'au clic (un chargement de page par un antivirus de messagerie ne l'utilise pas).
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmailForm token={typeof token === "string" ? token : ""} />;
}
