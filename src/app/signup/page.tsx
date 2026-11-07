import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Ancienne inscription : le compte se crée désormais à la fin du parcours d'entrée (#279, addendum §9). */
export default function SignupPage() {
  redirect("/bienvenue");
}
