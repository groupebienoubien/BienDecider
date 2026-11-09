import { AppShell } from "@/components/app-shell";
import { VISIT_TRACE_NOTICE, VISIT_TRACE_RETENTION_MONTHS } from "@/lib/onboarding/visit-trace-rules";

export default function ConfidentialitePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-700">
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
          <strong>Brouillon non validé juridiquement.</strong> Document généré
          automatiquement pour la phase pilote, décrivant honnêtement le
          fonctionnement actuel de l&apos;application. Une validation par un
          Délégué à la Protection des Données ou un juriste reste nécessaire
          avant toute ouverture à des utilisateurs externes, notamment pour
          confirmer la base légale de traitement et les durées de
          conservation.
        </div>

        <h1 className="text-2xl font-semibold text-slate-900">Politique de confidentialité</h1>
        <p className="mt-2 text-slate-500">Dernière mise à jour : phase pilote, 2026-10-09.</p>

        <h2 className="mt-6 font-medium text-slate-900">Qui traite vos données</h2>
        <p className="mt-1">
          [Raison sociale de l&apos;éditeur] — voir les{" "}
          <a href="/mentions-legales" className="underline">mentions légales</a>.
          Contact pour toute question relative à vos données : <a href="mailto:contact@biendecider.com" className="underline">contact@biendecider.com</a>.
        </p>

        <h2 className="mt-6 font-medium text-slate-900">Données collectées</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>Email et mot de passe (le mot de passe est stocké sous forme de hash, jamais en clair).</li>
          <li>Informations sur votre entreprise que vous saisissez (nom, métier, zone, description, téléphone, objectifs).</li>
          <li>Contenu des échanges avec les agents BienDecider (historique de conversation).</li>
          <li>Signalements que vous nous envoyez avec « Signaler un problème » : votre message, son type et la page où vous étiez, lus par l&apos;équipe BienDecider pour corriger le service ; aucune capture d&apos;écran n&apos;est jointe.</li>
          <li>Propositions générées par les agents et vos décisions de validation.</li>
          <li>Statistiques d&apos;usage (nombre de connexions, tokens et coût d&apos;appel au modèle d&apos;IA).</li>
          <li>
            Si vous autorisez un compte externe (Google, Meta) : un jeton d&apos;accès OAuth,
            sa date d&apos;expiration et, lorsque fourni, un jeton de renouvellement,
            jamais votre mot de passe sur ces plateformes.
          </li>
        </ul>

        <h2 className="mt-6 font-medium text-slate-900">Pourquoi ces données sont traitées</h2>
        <p className="mt-1">
          Pour fournir le service : analyser les informations de votre entreprise, générer des
          propositions de contenu et d&apos;actions marketing, et exécuter les fonctionnalités
          que vous utilisez. Dans le prototype actuel, la publication du site et l&apos;envoi
          Gmail exigent une validation et une confirmation explicites. Les niveaux futurs
          d&apos;autonomie et leurs limites doivent encore être décidés par les fondateurs ; ils
          ne sont pas activés dans le produit.
        </p>

        <h2 className="mt-6 font-medium text-slate-900">Accès aux données Google et Meta</h2>
        <p className="mt-1">
          Google : l&apos;autorisation demandée est <code>business.manage</code>, destinée à
          la gestion des fiches Business Profile. Elle ne demande pas l&apos;accès à vos
          emails Gmail, à votre Drive ou à vos contacts. La connexion Gmail est distincte :
          elle demande uniquement <code>gmail.send</code>, pour envoyer le message que vous
          rédigez et confirmez, ainsi que <code>openid</code> et <code>email</code> pour vérifier
          et afficher l&apos;adresse du compte expéditeur. Elle ne lit pas votre boîte de réception et ne supprime pas
          vos emails. Meta : le flux Facebook Login
          demande des permissions relatives aux Pages et aux comptes Instagram professionnels.
        </p>
        <p className="mt-2">
          Dans la version pilote actuelle, BienDecider échange le code OAuth contre des
          jetons et les conserve dans sa base PostgreSQL, rattachés à votre entreprise.
          La récupération des fiches, Pages, médias ou avis et la publication sur Google/Meta
          ne sont pas encore implémentées. Aucun jeton OAuth n&apos;est envoyé au modèle
          d&apos;IA Anthropic.
        </p>
        <p className="mt-2">
          Pour Gmail, les jetons et l&apos;adresse expéditeur sont chiffrés avec une clé serveur dédiée et les jetons sont renouvelés
          avant l&apos;envoi. Le destinataire, l&apos;objet et le texte du message confirmé sont
          transmis à Google pour l&apos;envoi. BienDecider conserve l&apos;objet, le destinataire et le
          texte dans l&apos;historique des propositions Gmail ; ils sont donc également conservés
          dans la base BienDecider jusqu&apos;à suppression selon la durée de conservation du compte.
          Aucun rapport ni message de prospection n&apos;est envoyé automatiquement.
          Vous pouvez déconnecter Gmail dans Connexions : les jetons locaux sont supprimés
          et une révocation Google est tentée. Si elle échoue, retirez également l&apos;accès
          dans les paramètres de votre compte Google. La révocation peut affecter les autres
          autorisations de ce même projet Google.
        </p>
        <p className="mt-2">
          Les jetons ne sont pas affichés dans l&apos;interface. Pour GBP et Meta, leur chiffrement applicatif
          au repos et leur renouvellement automatique ne sont pas encore implémentés ;
          ces mesures sont des prérequis avant ouverture de ces connexions aux clients externes.
          Les permissions accordées sont conservées chez Google/Meta ; leur vérification
          détaillée dans BienDecider reste à construire.
        </p>
        <p className="mt-2">
          Vous pouvez retirer l&apos;autorisation depuis votre compte Google ou les
          intégrations professionnelles Meta. Cette révocation bloque l&apos;accès chez
          le fournisseur mais ne supprime pas automatiquement les jetons stockés par
          BienDecider pour les intégrations GBP/Meta. Pour leur suppression et celle des données de votre compte,
          contactez <a href="mailto:contact@biendecider.com" className="underline">contact@biendecider.com</a>.
          La déconnexion GBP/Meta et la suppression automatique du compte depuis l&apos;application sont en préparation.
        </p>

        <h2 id="traitement" className="mt-6 scroll-mt-4 font-medium text-slate-900">Sous-traitants et destinataires</h2>
        <p className="mt-1">
          Traitement et publication sont deux choses distinctes : vos informations servent à préparer
          le travail (envoi à nos prestataires ci-dessous) ; seules les productions que vous approuvez
          et publiez sont rendues publiques, et elles peuvent reprendre des informations de votre entreprise.
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            <strong>Anthropic</strong> (fournisseur du modèle d&apos;IA Claude) : les informations
            sur votre entreprise et vos échanges sont envoyés à son API pour générer les réponses.
          </li>
          <li>
            <strong>Vercel</strong> (hébergement de l&apos;application et de la base de données).
          </li>
          <li>
            <strong>Votre navigateur</strong> : si vous utilisez la dictée vocale, l&apos;audio est traité
            par le service de reconnaissance vocale de votre navigateur (par exemple Google pour Chrome),
            pas par BienDecider ; seul le texte reconnu nous est transmis, quand vous l&apos;envoyez.
            La lecture à voix haute utilise la voix de votre appareil.
          </li>
          <li>
            <strong>Google / Meta</strong> : uniquement si vous connectez explicitement un compte,
            et uniquement pour les actions que vous autorisez.
          </li>
        </ul>
        <p className="mt-1">Vos données ne sont pas vendues à des tiers.</p>

        <h2 id="trace-visites" className="mt-6 scroll-mt-4 font-medium text-slate-900">Trace anonyme des visites</h2>
        <p className="mt-1">
          {VISIT_TRACE_NOTICE} Quand vous créez votre compte, ou quand vos réponses du parcours d&apos;entrée sont
          effacées après 24 heures, une trace de votre visite est écrite. Elle sert à savoir jusqu&apos;où vont les visiteurs
          et ce qu&apos;ils cherchent, pour améliorer le parcours.
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            Nous gardons : le jour de début de la visite, l&apos;étape la plus avancée et celle où la visite s&apos;est arrêtée,
            votre activité (choisie dans notre liste, sinon « Autre activité »), le département de votre localisation,
            si vous avez indiqué un site ou non, les rubriques que Paul a pu lire, les éléments retenus de votre ambition
            (gain, horizon, budget média, recrutement), les modèles des missions proposées, si un compte a été créé,
            et le coût de l&apos;analyse.
          </li>
          <li>
            Nous ne gardons jamais dans cette trace : votre prénom, le nom de votre entreprise, l&apos;adresse de votre site,
            votre commune, le texte de votre ambition, votre adresse e-mail, votre adresse IP, ni aucun lien vers votre compte.
          </li>
          <li>Elle est conservée {VISIT_TRACE_RETENTION_MONTHS} mois, puis effacée automatiquement.</li>
          <li>Seuls les administrateurs de BienDecider la consultent, et seulement en chiffres regroupés.</li>
        </ul>

        <h2 className="mt-6 font-medium text-slate-900">Durée de conservation</h2>
        <p className="mt-1">
          [À confirmer avec un juriste/DPO] — en phase pilote, vos données sont conservées tant
          que votre compte est actif. Vous pouvez demander leur suppression à tout moment.
        </p>

        <h2 className="mt-6 font-medium text-slate-900">Vos droits</h2>
        <p className="mt-1">
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification et de
          suppression de vos données. Pour l&apos;exercer, contactez <a href="mailto:contact@biendecider.com" className="underline">contact@biendecider.com</a>.
          Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).
        </p>

        <h2 className="mt-6 font-medium text-slate-900">Cookies</h2>
        <p className="mt-1">
          Un cookie technique maintient votre session connectée. Lors d&apos;une autorisation
          OAuth, un cookie temporaire protège le retour de Google/Meta contre la falsification
          de requête et est supprimé au retour. Pendant le parcours d&apos;entrée, avant la création
          du compte, un cookie technique relie votre navigateur à vos réponses (prénom, entreprise,
          localisation, site, activité, zone, clients, offres, ambition) : elles sont gardées au plus
          24 heures, reprises dans votre compte à sa création puis effacées, ou sinon ignorées puis
          effacées ; seule reste la <a href="#trace-visites" className="underline">trace anonyme de la visite</a>. Aucun cookie publicitaire ou de traçage tiers
          n&apos;est ajouté par BienDecider.
        </p>
      </div>
    </AppShell>
  );
}
