# ChatGPT Fixed Title Banner Auto Date

Userscript Tampermonkey pour ChatGPT.

Le script ajoute une bannière fixe en haut de la page afin d’afficher le titre daté de la conversation courante. Lorsque la conversation n’est pas encore horodatée, le script peut tenter un renommage automatique unique du titre côté ChatGPT, après détection d’un titre stabilisé et d’un horodatage disponible dans la page.

Fichier principal : `chatgpt_date.user.js`.

## Fonction

Le script vise à rendre les conversations ChatGPT plus facilement repérables dans le navigateur, la barre latérale et les exports personnels, en suffixant les titres avec une date au format `{YYYYMMDD}`.

Exemple : `Partition de Goldbach {20250806}`.

## Comportement attendu

Sur une page de conversation déjà horodatée :

- détection de l’URL de conversation ;
- lecture du titre de page ;
- affichage immédiat de la bannière ;
- aucun renommage automatique.

Sur une page de conversation non horodatée :

- attente d’une URL de conversation de forme `/c/<id>` ;
- attente d’un titre stabilisé différent de `ChatGPT` ;
- recherche temporaire d’un élément `.chatgpt-timestamp` ;
- extraction de la date historique ;
- appel ponctuel aux endpoints internes nécessaires ;
- renommage unique du titre de la conversation ;
- affichage de la bannière datée.

Hors page de conversation, par exemple sur la racine ChatGPT ou la racine d’un projet, le script ne doit pas afficher de bannière.

## Installation

1. Ouvrir `chatgpt_date.user.js` sur GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey proposer l’installation.
4. Vérifier que le script s’applique bien à :
   - `https://chatgpt.com/*`
   - `https://chat.openai.com/*`
5. Valider l’installation.

## Mise à jour

Le script contient des champs `@downloadURL` et `@updateURL` pointant vers la version brute du fichier sur GitHub. Tampermonkey peut donc détecter les nouvelles versions publiées dans ce dépôt.

Après une modification dans GitHub, vérifier dans Tampermonkey que la version installée correspond bien à la dernière version du fichier.

## Principes techniques

Le script combine plusieurs signaux afin d’éviter les traitements prématurés :

- surveillance de l’URL pour détecter les changements de conversation dans l’application monopage ;
- observation du titre du document ;
- attente d’un titre stabilisé ;
- recherche temporaire, limitée dans le temps, de `.chatgpt-timestamp` ;
- affichage de la bannière seulement lorsqu’un titre daté peut être affiché ;
- tentative de renommage limitée à une seule fois par conversation et par chargement du script.

Le script évite de traiter le titre immédiatement après un changement d’URL, car ChatGPT peut conserver fugitivement l’ancien titre avant de le remplacer par `ChatGPT`, puis par le titre réel de la nouvelle conversation.

## Renommage automatique

Le renommage automatique repose sur des endpoints internes de ChatGPT. Cette partie n’est pas une API publique documentée.

Le script doit donc rester prudent :

- pas de boucle réseau permanente ;
- pas de renommage répété ;
- pas de `PATCH` tant que le titre et la date ne sont pas disponibles ;
- pas de bannière lorsque la date est absente ;
- arrêt du moniteur temporaire après expiration.

## Bannière

La bannière est fixe, placée en haut de la page. Elle affiche le titre daté de la conversation.

Ergonomie prévue :

- affichage discret ;
- texte sur une seule ligne ;
- ellipse en cas de titre trop long ;
- double-clic en haut de page pour replier la bannière ;
- bouton de réaffichage lorsqu’elle est repliée.

## Limites connues

- Le comportement de ChatGPT peut changer sans préavis.
- Les endpoints internes utilisés par le script peuvent changer ou cesser de fonctionner.
- Le titre de page peut être fugitivement faux pendant les transitions entre conversations.
- Dans les projets, le titre affiché par l’onglet peut inclure le nom du projet, alors que le titre serveur de la conversation peut ne pas l’inclure.
- Le script dépend de la présence d’un élément `.chatgpt-timestamp` injecté ou rendu dans la page pour calculer la date historique.

## Dépannage

Si la bannière n’apparaît pas :

- vérifier que l’URL contient bien `/c/<id>` ;
- vérifier que le titre de l’onglet n’est plus simplement `ChatGPT` ;
- vérifier que `.chatgpt-timestamp` est présent dans le DOM ;
- vérifier que le titre n’est pas déjà en cours de renommage ;
- ouvrir la console du navigateur et chercher les avertissements commençant par `[cgpt-title-date]`.

Si la bannière apparaît puis disparaît, vérifier la logique autour de l’état `renameState[conversationId] === "done"` : la bannière doit rester affichée après un renommage réussi, même si `document.title` tarde à refléter le nouveau titre.

## Historique fonctionnel

Une ancienne version du script renommait les conversations en sollicitant régulièrement les endpoints internes de ChatGPT. Cette approche a été abandonnée car elle pouvait provoquer trop d’appels serveur.

La version actuelle privilégie une logique ponctuelle :

- détection locale ;
- attente d’un état stable ;
- un seul renommage automatique ;
- aucune boucle serveur permanente.

## Avertissement

Ce script est un outil personnel d’interface. Il n’est pas fourni par OpenAI et ne s’appuie pas sur une API publique stable. Il doit être utilisé avec prudence, en particulier pour toute fonction de renommage automatique.
