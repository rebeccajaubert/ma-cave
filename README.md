# Ma Cave

Une application iPhone pour retrouver chaque bouteille d'une cave à vin : une **maquette 3D** de la cave (deux couloirs en U autour d'un îlot central, sous une voûte), où l'on touche un emplacement pour voir la bouteille, sa fiche et son étiquette.

Application web installable (PWA) : pas d'App Store, pas de compte, gratuite. Les données restent **sur l'appareil**.

**Version actuelle : voir [CHANGELOG.md](CHANGELOG.md)** · **En ligne : <https://rebeccajaubert.github.io/ma-cave/>**

## Fonctionnalités

- **Vue d'ensemble** de la cave façon plan d'architecte, puis **casiers de face** (boutons en bas : murs gauche/droit, îlot gauche/droit).
- **Fiche de bouteille** : nom, couleur, millésime, appellation, région, cépage, prix, note, « à boire jusqu'en », commentaire, photo de l'étiquette.
- **Quatre types de rangement**, réglables casier par casier : cases maçonnées, casiers métalliques, alvéoles, caisses (voir « Rangement »).
- **Cases maçonnées en pile** : toucher une case la montre en grand avec son contenu (« 6 × Château Margaux 2015 »). Chaque bouteille a sa fiche et sa place : la pile part du coin en bas à droite, une bouteille ajoutée va en haut, une bouteille retirée fait descendre celles du dessus.
- **Séparations réglables** : menu → *Rangement de la cave* → *Ajuster les séparations* ; on touche une séparation (verticale ou étagère) et on la fait glisser. Une séparation s'arrête d'elle-même avant qu'une case n'ait plus assez de places pour ses bouteilles.
- **Plusieurs bouteilles par emplacement** (− / +) dans les autres rangements, et **même vin à plusieurs endroits** (« J'ai la même ailleurs »).
- **Vider** une case (depuis sa fiche), une colonne, une rangée ou tout un casier (menu → *Rangement de la cave* → *Gérer*), avec **Annuler** pendant 10 secondes.
- **À boire bientôt**, **filtre par couleur**, **mode d'emploi** au premier lancement.
- **Recherche** par nom, année, appellation, région… ; les résultats s'entourent d'un anneau orange dans la cave ; en touchant un résultat, seules les bouteilles de ce vin restent entourées.
- **Suggestions de saisie** à partir des fiches existantes.
- **Lecture automatique** (optionnelle, voir ci-dessous) : par **photo** de l'étiquette, ou **à la voix** (« 🎤 Parler » : on décrit la bouteille naturellement, l'IA range chaque information dans la bonne case ; texte compris modifiable, dictée du clavier en secours). On vérifie toujours avant d'enregistrer.
- **Sauvegarde et restauration** en fichier, **dimensions réglables**, **mode hors-ligne**.
- **Protection des données** : copie de sécurité sur le téléphone avant chaque nouvelle version et avant chaque restauration (menu → *Revenir en arrière*), rappel de sauvegarde après un mois, stockage protégé demandé à l'iPhone.

Un emplacement est soit *enregistré* (une fiche existe : la bouteille apparaît dans le casier), soit *non enregistré* (rien n'apparaît ; au toucher, la bouteille sort sans étiquette et propose de créer sa fiche).

## Installer sur l'iPhone

1. Ouvrir <https://rebeccajaubert.github.io/ma-cave/> dans **Safari** (pas Chrome).
2. Toucher **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer **Ma Cave** depuis l'icône (toujours depuis l'icône, pas depuis Safari : ce sont deux espaces de stockage distincts).

### Mettre à jour

La version installée est affichée **en haut du menu** (bouton ☰ en haut à droite), avec un bouton **« Mettre à jour »**. Au lancement, un bandeau vert annonce aussi toute nouvelle version publiée. La mise à jour retélécharge l'application depuis le site ; les bouteilles, les réglages et la clé de lecture sont conservés.

Les toutes premières versions (avant 0.3.1) n'ont pas ce bouton et peuvent rester bloquées, dans l'app comme dans Safari. **Dépannage** : ouvrir <https://rebeccajaubert.github.io/ma-cave/maj.html> dans Safari. Cette page retélécharge l'application et retire l'ancienne copie hors-ligne, sans toucher aux bouteilles, aux réglages ni à la clé. Pour une icône d'écran d'accueil restée bloquée, la solution reste de la supprimer puis de réinstaller depuis Safari (cela efface les fiches de cette icône).

## Rangement

