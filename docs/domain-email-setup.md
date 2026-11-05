# BienDecider : domaine OVH, Vercel et contact

Décision du 2026-10-09 : marque BienDecider, URL de référence `https://www.biendecider.com`, contact `contact@biendecider.com`. Depuis le 2026-10-11, le dépôt est `groupebienoubien/BienDecider` et le projet Vercel `bien-decider`.

## Statut

Le domaine et `www.biendecider.com` sur Vercel sont déclarés opérationnels par le CEO le 2026-10-09, après le contrôle initial qui pointait encore vers OVH. Les étapes ci-dessous restent une procédure de référence, pas une demande de refaire la zone. La réception de `contact`, la redirection du domaine nu et les callbacks OAuth restent à tester séparément. Le DNS seul ne prouve pas le fonctionnement du transfert email.

## 1. Relier le domaine à Vercel

1. Ouvrir le projet **pepito** dans Vercel, **Settings > Domains**.
2. Ajouter **www.biendecider.com** à l'environnement Production, puis **biendecider.com**. Configurer la redirection du domaine nu vers **https://www.biendecider.com**.
3. Copier les valeurs DNS indiquées pour ce projet : en général un **A** pour le domaine nu et un **CNAME** pour `www`. Ne pas réutiliser une IP ou un CNAME trouvés dans un ancien tutoriel : Vercel fournit les valeurs actuelles.
4. Dans OVHcloud, ouvrir **Web Cloud > Noms de domaine > biendecider.com > Zone DNS**. Exporter/sauvegarder la zone avant modification. Remplacer les enregistrements web A/AAAA/CNAME conflictuels pour ces deux hôtes par ceux fournis par Vercel. Pour le domaine nu, le champ sous-domaine est vide ; pour le sous-domaine, il est `www`.
5. **Conserver les serveurs DNS OVH, les MX et les TXT de messagerie (SPF, DKIM, DMARC).** Ne pas réinitialiser la zone. Une redirection web OVH vers une URL Vercel n'est pas un rattachement de domaine : privilégier les DNS ci-dessus. Retirer uniquement les anciennes redirections/entrées web qui entrent en conflit.
6. Ajouter un TXT de vérification uniquement si Vercel le demande. Attendre la propagation puis vérifier **Valid Configuration** et le certificat HTTPS actif sur les deux domaines.

Vercel gère le certificat et HTTPS. Aucun transfert du domaine hors OVH ni nouvel hébergement OVH n'est nécessaire. Ne pas imposer dans Next.js de redirection globale vers la production : le local et les previews Vercel doivent continuer à fonctionner.

## 2. Recevoir contact dans Gmail

La destination est le Gmail personnel communiqué par le propriétaire ; elle n'est volontairement pas enregistrée dans ce dépôt public.

