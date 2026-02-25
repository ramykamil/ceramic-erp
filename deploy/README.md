# Ceramic ERP - Deployment Package

Ce dossier contient tout le nécessaire pour déployer Ceramic ERP chez un client.

## 📁 Structure

```
deploy/
├── scripts/              # Scripts de démarrage et installation
│   ├── START-ERP.bat     # Démarrer le système (double-cliquer)
│   ├── STOP-ERP.bat      # Arrêter le système
│   ├── SETUP-CLIENT.bat  # Installer un poste client
│   ├── INSTALL-SERVICE.bat  # Installer comme service Windows
│   └── install-service.js   # Script node pour le service
├── config/
│   └── .env.production   # Configuration de production
├── installer/
│   └── ceramic-erp-setup.iss  # Script Inno Setup (créer installer.exe)
├── docs/
│   └── GUIDE-DEMARRAGE-RAPIDE.md  # Guide utilisateur
└── assets/
    └── icon.ico          # Icône de l'application (à créer)
```

---

## 🚀 Options de Déploiement

### Option 1: Déploiement Simple (Recommandé pour tester)

1. Copiez le dossier `ceramic-erp-platform` sur le serveur Windows
2. Renommez-le en `CeramicERP` et placez-le dans `C:\`
3. Double-cliquez sur `deploy/scripts/START-ERP.bat`
4. Ouvrez http://localhost:3000

### Option 2: Créer un Installateur Windows Professionnel

1. Installez [Inno Setup](https://jrsoftware.org/isinfo.php) sur Windows
2. Ouvrez `deploy/installer/ceramic-erp-setup.iss`
3. Modifiez les chemins si nécessaire
4. Cliquez sur "Build" > "Compile"
5. L'installateur sera créé dans `deploy/installer/Output/`

### Option 3: Service Windows (Auto-démarrage)

1. Exécutez `deploy/scripts/INSTALL-SERVICE.bat` en tant qu'administrateur
2. Le système démarrera automatiquement au prochain redémarrage

---

## 📋 Prérequis Client

### Sur le Serveur
- [ ] Windows 10/11 (64-bit)
- [ ] Node.js LTS (v18 ou plus récent)
- [ ] PostgreSQL 14+ installé et configuré
- [ ] Ports 3000 et 5000 disponibles
- [ ] Réseau local configuré

### Sur les Postes Clients
- [ ] Windows 10/11
- [ ] Navigateur moderne (Chrome, Edge, Firefox)
- [ ] Connexion au même réseau que le serveur

---

## ⚙️ Configuration

### Variables d'Environnement (backend/.env)

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| PORT | Port du serveur API | 5000 |
| DB_HOST | Adresse PostgreSQL | localhost |
| DB_PORT | Port PostgreSQL | 5432 |
| DB_NAME | Nom de la base | ceramic_erp |
| DB_USER | Utilisateur PostgreSQL | postgres |
| DB_PASSWORD | Mot de passe | postgres |
| JWT_SECRET | Clé secrète JWT | (à changer!) |

---

## 🔧 Dépannage

### Le backend ne démarre pas
1. Vérifiez que PostgreSQL fonctionne
2. Vérifiez les identifiants dans `.env`
3. Assurez-vous que la base `ceramic_erp` existe

### Les clients ne peuvent pas se connecter
1. Vérifiez le pare-feu Windows (autorisez Node.js)
2. Vérifiez que tous sont sur le même réseau
3. Utilisez `ipconfig` pour trouver l'IP du serveur

### Erreur CORS
Le backend est configuré pour accepter toutes les origines (`*`).
Si problème, vérifiez que le frontend utilise la bonne URL API.

---

## 📦 Création d'un Package de Distribution

Pour créer un package prêt à distribuer:

```bash
# Sur Linux/Mac (développement)
cd deploy
npm install
node scripts/build-production.js

# Sur Windows (ou copier manuellement)
# 1. Installez les dépendances: npm install (dans backend ET frontend)
# 2. Construisez le frontend: npm run build (dans frontend)
# 3. Copiez le tout vers C:\CeramicERP sur le serveur client
```

---

## 📞 Support

Pour toute question technique:
- Consultez d'abord `docs/GUIDE-DEMARRAGE-RAPIDE.md`
- Vérifiez les logs dans la console

---

*Ceramic ERP v1.0.0 - Package de Déploiement*
