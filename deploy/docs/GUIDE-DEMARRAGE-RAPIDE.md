# 📘 Guide de Démarrage Rapide - Ceramic ERP

## 🖥️ Configuration Requise

### Serveur (Ordinateur Principal)
- Windows 10 ou Windows 11
- 4 Go de RAM minimum (8 Go recommandé)
- 10 Go d'espace disque disponible
- Connexion au réseau local

### Postes Clients
- Windows 10/11 avec navigateur moderne (Chrome, Edge, Firefox)
- Connexion au même réseau local que le serveur

---

## 🚀 Installation du Serveur

### Étape 1: Installer les Prérequis

1. **Node.js** (si pas déjà installé)
   - Téléchargez depuis: https://nodejs.org/
   - Choisissez la version "LTS" (recommandée)
   - Suivez l'assistant d'installation
   - ✅ Cochez "Add to PATH" pendant l'installation

2. **PostgreSQL** (si pas déjà installé)
   - Téléchargez depuis: https://www.postgresql.org/download/windows/
   - Notez le mot de passe que vous choisissez!
   - Port par défaut: 5432

### Étape 2: Installer Ceramic ERP

1. Copiez le dossier `CeramicERP` sur `C:\`
2. Double-cliquez sur `START-ERP.bat`
3. Attendez que le système démarre (30-60 secondes la première fois)
4. Le navigateur s'ouvrira automatiquement

### Étape 3: Configuration de la Base de Données

Si vous avez changé le mot de passe PostgreSQL:
1. Ouvrez le fichier `C:\CeramicERP\backend\.env`
2. Modifiez la ligne: `DB_PASSWORD=votre_mot_de_passe`
3. Sauvegardez et redémarrez

---

## 👥 Configuration des Postes Clients

### Méthode Simple (Recommandée)

1. Sur chaque poste client, exécutez `SETUP-CLIENT.bat`
2. Entrez l'adresse IP du serveur (ex: 192.168.1.100)
3. Un raccourci sera créé sur le bureau

### Méthode Manuelle

1. Ouvrez le navigateur (Chrome recommandé)
2. Tapez l'adresse: `http://IP-DU-SERVEUR:3000`
   - Exemple: `http://192.168.1.100:3000`
3. Ajoutez la page aux favoris

### 🔍 Trouver l'adresse IP du serveur

Sur l'ordinateur serveur:
1. Appuyez sur `Windows + R`
2. Tapez `cmd` et appuyez sur Entrée
3. Tapez `ipconfig` et appuyez sur Entrée
4. Cherchez "Adresse IPv4" (ex: 192.168.1.100)

---

## 📱 Utilisation Quotidienne

### Démarrer le Système

**Sur le serveur:**
- Double-cliquez sur `START-ERP` sur le bureau
- Attendez que le navigateur s'ouvre
- Le système est prêt quand la page de connexion apparaît

**Sur les postes clients:**
- Double-cliquez sur `Ceramic ERP` sur le bureau
- Connectez-vous avec vos identifiants

### Arrêter le Système

**Sur le serveur:**
- Double-cliquez sur `STOP-ERP` sur le bureau
- Ou fermez les fenêtres de terminal en arrière-plan

---

## 👤 Comptes Utilisateurs par Défaut

| Utilisateur | Mot de passe | Rôle |
|-------------|--------------|------|
| admin | password123 | Administrateur |
| manager | password123 | Manager |
| vente_detail | password123 | Vendeur Détail |
| vente_gros | password123 | Vendeur Gros |

⚠️ **IMPORTANT:** Changez ces mots de passe après la première connexion!

---

## ⚠️ Dépannage

### Le système ne démarre pas

1. Vérifiez que PostgreSQL est en cours d'exécution:
   - Appuyez sur `Windows + R`
   - Tapez `services.msc`
   - Cherchez "postgresql" et vérifiez qu'il est "En cours d'exécution"

2. Vérifiez la connexion réseau

3. Redémarrez l'ordinateur et réessayez

### Les clients ne peuvent pas se connecter

1. Sur le serveur, vérifiez l'adresse IP avec `ipconfig`
2. Vérifiez que le pare-feu autorise les connexions:
   - Ouvrez "Pare-feu Windows Defender"
   - Cliquez sur "Autoriser une application"
   - Ajoutez Node.js si nécessaire

3. Vérifiez que tous les ordinateurs sont sur le même réseau

### Erreur de base de données

1. Vérifiez les identifiants dans `backend\.env`
2. Assurez-vous que la base "ceramic_erp" existe dans PostgreSQL

---

## 📞 Support

Pour toute assistance technique, contactez:
- **Email:** [votre email]
- **Téléphone:** [votre numéro]

---

## 💾 Sauvegarde des Données

### Sauvegarde Manuelle

1. Ouvrez `pgAdmin` (installé avec PostgreSQL)
2. Clic droit sur la base `ceramic_erp`
3. Sélectionnez "Backup..."
4. Choisissez un emplacement de sauvegarde
5. Cliquez sur "Backup"

### Recommandation

- Effectuez une sauvegarde quotidienne
- Conservez les sauvegardes sur un disque externe ou cloud

---

*Ceramic ERP v1.0.0 - Guide de Démarrage Rapide*
