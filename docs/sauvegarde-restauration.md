# Sauvegarde et restauration de la base

Procédure pour revenir en arrière après un incident (#82). La base de production est la base PostgreSQL du projet Vercel `bien-decider` ([architecture.md](architecture.md), [ci-cd.md](ci-cd.md)). Cette procédure se déroule en deux temps : vérifier ce que l'hébergeur sauvegarde, puis prouver qu'une restauration complète fonctionne. Rien ici ne touche à la production tant qu'on ne bascule pas (section 5).

## 1. Ce qu'il faut savoir avant de commencer

- Un export contient les données des entreprises et les jetons chiffrés des connexions. Il ne se stocke ni dans Git, ni dans une Issue, ni dans un message. Après l'essai, supprimez-le.
- L'adresse de connexion à la base est un secret : ne la collez ni dans une Issue ni dans une capture d'écran.
- Il faut `pg_dump`, `pg_restore` et `psql` en version 15 ou plus récente (clients PostgreSQL), et une base PostgreSQL vide et jetable pour la restauration d'essai (locale, ou une base de test chez l'hébergeur). Jamais la base de production comme cible.

## 2. Vérifier la sauvegarde automatique chez l'hébergeur

Dans la console Vercel, projet `bien-decider`, rubrique de stockage de la base, relevez :

| À relever | Où le noter |
| --- | --- |
| Sauvegarde automatique activée (oui ou non) | commentaire de l'Issue #82 |
| Fréquence et durée de conservation du plan actuel | commentaire de l'Issue #82 |
| Date et heure de la dernière sauvegarde disponible | commentaire de l'Issue #82 |
| Possibilité de restaurer à un instant donné (oui ou non) | commentaire de l'Issue #82 |

Si la sauvegarde automatique n'est pas activée ou si la conservation est inférieure à 7 jours, le dire dans l'Issue : la section 3 devient alors la sauvegarde de référence, à planifier.

## 3. Sauvegarde complémentaire par export

À faire depuis un poste de confiance, avec l'adresse de connexion directe de la base de production (variable `DATABASE_URL` de Vercel), en lecture seule :

```powershell
$env:PGURL = "<adresse de connexion, à ne pas conserver dans l'historique>"
pg_dump --format=custom --no-owner --no-privileges --file "biendecider-$(Get-Date -Format yyyyMMdd).dump" $env:PGURL
Remove-Item Env:PGURL
```

Notez la taille du fichier et la durée de l'export dans l'Issue.

## 4. Restauration d'essai complète

1. Créez une base vide et jetable, et notez son adresse dans une variable de session (`$env:TESTURL`).
2. Restaurez l'export :

   ```powershell
   pg_restore --no-owner --no-privileges --exit-on-error --dbname $env:TESTURL "biendecider-AAAAMMJJ.dump"
   ```

3. Vérifiez que le schéma est à jour, avec les migrations du dépôt :

   ```powershell
   $env:DATABASE_URL = $env:TESTURL
   npx prisma migrate status
   ```

   Résultat attendu : « Database schema is up to date ».
4. Comparez les volumes entre la production (ou l'export) et la base restaurée. Sur chaque base :

   ```sql
   SELECT 'Company' AS table_name, count(*) FROM "Company"
   UNION ALL SELECT 'UsageEvent', count(*) FROM "UsageEvent"
   UNION ALL SELECT 'Lead', count(*) FROM "Lead"
   UNION ALL SELECT 'ChannelConnection', count(*) FROM "ChannelConnection";
   ```

   Les nombres de la base restaurée doivent être égaux à ceux de la production à l'heure de l'export (ou légèrement inférieurs si la production a reçu des écritures depuis).
5. Démarrez l'application contre la base restaurée (`npm run build`, puis `npx next start`) et vérifiez qu'une connexion avec un compte existant réussit et que la page d'accueil de l'espace s'affiche.
6. Supprimez la base jetable et le fichier d'export.

## 5. Restauration réelle après un incident

1. Arrêtez les écritures : suspendez les entreprises depuis l'administration si l'incident est une corruption en cours, ou mettez le déploiement en pause.
2. Restaurez la sauvegarde choisie (automatique de l'hébergeur à l'instant voulu, ou export de la section 3) dans une **nouvelle** base, jamais par-dessus l'ancienne.
3. Vérifiez la nouvelle base comme en section 4 (étapes 3 à 5).
4. Dans Vercel, remplacez `DATABASE_URL` par l'adresse de la nouvelle base, puis redéployez. Gardez l'ancienne base intacte jusqu'à la fin de l'analyse de l'incident.
5. Réactivez les entreprises suspendues, prévenez les entrepreneurs concernés de la période éventuellement perdue (entre la sauvegarde et l'incident), et notez l'incident dans l'Issue de suivi.

## 6. Trace de la recette

À copier dans l'Issue #82 une fois l'essai fait :

| Élément | Valeur |
| --- | --- |
| Date de l'essai | |
| Personne | |
| Sauvegarde automatique vérifiée (fréquence, conservation, dernière) | |
| Durée de l'export, taille du fichier | |
| Durée de la restauration | |
| `prisma migrate status` | |
| Volumes comparés (conformes ou écarts) | |
| Connexion d'un compte existant sur la base restaurée | |
| Export et base jetable supprimés | |

L'Issue #82 peut être fermée quand la ligne de sauvegarde automatique est renseignée et qu'une restauration complète a été faite et tracée ici. Refaire l'essai après toute migration qui change la structure de façon importante, et au moins une fois par trimestre pendant le PoC.
