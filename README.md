# scripts Tampermonkey

Depot personnel de scripts Tampermonkey.

Ce depot regroupe des userscripts destines a modifier ou completer localement le comportement de certaines interfaces web. Les scripts sont prevus pour etre installes dans Tampermonkey depuis les fichiers `.user.js` presents dans les sous-dossiers.

## Contenu

| Dossier | Script | Objet |
|---|---|---|
| `chatgpt_date` | `ctdate.user.js` | Ajout d'une banniere de titre datee dans ChatGPT et, lorsque c'est possible, horodatage automatique du titre de la conversation. |

## Installation generale

1. Ouvrir le fichier `.user.js` souhaite depuis GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey intercepter le fichier et proposer son installation.
4. Verifier les permissions et les domaines concernes avant validation.

Pour le script ChatGPT, l'installation directe passe par le fichier :

`chatgpt_date/ctdate.user.js`

## Mise a jour

Les scripts peuvent inclure des champs `@downloadURL` et `@updateURL`. Lorsque ces champs pointent vers la version brute du fichier sur GitHub, Tampermonkey peut detecter les mises a jour du script.

Apres modification du script dans le depot, il faut verifier dans Tampermonkey que la nouvelle version est bien installee ou proposee a la mise a jour.

## Prudence

Ces scripts modifient le comportement local du navigateur. Certains peuvent aussi appeler des endpoints internes d'un service web lorsque cela est explicitement indique dans le sous-dossier concerne.

Avant toute mise en production personnelle :

- lire le code ;
- verifier les domaines declares dans les lignes `@match` ;
- verifier les permissions declarees dans les lignes `@grant` ;
- tester le comportement sur quelques pages seulement ;
- eviter les boucles reseau ou les appels repetes a des API internes.

## Licence

Depot personnel. Aucune licence publique specifique n'est declaree pour le moment.
