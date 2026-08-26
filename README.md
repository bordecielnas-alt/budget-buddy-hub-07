# Budget Tracker

Application web de gestion de budget : dashboard interactif, table budget éditable et mise à jour
unidirectionnelle depuis une table exposée par N8N.

## Fonctionnalités

- **Auth** email / mot de passe. Le premier compte créé devient administrateur.
  Compte initial provisionné automatiquement : `admin@budget.local` / `@Tracking@`
  (changez le mot de passe dans Réglages → Compte).
- **Dashboard** : KPI recettes / dépenses / solde, barres mensuelles, courbe de solde,
  répartition par catégorie, solde par compte, avec **filtrage croisé** au clic.
- **Data** : table à jour, édition en ligne (cellule → sauvegarde immédiate), ajout et
  suppression de lignes, import et export CSV.
- **Réglages** : Compte, Apparence (11 thèmes + densité, persistés par utilisateur),
  Mise à jour (liaison N8N, test, aperçu, MAJ, date de dernière synchro).

## Colonnes attendues

`Type, Date, Payee, Amount, Account, Description, Category`

Les en-têtes français (`Type, Date, Émetteur, Montant, Compte, Description, Catégorie`),
les dates `JJ/MM/AAAA` et les montants à virgule sont reconnus automatiquement.

## Brancher N8N

1. Workflow N8N avec un nœud **Webhook** (GET).
2. Lecture de la table source (Postgres, Sheets, Airtable…).
3. Nœud **Respond to Webhook** renvoyant un tableau JSON, ou un CSV.
4. Protégez le webhook via **Header Auth**.
5. Dans l'app : Réglages → Mise à jour → URL + nom d'en-tête + jeton → *Enregistrer*,
   puis *Tester*, *Aperçu*, *MAJ*.

Le jeton est stocké côté serveur uniquement (jamais exposé au navigateur).

### Synchronisation : ce qui est fait, ce qui manque

La MAJ est **unidirectionnelle** : N8N est la source de vérité, l'app est le miroir.
Chaque ligne reçoit une clé déterministe (`source_key`), l'import est donc idempotent :
relancer la MAJ ne duplique rien. Les lignes absentes de N8N ne sont **pas** supprimées.

Une vraie synchronisation bidirectionnelle impliquerait :

- un identifiant stable partagé des deux côtés (pas seulement une clé dérivée du contenu) ;
- un horodatage de modification côté N8N pour arbitrer les conflits (last-write-wins ou revue) ;
- un journal des suppressions (tombstones) pour distinguer « supprimé » de « jamais reçu » ;
- un webhook d'écriture côté N8N et une file de renvoi en cas d'échec réseau ;
- une gestion explicite des modifications locales (le drapeau `locally_modified` est déjà là).

## Auto-hébergement (Docker)

```bash
cp .env.example .env   # renseignez les variables
docker compose up -d --build
```

L'application écoute sur le port **3000** dans le conteneur, publié sur `http://localhost:3000`
(modifiable via `ports: - "8080:3000"` dans `docker-compose.yml`).

### Données persistantes

Le dossier `./data` de la machine hôte est monté dans le conteneur sur `/data` (variable `DATA_DIR`).
Il contient les données persistantes (exports CSV, sauvegardes) et survit à `docker compose down`,
aux rebuilds et aux mises à jour d'image.

```bash
mkdir -p ./data
sudo chown -R 1000:1000 ./data   # l'app tourne avec un utilisateur non root
docker compose up -d --build
```

Sauvegarde : `tar czf backup-$(date +%F).tar.gz ./data`.
Les écritures budgétaires elles-mêmes sont stockées dans la base Postgres du backend, référencée par
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` : pour un auto-hébergement complet, pointez ces variables
vers votre instance Postgres/Supabase self-host dont le volume de données doit également être monté
(ex. `./data/postgres:/var/lib/postgresql/data`).

### Table synchronisée

La table source expose exactement les entêtes :
`id,Type,Date,Payee,Amount,Account,Description,Category,createdAt,updatedAt`.
La colonne **`id` est obligatoire** : c'est la clé de rapprochement. À chaque MAJ, une ligne dont l'`id`
existe déjà est mise à jour (jamais dupliquée), une ligne inconnue est ajoutée, une ligne sans `id`
est ignorée et comptée dans « ignorées ». L'export CSV reprend les mêmes entêtes.

Variables nécessaires :

| Variable | Usage |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | client navigateur, passés au build Docker comme secrets BuildKit |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | accès serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | opérations privilégiées (jetons, bootstrap admin) |

Les données (comptes, écritures, réglages, historique de synchro) sont persistées en
base Postgres : redémarrer le conteneur ne perd rien.

## Build automatique GitHub Actions

Le workflow `.github/workflows/docker-image.yml` est déclenché à chaque push ou pull request sur `main`.

- Sur **pull request**, l'image est buildée sans être publiée.
- Sur **push sur `main`** ou **tag `v*`**, l'image est buildée et publiée sur **GitHub Container Registry** :

```text
ghcr.io/<utilisateur>/<dépôt>:latest
ghcr.io/<utilisateur>/<dépôt>:main
ghcr.io/<utilisateur>/<dépôt>:commit-<sha>
```

### Secrets à configurer dans le dépôt

Dans **Settings → Secrets and variables → Actions → Repository secrets**, ajoutez :

| Secret | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | URL Supabase/Lovable Cloud pour le build client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé publique Supabase pour le build client |

> La clé publishable est injectée via un secret BuildKit, elle ne reste pas dans les couches de l'image.

### Permissions du workflow

Le workflow demande `packages: write` pour pousser sur `ghcr.io`. Si le push échoue avec une erreur de permission, vérifiez dans **Settings → Actions → General → Workflow permissions** que l'option **Read and write permissions** est sélectionnée.

### Utiliser l'image publiée

```bash
docker pull ghcr.io/<utilisateur>/<dépôt>:latest
```

Puis lancez-la avec les variables serveur nécessaires (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Développement

```bash
bun install
bun run dev
```
