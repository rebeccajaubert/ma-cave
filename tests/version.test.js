// Vérifie que le numéro de version est le même partout (version.js, package.json, CHANGELOG.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

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
  for (const f of ['index.html', 'style.css', 'app.js', 'lib.js', 'db.js', 'scan.js', 'version.js', 'vendor/three.module.min.js', 'manifest.webmanifest']) {
    assert.ok(files.includes(f), `${f} manque dans APP_FILES (version.js)`);
  }
  for (const f of files.filter((x) => x !== './')) assert.doesNotThrow(() => read(f), `${f} est listé mais n'existe pas`);
  assert.match(read('sw.js'), /FILES = self\.APP_FILES/, 'le service worker doit utiliser APP_FILES');
});
