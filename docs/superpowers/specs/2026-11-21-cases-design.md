# Conception — Cases maçonnées réalistes : une place par bouteille, séparations réglables

Date : 2026-11-21 · Version visée : 0.4.0 · Statut : à valider par Rebecca

## Intention

La maquette doit ressembler au vrai mur de la cave de Verdelot, pour que son père retrouve **une bouteille précise**, et pas seulement la case où elle se trouve. Dans la vraie cave :
- les cases maçonnées n'ont pas toutes la même taille, ni en hauteur ni en largeur ;
- une case contient des vins différents, empilés en quinconce sur une seule épaisseur, et il faut savoir **où** est chaque vin dans la case.

Le bouton « Gérer ce casier » n'est pas clair : on le remplace par un geste direct. On touche une case, la vue zoome dessus, et on gère les bouteilles qu'elle contient.

## Objectifs

1. **Une place par bouteille dans les cases maçonnées.** Chaque bouteille a son adresse : casier, colonne, rangée, place dans la case. Elle a sa propre fiche (choix « B2 » de Rebecca : une fiche par bouteille).
2. **Nombre de places calculé d'après la taille de la case** (choix « A1 ») : bouteilles de 8 cm de diamètre, en quinconce.
3. **Chaque case est une pile** (idée de Rebecca) : on part du coin en bas à droite, la rangée du bas de droite à gauche, puis la rangée au-dessus, etc. Une bouteille ajoutée va toujours en haut ; une bouteille retirée fait descendre celles du dessus.
4. **Séparations réglables dans les deux sens** : on touche une ligne (horizontale ou verticale), elle s'allume, et on la fait glisser.
5. **Case zoomée** : toucher une case la montre en grand avec la liste de ce qu'elle contient. Toucher une bouteille ouvre sa fiche ; toucher une place vide propose d'y ranger une bouteille.
6. Retirer le bouton « Gérer ce casier ».

## Hors champ

