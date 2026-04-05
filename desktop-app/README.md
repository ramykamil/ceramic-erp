# Application Desktop Allaoua Ceram ERP

Cette application Electron permet de lancer l'ERP comme une application de bureau Windows.

## Structure

```
desktop-app/
├── main.js         # Point d'entrée Electron
├── package.json    # Configuration et dépendances
└── icon.ico        # Icône de l'application (à ajouter)
```

## Comment créer l'application .exe

### Prérequis
- Node.js installé sur le PC
- Le backend et frontend doivent être configurés

### Étapes

1. **Ajoutez l'icône**
   - Placez un fichier `icon.ico` (256x256 pixels) dans ce dossier

2. **Exécutez le script de construction**
   ```
   deploy\scripts\BUILD-DESKTOP-APP.bat
   ```

3. **Récupérez l'installateur**
   - Le fichier `Allaoua Ceram ERP Setup.exe` sera dans `desktop-app\dist\`

## Fonctionnement

L'application Electron:
1. Affiche un écran de chargement stylisé
2. Démarre automatiquement le backend (port 5000)
3. Démarre automatiquement le frontend (port 3000)
4. Ouvre une fenêtre de bureau avec l'application
5. Ferme proprement les serveurs à la fermeture

## Note

Si les serveurs sont déjà en cours d'exécution, l'application les utilisera directement sans en démarrer de nouveaux.
