import { Suspense, cache, type CSSProperties } from "react";
import Link from "next/link";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { PublicShell, SECONDARY_LINK } from "@/components/public-shell";
import { getSessionEmail } from "@/lib/session";

/**
 * Accueil public (#86, charte section 7) : un seul récit, dans l'ordre du parcours.
 * Promesse → l'équipe → un exemple concret → vous gardez la main → créer son compte.
 * Le détail par canal est sur /canaux (#224).
 */
const TEAM: { key: AgentKey; does: string }[] = [
  { key: "co_ceo", does: "fixe l’objectif avec vous et décide des priorités" },
  { key: "marketing", does: "analyse votre présence en ligne et vos concurrents" },
  { key: "contenu", does: "écrit vos posts et votre site" },
  { key: "demarchage", does: "trouve des clients à contacter" },
];

// Exemple de démonstration : données inventées, aucune entreprise cliente (#86, #88).
const EXAMPLE_PLAN: { agent: AgentKey; title: string; detail: string }[] = [
  { agent: "contenu", title: "Créer un site d'une page", detail: "Zone d'intervention, dépannage urgent et numéro direct." },
  { agent: "contenu", title: "Publier deux posts par semaine", detail: "Chantiers récents et conseils d'entretien sur la Page Facebook." },
  { agent: "demarchage", title: "Contacter 15 syndics du secteur", detail: "Liste de prospects et message de présentation préparés." },
];

const CONTROL = [
  { title: "Vous fixez l’objectif", text: "« 10 demandes de devis par mois » : Paul construit le plan à partir de votre but, pas d’une liste de conseils." },
  { title: "Vous relisez chaque production", text: "Une production à la fois : vous approuvez, modifiez ou refusez. Vos refus servent à la suivante." },
  { title: "Rien ne part sans vous", text: "Chaque publication ou envoi attend votre confirmation explicite. Une connexion à un compte ne déclenche jamais rien." },
];

// Une seule vérification par requête, partagée par l'en-tête et les appels à l'action.
const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    return (await getSessionEmail()) !== null;
  } catch {
    // L'accueil reste disponible même si la session ne peut pas être vérifiée.
    return false;
  }
});

const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-6 text-base font-medium text-white hover:bg-indigo-700";
const OUTLINE_BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-slate-800 hover:bg-slate-100";

function SignedOutActions() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <Link href="/signup" className={PRIMARY_BUTTON}>Créer mon compte</Link>
      <Link href="/login" className={OUTLINE_BUTTON}>J&apos;ai déjà un compte</Link>
    </div>
  );
}

// Seuls ces blocs dépendent de la session : le reste de l'accueil s'affiche sans attendre.
async function HeaderAction() {
  return (await isSignedIn()) ? (
    <Link href="/dashboard" className={SECONDARY_LINK}>Mon espace</Link>
  ) : (
    <Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>
  );
}

