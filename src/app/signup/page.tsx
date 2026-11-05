import { currentSignupAvailability } from "@/lib/signup-control";
import { SignupForm } from "./signup-form";

// L'état des inscriptions change sans redéploiement : la page est lue à chaque requête.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  return <SignupForm availability={await currentSignupAvailability()} />;
}
