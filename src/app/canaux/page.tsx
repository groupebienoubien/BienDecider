import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";

export const metadata: Metadata = {
  description: "Ce que BienDecider publie ou envoie, toujours après votre confirmation, et ce que vous faites vous-même, canal par canal.",
};

// Ordre de lecture : d'abord ce que BienDecider diffuse, puis ce que vous publiez vous-même.
const CHANNELS = [
  CHANNEL_CAPABILITIES.site,
  CHANNEL_CAPABILITIES.facebook,
  CHANNEL_CAPABILITIES.gmail,
  CHANNEL_CAPABILITIES.instagram,
  CHANNEL_CAPABILITIES.linkedin,
  CHANNEL_CAPABILITIES.googleBusiness,
  CHANNEL_CAPABILITIES.prospecting,
];

export default function CanauxPage() {
  return (
    <PublicShell>
      <section className="py-8" aria-labelledby="canaux">
        <p className="text-xs font-semibold uppercase text-indigo-700">Transparence</p>
        <h1 id="canaux" className="mt-3 text-3xl font-semibold sm:text-4xl">Ce que fait chaque canal</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          L’équipe prépare le travail pour tous les canaux. BienDecider ne publie ou n’envoie que là où c’est disponible, et toujours après votre confirmation. Ailleurs, vous copiez le contenu préparé et le publiez vous-même.
        </p>
        <ul className="channels-grid mt-8">
          {CHANNELS.map((channel) => {
            const byUs = channel.publishedBy === "biendecider";
            return (
              <li key={channel.label} className={`channel-card ${byUs ? "by-us" : "by-you"}`}>
                <h2 className="text-lg font-semibold">{channel.label}</h2>
                <p className="channel-badge">{byUs ? "Diffusé par BienDecider, après votre confirmation" : "Préparé par l’équipe, publié par vous"}</p>
                <p className="mt-3 text-sm text-slate-700"><span className="font-medium text-slate-900">BienDecider : </span>{channel.availability}</p>
                <p className="mt-2 text-sm text-slate-700"><span className="font-medium text-slate-900">Vous : </span>{channel.nextStep}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 max-w-2xl text-sm text-slate-600">
          Cette page suit l’état réel des connecteurs : un canal n’y apparaît comme diffusé par BienDecider qu’une fois le connecteur livré. Une connexion à un compte ne déclenche jamais de publication à elle seule.{" "}
          <Link href="/confidentialite" className="font-medium text-slate-800 underline">Comment vos données sont traitées</Link>
        </p>
      </section>
    </PublicShell>
  );
}
