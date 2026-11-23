# Déplacer toute une case (conception courte et plan)

Date : 2026-11-23. Branche : `chantier/deplacer-case` (partie de `main` 3a51f4c, code en modules `js/`).

## Intention
Réorganiser la cave sans déplacer les bouteilles une à une : prendre **tout le contenu d'une case maçonnée** et le
mettre dans une autre case, dans le même ordre de pile.

## Décidé avec l'utilisatrice
- Case d'arrivée vide : le contenu y va directement.
- Case d'arrivée déjà occupée : une fenêtre prévient et propose **« Empiler »**, **« Échanger les deux cases »** ou
  **« Annuler »**.

## Mes choix (à vérifier)
- **Cases maçonnées seulement**, au départ comme à l'arrivée : dans un casier métallique une place = une bouteille, et
  « Déplacer » existe déjà. Toucher une place métallique pendant le mode → message.
- **Bouton « Déplacer cette case »** dans la fiche de la case (à côté de « Vider cette case »), seulement si la case
  contient des bouteilles. Ensuite, comme « Déplacer » : bandeau « Touchez la case où déplacer ces N bouteilles ».
- **Pas de confirmation pour une arrivée vide** (le geste est volontaire et « Annuler » est proposé), confirmation à
  trois choix pour une arrivée occupée.
- **Place insuffisante** : empiler est refusé s'il n'y a pas assez de places libres (la fenêtre le dit et ne propose
  alors qu'« Échanger » ou « Annuler ») ; échanger est refusé si l'un des deux contenus ne tient pas dans l'autre case.
  Rien n'est jamais écrit à moitié.
- **Ordre** : chaque pile garde son ordre ; empilées, les bouteilles arrivent par-dessus, dans le même ordre.
- **Une seule transaction** (`persistBatch`) : nouvelles fiches et suppression des anciennes ensemble.
- **Identifiants** : la bouteille garde son suffixe (`K:c:r:u` → `K2:c2:r2:u`), un nouveau est tiré en cas de
  collision.
- **« Annuler »** pendant 10 s : remet les deux cases exactement comme avant, seulement si aucune des deux n'a changé
  depuis (sinon message, rien n'est touché).
- **Ancienne fiche « à ranger »** de la case de départ : elle reste dans sa case (elle n'est pas dans la pile) ; le
  message le dit.

## Plan
1. `js/lib.js` : `moveCase(list, from, to, how, { capFrom, capTo }, rand)` → `{ put, remove, before, after }`
   (`how` : `'stack'` ou `'swap'`), `RangeError` (cause `{ need, free }`) si ça ne tient pas ; `undoMoveCase(list, op)`
   → `{ put, remove } | null`. Tests dans `tests/movecase.test.js` d'abord.
2. `js/util.js` : `choose(message, options)` — fenêtre à 2 ou 3 boutons (`#dialogAlt` dans `index.html`).
3. `js/sheet.js` : bouton, mode `'move-case'` (bandeau, toucher d'arrivée), appel de `moveCase`, « Annuler ».
4. Vérifier en format iPhone (`?debug`), `npm test`, `code-reviewer`, `CHANGELOG.md` sous `## [Non publié]` (sans
   changer le numéro), README, puis PR vers `main` avec l'accord de l'utilisatrice (fusionner ≠ publier).
