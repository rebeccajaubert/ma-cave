# Menu « Cave sombre » — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la colonne de 12 boutons du menu par un menu sombre en sections et un écran « Réglages ».
**Architecture :** `showMenu()` réécrit et nouveau `showSettings()` dans `app.js` ; une classe `cave` sur `#sheet` porte le style sombre (`style.css`) ; la phrase de résumé vient d'une fonction pure de `lib.js`.
**Tech Stack :** JS natif (modules ES), CSS, `node --test`.
**Spec :** `docs/superpowers/specs/2026-11-23-menu-cave-sombre-design.md`

## Global Constraints
- Textes en français ; tout texte variable (nom de la cave…) passe par `esc()`.
- Cibles tactiles ≥ 54 px ; couleurs : fond #2a0f17, texte #f3e9d8, or #c9a961, séparateurs #5a2a35.
- Aucune fonction retirée : chaque `data-act` actuel du menu reste atteignable en 2 touches.
- Ne jamais désactiver `tests/undeclared.test.js` ; commentaires en français.

## Review Focus
- Le style sombre « fuit » sur un autre écran (fiche bouteille ouverte après le menu) → `openSheet` doit retirer la classe `cave`.
- « Retour » depuis Lecture automatique / Copies de sécurité / Installer ramène à Réglages, pas au menu.
- 0 et 1 bouteille / place libre : singulier correct (test Task 1).
- Nom de cave contenant `<` ou `&` : affiché tel quel, non interprété (`esc`).
- Menu long sur petit iPhone (SE) : défile, rien de coupé.

---

### Task 1 : phrase de résumé (`lib.js`)
**Files :** Modify `lib.js` ; Test `tests/lib.test.js`
**Produces :** `export function caveSummary(bottles: number, free: number): string`

- [ ] Test `caveSummary accorde au singulier et au pluriel` :
  `caveSummary(142, 18) === '142 bouteilles · 18 places libres'`, `caveSummary(1, 1) === '1 bouteille · 1 place libre'`, `caveSummary(0, 0) === '0 bouteille · 0 place libre'`.
- [ ] `npm test` → échoue (fonction absente).
- [ ] Implémenter avec JSDoc (singulier pour 0 et 1, usage français).
- [ ] `npm test` → passe. Commit.

### Task 2 : menu, Réglages et style (`app.js`, `style.css`)
**Files :** Modify `app.js` (`openSheet` ~l.939, `showMenu` ~l.1542, Retour l.1276, 1817, 1906, écouteur `#sheetBody` ~l.1356), `style.css`
**Consumes :** `caveSummary`

- [ ] `openSheet` retire la classe `cave` de `#sheet` ; `showMenu`/`showSettings` la posent après l'appel.
- [ ] `showMenu()` : titre = `config.nom`, sous-titre `caveSummary(totalBottles(shown), total - filled)` ; sections « Ma cave » (inventory, soon, config) et « Mes données » (export + `safetyLine` réduite à la date, `settings`, help) ; version en pied. Lignes `<button class="row-cave" data-act=…>` avec pictogramme SVG en ligne (`aria-hidden`) et chevron.
- [ ] `showSettings()` : scan-settings, import, snapshots (si copies), install, ligne version + update-check, état du stockage protégé, boutons « Test : » (dev) ; bouton Retour → `menu`.
- [ ] Écouteur : `act === 'settings'` → `showSettings()`. Les Retour de `showScanSettings`, `showInstall`, `showCopies` passent à `data-act="settings"`.
- [ ] CSS : `#sheet.cave` (fond, titre à empattements Georgia, filet doré, `#sheetClose` adapté), `.cave-sec` (titres de section), `.row-cave` (min-height 54px, séparateurs).
- [ ] `npm test` → passe. Commit.

### Task 3 : fusion, version, documentation
- [ ] `git merge chantier/defauts-et-tests` (après accord de Rebecca) ; `npm test` passe.
- [ ] Version 1.0.0 : `version.js`, `package.json`, `?v=` de `index.html`, `CHANGELOG.md` (lignes reprises de `defauts-et-tests-pour-1.0.0.md` + menu) ; README (section menu).
- [ ] `npm test` → passe. Commit.

### Task 4 : vérification
- [ ] `npm run serve`, `?debug`, format iPhone (375×812), rechargement forcé : menu, chaque entrée, Réglages et ses Retour, fiche bouteille ensuite (fond clair), console sans erreur.
- [ ] Agent `code-reviewer` ; corriger Bloquant/Important ; relancer si le code change.
