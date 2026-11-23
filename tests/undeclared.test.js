// Les tests unitaires ne couvrent pas l'interface (js/ hors lib.js et scan.js) : ce test vérifie au moins
// qu'aucun identifiant n'y est utilisé sans être déclaré ou importé, ni aucune variable importée réassignée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Le détecteur utilise l'analyseur JavaScript interne de Node (pas de dépendance à installer).
// Si une future version de Node le retire, le test est sauté avec un message plutôt que de bloquer `npm test`.
const probe = spawnSync(process.execPath, ['--expose-internals', '-e', "require('internal/deps/acorn/acorn/dist/acorn'); require('internal/deps/acorn/acorn-walk/dist/walk')"], { encoding: 'utf8' });
const skip = probe.status === 0 ? false : 'analyseur interne de Node indisponible : ajouter acorn et acorn-walk en devDependencies';

test('aucun identifiant non déclaré dans le code de l\'app', { skip }, () => {
  // Tous les modules de js/, le service worker, la liste des fichiers et les relais provisoires de la racine
  const files = [...readdirSync(new URL('../js', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`), 'sw.js', 'version.js', 'app.js', 'lib.js', 'db.js', 'scan.js'];
  const r = spawnSync(process.execPath, ['--expose-internals', 'tests/helpers/undeclared.cjs', ...files], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `Identifiants non déclarés :\n${r.stdout}${r.stderr}`);
});