- Profondeur : une seule épaisseur de bouteilles (confirmé par Rebecca, « pour l'instant »).
- **Casiers métalliques** : inchangés (une place, une bouteille, une fiche, grille régulière, pas de réglage des séparations).
- **Alvéoles et caisses** : inchangées (modèle actuel « une fiche par emplacement avec une quantité »). *Choix de Claude : seules les cases maçonnées existent à Verdelot ; on garde ces types tels quels.*
- Séparations verticales différentes d'un étage à l'autre : les séparations verticales vont du sol jusqu'en haut, comme des piliers (supposition présentée à Rebecca, non contestée).
- Étagères différentes d'une colonne à l'autre : **chaque étagère est continue sur toute la longueur du casier** (confirmé par Rebecca). Un seul `rowH` par casier ; glisser une ligne horizontale déplace l'étagère entière.

## À éviter absolument

- Perdre ou cacher une bouteille en réglant les séparations ou les dimensions.
- Un mode de réglage dans lequel le père reste coincé, ou qu'il active par erreur.
- Des cibles trop petites pour le doigt (au moins 44 px pour un culot en vue zoomée).

## Contraintes

- Règles du projet (CLAUDE.md) : écrire avant de confirmer, confirmer toute suppression, « Annuler » après les suppressions, `esc()` sur tout texte, logique pure dans `lib.js` avec tests, versionnement (0.4.0), README à jour, relecture `code-reviewer`.
- Données actuelles : Rebecca n'a que des bouteilles d'exemple, inutile de les préserver. Elles sont **régénérées** au nouveau format. *Choix de Claude, pour respecter la règle « garder les anciennes fiches lisibles » à moindre coût : une éventuelle vraie fiche d'ancien format dans une case maçonnée (`G:c:r` avec quantité q) devient q fiches aux rangs 0 à q−1 de la pile de sa case, au premier lancement de la 0.4.0. Si la case n'a pas assez de places, les bouteilles en trop restent dans une fiche d'ancien format, listée dans « Liste de mes bouteilles » avec la mention « à ranger ».*

## Approches considérées

**A. Nombre de places dans une case**
- **A1, retenue (choix de Rebecca) : calculé d'après la taille de la case.** La maquette suit le vrai mur : élargir une case lui donne des places. Revers : rétrécir peut supprimer des places, ce qui est réglé par la règle « une séparation ne peut pas écraser une bouteille » (voir plus bas).
- A2 : un nombre fixe par case. Plus simple, mais le dessin devient irréaliste dès qu'une case change de taille, ce qui va contre le but du réglage.

**B. Fiches**
- B1 : une fiche par vin et par case, avec une liste de places. Une seule correction pour 6 bouteilles identiques.
- **B2, retenue (choix de Rebecca) : une fiche par bouteille.** Modèle le plus simple et le plus direct : une bouteille touchée = une fiche. Revers assumé : corriger 6 bouteilles identiques demande 6 corrections, sauf avec l'aide proposée plus bas.

## Conception

### Données

- **Une case est une pile** (précision de Rebecca) : ses bouteilles occupent toujours les premières places de l'ordre de la pile, sans trou. Une bouteille ajoutée va **toujours en haut de la pile**. Quand une bouteille est retirée (bue, déplacée, vidée), **celles qui étaient au-dessus d'elle descendent d'un cran** pour prendre sa place.
- **Fiche d'une bouteille de case maçonnée** :
  - identifiant stable `K:c:r:u`, où `K:c:r` est la case et `u` un suffixe unique (base 36, généré à la création) ; il ne change pas quand la bouteille descend dans la pile ;
  - champ `pile` : son rang dans la pile (0 = coin en bas à droite, la première rangée).

  Les autres types gardent `K:c:r`. `isValidId` et `parseId` acceptent les deux formes (`u` vaut `null` sans suffixe).
- **Retirer une bouteille** = supprimer sa fiche **et** décrémenter `pile` de toutes les bouteilles de la case qui étaient au-dessus, dans **une seule transaction** IndexedDB (sinon un échec à mi-chemin laisserait un trou ou deux bouteilles au même rang). « Annuler » remet la fiche et les rangs d'avant, aussi en une transaction. `db.js` reçoit pour cela une opération groupée (écrire et supprimer ensemble).
- Fonctions pures dans `lib.js` : `pileOf(list, caseId)` (bouteilles d'une case triées par rang), `pushToPile(list, caseId, n)` (rangs des n nouvelles bouteilles), `removeFromPile(list, id)` (fiches à réécrire et à supprimer), `normalizePile` (remet des rangs 0…n−1 sans trou ni doublon si des données incohérentes sont lues).
- Une fiche de case maçonnée n'a pas de quantité (toujours 1 bouteille).
- **Réglage** (révision `CONFIG_REV = 3`) : un casier en cases maçonnées peut porter
  - `colW` : largeur de chaque colonne en mètres, de l'entrée vers le fond ;
  - `rowH` : hauteur de chaque rangée en mètres, du bas vers le haut.
  
  Absents ou invalides (mauvaise longueur, valeurs hors limites) : tailles régulières du type (0,60 × 0,38 m). Changer le nombre de colonnes ou de rangées dans « Rangement de la cave » ajoute des cases de taille par défaut à la fin, ou retire les dernières. Les autres types ignorent ces champs.
- Les sauvegardes contiennent déjà le réglage : `colW` et `rowH` y passent tels quels.

### Places dans une case (fonction pure `casePlaces(w, h)` dans `lib.js`)

- Diamètre d'une bouteille D = 0,08 m, marge de 1 cm sur les bords.
- Rangée du bas : n = ⌊(w − 0,02) / D⌋ places. La rangée suivante a n − 1 places, décalées d'un demi-diamètre. On alterne n, n−1, n… L'écart vertical entre rangées vaut D × sin 60°. On ajoute des rangées tant qu'elles tiennent dans h − 0,02.
- Exemple : une case de 60 × 38 cm donne 7 + 6 + 7 + 6 + 7 = 33 places. *La constante D se règle à l'essai sur une photo de la cave ; à ajuster si 33 semble trop.*
- Renvoie la liste des positions (centre de la bouteille, relatif au centre de la case) **dans l'ordre de la pile** : rangée du bas de droite à gauche, puis la rangée au-dessus de droite à gauche, etc. « Droite » est la droite vue depuis l'allée, face au casier. La bouteille de rang k est dessinée à la k-ième position ; la capacité de la case est le nombre de positions.
- Changer la taille d'une case reforme la pile à la nouvelle largeur : les bouteilles gardent leur ordre, mais une bouteille peut passer en fin de rangée ou au début de la rangée du dessus. C'est le comportement d'une pile, et on règle les séparations une fois, au début.

### Dessin 3D

- La façade d'un casier en cases maçonnées n'est plus une texture répétée : chaque case a son propre fond, à sa taille. Les séparations sont des objets fins, qu'on peut toucher et allumer (orange).
- Chaque bouteille enregistrée est un culot à sa place, de taille réelle (il ne rétrécit pas avec la case), de la couleur de son vin. Les places vides ne montrent rien (comme aujourd'hui).
- Recherche : un anneau orange par **bouteille** trouvée, et non plus par case.
- Le choix technique (un maillage par case, ou une texture redessinée pour tout le casier) est laissé au développeur, en gardant de bonnes performances sur iPhone (environ 30 cases × 33 places par casier).

### Parcours

1. **Vue d'ensemble → casier** : inchangé.
2. **Casier → case** : toucher une case zoome sur elle, qui remplit la partie libre de l'écran, **sans descendre sous 44 px par culot**. *Choix de Claude, à la suite de la relecture : une case de plus de 70 cm environ ne tient pas en entier à cette taille sur un iPhone en portrait ; elle s'affiche alors à 44 px par culot, cadrée sur son coin en bas à droite (le début de la pile), et on fait glisser pour voir le reste, comme on fait déjà défiler un casier.* Une fiche « Case » s'ouvre en bas :
   - titre : « Mur gauche · colonne 3 · rangée 2 » ;
   - contenu groupé par vin, par exemple « 6 × Château Margaux 2015 », « 4 × Yquem 2007 », et « 23 places libres » ;
   - boutons : **Ajouter des bouteilles**, **Vider cette case** (confirmation, puis « Annuler »).
   
   Toucher une ligne de la liste allume ces bouteilles dans la case.
3. **Dans la case zoomée** :
   - toucher une bouteille l'entoure et ouvre **sa fiche** (même fiche qu'aujourd'hui : modifier, déplacer, « j'ai la même ailleurs », « bouteille bue : la retirer ») ; la retirer fait descendre celles du dessus ;
   - toucher une place vide rouvre simplement la fiche Case (on ne choisit pas une place : on ajoute toujours en haut de la pile).
4. **Ajouter des bouteilles** : le formulaire actuel, avec un compteur « Nombre de bouteilles » (− / +). On enregistre N fiches identiques **en haut de la pile**. S'il manque de la place : « Il ne reste que X places dans cette case » et l'enregistrement est bloqué.
5. **Déplacer / J'ai la même ailleurs** : toucher une case (en vue casier ou zoomée) range la bouteille **en haut de sa pile**. Un déplacement écrit d'abord la bouteille dans la nouvelle case, puis la retire de l'ancienne (qui se tasse). Le bandeau actuel est conservé.
6. **Aide aux corrections (proposition de Claude, en complément de B2)** : après « Modifier la fiche » d'une bouteille, si d'autres bouteilles de la **même case** avaient exactement le même vin (nom et millésime) avant la modification, l'app demande : « Appliquer aussi ces changements aux 5 autres bouteilles identiques de cette case ? ».
7. **Liste, recherche, « À boire bientôt »** : une ligne par vin et par case, avec « × 6 », plutôt que 6 lignes identiques. Toucher la ligne ouvre la case zoomée, avec ces bouteilles allumées.

### Régler les séparations

- **Entrée** : menu → « Rangement de la cave » → pour chaque casier en cases maçonnées, un bouton **« Ajuster les séparations »**. *Choix de Claude : c'est un réglage qu'on fait une fois, il n'encombre pas la vue de tous les jours, et le père ne peut pas l'activer par erreur.*
- Le casier s'affiche de face avec un bandeau en haut : « Touchez une séparation, puis faites-la glisser » et les boutons **Terminé** et **Annuler**.
- Toucher une ligne (zone de toucher élargie, au moins 44 px) l'allume en orange, avec une poignée ronde. Glisser à partir de la ligne la déplace ; glisser ailleurs fait défiler le casier comme d'habitude. On ne peut sélectionner qu'une ligne à la fois.
- Seules les séparations **intérieures** bougent : la case de chaque côté grandit ou rétrécit d'autant, et la taille totale du casier ne change pas (elle se règle par le nombre de colonnes et de rangées).
- Pas de 1 cm. Taille minimale d'une case : 10 cm. **Une séparation s'arrête d'elle-même** au point où une case n'aurait plus assez de places pour ses bouteilles (capacité ≥ nombre de bouteilles). Aucune bouteille ne peut donc disparaître, et aucun avertissement n'est nécessaire.
- Pendant le glissement : la case, ses places et ses bouteilles se redessinent en direct, et sa taille s'affiche (« 52 × 40 cm »).
- **Terminé** enregistre le réglage ; **Annuler** remet les séparations d'avant.
- Réduire le nombre de colonnes ou de rangées dans « Rangement de la cave » garde l'avertissement actuel (fiches hors des dimensions, conservées mais invisibles).

### Ce qui disparaît ou bouge

- Le bouton « Gérer ce casier » est retiré de la vue casier.
- « Vider cette case » passe dans la fiche Case. « Vider une colonne / une rangée / tout le casier » passe dans « Rangement de la cave », pour chaque casier, sous le même bouton « Gérer » avec confirmation et « Annuler ». *Choix de Claude : ces actions sont rares et risquées, elles n'ont pas leur place dans la vue de tous les jours.*
- L'aide en bas de la vue casier devient : « Touchez une case pour l'ouvrir · glissez pour faire défiler ».

### Bouteilles d'exemple

Au premier lancement de la 0.4.0, les exemples sont retirés puis régénérés : des cases remplies de 0 à 20 bouteilles de vins mélangés, dans l'ordre de la pile.

## Laissé au développeur

- La technique de dessin des cases et des séparations, et la détection du toucher sur une ligne.
- Le cadrage exact de la caméra sur une case zoomée (réutiliser le cadrage actuel dans la partie libre de l'écran).
- L'organisation du code de `app.js` (fonctions nouvelles ou adaptées).
- Les tests de `lib.js` : `casePlaces`, fonctions de pile (`pileOf`, `pushToPile`, `removeFromPile`, `normalizePile`), identifiants à 4 parties, normalisation de `colW` et `rowH`, et la fonction de déplacement d'une séparation avec ses butées (taille minimale, capacité ≥ nombre de bouteilles).

## Vérification

- `npm test` (dont le test des variables non déclarées).
- iPhone (simulateur, format iPhone) :
  - ouvrir une case, ajouter 6 bouteilles puis 3 d'un autre vin, vérifier l'ordre de la pile ;
  - boire une bouteille du milieu : celles du dessus descendent ; « Annuler » remet tout comme avant ; en ajouter une : elle va en haut de la pile ;
  - rechercher un vin, vérifier les anneaux sur les bonnes bouteilles ;
  - déplacer une bouteille vers une autre case ;
  - régler des séparations dans les deux sens, y compris jusqu'à la butée d'une case pleine ;
  - « Annuler » le réglage ; vérifier la vue d'ensemble.
- Relecture `code-reviewer`.
