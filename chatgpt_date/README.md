# ChatGPT Date

Script Tampermonkey qui ajoute automatiquement la date de création (YYYYMMDD) au titre des conversations ChatGPT et affiche une barre fixe avec le contenu du <title> de la page.

## Installation

1. Installer l'extension Tampermonkey dans le navigateur.
2. Créer un nouveau script et coller le contenu de `script.user.js`.
3. Enregistrer, puis ouvrir ChatGPT sur `chatgpt.com` ou `chat.openai.com`.

## Limitations

- Utilise des endpoints internes de ChatGPT; cela peut changer et casser le script.
- Nécessite une session connectée.
- Le renommage ne s'applique pas si le titre se termine déjà par un suffixe YYYYMMDD.
- La bannière affiche simplement le <title> courant et peut légèrement retarder lors des navigations.
