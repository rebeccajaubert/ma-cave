// Vérifie que le numéro de version est le même partout (version.js, package.json, CHANGELOG.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const modules = readdirSync(new URL('../js', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);

test('version cohérente entre version.js, package.json et CHANGELOG.md', () => {
  const fromJs = /APP_VERSION\s*=\s*'([^']+)'/.exec(read('version.js'))?.[1];
  const fromPkg = JSON.parse(read('package.json')).version;
  const fromLog = /^##\s*\[?(\d+\.\d+\.\d+)/m.exec(read('CHANGELOG.md'))?.[1];
  assert.match(fromJs, /^\d+\.\d+\.\d+$/);
  assert.equal(fromPkg, fromJs, 'package.json différent de version.js');
  assert.equal(fromLog, fromJs, 'dernière entrée de CHANGELOG.md différente de version.js');
});

test('la liste des fichiers (version.js) contient toute l\'application et ils existent', () => {
  const list = /APP_FILES\s*=\s*\[([^\]]+)\]/.exec(read('version.js'))?.[1] ?? '';
  const files = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const f of ['index.html', 'css/style.css', ...modules, 'version.js', 'vendor/three.module.min.js', 'manifest.webmanifest']) {
    assert.ok(files.includes(f), `${f} manque dans APP_FILES (version.js)`);
  }
  for (const f of files.filter((x) => x !== './')) assert.doesNotThrow(() => read(f), `${f} est listé mais n'existe pas`);
  assert.match(read('sw.js'), /FILES = self\.APP_FILES/, 'le service worker doit utiliser APP_FILES');
});

test('index.html charge les fichiers avec le numéro de la version (?v=), modules compris', () => {
  const html = read('index.html'), version = /APP_VERSION\s*=\s*'([^']+)'/.exec(read('version.js'))?.[1];
  const tags = [...html.matchAll(/\?v=([0-9.]+)/g)].map((m) => m[1]);
  assert.ok(tags.length >= 6, 'css/style.css, version.js, js/app.js et les modules doivent avoir ?v=');
  for (const t of tags) assert.equal(t, version, `?v=${t} ne correspond pas à la version ${version}`);
  for (const f of ['css/style.css', 'version.js', 'js/app.js']) assert.ok(html.includes(`${f}?v=`), `${f} sans ?v=`);
  // tout module importé par un autre module de js/ doit être dans la table d'import, sinon Safari pourrait en garder une vieille copie
  for (const m of modules) {
    for (const [, f] of read(m).matchAll(/from '\.\/([^']+)'/g)) assert.ok(html.includes(`"./js/${f}": "./js/${f}?v=`), `js/${f} (importé par ${m}) manque dans la table d'import de index.html`);
  }
});

// Relais provisoires de la racine (1.0.1) : un téléphone encore en 1.0.0 retélécharge l'ancienne liste de fichiers.
// Ils renvoient vers js/ et css/, et ne font pas partie de l'application en cache.
test('relais de la racine : renvoient vers js/ et css/, absents de APP_FILES', () => {
  const list = /APP_FILES\s*=\s*\[([^\]]+)\]/.exec(read('version.js'))?.[1] ?? '';
  for (const f of ['lib.js', 'db.js', 'scan.js']) {
    assert.match(read(f), new RegExp(`export \\* from '\\./js/${f}'`), `${f} doit ré-exporter js/${f}`);
    assert.ok(!list.includes(`'${f}'`), `${f} (relais) ne doit pas être dans APP_FILES`);
  }
  assert.match(read('app.js'), /import '\.\/js\/app\.js'/);
  assert.match(read('style.css'), /@import url\('css\/style\.css'\)/);
  assert.ok(!list.includes("'app.js'") && !list.includes("'style.css'"), 'relais app.js / style.css dans APP_FILES');
});
