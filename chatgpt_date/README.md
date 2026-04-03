ReadMe généré par Gemini ; script initial par ChatGPT puis "amendé" par Gemini

# ChatGPT Safe Banner & Metadata 🛡️

Ce script Tampermonkey améliore l'interface de ChatGPT en ajoutant une bannière fixe en haut de page. Elle affiche le titre de la conversation et la date de création au format `YYYYMMDD` sans générer de requêtes réseau superflues.

## 🚀 Évolutions & Historique

Le projet a pivoté d'un outil d'automatisation risqué vers une extension d'interface (UI) "furtive" pour garantir la stabilité du compte utilisateur.

### 🔴 v1.0.0 : L'approche "API Directe" (Obsolète)
* **Méthode** : Tentative de renommage des conversations via les API privées d'OpenAI (`/backend-api`).
* **Problème** : Générait un flux de requêtes trop important (Polling), provoquant des erreurs **429 (Too Many Requests)**.
* **Risque** : Saturation du compte et déconnexions intempestives.

### 🟢 v2.2.0 : L'approche "Furtive" (Version Actuelle)
* **Zéro Requête Réseau** : Le script ne communique plus avec les serveurs d'OpenAI. Il est 100% passif.
* **Extraction DOM** : Récupère la date réelle du premier message en lisant directement le HTML (compatible avec les extensions de *timestamps* type `.chatgpt-timestamp`).
* **Performance** : Utilisation de `MutationObserver` pour ne réagir qu'aux changements réels du titre, sans surcharge CPU.

---

## ✨ Fonctionnalités

* **Bannière Fixe** : Garde le titre et la date visibles même lors de longs scrolls.
* **Format YYYYMMDD** : Extraction et formatage automatique de la date de création du chat.
* **Mode Discret** : 
    * **Double-clic** sur le bandeau pour le masquer.
    * **Bouton ⬇️** pour le faire réapparaître.
* **Sécurité Totale** : Aucune interférence avec les mécanismes de sécurité d'OpenAI (Cloudflare).

## 🛠 Installation

1.  Installez l'extension [Tampermonkey](https://www.tampermonkey.net/).
2.  Créez un nouveau script dans votre tableau de bord.
3.  Copiez le contenu de `script.user.js` (version 2.2.0).
4.  Enregistrez et rafraîchissez votre page ChatGPT.

> **Note** : Pour une précision optimale de la date, ce script est optimisé pour lire les marqueurs temporels injectés par des extensions de type "ChatGPT Timestamp".

## 📜 Licence
MIT - Libre d'utilisation et de modification.
