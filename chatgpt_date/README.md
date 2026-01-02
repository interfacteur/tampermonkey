# ChatGPT Date

Script Tampermonkey qui ajoute automatiquement la date de creation (YYYYMMDD) au titre des conversations ChatGPT et affiche une barre fixe avec le contenu du <title> de la page.

## Installation

1. Installer l'extension Tampermonkey dans le navigateur.
2. Creer un nouveau script et coller le contenu de `script.user.js`.
3. Enregistrer, puis ouvrir ChatGPT sur `chatgpt.com` ou `chat.openai.com`.

## Limitations

- Utilise des endpoints internes de ChatGPT; cela peut changer et casser le script.
- Necessite une session connectee.
- Le renommage ne s'applique pas si le titre se termine deja par un suffixe YYYYMMDD.
- La bannere affiche simplement le <title> courant et peut legerement retarder lors des navigations.
