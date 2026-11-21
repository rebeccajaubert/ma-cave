# Cases maçonnées en pile — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ma Cave 0.4.0. Chaque case maçonnée devient une pile de bouteilles, une fiche par bouteille. Les séparations se règlent dans les deux sens. On touche une case pour la zoomer et gérer son contenu. Le bouton « Gérer ce casier » disparaît.

**Architecture :**
- La logique pure va dans `lib.js` : identifiants, pile, géométrie des cases, places, butées des séparations. Elle est testée sous Node.
- `db.js` gagne une écriture groupée en une seule transaction.
- `app.js` dessine les cases à leur taille réelle et dérive la position de chaque bouteille de son rang dans la pile. Il ajoute la fiche « Case », la vue zoomée et le mode « Ajuster les séparations ».
- Les autres types de rangement (métal, alvéoles, caisses) gardent le modèle actuel : `K:c:r` avec une quantité.

**Tech Stack :** JS natif en modules ES, Three.js r170 (`vendor/`), IndexedDB, `node --test`. Pas d'étape de construction.

**Spec :** `docs/superpowers/specs/2026-11-21-cases-design.md`

## Global Constraints

- Interface et commentaires **en français** ; JSDoc sur toute fonction exportée ; tout texte saisi ou lu passe par `esc()`.
- **Données sacrées** : écrire sur l'appareil avant de mettre à jour la mémoire et l'écran (`persist`). Le retrait d'une bouteille et le tassement de la pile se font **dans une seule transaction**. Un déplacement écrit la nouvelle case avant de libérer l'ancienne. Toute suppression demande confirmation et propose « Annuler ».
- Diamètre d'une bouteille `BOTTLE_D = 0.08` m ; marge de bord `0.01` m ; écart vertical entre rangées `BOTTLE_D * Math.sin(Math.PI / 3)` ; taille minimale d'une case `0.10` m ; pas de réglage `0.01` m ; culot d'au moins **44 px** en vue zoomée.
- Ordre de la pile : rangée du bas **de droite à gauche** (droite vue depuis l'allée), puis la rangée au-dessus, etc. La rangée i a `n` places si i est pair, `n − 1` si i est impair, avec `n = ⌊(w − 0,02) / 0,08⌋`. Case de 0,60 × 0,38 m : 7 + 6 + 7 + 6 + 7 = **33** places.
- Ajout toujours **en haut** de la pile ; retrait = **ceux du dessus descendent d'un cran**.
- Identifiant d'une bouteille de case maçonnée : `K:c:r:u` (`u` suffixe base 36 unique et stable) + champ `pile` (0 = premier rang). Les autres types : `K:c:r`.
- Réglage : `CONFIG_REV = 3` ; `colW` / `rowH` (mètres) sur les casiers `style: 'cases'` seulement. Étagères continues sur toute la longueur.
- Version **0.4.0** dans `version.js`, `package.json`, `CHANGELOG.md` et les `?v=` de `index.html` ; README à jour ; `npm test` (dont `tests/undeclared.test.js`) ; vérification au format iPhone ; relecture `code-reviewer`. Ne **pas** pousser sans accord de Rebecca.

## Review Focus

1. **Coupure entre le retrait et le tassement** : il ne doit jamais rester de trou ni deux bouteilles au même rang. Couvert par la transaction unique (Task 3). `normalizePile` répare des données incohérentes à la lecture (test, Task 1).
2. **« Annuler » après qu'une autre bouteille a été ajoutée entre-temps** : on attend que la bouteille annulée revienne à son rang, et que les autres restent dans la case sans doublon. Test `undoRemoval` (Task 1).
3. **Case pleine, ou trop petite pour une seule bouteille** : « Ajouter » est bloqué avec « Il ne reste que X places ». Une séparation ne peut pas réduire la capacité sous le nombre de bouteilles. Tests `pushToPile` et `moveSeparator` (Tasks 1 et 2).
4. **Ancienne sauvegarde ou ancienne fiche `K:c:r` avec une quantité dans un casier de cases maçonnées** : elle est convertie en q bouteilles en pile, à l'import comme au démarrage. Le surplus reste en « à ranger » sans être perdu. Test `migrateCaseRecords` (Task 1).
5. **Réduire le nombre de colonnes ou de rangées** d'un casier qui a des bouteilles : les fiches hors dimensions sont conservées, invisibles, et toujours listées. Test `normalizeConfig` sur la longueur des tableaux (Task 2) ; avertissement existant conservé (Task 6).

---

### Task 1 : Identifiants et pile (`lib.js`)

**Files :** Modify `lib.js` (identifiants l. 22-24, nouvelles fonctions après `recordsIn`). Test `tests/pile.test.js` (nouveau).

**Interfaces :**
- Produces :
  - `isValidId(id) → boolean` : accepte `^(G|IG|ID|D):\d+:\d+(:[a-z0-9]+)?$` ;
  - `parseId(id) → { k, c, r, u }`, où `u` est une chaîne ou `null` ;
  - `caseIdOf(id) → 'K:c:r'` ;
  - `newBottleId(caseId, rand = Math.random) → 'K:c:r:u'` ;
  - `pileOf(list, caseId) → Array<rec>` : triées par `pile` croissant, sans les fiches `vide` ;
  - `pushToPile(list, caseId, n, capacity) → number[]`, les rangs à donner aux n nouvelles bouteilles. Lance `RangeError('place', { cause: libres })` si `count + n > capacity` ;
  - `removeFromPile(list, id) → { put: rec[], remove: string[] }` : la fiche retirée, plus les fiches du dessus avec `pile − 1` ;
  - `undoRemoval(list, removed: rec[]) → rec[]` : les fiches à réécrire pour remettre `removed` à leurs rangs, en remontant celles qui y sont maintenant ;
  - `normalizePile(list, caseId) → rec[]` : les fiches dont le rang change pour obtenir 0…n−1 (ordre conservé, égalités départagées par `ajout`) ;
  - `migrateCaseRecords(list, isCasesRack(k) → boolean, capacityOf(caseId) → number, rand) → { put, remove }` : convertit `K:c:r` + quantité q en q fiches empilées, et laisse le surplus avec `aRanger: true`.

- [ ] **Step 1 : Write the failing tests** in `tests/pile.test.js`:
  - `pile : identifiants` : `isValidId('G:2:3:k9x')`, `isValidId('G:2:3')`, `!isValidId('G:2:3:')` ; `parseId('IG:0:4:ab').u === 'ab'` ; `caseIdOf('D:1:2:z') === 'D:1:2'` ; `newBottleId('G:0:0', () => 0.5)` correspond à `isValidId`.
  - `pile : ajout en haut` : avec 3 bouteilles aux rangs 0,1,2 dans `G:0:0`, `pushToPile(list,'G:0:0',2,33)` vaut `[3,4]` ; `pushToPile(list,'G:0:0',31,33)` lance une `RangeError` dont `cause` vaut 30.
  - `pile : retrait au milieu` : on retire le rang 1 sur 0..3 ; `remove` contient son id ; `put` donne les anciens rangs 2 et 3 → 1 et 2 ; les fiches d'une autre case ne sont pas touchées.
  - `pile : annuler après un ajout` : rangs 0,1,2 ; on retire 1 (tassement) ; on ajoute X au rang 2 ; `undoRemoval` remet la fiche retirée au rang 1 et met les rangs 1 → 2 et 2 → 3, sans doublon.
  - `pile : normalisation` : les rangs [0, 2, 2, 7] deviennent 0,1,2,3, et la fiche la plus ancienne (`ajout`) passe en premier en cas d'égalité.
  - `pile : migration` : `G:1:1` avec `quantite: 5` et une capacité de 33 donne 5 fiches `G:1:1:*` aux rangs 0–4, sans `quantite`, et l'ancienne fiche est supprimée. Avec une capacité de 3 : 3 fiches empilées, plus l'ancienne fiche gardée avec `quantite: 2, aRanger: true`. Une fiche de casier métallique est ignorée.
- [ ] **Step 2 :** `npm test`. Attendu : échec (fonctions absentes).
- [ ] **Step 3 :** Mettre à jour `tests/lib.test.js:17` : `parseId('IG:0:5')` vaut désormais `{ k: 'IG', c: 0, r: 5, u: null }`. Ajouter `'G:1:2:'` aux identifiants invalides de la ligne 19.
- [ ] **Step 4 :** Implémenter les fonctions ci-dessus dans `lib.js`, avec JSDoc en français. Les fiches renvoyées sont des copies (`{ ...b, pile }`) : rien n'est modifié en place.
- [ ] **Step 5 :** `npm test`. Attendu : tout passe.
- [ ] **Step 6 :** Commit « Pile : identifiants et rangs des bouteilles de case (lib) ».

### Task 2 : Géométrie des cases, places et séparations (`lib.js`)

**Files :** Modify `lib.js` (`normalizeConfig`, `CONFIG_REV`, nouvelles fonctions après `cellLayout`). Test `tests/cases.test.js` (nouveau) et `tests/lib.test.js` (ajustement des tests de `rev`).

**Interfaces :**
- Consumes : `STYLES`, `rackLimits`, `CONFIG_REV`.
- Produces :
  - `BOTTLE_D = 0.08`, `CASE_MIN = 0.10` ;
  - `casePlaces(w, h) → Array<[x, y]>` : centres relatifs au centre de la case, dans l'ordre de la pile. x **positif = droite vue depuis l'allée**. `app.js` inverse x selon `rack.flip` ;
  - `rackGrid(rackCfg) → { colW: number[], rowH: number[], colX: number[], rowY: number[], W, H }`, où `colX` et `rowY` sont les bords gauche et bas cumulés depuis 0. Pour un casier non « cases », tailles régulières du type ;
  - `moveSeparator(sizes: number[], i, delta, minOf(index, size) → boolean) → number[]` : déplace la séparation entre `sizes[i]` et `sizes[i + 1]`. Arrondi au cm ; s'arrête à la dernière valeur où `sizes[i]` et `sizes[i + 1]` restent ≥ `CASE_MIN` et où `minOf` accepte les deux nouvelles tailles. La somme est conservée ;
  - `normalizeConfig` (rev 3) garde `colW` et `rowH` valides pour `style === 'cases'`. La longueur est ajustée à `cols` / `rows` (ajout de tailles par défaut ou coupe à la fin), chaque valeur bornée à [0,10 ; 1,5] m. Ces champs sont retirés pour les autres styles. Les règles de la rev 2 (36 × 12 → 15) s'appliquent toujours quand `rev < 2`.
- [ ] **Step 1 : Write the failing tests** in `tests/cases.test.js`:
  - `casePlaces : 60 × 38 cm` : longueur 33 ; le premier point est le plus à droite de la rangée du bas (x maximal, y minimal) ; le 8e point (indice 7) est le plus à droite de la deuxième rangée ; toutes les positions restent dans la case, marge comprise.
  - `casePlaces : case trop petite` : `casePlaces(0.09, 0.09).length === 1` ; `casePlaces(0.05, 0.38).length === 0`.
  - `rackGrid` : un casier de cases maçonnées 6 × 5 sans `colW` donne `W = 3.6` et `H = 1.9` ; avec `colW: [0.5, 0.7, 0.6, 0.6, 0.6, 0.6]`, on a `colX[2] === 1.2`.
  - `moveSeparator : somme conservée et butée` : `[0.6, 0.6]` avec +0.05 donne `[0.65, 0.55]` ; +0.55 donne `[1.1, 0.1]` ; avec un `minOf` qui refuse une taille < 0.5, +0.3 donne `[0.7, 0.5]`.
  - `normalizeConfig : colW/rowH` : un `rowH` de mauvaise longueur est complété ou coupé ; `colW` sur un casier métallique est retiré ; une valeur `0.01` est remontée à 0.10 ; `normalizeConfig(normalizeConfig(x))` est stable ; `DEFAULT_CONFIG.rev === 3`.
- [ ] **Step 2 :** `npm test`. Attendu : échec.
- [ ] **Step 3 :** Implémenter. Pour `casePlaces`, le bas de la rangée i est à `−h/2 + 0.01 + D/2 + i·D·sin60°` ; les rangées impaires sont décalées d'un demi-diamètre vers la gauche. On ajoute des rangées tant que `y + D/2 ≤ h/2 − 0.01`.
- [ ] **Step 4 :** `npm test`. Attendu : tout passe.
- [ ] **Step 5 :** Commit « Cases : places, géométrie et séparations (lib) ».

### Task 3 : Écriture groupée (`db.js`)

**Files :** Modify `db.js`.

**Interfaces :** Produces `store.batch(puts: rec[], removeIds: string[]) → Promise` : une seule transaction `readwrite`. Les suppressions passent avant les écritures.

- [ ] **Step 1 :** Ajouter `batch`, avec JSDoc expliquant pourquoi : le tassement de la pile ne doit jamais être à moitié écrit.
- [ ] **Step 2 :** `node --check db.js` puis `npm test`. Attendu : OK.
- [ ] **Step 3 :** Commit « db : écriture groupée en une transaction ».

### Task 4 : Dessin des casiers en cases maçonnées et position des bouteilles (`app.js`)

**Files :** Modify `app.js` : `dims` (l. ~93), `makeRack` (l. ~253), `slotLocal` / `slotWorld` / `inRack` (l. ~277-285), `rebuildBottles` / `rebuildRings` (l. ~299-326), `pick` (l. ~522), sélection (`selRing`).

**Interfaces :**
- Consumes : `rackGrid`, `casePlaces`, `pileOf`, `caseIdOf`, `parseId`.
- Produces (pour les tâches 5 à 7) :
  - `racks[k].grid` (sortie de `rackGrid`) ;
  - `caseLocal(rack, c, r) → [cx, cy, w, h]` : centre et taille de la case dans le repère du casier ;
  - `bottleLocal(rec) → [x, y] | null` : null si son rang dépasse la capacité ;
  - `rebuildRack(k)`, qui recrée la façade d'un casier après un changement de géométrie ;
  - `pick()` renvoie `{ type: 'slot', key, c, r, id? }`, où `id` est la bouteille touchée dans une case maçonnée (au plus près, à moins de `BOTTLE_D / 2`).

- [ ] **Step 1 :** Pour les casiers `cases`, remplacer la texture répétée par une façade par case : un fond à la taille de la case, et des séparations en maillages fins, chacun avec `userData.sep = { axis: 'col' | 'row', i }` pour la tâche 7. Les autres styles gardent la texture répétée. Le flip (colonne 1 près de l'entrée) s'applique à `colX` comme aujourd'hui.
- [ ] **Step 2 :** `rebuildBottles` dessine, pour chaque case maçonnée, `pileOf` aux positions de `casePlaces`, avec un culot de taille réelle (échelle `BOTTLE_D / 0.149`, diamètre du culot de `glassGeo`) et la couleur du vin. Les autres styles restent inchangés.
- [ ] **Step 3 :** Recherche et sélection : un anneau par bouteille (`bottleLocal`) dans les cases maçonnées, et un par emplacement ailleurs. `highlighted` contient des identifiants de fiche.
- [ ] **Step 4 :** `pick` : en vue casier, trouver la colonne et la rangée par recherche dans `colX` / `rowY` (tailles inégales), puis la bouteille la plus proche dans la case.
- [ ] **Step 5 : Vérifier** avec `npm test` puis, au format iPhone (393 × 760, `?debug`), la vue d'ensemble et les quatre casiers : pas d'erreur console, et les bouteilles d'exemple sont dessinées dans les cases. Les exemples au nouveau format viennent à la tâche 5 ; d'ici là, vérifier avec des fiches créées par `__cave.saveRecord`.
- [ ] **Step 6 :** Commit « Cases : façade à la taille réelle, bouteilles placées selon la pile ».

### Task 5 : Fiche « Case », ajout, retrait, déplacement, liste (`app.js`)

**Files :** Modify `app.js` : `tapSlot`, `selectSlot`, `showCard`, `showForm` et sa soumission (l. ~860-900), actions `drink` / `remove` / `copy` / `move`, `offerUndo` et `undoBtn`, `rowHtml` / `runSearch` / `showInventory` / `showSoon`, `seedDemo` / `clearDemo`, `start()`, import de sauvegarde.

**Interfaces :**
- Consumes : tâches 1, 3 et 4 (`store.batch`, `pushToPile`, `removeFromPile`, `undoRemoval`, `migrateCaseRecords`, `bottleLocal`, `pick().id`).
- Produces :
  - `showCase(caseId)`, la fiche Case ;
  - `addToCase(caseId, draft, n) → Promise<boolean>` ;
  - `removeBottles(ids: string[], label) → Promise<boolean>`, avec tassement et « Annuler » ;
  - `persistBatch(puts, removes) → Promise<boolean>`, l'équivalent de `persist` qui met aussi `records` à jour.

- [ ] **Step 1 :** Toucher une case maçonnée en vue casier ouvre `showCase(caseId)`. Le titre est « Mur gauche · colonne 3 · rangée 2 ». La fiche liste les bouteilles groupées par `nom + millésime`, sous la forme « 6 × Château Margaux 2015 », plus « N places libres ». Ses boutons sont **Ajouter des bouteilles** et **Vider cette case**. Toucher une ligne allume ces bouteilles. Le zoom sur la case vient à la tâche 6.
- [ ] **Step 2 :** En case maçonnée, toucher une bouteille ouvre `showCard(rec)`. Le bouton est « Bouteille bue : la retirer » (pas de quantité) ; « Vider cette case » reste dans la fiche Case. Toucher une place vide de la case rouvre `showCase` (on ne choisit pas de place).
- [ ] **Step 3 :** Formulaire en case maçonnée. Le compteur s'appelle « Nombre de bouteilles à ajouter ». L'enregistrement appelle `addToCase`, qui fait un `batch` des N fiches aux rangs `pushToPile`. S'il manque de la place : toast « Il ne reste que X places dans cette case » et rien n'est écrit. La modification d'une bouteille existante ne réécrit qu'elle. Si d'autres bouteilles de la même case avaient le même `nom` + `millesime` avant la modification, demander « Appliquer aussi ces changements aux N autres bouteilles identiques de cette case ? » ; un oui les réécrit dans le même `batch`.
- [ ] **Step 4 :** Retrait : « bue », « vider cette case » et la libération de l'ancienne place d'un déplacement passent par `removeBottles` (`removeFromPile` puis `batch`). « Annuler » utilise `undoRemoval`.
- [ ] **Step 5 :** Copie et déplacement : toucher une case maçonnée, en vue casier ou zoomée, range la bouteille en haut de la pile avec un nouvel id. Pour un déplacement, la nouvelle fiche est écrite d'abord, puis `removeBottles` sur l'ancienne. Si la case est pleine, afficher le toast et ne rien écrire. Les autres styles gardent le comportement actuel.
- [ ] **Step 6 :** Liste, recherche et « À boire bientôt » : une ligne par `caseId + nom + millesime`, avec « × n ». Toucher la ligne ouvre la case et allume ces bouteilles. `locText` et `locShort` acceptent les ids à 4 parties.
- [ ] **Step 7 :** Données au démarrage et à l'import :
  - `migrateCaseRecords` est appliqué puis écrit en `batch` avant le premier affichage ;
  - `normalizePile` est appliqué à chaque case lue ;
  - les fiches `aRanger` sont listées avec la mention « à ranger » ;
  - les exemples sont régénérés au nouveau format : de 0 à 20 bouteilles par case, vins mélangés. `shouldResetDemoToVerdelot` et le drapeau `cave-demo` sont conservés ; un nouveau drapeau `cave-demo-v4` déclenche la régénération une seule fois si toutes les fiches sont des exemples.
- [ ] **Step 8 : Vérifier** avec `npm test` puis, au format iPhone, ces scénarios :
  - ajouter 6 vins A puis 3 vins B, et vérifier l'ordre depuis le coin en bas à droite ;
  - boire la 2e bouteille : celles du dessus descendent ; « Annuler » remet tout comme avant ;
  - ajouter : la bouteille va en haut ;
  - déplacer une bouteille vers une autre case ;
  - rechercher « Margaux » : les anneaux sont sur les bonnes bouteilles ;
  - modifier le millésime d'une bouteille, puis répondre oui à « appliquer aux identiques ».
  
  Aucune erreur dans la console.
- [ ] **Step 9 :** Commit « Cases : fiche Case, ajout en haut de pile, retrait avec tassement ».

### Task 6 : Case zoomée et disparition de « Gérer ce casier » (`app.js`, `index.html`, `style.css`)

**Files :** Modify `app.js` (`focusSlot`, `showRack`, `clampView`, `applyVisibility`, `showRackTools`, `clearPart`, `showConfig`) ; `index.html` (retirer `#rackBtn`) ; `style.css` (règles `#rackBtn` et `body.rack-mode #hint`).

**Interfaces :** Produces `focusCase(k, c, r)`. Consumes `caseLocal`, `freeArea` / `usableRatio` (déjà présents).

- [ ] **Step 1 :** `focusCase` cadre la case dans la partie libre de l'écran, au-dessus de la fiche Case. La distance est la plus grande permise tant qu'un culot fait au moins 44 px (`BOTTLE_D` projeté). Si la case ne tient pas à cette taille, cadrer sur son coin en bas à droite ; le glisser reste possible (`clampView`).
- [ ] **Step 2 :** Retirer le bouton « Gérer ce casier » (HTML, CSS, écouteurs). L'aide de la vue casier devient « Touchez une case pour l'ouvrir · glissez pour faire défiler » pour les cases maçonnées, et reste « Touchez une bouteille · glissez pour faire défiler » ailleurs. Elle reprend toute la largeur ; `measureFreeArea` ignore l'élément absent.
- [ ] **Step 3 :** Dans « Rangement de la cave », chaque casier reçoit un bouton **Gérer** qui ouvre les outils actuels (vider une colonne, une rangée, tout le casier ; confirmation et « Annuler »), et, pour les cases maçonnées, **Ajuster les séparations** (tâche 7). `clearPart` passe par `removeBottles` pour les cases maçonnées.
- [ ] **Step 4 : Vérifier** au format iPhone : la case zoomée est entière pour 60 × 38 cm, cadrée en bas à droite pour une case de 1 m, avec des culots d'au moins 44 px (mesurés via `__cave.camera`). Les outils sont accessibles depuis le menu. Pas d'erreur console.
- [ ] **Step 5 :** Commit « Case zoomée ; outils de casier déplacés dans le menu ».

### Task 7 : Mode « Ajuster les séparations » (`app.js`, `index.html`, `style.css`)

**Files :** Modify `app.js` (gestes `pointerdown/move/up`, nouvel état `adjust`), `index.html` (bandeau `#adjustBar` avec `#adjustText`, `#adjustDone`, `#adjustCancel`), `style.css`.

**Interfaces :**
- Consumes : `moveSeparator`, `casePlaces`, `pileOf`, `rebuildRack`, `userData.sep`.
- Produces : `startAdjust(k)` et `endAdjust(save: boolean)`.

- [ ] **Step 1 :** `startAdjust(k)` ouvre le casier de face, ferme les fiches et affiche le bandeau « Touchez une séparation, puis faites-la glisser » avec **Terminé** et **Annuler**. Les séparations intérieures sont épaissies, avec une zone de toucher d'au moins 44 px. Toucher une ligne l'allume en orange avec une poignée ronde ; une seule ligne à la fois.
- [ ] **Step 2 :** Glisser en partant de la ligne allumée appelle `moveSeparator` sur `colW` ou `rowH`. `minOf` vérifie que chaque case touchée garde `casePlaces(w, h).length ≥ nombre de bouteilles`, sur toute la colonne pour une séparation verticale et sur toute la rangée pour une étagère. Le casier se redessine en direct (`rebuildRack`) et la taille de la case s'affiche dans le bandeau (« 52 × 40 cm »). Glisser ailleurs fait défiler le casier.
- [ ] **Step 3 :** **Terminé** écrit le réglage (`localStorage`, `rev: CONFIG_REV`) avant de quitter le mode. En cas d'échec : toast, et le mode reste ouvert. **Annuler** remet les tailles d'avant.
- [ ] **Step 4 : Vérifier** au format iPhone :
  - déplacer une étagère et une séparation verticale ;
  - pousser une séparation contre une case pleine : elle s'arrête ;
  - « Annuler » ; « Terminé » puis recharger : le réglage est gardé ;
  - pas d'erreur console.
- [ ] **Step 5 :** Commit « Mode Ajuster les séparations ».

### Task 8 : Version 0.4.0, documentation, vérification finale

**Files :** `version.js`, `package.json`, `index.html` (`?v=`), `CHANGELOG.md`, `README.md` (Fonctionnalités, Rangement, structure des identifiants).

- [ ] **Step 1 :** Passer à 0.4.0 partout. Écrire l'entrée du CHANGELOG (Ajouté, Modifié, Retiré : « Gérer ce casier ») et mettre à jour le README : pile, séparations, identifiants `K:c:r:u`.
- [ ] **Step 2 :** `npm test`. Attendu : tout passe, dont `version.test.js` et `undeclared.test.js`.
- [ ] **Step 3 : Vérifier dans le simulateur iPhone 15 (Safari)** la vérification complète de la spec, plus la mise à jour depuis la 0.3.4 : exemples régénérés et version 0.4.0 affichée dans le menu.
- [ ] **Step 4 :** Lancer `code-reviewer` ; corriger les points Bloquant et Important ; relancer si le code a changé.
- [ ] **Step 5 :** Commit et tag `v0.4.0` en local. **Ne pas pousser** : demander l'accord de Rebecca.
