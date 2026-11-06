import { Suspense, cache } from "react";
import Link from "next/link";
import { PERSONAS } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { PublicShell, SECONDARY_LINK } from "@/components/public-shell";
import { getSessionEmail } from "@/lib/session";

/**
 * Page de découverte (#310, FR-1, charte §7) : un seul récit, dans l'ordre du parcours.
 * Promesse → Paul → un exemple concret → vous gardez la main → six étapes → commencer.
 * Paul est le seul personnage présenté (D3). Le détail par canal est sur /canaux (#224).
 */

// Parcours d'entrée : l'inscription actuelle, en attendant /bienvenue (#279).
const START_HREF = "/signup";
const SPACE_HREF = "/strategie";

// Exemple d'illustration : données inventées, aucune entreprise cliente (#88).
const EXAMPLE_PLAN: { title: string; detail: string }[] = [
  { title: "Faire parler vos réalisations", detail: "Un chantier documenté, publié sur votre Page Facebook." },
  { title: "Ouvrir la porte des agences locales", detail: "Un message individuel à deux agences, sans relance automatique." },
  { title: "Renouer avec d'anciens prospects", detail: "Huit contacts recontactables, vérifiés avant tout envoi." },
];

const CONTROL = [
  { title: "Vous fixez l’objectif", text: "« +20 % de chiffre d’affaires en 12 mois, sans embaucher » : Paul construit le plan à partir de votre but, pas d’une liste de conseils." },
  { title: "Vous relisez chaque contenu", text: "Un contenu à la fois : vous validez, vous modifiez ou vous refusez. Une fois diffusé, il ne bouge plus : toute retouche crée une nouvelle version." },
  { title: "Rien ne part sans vous", text: "Chaque publication ou envoi attend votre confirmation explicite. Connecter un compte ne déclenche jamais rien." },
];

const LOOP = [
  "Vous présentez votre entreprise et votre cap",
  "Paul propose trois missions ; vous choisissez celles que vous lancez",
  "Un contenu est préparé dans l’atelier",
  "Vous le relisez, le validez, puis confirmez la diffusion",
  "Vous notez les résultats obtenus",
  "Vous décidez : poursuivre, adapter ou arrêter",
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

function StartAction({ withAccountLink }: { withAccountLink: boolean }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <Link href={START_HREF} className={PRIMARY_BUTTON}>C&apos;est parti</Link>
      {withAccountLink && (
        <p className="text-sm text-slate-700">
          Vous avez déjà un compte ? <Link href="/login" className="font-medium text-slate-900 underline">Retrouver mon compte</Link>
        </p>
      )}
    </div>
  );
}

function SpaceAction() {
  return (
    <div className="mt-6 flex justify-center">
      <Link href={SPACE_HREF} className={PRIMARY_BUTTON}>Retourner à mon espace</Link>
    </div>
  );
}

// Seuls ces blocs dépendent de la session : le reste de l'accueil s'affiche sans attendre.
async function HeaderAction() {
  return (await isSignedIn()) ? (
    <Link href={SPACE_HREF} className={SECONDARY_LINK}>Mon espace</Link>
  ) : (
    <Link href="/login" className={SECONDARY_LINK}>Retrouver mon compte</Link>
  );
}

async function CallToAction({ withAccountLink }: { withAccountLink: boolean }) {
  return (await isSignedIn()) ? <SpaceAction /> : <StartAction withAccountLink={withAccountLink} />;
}

export default function LandingPage() {
  const paul = PERSONAS.co_ceo;
  return (
    <PublicShell headerAction={<Suspense fallback={<Link href="/login" className={SECONDARY_LINK}>Retrouver mon compte</Link>}><HeaderAction /></Suspense>}>
      {/* 1. La promesse */}
      <section className="landing-hero" aria-labelledby="promesse">
        <h1 id="promesse" className="text-4xl font-semibold leading-tight sm:text-5xl">Vous décidez. Votre activité avance.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-700">
          Paul prépare le travail pour atteindre votre objectif : plan, messages, visuels, prospection. Vous gardez le dernier mot.
        </p>
        <Suspense fallback={<StartAction withAccountLink />}>
          <CallToAction withAccountLink />
        </Suspense>
      </section>

      {/* 2. Paul, seul copilote */}
      <section className="landing-team" aria-labelledby="copilote">
        <h2 id="copilote" className="sr-only">Votre copilote</h2>
        <div className="landing-paul">
          <PersonaAvatar agentKey="co_ceo" size={64} />
          <p>
            <span className="landing-agent-name">{paul.name}</span>
            <span className="block text-base text-slate-700">votre copilote unique : il comprend, recommande, prépare et apprend avec vous.</span>
          </p>
        </div>
      </section>

      {/* 3. Un exemple concret */}
      <section className="landing-band" aria-labelledby="exemple">
        <p className="text-xs font-semibold uppercase text-indigo-700">Un exemple concret</p>
        <h2 id="exemple" className="mt-3 text-2xl font-semibold">Une entreprise de rénovation qui veut plus de projets</h2>
        <p className="mt-1 text-base text-slate-700">
          Objectif : <strong className="font-medium text-slate-900">+20 % de chiffre d&apos;affaires en 12 mois</strong>.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Le plan proposé par Paul</h3>
            <ol className="mt-3 space-y-4">
              {EXAMPLE_PLAN.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{i + 1}</span>
                  <span>
                    <span className="block font-medium">{step.title}</span>
                    <span className="block text-sm text-slate-700">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Un contenu prêt à relire</h3>
            <div className="landing-production mt-3">
              <p className="flex items-center gap-2 text-sm text-slate-700"><PersonaAvatar agentKey="co_ceo" size={24} /><span><strong className="text-slate-900">Paul</strong> prépare un post Facebook</span></p>
              <p className="mt-3 text-base">
                Un projet de rénovation commence par une maison que l&apos;on connaît et des priorités bien définies. Parlons de votre projet.
              </p>
              <p className="mt-3 text-sm text-slate-700">Vous validez le texte, puis confirmez sa publication sur votre Page.</p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-700">Exemple d&apos;illustration, aucune donnée client</p>
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

      {/* 5. Six étapes, une seule boucle */}
      <section className="landing-band" aria-labelledby="parcours">
        <p className="text-xs font-semibold uppercase text-indigo-700">De bout en bout</p>
        <h2 id="parcours" className="mt-3 text-2xl font-semibold">Six étapes, une seule boucle</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {LOOP.map((text, i) => (
            <li key={text} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{i + 1}</span>
              <span className="text-base">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Commencer */}
      <section className="landing-final" aria-labelledby="commencer">
        <h2 id="commencer" className="text-2xl font-semibold">Quel est votre objectif ?</h2>
        <p className="mt-2 text-base text-slate-700">Dites-le à Paul : il s&apos;occupe du reste, vous décidez.</p>
        <Suspense fallback={<StartAction withAccountLink={false} />}>
          <CallToAction withAccountLink={false} />
        </Suspense>
      </section>
    </PublicShell>
  );
}
