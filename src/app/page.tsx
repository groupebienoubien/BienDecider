import { Suspense, cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/components/brand-logo";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getSessionEmail } from "@/lib/session";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

const TEAM: AgentKey[] = ["co_ceo", "marketing", "contenu", "demarchage"];

// Exemple de démonstration : données inventées, aucune entreprise cliente (#86, #88).
const EXAMPLE_PLAN = [
  { title: "Créer un site d'une page", detail: "Zone d'intervention, dépannage urgent et numéro direct." },
  { title: "Publier deux posts par semaine", detail: "Chantiers récents et conseils d'entretien sur la Page Facebook." },
  { title: "Contacter 15 syndics du secteur", detail: "Liste de prospects et message de présentation préparés." },
];

// Promesse par livrable : les agents préparent, et n'agissent au nom du dirigeant que sur sa décision.
const CAPABILITIES = [
  {
    deliverable: "Diagnostic et plan d'action",
    us: "L'équipe analyse votre présence en ligne et Paul propose des priorités.",
    you: "Vous choisissez les activités à confier aux agents.",
  },
  {
    deliverable: CHANNEL_CAPABILITIES.site.label,
    us: "BienDecider prépare le contenu et peut mettre le site en ligne.",
    you: CHANNEL_CAPABILITIES.site.nextStep,
  },
  {
    deliverable: "Publications sur les réseaux",
    us: "L'équipe prépare vos textes. La publication Facebook est disponible sur une Page reliée et vérifiée.",
    you: "Pour les autres réseaux, vous copiez le texte et le publiez vous-même. Instagram, LinkedIn et Google ne sont pas publiés par BienDecider.",
  },
  {
    deliverable: CHANNEL_CAPABILITIES.prospecting.label,
    us: "Jean-Claude prépare des pistes et des modèles de message, sans envoyer de prospection.",
    you: "Vous vérifiez la source, choisissez qui contacter et envoyez vous-même le message.",
  },
];

const STEPS = [
  { n: "1", title: "Vous donnez l'objectif", text: "« 10 demandes de devis par mois ». Votre métier, votre zone, votre site s'il existe. Environ 5 minutes." },
  { n: "2", title: "Paul fait le plan", text: "Votre partenaire de croissance analyse votre situation et propose quelques actions, confiées à son équipe." },
  { n: "3", title: "L'équipe prépare", text: "Site, posts, prospection : chaque agent prépare le travail concret." },
  { n: "4", title: "Vous relisez et décidez", text: "Le site et les publications Facebook peuvent être mis en ligne après approbation et confirmation. Pour les autres canaux, vous copiez et publiez vous-même. Gmail envoie uniquement le message que vous avez confirmé." },
];

// Une seule vérification par requête, partagée par l'en-tête et le bloc principal.
const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    return (await getSessionEmail()) !== null;
  } catch {
    // L'accueil reste disponible même si la session ne peut pas être vérifiée.
    return false;
  }
});

const SECONDARY_LINK = "rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200";
const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-6 text-base font-medium text-white hover:bg-indigo-700";

function SignedOutActions() {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/signup" className={PRIMARY_BUTTON}>
          Créer mon compte
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-slate-800 hover:bg-slate-100"
        >
          J&apos;ai déjà un compte
        </Link>
      </div>
    </>
  );
}

// Seuls ces deux blocs dépendent de la session : le reste de l'accueil s'affiche sans attendre.
async function HeaderAction() {
  return (await isSignedIn()) ? (
    <Link href="/dashboard" className={SECONDARY_LINK}>Mon espace</Link>
  ) : (
    <Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>
  );
}

