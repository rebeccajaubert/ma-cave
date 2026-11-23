# Rangement de la cave : entrée, texte au sol, casiers déplaçables (conception)

Date : 2026-11-23. Chantier `chantier/rangement`. L'utilisatrice a demandé d'avancer sans séance de questions :
les choix ci-dessous sont ceux de l'auteur (marqués « choix »), à corriger à la relecture.

## Intention
L'utilisateur doit avoir la main sur l'organisation de sa cave dans « Rangement de la cave » : où est l'entrée, quel
texte est écrit au sol (par défaut « La Cave de Verdelot »), et où sont placés les murs et les casiers (leur position,
pas seulement leur taille).

## Anti-objectifs
- **Perdre ou déplacer une bouteille enregistrée.** Les fiches restent attachées à leur casier (`G`, `IG`, `ID`, `D`) et à
  leur colonne et rangée : déplacer un casier le déplace avec toutes ses bouteilles ; changer l'entrée ne déplace rien.
- Un réglage illisible : un ancien réglage (sans les nouveaux champs) s'ouvre avec la disposition actuelle.

## Ce qui change (choix)
1. **Texte au sol** : le champ « Nom de la cave » devient « Texte au sol (nom de la cave) » ; il reste aussi le titre du
   menu. Vide → « La Cave de Verdelot ».
2. **Entrée** : deux possibilités, « Entrée devant » (aujourd'hui) ou « Entrée au fond » (l'autre bout du couloir sous la
   voûte). Le texte au sol et « ▼ ENTRÉE ▼ » vont de ce côté, tournés pour se lire en entrant ; la vue d'ensemble se
   place du côté de l'entrée. Les colonnes restent physiquement où elles sont ; seul leur **numéro affiché** suit
   l'entrée (« colonne 1 » = la plus proche de l'entrée), partout où un numéro de colonne est montré ou saisi.
   Choix : pas d'entrée sur un côté (sous une voûte, l'entrée est à un bout du couloir).
3. **Casiers déplaçables** : chaque casier (mur gauche, îlot gauche, îlot droit, mur droit) peut être décalé le long de
   la cave, vers le devant ou vers le fond, par pas de 10 cm (jusqu'à 4 m de chaque côté). L'îlot (ses deux faces
   ensemble) peut aussi être décalé vers le mur gauche ou le mur droit, par pas de 10 cm, en gardant au moins 60 cm de
   passage de chaque côté. La longueur de la cave s'agrandit d'elle-même pour contenir tous les casiers.
   Choix : boutons « ◀ / ▶ » avec la valeur affichée dans l'écran de réglage, appliqués avec « Appliquer » comme le
   reste du réglage (pas de glisser en 3D pour l'instant).

## Format du réglage
`normalizeConfig` accepte et borne : `entree` (`'avant'` | `'fond'`, défaut `'avant'`), `ilotX` (mètres, −1,1 à 1,1,
défaut 0), et pour chaque casier `z` (mètres, −4 à 4, défaut 0 ; positif = vers le devant). `CONFIG_REV` inchangé :
les nouveaux champs ont une valeur par défaut qui redonne la disposition actuelle.

## Logique pure (`js/lib.js`, testée)
- `colNumber(c, cols, entree)` : numéro de colonne affiché (1 = la plus proche de l'entrée) ; `colIndex(n, cols, entree)`
  l'inverse.
- `caveLength(racks)` : longueur de la cave qui contient tous les casiers décalés (redonne la longueur actuelle sans
  décalage).
- `normalizeConfig` : nouveaux champs bornés et arrondis au centimètre, stables.

## Hors champ
Ajouter ou supprimer des casiers, changer la forme de la cave (pas de voûte, plusieurs couloirs), tourner un casier.
