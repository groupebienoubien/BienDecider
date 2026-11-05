import { ResetPasswordForm } from "./reset-password-form";

// Le jeton vient du lien de l'e-mail ; il n'est consommé qu'à l'envoi du formulaire.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : ""} />;
}
