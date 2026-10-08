# ChatGPT export

Scripts Tampermonkey liés à l'export des conversations ChatGPT.

## Script disponible

- `chatgpt_export.user.js` : exporte la conversation ChatGPT courante depuis les données backend en JSON, Markdown et HTML.

Les exports Markdown et HTML résolvent les références de contenu fournies par ChatGPT :

- les citations web deviennent des liens externes lorsqu’une URL est disponible ;
- les entités interactives internes, qui ouvrent un volet dans ChatGPT sans URL propre, deviennent des libellés lisibles ;
- l’export HTML restitue les liens Markdown, le gras, l’italique, les listes, les titres et les blocs de code courants.

Si ChatGPT ne fournit aucune destination dans les métadonnées d’une citation, le marqueur technique est retiré plutôt qu’affiché dans l’export.

## Installation

1. Ouvrir `chatgpt_export.user.js` sur GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey proposer l'installation.
4. Vérifier que le script s'applique bien à `https://chatgpt.com/*` et `https://chat.openai.com/*`.
5. Valider l'installation.

## Prudence

Hors page de conversation contenant `/c/<id>`, le script garde seulement une surveillance légère de l’URL et du DOM : il supprime le bouton Export s’il existe et ne fait aucune requête backend.

Le script utilise des endpoints internes de ChatGPT pour lire les données de la conversation courante. Ces endpoints ne sont pas une API publique stable et peuvent changer sans préavis.
