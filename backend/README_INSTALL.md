# Guide d'Installation de la Base de Données

Ce guide explique comment installer ou mettre à jour la base de données **Ceramic ERP** sur votre nouveau PC (Windows/Linux).

## Dossier: `backend/`
Tous les fichiers mentionnés ci-dessous se trouvent dans le dossier `backend` du projet.

---

## SCÉNARIO 1 : NOUVELLE INSTALLATION (Nouveau PC)
*Utilisez cette méthode si vous installez l'application pour la première fois sur un ordinateur.*

### Étape 1 : Prérequis
1. Installez **PostgreSQL** (version 14 ou plus).
2. Installez **pgAdmin 4**.

### Étape 2 : Créer la Base de Données
1. Ouvrez **pgAdmin 4**.
2. Connectez-vous à votre serveur (mot de passe par défaut souvent `root` ou `postgres` selon votre installation).
3. Faites un clic-droit sur **Databases** > **Create** > **Database...**.
4. Nommez la base : `ceramic_erp`.
5. Cliquez sur **Save**.

### Étape 3 : Initialiser la Structure (Tables)
1. Faites un clic-droit sur la nouvelle base `ceramic_erp`.
2. Choisissez **Query Tool**.
3. Ouvrez le fichier `INIT_DATABASE_FINAL.sql` (en cliquant sur l'icône de dossier ou en copiant-collant le contenu).
4. Exécutez le script (Bouton **Play** ▶️ ou F5).
   - *Message de succès attendu : "Database Initialized Successfully"*

### Étape 4 : Restaurer les Données (Optionnel)
*Si vous voulez récupérer les données (produits, clients, stocks) depuis votre ancien PC.*
1. Dans pgAdmin, sur la base `ceramic_erp`, clic-droit > **Restore...**.
2. Dans "Filename", sélectionnez le fichier `backup_final_20251220.sql`.
3. Dans l'onglet "Restore options", décochez "Only data" si vous voulez tout, ou laissez par défaut.
   - *Note : Comme vous venez de créer la structure à l'étape 3, il est parfois plus simple d'utiliser le fichier de backup avec l'option "Data Only" si la structure existe déjà, OU simplement d'utiliser le backup pour TOUT faire (Structure + Données) à la place de l'étape 3.*
   - **Recommandation Simple :** Si vous avez `backup_final_20251220.sql`, vous pouvez sauter l'étape 3 et juste restaurer ce backup dans une base vide.

---

## SCÉNARIO 2 : MISE À JOUR (PC Existant)
*Utilisez cette méthode si vous avez déjà l'application et voulez juste ajouter les nouvelles fonctionnalités (Marges, Fiscalité, etc.) sans perdre vos ventes.*

### Étape 1 : Sauvegarde de sécurité (Très Important)
1. Ouvrez **pgAdmin 4**.
2. Clic-droit sur `ceramic_erp` > **Backup...**.
3. Sauvegardez sous `avant_mise_a_jour.sql`.

### Étape 2 : Exécuter le Correctif
1. Clic-droit sur `ceramic_erp` > **Query Tool**.
2. Ouvrez le fichier `FIX_ALL_SCHEMA_FINAL.sql`.
3. Exécutez le script (▶️).
   - *Ce script va ajouter intelligemment (IF NOT EXISTS) les colonnes manquantes (NIF, RC, Marges) et mettre à jour les vues.*
   - *Vos données existantes (Commandes, Clients) NE SERONT PAS effacées.*

---

## Résumé des Fichiers

| Fichier | Quand l'utiliser ? | Danger |
|---------|-------------------|--------|
| `INIT_DATABASE_FINAL.sql` | **Installation Neuve**. Efface TOUT et recrée à zéro. | 🔴 HAUT (Supprime tout) |
| `FIX_ALL_SCHEMA_FINAL.sql` | **Mise à jour**. Ajoute juste ce qui manque. | 🟢 SÛR (Non destructif) |
| `backup_final_...sql` | **Restauration**. Contient vos données sauvegardées. | 🟡 MOYEN (Écrase données) |

---

## ORDRE D'EXÉCUTION (IMPORTANT)
**Ne lancez pas les 3 fichiers ! Choisissez votre scénario :**

1. **Option A - Installation Complète (Recommandé)** : 
   - Lancez uniquement le **Backup** (`backup_final_...sql`). 
   - Il contient TOUT (Structure + Données). N'exécutez pas `INIT` avant.

2. **Option B - Nouvelle Installation VIDE** : 
   - Lancez uniquement **INIT** (`INIT_DATABASE_FINAL.sql`).
   - Vous aurez une base vide prête à l'emploi.

3. **Option C - Mise à jour** : 
   - Lancez uniquement **FIX** (`FIX_ALL_SCHEMA_FINAL.sql`).
   - Cela rajoute les colonnes manquantes sans toucher à vos données.

---

## METHODE RAPIDE (LIGNE DE COMMANDE / CMD)
*Si vous préférez utiliser le terminal (CMD ou PowerShell) pour aller plus vite.*

**0. Ouvrir le terminal dans le bon dossier**
- Ouvrez le dossier où vous avez copié les fichiers (ex: `backend`).
- Tapez `cmd` dans la barre d'adresse et faites entrer.

**1. Réinitialiser la Base de données (Attention: Supprime tout!)**
```cmd
psql -U postgres -c "DROP DATABASE IF EXISTS ceramic_erp;"
psql -U postgres -c "CREATE DATABASE ceramic_erp;"
```

**2. Restaurer le Backup**
*Si vous êtes dans le même dossier que le fichier, mettez juste le nom du fichier.*
```cmd
psql -U postgres -d ceramic_erp -f "backup_final_20251220.sql"
```
*Si le fichier est ailleurs (ex: clé USB E:), mettez le chemin complet :*
```cmd
psql -U postgres -d ceramic_erp -f "E:\backup.sql"
```
