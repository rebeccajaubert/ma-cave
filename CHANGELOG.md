# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement [sémantique](https://semver.org/lang/fr/) :
`MAJEUR.MINEUR.CORRECTIF`. Le numéro de version est défini dans `version.js` (voir README, « Publier une version »).

## [Non publié]

### Ajouté
- **Disposition de la cave** (menu → *Rangement de la cave*) : on choisit le **texte écrit au sol** (« La Cave de Verdelot » par défaut), le côté de l'**entrée** (devant ou au fond ; la vue d'ensemble se place de ce côté et le texte se lit en entrant), et la **position de chaque casier** le long de la cave (▲ vers le devant / ▼ vers le fond, par 10 cm) ainsi que celle de l'**îlot** entre les deux murs (◀ / ▶). La cave s'allonge d'elle-même pour contenir les casiers.
- Les bouteilles suivent toujours leur casier. La colonne 1 reste la plus proche de l'entrée : si l'entrée change de bout, les **numéros** de colonne s'inversent partout (fiche, liste, « Vider une colonne », séparations), les bouteilles ne bougent pas.

### Technique
- **Code réorganisé**, sans changement visible : le code est rangé dans `js/` (l'ancien `app.js` de 2 100 lignes est découpé en modules : scène 3D, gestes, fiche, photo et voix, recherche, menu, sauvegardes…) et la feuille de style dans `css/`. Carte des modules en tête de `js/util.js`.
- De petits fichiers relais restent aux anciennes adresses pour qu'un téléphone encore en 1.0.0 puisse se mettre à jour (y compris avec « Mettre à jour l'application »).
- Le test des identifiants non déclarés vérifie aussi qu'aucun module ne réassigne une variable d'un autre.

## [1.0.0] - 2026-11-23

### Ajouté
- **Nouveau menu « Cave sombre »**, plus simple : bleu nuit (assorti à la cave), crème et or, en deux sections. « Ma cave » : Mes bouteilles, À boire bientôt, Rangement de la cave. « Mes données » : Sauvegarder (avec la date de la dernière sauvegarde), Réglages, Mode d'emploi. En tête, le nom de la cave et « 142 bouteilles · 18 places libres » ; la version en bas.
- **Écran « Réglages »** pour ce qui sert rarement : lecture automatique (photo et voix), restaurer une sauvegarde, revenir en arrière, installer sur l'iPhone, mettre à jour l'application, état du stockage protégé. « Retour » ramène des écrans ouverts depuis Réglages à Réglages.
- « Annuler » après « Les ranger dans cette case » (fiches « à ranger ») : les bouteilles rangées repartent et l'ancienne fiche revient. Refusé, sans rien toucher, si une de ces bouteilles a été modifiée, bue ou déplacée entre-temps.

### Modifié
- Boutons ☰ (menu) et ✕ (fermer) redessinés et bien centrés ; le ✕ est un peu plus grand (44 px) et le titre des fiches s'aligne sur lui.
- « Mettre à jour » n'est plus en haut du menu : il est dans Réglages (« Mettre à jour l'application », avec la version installée). Le bandeau vert annonce toujours une nouvelle version au lancement.

### Corrigé
- Les listes signalent une fiche dont l'emplacement n'existe plus avec les dimensions actuelles (« hors du rangement actuel »).
- Saisie à la voix : les horodatages « (00:04) » sont aussi retirés du texte compris.

### Technique
- Tests ajoutés (phrase de résumé du menu, choix de la case touchée, annulation du rangement, stockage de la clé Gemini, `rackSizes`).

## [0.5.0] - 2026-11-22

### Ajouté
- **Remplir une fiche en parlant.** En haut de la fiche, deux gros boutons : « 📷 Photo de l'étiquette » et « 🎤 Parler ». On touche « Parler », on décrit la bouteille naturellement (« Château Talbot 2016, Saint-Julien, j'en ai six, offert par Paul, à boire avant 2030 »), puis « J'ai fini » : l'IA (Gemini) range chaque information dans la bonne case — nom, couleur, millésime, « à boire jusqu'en », appellation, région, cépage, nombre de bouteilles, prix par bouteille, note, commentaires. On vérifie, puis on enregistre.
- « J'ai compris : … » affiche le texte compris, modifiable ; « Remplir la fiche » le renvoie. « Reparler » complète ou corrige (« non, c'est 2015 »). Sans micro (refusé ou indisponible), on peut dicter avec le micro du clavier ou écrire.
- Ce que la voix remplit remplace la valeur du champ, sauf ce qui a été tapé à la main dans la fiche. Rien n'est enregistré sans « Enregistrer ».
- Prix et note compris à la voix sont écrits à la française (« 20,5 »). Pendant l'écoute, les boutons de photo sont désactivés (une photo aurait fait perdre l'enregistrement).