async function CallToAction() {
  if (!(await isSignedIn())) return <SignedOutActions />;
  return (
    <div className="mt-6">
      <Link href="/dashboard" className={PRIMARY_BUTTON}>Accéder à mon espace</Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <PublicShell headerAction={<Suspense fallback={<Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>}><HeaderAction /></Suspense>}>
      {/* 1. La promesse */}
      <section className="landing-hero" aria-labelledby="promesse">
        <p className="text-xs font-semibold uppercase text-indigo-700">L&apos;équipe IA des indépendants et des TPE</p>
        <h1 id="promesse" className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Vous décidez. Votre activité avance.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-700">
          Paul et son équipe préparent le travail pour atteindre votre objectif : plan, site, posts, prospection. Vous gardez le dernier mot.
        </p>
        <Suspense fallback={<SignedOutActions />}>
          <CallToAction />
        </Suspense>
      </section>

      {/* 2. L'équipe, dès le haut de page */}
      <section className="landing-team" aria-labelledby="equipe">
        <h2 id="equipe" className="sr-only">L&apos;équipe qui prépare le travail</h2>
        <ul className="landing-team-grid">
          {TEAM.map(({ key, does }) => (
            <li key={key} className="landing-agent" style={{ "--agent": `var(--bd-agent-${key})` } as CSSProperties}>
              <PersonaAvatar agentKey={key} size={64} />
              <span className="landing-agent-name">{PERSONAS[key].name}</span>
              <span className="text-sm text-slate-700">{does}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Un exemple concret */}
      <section className="landing-band" aria-labelledby="exemple">
        <p className="text-xs font-semibold uppercase text-indigo-700">Un exemple concret</p>
        <h2 id="exemple" className="mt-3 text-2xl font-semibold">Un plombier qui veut plus de demandes de devis</h2>
        <p className="mt-1 text-base text-slate-600">
          Objectif : <strong className="font-medium text-slate-900">10 demandes de devis par mois</strong>.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Le plan proposé par Paul</h3>
            <ol className="mt-3 space-y-4">
              {EXAMPLE_PLAN.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{i + 1}</span>
                  <span>
                    <span className="block font-medium">{step.title}</span>
                    <span className="block text-sm text-slate-600">{step.detail} <strong style={{ color: `var(--bd-agent-${step.agent})` }}>· {PERSONAS[step.agent].name}</strong></span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Ce que Camille vous propose</h3>
            <div className="landing-production mt-3">
              <p className="flex items-center gap-2 text-sm text-slate-700"><PersonaAvatar agentKey="contenu" size={24} /><span><strong style={{ color: "var(--bd-agent-contenu)" }}>Camille</strong> vous propose un post Facebook</span></p>
              <p className="mt-3 text-base">
                Fuite sous l&apos;évier un dimanche ? Nous intervenons sur toute l&apos;agglomération, 7 jours sur 7. Devis gratuit avant chaque intervention.
              </p>
              <p className="mt-3 text-sm text-slate-700">Vous approuvez le texte, puis confirmez sa publication sur votre Page.</p>
            </div>
          </div>
        </div>
        <figure className="landing-capture mt-8">
          <picture>
            <source media="(max-width: 640px)" srcSet="/brand/workspace-preview-mobile.png" />
            {/* Capture du produit : l'image s'adapte à l'écran au lieu d'être rognée. */}
            <img src="/brand/workspace-preview.png" alt="Aperçu BienDecider : l’objectif d’une entreprise fictive et ce que l’équipe lui a préparé" width={1920} height={1200} loading="lazy" />
          </picture>
          <figcaption className="mt-2 text-xs text-slate-600">Exemple fictif, aucune donnée client</figcaption>
        </figure>
      </section>

      {/* 4. Vous gardez la main */}
      <section className="landing-band" aria-labelledby="controle">
        <h2 id="controle" className="text-2xl font-semibold">Vous gardez la main</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {CONTROL.map((point) => (
            <li key={point.title} className="landing-control">
              <h3 className="font-semibold">{point.title}</h3>
              <p className="mt-2 text-sm text-slate-700">{point.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-slate-700">
          <Link href="/canaux" className="font-medium text-slate-900 underline">Ce que fait chaque canal</Link>
          {" · "}
          <Link href="/confidentialite" className="font-medium text-slate-900 underline">Comment vos données sont traitées</Link>
        </p>
      </section>

      {/* 5. Créer son compte */}
      <section className="landing-final" aria-labelledby="commencer">
        <h2 id="commencer" className="text-2xl font-semibold">Quel est votre objectif ?</h2>
        <p className="mt-2 text-base text-slate-700">Dites-le à Paul en une phrase. L&apos;équipe s&apos;occupe du reste, vous décidez.</p>
        <Suspense fallback={<SignedOutActions />}>
          <CallToAction />
        </Suspense>
      </section>
    </PublicShell>
  );
}
