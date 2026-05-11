# ChatGPT export

Scripts Tampermonkey liés à l'export des conversations ChatGPT.

## Script disponible

- `chatgpt_export.user.js` : exporte la conversation ChatGPT courante depuis les données backend en JSON, Markdown et HTML.

## Installation

1. Ouvrir `chatgpt_export.user.js` sur GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey proposer l'installation.
4. Vérifier que le script s'applique bien à `https://chatgpt.com/*` et `https://chat.openai.com/*`.
5. Valider l'installation.

## Prudence

Le script utilise des endpoints internes de ChatGPT pour lire les données de la conversation courante. Ces endpoints ne sont pas une API publique stable et peuvent changer sans préavis.