async function HeroActions() {
  if (!(await isSignedIn())) return <SignedOutActions />;
  return (
    <div className="mt-6">
      <Link href="/dashboard" className={PRIMARY_BUTTON}>
        Accéder à mon espace
      </Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-page min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link>
          <Suspense fallback={<Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>}>
            <HeaderAction />
          </Suspense>
        </header>

        <section className="landing-hero" aria-labelledby="promesse">
          <p className="text-xs font-semibold uppercase text-indigo-700">L&apos;équipe IA des indépendants et des TPE</p>
          <h1 id="promesse" className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">BienDecider</h1>
          <p className="landing-tagline">Vous décidez. Votre activité avance.</p>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">Les bonnes priorités. Le travail préparé. Le dernier mot pour vous.</p>
          <Suspense fallback={<SignedOutActions />}>
            <HeroActions />
          </Suspense>
          <div className="landing-preview">
            <Image src="/brand/workspace-preview.png" alt="Aperçu BienDecider : décisions à examiner, plan d’action et activité récente d’une entreprise fictive" width={1440} height={960} priority sizes="(max-width: 768px) 100vw, 1100px" />
          </div>
          <p className="mt-2 text-xs text-slate-600">Exemple fictif, aucune donnée client</p>
        </section>

        <section className="landing-band" aria-labelledby="exemple">
          <p className="text-xs font-semibold uppercase text-indigo-700">Du concret, pas une liste de conseils</p>
          <h2 id="exemple" className="mt-3 text-xl font-semibold">Un plombier qui veut plus de demandes de devis</h2>
          <p className="mt-1 text-base text-slate-600">
            Objectif : <strong className="font-medium text-slate-900">10 demandes de devis par mois</strong>.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Le plan proposé par Paul</h3>
              <ol className="mt-3 space-y-3">
                {EXAMPLE_PLAN.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-medium">{step.title}</span>
                      <span className="block text-sm text-slate-600">{step.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Une production à relire</h3>
              <div className="mt-3 border-l-2 border-indigo-300 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Post Facebook · préparé par Camille</p>
                <p className="mt-2 text-base">
                  Fuite sous l&apos;évier un dimanche ? Nous intervenons sur toute l&apos;agglomération, 7 jours sur 7.
                  Devis gratuit avant chaque intervention.
                </p>
                <p className="mt-3 text-sm font-medium text-slate-900">À vérifier avant de publier :</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  <li>la disponibilité 7 jours sur 7</li>
                  <li>la gratuité du devis</li>
                </ul>
                <p className="mt-3 text-sm text-slate-600">
                  Vous approuvez le texte, puis confirmez sa publication sur la Page Facebook choisie.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-band" aria-labelledby="qui-fait-quoi">
          <h2 id="qui-fait-quoi" className="text-xl font-semibold">Ce que BienDecider fait pour vous</h2>
          <p className="mt-1 text-base text-slate-600">
            Les agents préparent tout le travail. Ils n&apos;agissent en votre nom que sur votre décision.
          </p>
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {CAPABILITIES.map((c) => (
              <li key={c.deliverable} className="grid gap-2 p-4 sm:grid-cols-[1fr_1.4fr_1.4fr] sm:gap-4">
                <h3 className="font-medium">{c.deliverable}</h3>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-indigo-700">BienDecider : </span>
                  {c.us}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Vous : </span>
                  {c.you}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-band" aria-labelledby="etapes">
          <h2 id="etapes" className="text-xl font-semibold">Comment ça marche</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t-2 border-indigo-200 py-5">
                <span className="text-sm font-semibold text-indigo-700">Étape {s.n}</span>
                <h3 className="mt-1 font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-band" aria-labelledby="equipe">
          <h2 id="equipe" className="text-xl font-semibold">L&apos;équipe qui prépare le travail</h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TEAM.map((key) => (
              <li key={key} className="flex flex-col items-center text-center">
                <PersonaAvatar agentKey={key} size={48} />
                <span className="mt-2 text-sm font-medium">{PERSONAS[key].name}</span>
                <span className="text-sm text-slate-600">{PERSONAS[key].role}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-sm text-slate-600">
          Une connexion à un compte ne confie pas une activité et ne déclenche pas de publication. Chaque envoi ou mise en ligne disponible demande votre confirmation. Vous ne saisissez jamais le mot de passe de vos comptes fournisseurs chez nous.{" "}
          <Link href="/confidentialite" className="font-medium text-slate-800 underline">
            Comment vos données sont traitées
          </Link>
        </p>

        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <Link href="/cgu" className="py-1 hover:underline">Conditions d&apos;utilisation</Link>
          <Link href="/confidentialite" className="py-1 hover:underline">Confidentialité</Link>
          <Link href="/mentions-legales" className="py-1 hover:underline">Mentions légales</Link>
          <a href="mailto:contact@biendecider.com" className="py-1 hover:underline">Contact</a>
        </footer>
      </div>
    </main>
  );
}