### Modifié
- Le réglage s'appelle « Lecture automatique (photo et voix) » ; il prévient que la photo ou ce qui est dit est envoyé à Google.

### Corrigé
- La lecture d'étiquette envoyait d'abord une demande refusée par Google (couleur vide dans le schéma) avant de réessayer : elle aboutit maintenant du premier coup.

## [0.4.3] - 2026-11-22

### Ajouté
- **Copie de sécurité avant chaque nouvelle version** : au premier lancement d'une nouvelle version, l'application copie les bouteilles et le rangement sur le téléphone avant toute transformation des fiches. Si la copie échoue, rien n'est transformé. Les 4 copies les plus récentes sont gardées (si le téléphone manque de place, les plus anciennes sont supprimées pour faire la nouvelle). Si elle échoue quand même, l'application le dit et propose une sauvegarde en fichier.
- **Revenir en arrière** (menu, s'il existe une copie) : revenir à l'état d'avant une mise à jour ou d'avant une restauration. Restaurer une sauvegarde ou une copie garde d'abord une copie de l'état actuel.
- **Rappel de sauvegarde** : si les bouteilles n'ont jamais été sauvegardées, ou pas depuis un mois, l'application le propose au lancement (au plus une fois par semaine).
- Le menu indique la date de la dernière sauvegarde et si l'iPhone protège le stockage de l'application (il ne le videra pas pour faire de la place).

### Modifié
- **Plus de bouteilles d'exemple sur le téléphone** : elles ne sont plus ajoutées à la première ouverture, et celles qui restent sont retirées automatiquement (les vraies bouteilles ne sont pas touchées ; une bouteille d'exemple modifiée par l'utilisateur compte comme une vraie). Elles restent disponibles pour les tests, sur le serveur local ou avec `?debug`.

## [0.4.2] - 2026-11-21

### Corrigé
- Recherche : en touchant un résultat, seules les bouteilles de ce vin restent entourées en orange (une recherche large comme « Chat » laissait entourés tous les « Château… »), y compris après avoir modifié, déplacé ou retiré la bouteille choisie. Les anneaux s'éteignent en fermant la fiche quand la recherche est vide.

## [0.4.1] - 2026-11-21

### Corrigé
- Fiches « à ranger » (anciennes bouteilles qui n'avaient pas trouvé de place dans leur case) : la fiche de la case propose de **les ranger** (s'il y a de la place) ou de **les retirer** ; « Vider cette case » les retire aussi. Elles ne reviennent plus toutes seules après un vidage.
- Une case qui a plus de bouteilles que de places (après un « Annuler ») le signale, et la bouteille en trop reste accessible (« Voir la bouteille en trop ») pour la déplacer ou la retirer.
- Une bouteille de case dans un casier passé à un autre type de rangement s'ouvre depuis la liste ou la recherche, et peut être déplacée ou retirée.
- Une ancienne fiche hors des dimensions actuelles n'est plus marquée « à ranger » ni réécrite à chaque lancement.
- Restauration d'une sauvegarde : le rang dans la pile est toujours lu comme un nombre.
- Compatibilité avec les iPhone en iOS 15.0 à 15.3 (fonctions récentes remplacées).

## [0.4.0] - 2026-11-21

### Ajouté
- **Cases maçonnées en pile, une fiche par bouteille.** Toucher une case la montre en grand, avec son contenu groupé par vin et le nombre de places libres. Chaque bouteille a sa place : la pile part du coin en bas à droite ; une bouteille ajoutée va en haut ; une bouteille retirée (bue, déplacée) fait descendre celles du dessus. Toucher une bouteille ouvre sa fiche, qui dit où elle est dans la pile.
- **Ajouter des bouteilles** dans une case : nombre de bouteilles à ajouter ; refus clair s'il ne reste pas assez de places.
- Après la modification d'une bouteille, l'app propose d'appliquer les mêmes changements aux bouteilles identiques (même vin, même millésime) de la case.
- **Ajuster les séparations** (menu → Rangement de la cave) : on touche une séparation, verticale ou étagère, elle s'allume et on la fait glisser. Les étagères traversent tout le casier. Une séparation s'arrête d'elle-même avant qu'une case n'ait plus assez de places pour ses bouteilles. Le nombre de places de chaque case suit sa taille (bouteilles de 8 cm de diamètre).
- La recherche entoure chaque bouteille trouvée ; la liste regroupe les bouteilles identiques d'une même case (« × 6 »).

### Modifié
- Une case zoomée garde des bouteilles d'au moins 44 px à l'écran ; une très grande case est cadrée sur son coin en bas à droite.
- Les bouteilles d'exemple sont régénérées au nouveau format. Les anciennes fiches de cases maçonnées sont converties automatiquement (une fiche par bouteille) ; ce qui ne tient pas dans la case reste dans la liste, marqué « à ranger ».

### Retiré
- Le bouton « Gérer ce casier » de la vue d'un casier : vider une case se fait depuis sa fiche ; vider une colonne, une rangée ou tout un casier se fait depuis *Rangement de la cave* → *Gérer*.

### Technique
- Le retrait d'une bouteille et la descente de celles du dessus sont enregistrés en une seule transaction (jamais à moitié).

## [0.3.4] - 2026-11-21

### Modifié
- Casiers métalliques : **15 rangées** par défaut (la vraie hauteur à Verdelot). Un appareil resté sur l'ancien réglage d'origine (36 × 12) passe à 15 rangées ; les rangées se comptent depuis le bas, donc aucune fiche ne bouge. Un 36 × 12 choisi volontairement avant cette version est aussi converti : il suffit de le remettre dans « Rangement de la cave », il sera alors gardé.
- Confirmations plus claires avant les actions risquées :
  - ajouter des bouteilles d'exemple alors que de vraies fiches existent demande confirmation (les exemples ne vont que dans les places vides et ne touchent jamais une vraie fiche) ;
  - retirer les exemples indique le nombre de bouteilles, rappelle que les vraies fiches sont gardées, et peut être annulé pendant 10 secondes ;
  - restaurer une sauvegarde indique combien de fiches actuelles seront effacées définitivement et conseille de sauvegarder d'abord.

## [0.3.3] - 2026-11-21

### Corrigé
- Vue d'un casier : la phrase d'aide et le bouton « Gérer ce casier » ne recouvrent plus les bouteilles du bas ; la maquette est recentrée dans la partie libre de l'écran.

### Modifié
- Les bouteilles d'exemple sont toujours au format de la cave de Verdelot (cases maçonnées à gauche, casiers métalliques à droite). Un appareil de test resté sur l'ancien rangement en alvéoles avec seulement des exemples est remis au format Verdelot automatiquement, avec des exemples régénérés. Dès qu'une vraie fiche existe, rien n'est modifié.

## [0.3.2] - 2026-11-21

### Ajouté
- **Vérification des mises à jour à chaque retour dans l'app** (iOS reprend souvent l'app sans la recharger).
- **Mise à jour automatique** : dès qu'une nouvelle version est arrivée, les pages ouvertes passent toutes seules à cette version (même depuis les toutes premières versions). Si une fiche est en cours de saisie, un bandeau propose de le faire au bon moment.
- Les fichiers sont chargés avec le numéro de version dans leur adresse : après une mise à jour, Safari ne peut plus mélanger d'anciens et de nouveaux fichiers.
- **Page de dépannage `maj.html`** : débloque un appareil resté sur une très ancienne version (y compris dans Safari) en retéléchargeant l'application et en retirant l'ancienne copie hors-ligne, sans toucher aux bouteilles, aux réglages ni à la clé. Les anciennes versions ne l'ont jamais gardée en copie : elle est toujours lue sur le site.