Chaque casier (mur gauche, îlot gauche, îlot droit, mur droit) a un **type de rangement**, un nombre de **colonnes** (depuis l'entrée) et de **rangées** (depuis le bas) : menu → *Rangement de la cave*. Chaque casier a donc sa propre taille (affichée en mètres pendant le réglage) : l'îlot peut être plus court ou plus long que les murs, et les murs différents entre eux. Les casiers sont centrés dans la longueur de la cave ; l'îlot est fait de deux casiers dos à dos, chacun avec sa propre taille.

| Type | Un emplacement = | Disposition | Quantité par défaut |
|---|---|---|---|
| Cases maçonnées | une case (≈ 60 × 38 cm, réglable) | une pile en quinconce, une fiche par bouteille (33 places pour 60 × 38 cm) | — |
| Casier métallique | une place | une bouteille | 1 |
| Alvéoles | un trou | jusqu'à 3 visibles | 1 |
| Caisses | une caisse | 2 rangs de 3 | 6 |

Par choix esthétique, toutes les bouteilles sont montrées **culot vers l'allée** (bouchon caché), même là où elles sont en réalité goulot vers l'allée.

Réglage par défaut (cave de Verdelot) : couloir de gauche en cases maçonnées (6 colonnes × 5 rangées), couloir de droite en casiers métalliques (36 colonnes × 15 rangées). Une fiche reste attachée à son numéro de colonne et de rangée : changer le type de rangement d'un casier qui contient des fiches peut les mélanger, l'app le signale avant d'appliquer.

## Lecture automatique : photo et voix (optionnelle)

La photo de l'étiquette, ou l'enregistrement de ce qui est dit (« 🎤 Parler »), est envoyé à l'API **Gemini** de Google pour remplir la fiche. Il faut une clé gratuite :

1. Aller sur <https://aistudio.google.com/apikey>, se connecter, « Create API key » (gratuit, sans carte bancaire).
2. Dans l'app : menu → **Lecture automatique (photo et voix)** → coller la clé → **Enregistrer la clé** (elle est testée). À faire une fois sur chaque appareil.

Il n'y a volontairement **pas de fichier `.env`** : l'app n'a pas de serveur, et une clé placée dans le code serait publique sur GitHub.

À savoir :
- La clé est stockée **uniquement sur l'appareil** (jamais dans le code, GitHub ou les sauvegardes).
- Avec l'offre gratuite, Google peut réutiliser le contenu envoyé pour améliorer ses produits : ne photographier que des étiquettes, ne dire que ce qui concerne la bouteille.
- À la voix : l'iPhone demande l'accès au micro (souvent à chaque ouverture de l'app installée). Enregistrement d'une minute au plus. Ce que la voix remplit remplace la valeur d'un champ, sauf ce qui a été tapé à la main dans la fiche ; le prix est compris par bouteille. Le micro n'est permis que sur une page sûre (HTTPS, ou `localhost`) : pour l'essayer avant publication, utiliser le simulateur iOS sur `http://localhost:8765`.
- Sans clé ou sans réseau, la saisie manuelle reste disponible. Le modèle utilisé est défini dans `scan.js` (`MODELS`) ; les modèles Gemini changent, voir la documentation Google si la lecture cesse de fonctionner.

## Données et confidentialité

- Les fiches sont dans **IndexedDB** (navigateur de l'appareil). Supprimer l'icône ou effacer les données du site les efface : faire une **sauvegarde** (menu → *Sauvegarder mes données*) de temps en temps ; l'app le rappelle si la dernière date de plus d'un mois (au plus une fois par semaine).
- Une mise à jour ne touche pas aux fiches. Au premier lancement d'une nouvelle version, l'app copie d'abord fiches et rangement dans une base à part (`cave-a-vin-copies`, les 4 plus récentes) ; si la copie échoue, elle ne transforme pas les fiches. Restaurer (fichier ou copie) copie aussi l'état actuel avant de le remplacer.
- Au démarrage, l'app demande à l'iPhone de ne pas vider son stockage pour faire de la place (`navigator.storage.persist()`) ; la réponse est affichée dans le menu.
- Chaque ajout, modification ou suppression est écrit immédiatement sur l'appareil.
- Rien n'est envoyé en ligne, sauf la photo d'étiquette ou l'enregistrement de la voix, quand on utilise la lecture automatique.

## Développement

Pas de build : des fichiers statiques et des modules ES natifs.

```bash
npm test          # tests automatiques (Node ≥ 20, sans dépendance)
npm run serve     # serveur local sur http://localhost:8765  (ou : python3 -m http.server 8765)
```

Pour essayer sur un iPhone du même Wi-Fi : `http://<adresse-IP-du-Mac>:8765/?debug` (sans `?debug`, une adresse IP se comporte comme le site publié : pas de bouteilles d'exemple ; le service worker, donc le mode hors-ligne, ne s'active qu'en HTTPS).
Ajouter `?debug` à l'adresse expose `window.__cave` pour les tests dans le navigateur.

**Bouteilles d'exemple : en développement seulement.** Sur le serveur local (`localhost`) ou avec `?debug` dans l'adresse, une cave vide se remplit de bouteilles d'exemple au premier lancement, et le menu propose « Test : ajouter / retirer des bouteilles d'exemple ». Sur le site publié, aucun exemple n'est ajouté, et ceux laissés par une ancienne version sont retirés au lancement (après la copie de sécurité), sans toucher aux vraies fiches. Ouvrir le site publié avec `?debug` ajoute donc des exemples à une cave vide, retirés au lancement suivant sans `?debug`.

### Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page, interface (conçue pour un public peu à l'aise avec le numérique : gros boutons, textes clairs) |
| `app.js` | Scène 3D (Three.js), interactions, fiches, menu |
| `lib.js` | Fonctions pures (échappement HTML, identifiants, dimensions, quantités, suggestions ; pile des cases maçonnées, places en quinconce, séparations ; copies de sécurité et rappel de sauvegarde) |
| `db.js` | Stockage local IndexedDB (fiches, et copies de sécurité dans une base à part) |
| `scan.js` | Lecture automatique via Gemini : étiquette (photo) et description à la voix ou écrite (clé, requêtes, validation des réponses) |
| `version.js` | Numéro de version, source unique |
| `sw.js`, `manifest.webmanifest`, `icons/` | Mode hors-ligne et installation iPhone |
| `vendor/` | Three.js (copie locale, licence MIT) |
| `tests/` | Tests `node --test` |
| `.github/workflows/tests.yml` | Tests automatiques sur GitHub (`npm test` à chaque envoi et demande de fusion) |
| `.claude/` | Agent de relecture de code et automatisations (voir plus bas) |

Un emplacement s'identifie par `casier:colonne:rangée` (ex. `G:12:4`), colonnes comptées depuis l'entrée, rangées depuis le bas. Casiers : `G` mur gauche, `IG`/`ID` îlot gauche/droit, `D` mur droit. Dans une case maçonnée, chaque bouteille a son identifiant stable `casier:colonne:rangée:suffixe` et un champ `pile` (son rang dans la pile, 0 = coin en bas à droite) ; les tailles réglées des colonnes et rangées sont dans le réglage (`colW`, `rowH`, en mètres).

## Déploiement

Le site est servi par **GitHub Pages** depuis la branche `main` (racine du dépôt) : **pousser sur `main` publie le site** en une à deux minutes. Il n'y a ni serveur ni étape de construction ; les fichiers du dépôt sont les fichiers servis.

### Travailler sur une branche

`main` est ce qui est en ligne : on n'y travaille jamais directement. Chaque chantier a sa branche, de préférence dans son propre dossier (plusieurs chantiers peuvent avancer en même temps sans se gêner) :

```bash
git worktree add ../app_cave-menu -b chantier/menu main
```

Les **tests automatiques** (GitHub Actions, `.github/workflows/tests.yml`) lancent `npm test` à chaque envoi d'une branche et sur chaque demande de fusion.

### Publier une version

1. Sur la branche : mettre à jour le numéro dans `version.js` **et** `package.json`, les `?v=` de `index.html`, et ajouter l'entrée en tête de `CHANGELOG.md` (un test vérifie qu'ils concordent). Numérotation `MAJEUR.MINEUR.CORRECTIF` : correctif → CORRECTIF, nouvelle fonction → MINEUR, changement qui casse l'existant → MAJEUR.
2. `npm test`, vérification en local (format iPhone).
3. Envoyer la branche et ouvrir la demande de fusion : `git push -u origin chantier/<nom>` puis `gh pr create`.
4. Quand les tests GitHub sont verts et après vérification : fusionner (`gh pr merge`). **C'est la fusion dans `main` qui met le site en ligne.** `main` est protégée : un envoi direct est refusé.
5. Marquer la version publiée et créer sa page de Release :
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "Ma Cave X.Y.Z" && git push origin vX.Y.Z
   gh release create vX.Y.Z --title "Ma Cave X.Y.Z" --notes-file notes.md
   ```
   (`notes.md` : l'entrée de la version dans `CHANGELOG.md`.)

Chaque version publiée a son tag (`v0.1.0`, `v0.3.0` … `v0.5.0`) : `git checkout vX.Y.Z` retrouve exactement le code de cette version. Revenir en arrière : `git revert <commit>` sur une branche, puis la fusionner.

## Relecture de code automatisée

Le dossier `.claude/` contient, pour Claude Code :
- l'agent **`code-reviewer`** (`.claude/agents/code-reviewer.md`) : relecture en lecture seule selon les bonnes pratiques du projet (sécurité, données, PWA, ergonomie, 3D, documentation) ;
- des **hooks** (`.claude/settings.json`) : après chaque modification de code, la syntaxe est vérifiée et un marqueur « relecture en attente » est posé ; Claude ne peut pas conclure sans avoir lancé l'agent ;
- `CLAUDE.md` : les règles du projet.

Le plugin *superpowers* (méthodes de travail : tests d'abord, débogage méthodique, vérification avant de conclure) est installé au niveau de l'utilisateur (tous les projets). Il est complémentaire de `code-reviewer` : superpowers apporte une méthode générique, `code-reviewer` une liste de contrôle propre à Ma Cave, rendue obligatoire par les hooks.

## Limites connues / idées

- Les données ne sont pas partagées entre appareils (pas de compte en ligne).
- Affichage prévu en portrait ; le mode paysage n'est pas finalisé.
- Idées : filtres par région ou millésime, export de l'inventaire en tableau, partage entre deux téléphones.
