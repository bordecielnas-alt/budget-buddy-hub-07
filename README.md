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

L'application écoute sur `http://localhost:3000`.

Variables nécessaires :

| Variable | Usage |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | client navigateur, passés au build Docker comme secrets BuildKit |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | accès serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | opérations privilégiées (jetons, bootstrap admin) |

Les données (comptes, écritures, réglages, historique de synchro) sont persistées en
base Postgres : redémarrer le conteneur ne perd rien.

## Développement

```bash
bun install
bun run dev
```
