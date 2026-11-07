import Link from "next/link";
import { requireDraftPage } from "../guard";
import { WelcomeFrame } from "../welcome-frame";
import { AccountForm } from "../step-forms";
import { currentSignupAvailability } from "@/lib/signup-control";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE } from "@/lib/signup-rules";

/** Étape 5 (#279) : le compte est créé en dernier, puis le dirigeant arrive sur sa stratégie. */
export default async function WelcomeAccountPage() {
  const state = await requireDraftPage("/bienvenue/compte");
  const availability = await currentSignupAvailability();
  return (
    <WelcomeFrame step={5} intro={<p>{state.profile.firstName}, créez votre compte pour retrouver votre stratégie et vos trois missions.</p>}>
      {availability === "open" ? (
        <AccountForm />
      ) : (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-4 text-sm text-[var(--bd-ink)]">
          <p className="font-semibold">{availability === "closed" ? SIGNUP_CLOSED_MESSAGE : SIGNUP_FULL_MESSAGE}</p>
          <p>Vos réponses restent enregistrées jusqu&apos;à 24 heures après le début du parcours. Si vous avez déjà un compte, la connexion reste disponible.</p>
          <p><Link href="/login" className="font-semibold text-[var(--bd-brand)] underline">Retrouver mon compte</Link></p>
        </div>
      )}
    </WelcomeFrame>
  );
}
