# 📺 KeoTV - Lecteur IPTV TiviMate pour Android TV & Mobile

**KeoTV** est un lecteur IPTV moderne, ultra-léger et ultra-fluide inspiré de l'ergonomie de référence de **TiviMate**, conçu pour fonctionner nativement sur **Android TV** (via télécommande D-Pad) et sur **Smartphones/Tablettes Android** (via écran tactile).

## 📥 Installation sur Android TV & Fire TV

Pour installer rapidement KeoTV sur votre télévision sans câble :
1. Installez l'application gratuite **Downloader** depuis le Google Play Store ou l'Amazon Appstore.
2. Ouvrez **Downloader** et entrez le **code court à 7 chiffres** :
   > ### **`4317787`**
   *(Ou l'adresse directe : `tinyurl.com/keo-apk`)*
3. Le téléchargement et l'installation de la dernière version débutent automatiquement !

---

## ✨ Points forts & Fonctionnalités

* 🎯 **Expérience TiviMate TV-First** : Grille de programmes en 3 volets (Groupes / Chaînes / Détails du programme) avec sélection au curseur D-Pad.
* ⚡ **Mini-Player Permanent (Picture-in-Preview)** : Le flux vidéo continue de tourner en direct dans le coin supérieur sans coupure sonore ni vidéo pendant que vous explorez les chaînes.
* 🚀 **Zapping Rapide & OSD Plein Écran** :
  * Affichage automatique du bandeau d'informations (Numéro, Nom, Résolution FHD/4K, Titre de l'émission, barre de temps restante et émission suivante).
  * Zapping rapide via les touches `▲` et `▼` sans quitter le mode plein écran.
* 💾 **Capacité Très Grosses Playlists (IndexedDB)** :
  * Moteur de base de données local basé sur Dexie.js capable d'indexer plus de 100 000 chaînes, séries et VOD sans saturer la mémoire vive de la TV box.
* 🔄 **Synchronisation Cloud Multi-Appareils** :
  * Appairage instantané par **Code PIN à 4 ou 6 caractères** (ex: `KEO-8742`) entre votre télévision du salon, votre télévision de chambre et votre smartphone.
  * Synchronisation en temps réel de vos favoris, playlists, catégories masquées et préférences.
* 🌐 **Compatibilité Xtream Codes & M3U** :
  * Connexion simple via API Xtream (URL Serveur + Utilisateur + Mot de passe) ou via lien direct M3U/M3U8.

---

## 🎮 Commandes & Raccourcis Télécommande / Clavier

| Touche Télécommande | Touche Clavier (PC) | Action |
| :--- | :--- | :--- |
| **Flèches Directionnelles** | `▲` / `▼` / `◀` / `▶` | Déplacer le curseur entre Menu, Catégories et Chaînes |
| **Bouton OK / Select** | `Touche Entrée` | **1er appui** : Joue la chaîne dans l'aperçu<br>**2e appui** : Passe la vidéo en Plein Écran |
| **Bouton Retour** | `Touche Échap` / `Retour Arrière` | Quitter le plein écran / Revenir au volet précédent |
| **Touche Jaune / F** | `Touche F` | Ajouter / Retirer des favoris instantanément |
| **Touches Numériques** | `0` à `9` | Saut direct vers le canal numérique |
| **Haut / Bas en Plein Écran**| `▲` / `▼` | Zapping rapide vers la chaîne précédente / suivante |

---

## 🛠️ Stack Technique

* **Framework** : Next.js 14 (Export statique sans serveur pour démarrage instantané) + React 18
* **Styling** : Tailwind CSS (Thème TV sombre OLED à fort contraste) + Lucide Icons
* **Moteur Vidéo** : HLS.js (Transmuxage et lecture des flux Live & VOD)
* **Base de Données Locale** : IndexedDB (Dexie.js)
* **Synchronisation Cloud** : Supabase Realtime
* **Packaging Android** : Capacitor Android avec support Android TV Leanback
