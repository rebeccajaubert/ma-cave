# Menu « Cave sombre » — design court

## Pourquoi
Le menu actuel aligne une douzaine de boutons identiques, sans hiérarchie : l'utilisateur (60 ans, peu à l'aise avec le numérique, iPhone) ne distingue pas l'usage quotidien des réglages ponctuels. Rebecca veut un menu épuré, d'allure « appli de luxe », dans l'univers vin et champagne.

## Objectifs
- Menu principal court (5 entrées), groupé en sections titrées, gros éléments faciles à toucher.
- Ce qui sert rarement passe dans un écran « Réglages ».
- Style sombre bleu nuit (assorti au bleu de la cave ; le bordeaux d'abord retenu a été écarté par Rebecca après essai), texte crème, filets dorés, titre à empattements.

## Hors champ
- Les autres écrans (liste des bouteilles, fiches, formulaires, mode d'emploi…) gardent leur style clair actuel (choix 1 de Rebecca).
- Aucune fonction ajoutée ni retirée : seuls l'ordre, les regroupements, les libellés et le style changent.

## Anti-objectifs
- Un menu joli mais moins lisible en plein jour ou avec des cibles plus petites qu'aujourd'hui (≥ 54 px).
- Une fonction devenue introuvable (chaque bouton actuel reste accessible en 2 touches au plus).

## Approches envisagées
- A · Cave sombre, liste en sections — **retenue par Rebecca**.
- B · Champagne clair, tuiles ; C · Étiquette, mixte — écartées.
- Portée du style : menu + Réglages seulement (retenue), tous les écrans du menu, toute l'app (déconseillée : formulaires moins lisibles).

## Le design
Menu principal (fiche du bas, fond bleu nuit) :
```
            Ma Cave            ← nom de la cave, police à empattements
             ────              ← filet doré
  142 bouteilles · 18 places libres

  MA CAVE
  🍷 Mes bouteilles              ›
  ⏳ À boire bientôt             ›
  ▦  Rangement de la cave        ›
  MES DONNÉES
  ⛨  Sauvegarder mes données     ›
     Dernière sauvegarde : hier
  ⚙  Réglages                    ›
  ?  Mode d'emploi               ›

        Version 1.0.0
```
Écran « Réglages » (même style, bouton Retour vers le menu) :
- Lecture automatique (photo et voix) (activée)
- Restaurer une sauvegarde
- Revenir en arrière (copies de sécurité) — si des copies existent
- Installer sur l'iPhone
- Version installée X.Y.Z + « Mettre à jour »
- Stockage protégé par l'iPhone : oui/non (+ conseil si non)
- En mode dev : boutons « Test : »

Les écrans ouverts depuis Réglages (lecture automatique, copies de sécurité, installation) reviennent à Réglages par « Retour ».

## Laissé au réalisateur (choix de Claude)
- Icônes : petits pictogrammes au trait en SVG en ligne (couleur dorée), pas de police d'icônes.
- Couleurs : fond #0a1d38, texte #f3e9d8, or #c9a961, séparateurs #26436e ; contrastes vérifiés (crème sur bleu nuit ≈ 14:1, or ≈ 7,5:1).
- Style limité par une classe sur `#sheet` (ex. `cave`), posée par `showMenu`/`showSettings` et retirée par `openSheet` pour les autres écrans.
- La phrase « 142 bouteilles · 18 places libres » (singulier/pluriel) est une fonction pure de `lib.js`, testée.
- Version : 1.0.0 (à confirmer par Rebecca), avec les corrections de `chantier/defauts-et-tests` fusionnées avant le passage de version.