## [0.3.1] - 2026-11-21

### Ajouté
- **Version installée affichée en haut du menu**, avec un bouton **« Mettre à jour »** qui vérifie le site et, si une nouvelle version existe, la télécharge vraiment (sans toucher aux bouteilles ni aux réglages).
- **Bandeau « Nouvelle version disponible »** au lancement quand une mise à jour est publiée.

### Corrigé
- Mise à jour hors-ligne : la mise en cache des fichiers ne dépend plus d'un appel refusé par Safari.

## [0.3.0] - 2026-11-17

### Ajouté
- Toutes les bouteilles sont montrées culot vers l'allée (bouchon caché), par choix esthétique.
- **Types de rangement par casier**, modélisés d'après la cave de Verdelot : cases maçonnées (bouteilles empilées, culot vers l'allée), casiers métalliques (une bouteille par place), alvéoles et caisses. Chaque casier a son type, ses colonnes et ses rangées (menu « Rangement de la cave »).
- **Avertissement clair** avant de changer le rangement d'un casier qui contient des fiches (risque de mélange) ou de réduire ses dimensions.
- **Îlot en deux casiers dos à dos**, chacun avec son propre meuble (plus de grand bloc commun).
- Clé de lecture d'étiquette : tous les formats de clé Google sont acceptés (espaces et retours à la ligne retirés), la validité est vérifiée directement auprès de Google.
- **Taille de chaque casier** affichée en mètres dans le réglage, mise à jour pendant la saisie : l'îlot peut être plus court ou plus long que les murs, et les murs différents entre eux.
- **« Gérer ce casier »** : vider une colonne, une rangée ou tout le casier ; « Vider cette case / caisse » depuis une fiche.
- **Annuler** pendant 10 secondes après toute suppression (bouteille bue, case ou colonne vidée…).
- **Mode d'emploi** au premier lancement (et dans le menu), liste **« À boire bientôt »**, filtre par couleur dans la liste des bouteilles.

