# 🌐 Guide d'Accès à Distance - Cloudflare Tunnel

## Qu'est-ce que c'est ?

Un **tunnel Cloudflare** permet d'accéder à l'ERP depuis n'importe où via internet, de manière sécurisée (HTTPS). Pas besoin d'ouvrir des ports sur le routeur ni d'avoir une IP fixe.

---

## 🚀 Mise en Place (une seule fois)

### Option 1 : Mode Rapide (Gratuit, sans compte)

1. Exécutez **`deploy\scripts\SETUP-TUNNEL.bat`**
2. Attendez le téléchargement de cloudflared
3. Choisissez **[1] Mode Rapide**
4. C'est tout ! ✅

> ⚠️ **Note** : En mode rapide, l'URL change à chaque redémarrage du tunnel. Il faut la partager à nouveau à chaque fois.

### Option 2 : Mode Permanent (URL fixe, nécessite un domaine)

**Prérequis :**
- Un compte Cloudflare gratuit → [Créer un compte](https://dash.cloudflare.com/sign-up)
- Un nom de domaine ajouté à Cloudflare (ex: `allaoua-ceram.com`)

**Étapes :**
1. Exécutez **`deploy\scripts\SETUP-TUNNEL.bat`**
2. Choisissez **[2] Mode Permanent**
3. Une fenêtre de navigateur s'ouvre → connectez-vous à Cloudflare
4. Entrez votre sous-domaine (ex: `erp`) et domaine (ex: `allaoua-ceram.com`)
5. L'URL sera : `https://erp.allaoua-ceram.com` ✅

---

## 📱 Utilisation Quotidienne

### Démarrer l'accès à distance

**Méthode 1** — Avec le démarrage de l'ERP :
1. Lancez **`START-ERP.bat`**
2. Quand il demande "Voulez-vous activer l'accès à distance?", répondez **O**

**Méthode 2** — Séparément :
1. Exécutez **`deploy\scripts\START-TUNNEL.bat`**
2. L'URL publique s'affiche dans la fenêtre

### Arrêter l'accès à distance

- Exécutez **`deploy\scripts\STOP-TUNNEL.bat`**
- Ou fermez simplement la fenêtre "ERP Tunnel"

---

## 📋 Résumé des Fichiers

| Fichier | Usage |
|---------|-------|
| `SETUP-TUNNEL.bat` | Configuration initiale (une seule fois) |
| `START-TUNNEL.bat` | Démarrer le tunnel |
| `STOP-TUNNEL.bat` | Arrêter le tunnel |
| `START-ERP.bat` | Démarrage ERP + option tunnel intégrée |

---

## ❓ FAQ

**Q: Le tunnel est-il sécurisé ?**
Oui. Cloudflare Tunnel utilise le chiffrement HTTPS de bout en bout. Aucun port n'est ouvert sur votre routeur.

**Q: Que se passe-t-il si l'ordinateur serveur s'éteint ?**
L'accès à distance s'arrête. L'ERP doit être relancé avec le tunnel.

**Q: Combien ça coûte ?**
Le tunnel Cloudflare est **100% gratuit**. Seul un nom de domaine est payant si vous choisissez le mode permanent (~1-10€/an).

**Q: L'URL ne marche plus, que faire ?**
1. Vérifiez que l'ERP est bien lancé (Backend + Frontend)
2. Vérifiez que la fenêtre du tunnel est ouverte
3. Relancez `START-TUNNEL.bat`
