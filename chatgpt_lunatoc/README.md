# ChatGPT LunaTOC Auto Collapse

Userscript Tampermonkey complémentaire à l’extension LunaTOC.

Le script replie automatiquement la barre latérale LunaTOC lorsqu’elle apparaît ouverte sur une page de conversation ChatGPT. Il ne clique que si le bouton `#luna-toc-toggle-btn` porte la classe `luna-toc-sidebar-visible` ; un panneau déjà replié, identifié par `luna-toc-sidebar-hidden`, reste donc inchangé.

## Périmètre

Le script est chargé sur `https://chatgpt.com/*`, mais n’agit que lorsque le chemin contient `/c/<identifiant>`.

Il ne fait donc rien sur :

- `https://chatgpt.com/codex...` ;
- la racine de ChatGPT ;
- les racines de projets de forme `/g/<identifiant>/project` ;
- les autres pages sans conversation.

Il fonctionne sur les conversations ordinaires `/c/<identifiant>` et sur les conversations de projet `/g/<identifiant-ou-slug>/c/<identifiant>`.

## Fonctionnement

- vérification initiale à la fin du chargement du document ;
- observation du DOM pour attendre un bouton LunaTOC injecté tardivement ;
- nouvelle vérification lors des navigations internes de l’application monopage ;
- aucun clic lorsque la barre est déjà repliée ;
- aucun intervalle de scrutation permanent.

## Installation

1. Ouvrir `chatgpt_lunatoc.user.js` sur GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey proposer l’installation.
4. Vérifier que LunaTOC est installée et autorisée sur `chatgpt.com`.