### Modifié
- Configuration par défaut (nouvelle installation) : couloir de gauche en cases maçonnées (6 × 5), couloir de droite en casiers métalliques (36 × 12). Un appareil qui a déjà des fiches garde son rangement précédent (alvéoles), pour que rien ne bouge ; on le change ensuite dans « Rangement de la cave ».
- Casiers métalliques : ouverture et zoom adaptés pour que chaque place reste assez grande pour le doigt.
- Annuler : plusieurs suppressions rapprochées peuvent être annulées ensemble.

### Technique
- Mode hors-ligne en « réseau d'abord » (4 s maximum, puis cache) : la page et le code restent de la même version après une mise à jour. Si une ancienne page est tout de même servie avec le nouveau code, l'app se recharge une fois au lieu d'afficher un écran vide.
- Nouveau test qui détecte toute variable utilisée sans être déclarée dans le code de l'app (une telle erreur avait cassé la recherche pendant le développement).

## [0.2.0] - 2026-11-16

### Ajouté
- **Plusieurs bouteilles au même emplacement** : champ « Nombre de bouteilles à cet emplacement » (− / +), affiché dans la fiche, la liste, les totaux et en 3D (jusqu'à 3 bouteilles empilées visibles). « J'ai bu une bouteille » en retire une seule.
- **Ranger le même vin à plusieurs endroits** : bouton « Enregistrer, puis ranger la même ailleurs » et mode « J'ai la même ailleurs » avec compteur d'emplacements ajoutés et réglage du nombre de bouteilles par emplacement.
- **Suggestions de saisie** pour le nom, l'appellation, la région et le cépage, à partir des fiches existantes ; la saisie d'un vin déjà connu pré-remplit le reste de la fiche.
- **Lecture automatique de l'étiquette par photo** (Gemini, offre gratuite de Google) : remplit nom, millésime, appellation, région, cépage et couleur. Activation par une clé personnelle dans le menu « Lecture des étiquettes ».
- Numéro de version affiché dans le menu ; tests automatiques (`npm test`).

### Modifié
- Enregistrement sécurisé : la fiche est écrite sur l'appareil avant que « Fiche enregistrée » ne s'affiche ; un échec est signalé au lieu d'être ignoré. Un déplacement enregistre la nouvelle place avant de libérer l'ancienne.
- Code réorganisé en modules (`lib.js`, `db.js`, `scan.js`) et commenté ; le cache hors-ligne suit désormais le numéro de version.
- Le pré-remplissage d'un vin connu ne reprend le prix et la date limite de garde que pour le même millésime.
- Lecture d'étiquette : délais maximum, message dédié si le service Google a changé (« mettez l'application à jour »), pas de double lecture.
- Mise à jour hors-ligne plus fiable (`cache: 'reload'`, `updateViaCache: 'none'`) ; plus de double rangement en cas de double toucher en mode copie/déplacement.

## [0.1.0] - 2026-11-13

Première version (v0) : maquette 3D de la cave (vue d'ensemble puis casiers de face), fiches de bouteilles, étiquette en photo, recherche, sauvegarde et restauration, installation sur l'écran d'accueil de l'iPhone, fonctionnement hors-ligne.
