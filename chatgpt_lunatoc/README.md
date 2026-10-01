# ChatGPT LunaTOC Auto Collapse

Userscript Tampermonkey complémentaire à l’extension LunaTOC.

Le script replie automatiquement la barre latérale LunaTOC lorsqu’on arrive sur une page de conversation ChatGPT depuis une page qui n’est pas une conversation. Il ne clique que si le bouton `#luna-toc-toggle-btn` porte la classe `luna-toc-sidebar-visible` ; un panneau déjà replié, identifié par `luna-toc-sidebar-hidden`, reste donc inchangé.

## Périmètre

Le script est chargé sur `https://chatgpt.com/*`. Il replie LunaTOC lorsque le chemin contient `/c/<identifiant>` et masque ses éléments visuels sur les autres chemins.

Il masque tous les éléments visuels LunaTOC connus sur :

- `https://chatgpt.com/codex...` ;
- la racine de ChatGPT ;
- les racines de projets de forme `/g/<identifiant>/project` ;
- les autres pages sans conversation.

Il fonctionne sur les conversations ordinaires `/c/<identifiant>` et sur les conversations de projet `/g/<identifiant-ou-slug>/c/<identifiant>`.

Lors d’un passage direct d’une conversation à une autre, la barre conserve son état courant. Si la navigation passe par une page hors conversation — par exemple une racine de projet — la prochaine conversation replie de nouveau la barre. Après ce repli automatique unique, l’utilisateur peut librement la rouvrir.

## Fonctionnement

- vérification initiale à la fin du chargement du document ;
- observation du DOM pour attendre les éléments LunaTOC injectés tardivement ;
- suivi des navigations internes pour distinguer `chat → chat` de `chat → hors chat → chat` ;
- aucun clic lorsque la barre est déjà repliée ;
- un seul clic automatique par entrée dans une séquence de conversations ;
- masquage hors conversation de `#luna-toc-react-host`, `#luna-toc-sidebar`, `#luna-toc-toggle-btn`, `#luna-toc-preview-tooltip` et `#luna-toc-button-tooltip` ;
- aucun intervalle de scrutation permanent.

## Installation

1. Ouvrir `chatgpt_lunatoc.user.js` sur GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey proposer l’installation.
4. Vérifier que LunaTOC est installée et autorisée sur `chatgpt.com`.
