# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement [sémantique](https://semver.org/lang/fr/) :
`MAJEUR.MINEUR.CORRECTIF`. Le numéro de version est défini dans `version.js` (voir README, « Publier une version »).

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
