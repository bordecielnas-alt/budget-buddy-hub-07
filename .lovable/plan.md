# Budget Tracker

Application web de gestion de budget, dans la même famille que Daily Tracker : authentification, navigation par onglets, réglages avec thèmes, et une source de données alimentée depuis N8N.

## Structure de l'app

Trois onglets principaux + réglages :

```text
/            -> redirection vers Dashboard (ou /auth si non connecté)
/dashboard   -> graphiques et analyse croisée
/data        -> table budget, édition locale
/settings    -> Compte | Apparence | Mise à jour
/auth        -> connexion
```

## Données

Le CSV fourni définit le schéma de la table `budget` :

| Colonne | Type | Exemple |
| --- | --- | --- |
| Type | texte (Dépenses / Recettes / ...) | Dépenses |
| Date | date | 2026-07-15 |
| Payee | texte | emetteur |
| Amount | décimal signé | -59.45 |
| Account | texte/entier | 1 |
| Description | texte, optionnel | |
| Category | texte, optionnel | |

Chaque ligne garde en plus : un identifiant, une clé d'origine N8N (pour reconnaître les lignes déjà importées), et des horodatages de création/modification. Les données sont stockées dans la base intégrée (Lovable Cloud), avec un cloisonnement par utilisateur et accès restreint aux utilisateurs connectés.

Quelques lignes d'exemple sont insérées à la création pour que le Dashboard ne soit pas vide avant la première synchro.

## Onglet Data

- Tableau complet, triable, filtrable (période, type, catégorie, compte, texte libre).
- Édition en ligne de chaque cellule, ajout et suppression de lignes.
- Marqueur visuel sur les lignes modifiées localement après import (utile plus tard pour une vraie synchro).
- Export CSV et import CSV manuel (même format que le fichier fourni), en secours si N8N est indisponible.

## Onglet Dashboard

Sélection visuelle et croisée façon Wealth Tracker : cliquer sur un élément d'un graphique filtre tous les autres, avec des puces de filtres actifs et un bouton de réinitialisation.

- Cartes de synthèse : total recettes, total dépenses, solde net, épargne moyenne mensuelle.
- Évolution mensuelle (barres recettes/dépenses + courbe de solde cumulé).
- Répartition par catégorie (donut, cliquable).
- Répartition par compte (barres, cliquable).
- Top bénéficiaires (Payee) par montant.
- Comparaison période / période précédente.

## Onglet Réglages

**Compte** — email, changement de mot de passe, déconnexion, et un compte administrateur initial (`admin` / `@Tracking@`) créé à l'installation. Le rôle admin est stocké dans une table de rôles dédiée, jamais dans le profil, pour éviter toute élévation de privilège.

**Apparence** — sélecteur de thèmes riches (clair, sombre, et une série de palettes nommées), densité d'affichage compacte/confortable, et choix de la devise et du format de date. Le tout via des variables de thème, pas de couleurs codées en dur.

**Mise à jour** — bouton « MAJ » qui va chercher la table côté N8N :
- Champ URL du webhook N8N + jeton d'authentification stocké côté serveur (jamais exposé au navigateur).
- Appel effectué par le serveur de l'app, pas par le navigateur (évite les problèmes CORS et protège le jeton).
- Résumé après import : lignes ajoutées, mises à jour, inchangées, ignorées, plus la date de dernière synchro et un historique des dernières exécutions.
- Mode « aperçu avant application » pour voir les changements avant écriture.
- Sens unique : N8N est la source, l'app se met à jour, rien n'est renvoyé.

### Instructions de liaison N8N (fournies dans l'onglet)

1. Dans N8N, créer un workflow avec un nœud **Webhook** en méthode `GET`, chemin par ex. `budget-export`.
2. Activer l'authentification **Header Auth** sur ce webhook, avec un nom d'en-tête (par ex. `x-api-key`) et une valeur secrète que vous générez vous-même.
3. Ajouter le nœud qui lit la table budget (Postgres / Sheets / NocoDB selon votre source), puis un nœud **Respond to Webhook** renvoyant le JSON des lignes avec exactement les clés `Type, Date, Payee, Amount, Account, Description, Category`.
4. Activer le workflow et copier l'URL de production du webhook.
5. Dans Budget Tracker → Réglages → Mise à jour, coller l'URL, le nom d'en-tête et la valeur secrète, puis cliquer sur « Tester la connexion » et « MAJ ».

Le format CSV est accepté en plus du JSON, au cas où votre workflow renvoie directement un fichier.

## Ce qu'implique une vraie synchronisation bidirectionnelle

Pour l'instant l'app ne fait que tirer les données. Passer à une synchro réelle demande quatre briques supplémentaires :

1. **Identité stable des lignes.** Chaque enregistrement doit porter le même identifiant des deux côtés. Sans cela, impossible de dire si une ligne a été modifiée ou recréée, et chaque synchro duplique les données.
2. **Suivi des modifications.** Chaque côté doit savoir ce qui a changé depuis la dernière synchro : horodatage de modification, drapeau « à pousser », et journal des suppressions (une ligne effacée ne peut pas être détectée par simple comparaison, sinon la synchro la recrée).
3. **Résolution de conflits.** Si la même ligne change des deux côtés, il faut une règle : dernier écrit gagne, N8N prioritaire, ou arbitrage manuel avec un écran de conflits. C'est la partie la plus coûteuse et celle qui demande une décision produit.
4. **Canal retour + déclencheur.** Un webhook N8N en écriture pour recevoir les changements de l'app, et un déclencheur côté N8N (planification ou événement) pour pousser les siens. Il faut aussi rendre les écritures idempotentes pour qu'un renvoi ne double pas les effets.

En pratique : le sens unique actuel demande une journée de travail, une bidirectionnelle fiable c'est plusieurs fois plus, essentiellement à cause des suppressions et des conflits. Une étape intermédiaire raisonnable existe : garder N8N maître, et n'autoriser en retour que les champs que l'app seule modifie (catégorie, description), ce qui supprime la quasi-totalité des conflits.

## Infra GitHub / Docker

Le projet est synchronisable sur GitHub depuis les réglages Lovable. Deux nuances à valider :

- Version proposée par défaut : app Lovable (auth + base de données gérées), code sur GitHub, avec un `Dockerfile` et un `docker-compose.yml` fournis pour construire et servir l'app.
- Si l'objectif est un auto-hébergement complet comme Daily Tracker (Postgres dans docker-compose, auth autonome), il faut remplacer la couche base de données et authentification — je peux fournir les fichiers, mais l'aperçu Lovable ne pourra pas tout exécuter.

## Détails techniques

- TanStack Start + TanStack Router (onglets = routes), TanStack Query pour les lectures.
- Base de données et authentification via Lovable Cloud ; toutes les tables avec RLS et politiques par utilisateur, rôles admin dans `user_roles` + fonction `has_role`.
- L'appel N8N passe par une server function : URL et jeton lus côté serveur uniquement, jeton stocké en secret projet.
- Import idempotent basé sur une clé d'origine, en une seule transaction, avec compte-rendu.
- Graphiques avec Recharts, état de filtrage croisé partagé dans un contexte du Dashboard.
- Thèmes via variables CSS sémantiques dans `src/styles.css`, préférence persistée par utilisateur.
- Métadonnées `head()` propres par route.

## Première livraison

1. Base de données, auth, compte admin, coquille de l'app avec les onglets.
2. Onglet Data complet (table + édition + import/export CSV).
3. Onglet Dashboard avec filtrage croisé.
4. Réglages : Compte, Apparence, Mise à jour + instructions N8N.
