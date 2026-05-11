# scripts Tampermonkey

Dépôt personnel de scripts Tampermonkey.

Ce dépôt regroupe des userscripts destinés à modifier ou compléter localement le comportement de certaines interfaces web. Les scripts sont prévus pour être installés dans Tampermonkey depuis les fichiers `.user.js` présents dans les sous-dossiers.

## Contenu

| Dossier | Script | Objet |
|---|---|---|
| `chatgpt_date` | `ctdate.user.js` | Ajout d'une bannière de titre datée dans ChatGPT et, lorsque c'est possible, horodatage automatique du titre de la conversation. |
| `chatgpt_export` | `chatgpt_export.user.js` | Export de la conversation ChatGPT courante en JSON, Markdown et HTML. |

## Installation générale

1. Ouvrir le fichier `.user.js` souhaité depuis GitHub.
2. Cliquer sur `Raw`.
3. Laisser Tampermonkey intercepter le fichier et proposer son installation.
4. Vérifier les permissions et les domaines concernés avant validation.

Pour le script ChatGPT, l'installation directe passe par le fichier :

`chatgpt_date/ctdate.user.js`

## Mise à jour

Les scripts peuvent inclure des champs `@downloadURL` et `@updateURL`. Lorsque ces champs pointent vers la version brute du fichier sur GitHub, Tampermonkey peut détecter les mises à jour du script.

Après modification du script dans le dépôt, il faut vérifier dans Tampermonkey que la nouvelle version est bien installée ou proposée à la mise à jour.

## Prudence

Ces scripts modifient le comportement local du navigateur. Certains peuvent aussi appeler des endpoints internes d'un service web lorsque cela est explicitement indiqué dans le sous-dossier concerné.

Avant toute mise en production personnelle :

- lire le code ;
- vérifier les domaines déclarés dans les lignes `@match` ;
- vérifier les permissions déclarées dans les lignes `@grant` ;
- tester le comportement sur quelques pages seulement ;
- éviter les boucles réseau ou les appels répétés à des API internes.

## Licence

Dépôt personnel. Aucune licence publique spécifique n'est déclarée pour le moment.