1. Dans OVHcloud, ouvrir **Web Cloud > MX Plan**, sélectionner le service lié à **biendecider.com** et vérifier sa technologie dans **Informations générales**.
2. Pour **MX Plan Roundcube / OWA / Redirect**, ouvrir **Emails > Gestion des redirections > Ajouter une redirection**.
3. Source : **contact@biendecider.com**. Destination : **le Gmail indiqué par le propriétaire**. Pour un simple transfert, choisir **Ne pas conserver de copie du mail**, puis valider. Choisir une copie locale seulement si une vraie boîte OVH existe et que sa conservation est souhaitée.
4. Si aucun service email n'est attaché au domaine, vérifier l'offre gratuite **Redirect** (OVH indique qu'elle est disponible pour les domaines sans offre email). Ne commander une boîte payante que si elle est réellement nécessaire.
5. Si l'offre utilise **Zimbra**, créer/ouvrir la boîte et configurer le transfert dans les paramètres du webmail selon le guide OVH. Les menus diffèrent selon l'offre ; ne pas appliquer la procédure MX Plan à une offre Zimbra dédiée.
6. Préserver les MX de l'offre utilisée. Envoyer un message test depuis **une autre adresse que le Gmail destinataire**, vérifier réception et spam, et contrôler qu'il n'y a ni boucle ni erreur de livraison. Tester aussi avec un second expéditeur.

Ce transfert ne donne pas la capacité de répondre en tant que `contact@biendecider.com`. Pour cela, il faut une boîte/fournisseur SMTP autorisé puis configurer **Envoyer des emails en tant que** dans Gmail et valider SPF/DKIM/DMARC avec ce fournisseur. Sans ce réglage, les réponses partent du Gmail personnel. Ne jamais ajouter un deuxième SPF concurrent ni communiquer de mot de passe à un agent.

La réception du contact est indépendante du fournisseur d'envoi des rapports et de la prospection : le transfert ne débloque aucune de ces fonctionnalités applicatives.

### E-mails du service (confirmation d'adresse, mot de passe oublié, bilans)

L'application envoie ses propres messages par SMTP (`src/lib/service-mail.ts`), depuis une adresse du domaine, indépendamment de Gmail (qui part au nom du dirigeant). Le fournisseur est au choix des fondateurs (Resend, Brevo, Postmark, SMTP OVH…) ; le code ne dépend d'aucun.

1. Créer le compte chez le fournisseur et y **vérifier le domaine `biendecider.com`**.
2. Publier dans la zone DNS OVH les enregistrements demandés (**SPF**, **DKIM**, et **DMARC**) en les **fusionnant** avec l'existant : un seul enregistrement SPF par domaine (ne jamais en ajouter un second).
3. Créer l'expéditeur, par exemple `noreply@biendecider.com`, et relever l'URL SMTP du fournisseur.
4. Dans Vercel (Production), définir : `SERVICE_SMTP_URL` (secret : ne jamais le communiquer dans une Issue, un message ou un agent), `SERVICE_MAIL_FROM` (par exemple `BienDecider <noreply@biendecider.com>`) et `APP_BASE_URL` (`https://www.biendecider.com`). Redéployer.
5. Recette : demander un lien de réinitialisation sur `/mot-de-passe-oublie` pour une adresse de test ; vérifier la réception en boîte de réception (pas dans les indésirables), l'expéditeur et le lien.

Sans ces variables, aucun e-mail n'est envoyé : l'application continue de fonctionner, mais une adresse ne peut pas être confirmée (la diffusion reste bloquée) et un mot de passe ne peut pas être réinitialisé.

## 3. Adapter Google et Meta

- Nom de l'application : **BienDecider** ; email de support : `contact@biendecider.com` une fois sa réception confirmée.
- Domaine autorisé : `biendecider.com` ; accueil : `https://www.biendecider.com`.
- Confidentialité : `https://www.biendecider.com/confidentialite` ; CGU : `https://www.biendecider.com/cgu` (toujours des brouillons à valider juridiquement).
- Google callback : `https://www.biendecider.com/api/oauth/google/callback`.
- Meta callback : `https://www.biendecider.com/api/oauth/meta/callback`.
- Conserver les callbacks locaux pour le développement. Les URI doivent correspondre exactement à l'origine utilisée ; ne pas commencer un flux sur le domaine nu si son callback n'est pas autorisé. Voir [oauth-setup.md](oauth-setup.md).

Les sessions existantes sur `vercel.app` ne sont pas transférables au nouveau domaine : chaque utilisateur se reconnecte avec son compte existant. Ne changer ni les mots de passe ni `SESSION_SECRET` pour cette bascule.

## 4. Recette avant annonce

- [ ] `http://www.biendecider.com` aboutit en HTTPS ; domaine nu redirigé vers www, chemins conservés.
- [ ] Landing et login affichent BienDecider ; titre navigateur et langue française corrects.
- [ ] Connexion avec un compte existant ; données et plan conservés.
- [ ] Connexions OAuth : callbacks et autorisations corrects si les providers sont actifs.
- [ ] Site publié accessible sous `/site/<slug>` sur le nouveau domaine.
- [ ] `contact@biendecider.com` reçu dans le Gmail depuis deux expéditeurs distincts.
- [ ] E-mail du service reçu en boîte de réception, expéditeur `biendecider.com`, SPF/DKIM/DMARC valides (outil de contrôle d'en-têtes du fournisseur).
- [ ] Mentions légales complétées, confidentialité revue et `ADMIN_EMAILS` restreint avant ouverture publique.

## Références officielles

- [Vercel : ajouter et configurer un domaine](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
- [OVHcloud : alias et redirections email](https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/common-email-features/feature-redirections).