import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session";
import { loadDraft } from "@/lib/onboarding/draft";
import { emptyDraft, stepHref, type DraftState } from "@/lib/onboarding/draft-rules";

/**
 * Aiguillage du parcours (spécification §1.4) : une session ouverte mène à la stratégie ; sinon la page
 * demandée doit être celle de l'étape courante du brouillon (sans brouillon, ou brouillon expiré : l'étape 1).
 */
export async function requireDraftPage(pathname: string): Promise<DraftState> {
  if (await getSessionEmail()) redirect("/strategie");
  const state = (await loadDraft())?.state ?? emptyDraft();
  const expected = stepHref(state.step);
  if (expected !== pathname) redirect(expected);
  return state;
}
