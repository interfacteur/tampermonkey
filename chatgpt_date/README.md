**IMPORTANT :**
_l'ensemble du projet, code et readme, a été généré par ChatGPT + Codex (CLI puis Cloud)_


_au 20260403 : comme il générait de multiples requêtes serveur, il a fini par provoquer l'impossibilité de charger les pages (nouvelles mesures de protection d'OpenAI mars-avril 2026) : la nouvelle version est "amendée" par Gemini_

---

# ChatGPT Date

Script Tampermonkey qui ajoute automatiquement la date de création (YYYYMMDD) au titre des conversations ChatGPT et affiche une barre fixe avec le contenu du <title> de la page.
Ancienne version par ChatGPT : le script declenche aussi des evenements `locationchange`, `pushstate`, `replacestate` et `popstate` a chaque navigation pour que d'autres scripts puissent reagir aux changements d'URL.

## Installation

1. Installer l'extension Tampermonkey dans le navigateur.
2. Créer un nouveau script et coller le contenu de `script.user.js`.
3. Enregistrer, puis ouvrir ChatGPT sur `chatgpt.com` ou `chat.openai.com`.

## Limitations de l'ancienne version par ChatGPT

- Utilise des endpoints internes de ChatGPT; cela peut changer et casser le script.
- Nécessite une session connectée.
- Le renommage ne s'applique pas si le titre se termine déjà par un suffixe YYYYMMDD.
- La bannière affiche simplement le <title> courant et peut légèrement retarder lors des navigations.
