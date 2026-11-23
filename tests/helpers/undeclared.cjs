// Détecte les identifiants utilisés mais jamais déclarés ni importés, et les variables importées réassignées (ex. une déclaration
// supprimée par erreur : `highlighted` en 0.2.0 et 0.3.0). Analyse sans tenir compte des portées :
// elle rate un nom déclaré ailleurs dans le fichier, mais repère tout nom déclaré nulle part.
// Utilise l'analyseur JavaScript fourni avec Node (lancer avec --expose-internals).
'use strict';
const { readFileSync } = require('node:fs');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');

// Variables globales du navigateur, du service worker et de JavaScript utilisées par l'app.
const GLOBALS = new Set(`window self globalThis document location history navigator localStorage sessionStorage indexedDB fetch
Response Request Headers URL URLSearchParams MessageChannel Image File Blob FileReader MediaRecorder DataTransfer FormData Event CustomEvent AbortController
console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame performance
createImageBitmap structuredClone getComputedStyle confirm alert caches importScripts clients
Promise Math JSON Object Array String Number Boolean Date Map Set WeakMap Symbol Error TypeError RangeError
parseInt parseFloat isNaN isFinite Infinity NaN undefined arguments`.split(/\s+/));

function namesOf(pattern, out) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier': out.add(pattern.name); break;
    case 'ObjectPattern': for (const p of pattern.properties) namesOf(p.type === 'RestElement' ? p.argument : p.value, out); break;
    case 'ArrayPattern': for (const e of pattern.elements) namesOf(e, out); break;
    case 'RestElement': namesOf(pattern.argument, out); break;
    case 'AssignmentPattern': namesOf(pattern.left, out); break;
  }
}

function undeclared(file) {
  const code = readFileSync(file, 'utf8');
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: /import |export /.test(code) ? 'module' : 'script', locations: true });
  const declared = new Set(), used = [];
  walk.simple(ast, {
    VariableDeclarator: (n) => namesOf(n.id, declared),
    ImportSpecifier: (n) => declared.add(n.local.name),
    ImportDefaultSpecifier: (n) => declared.add(n.local.name),
    ImportNamespaceSpecifier: (n) => declared.add(n.local.name),
    CatchClause: (n) => namesOf(n.param, declared),
    Class: (n) => n.id && declared.add(n.id.name),
    Function: (n) => { if (n.id) declared.add(n.id.name); for (const p of n.params) namesOf(p, declared); },
  });
  walk.ancestor(ast, {
    Identifier: (n) => used.push(n),
    // cible d'une affectation (`x = …`) : c'est aussi un usage
    VariablePattern: (n, _st, anc) => {
      if (anc.some((a) => (a.type === 'AssignmentExpression' && a.left === n) || ((a.type === 'ForOfStatement' || a.type === 'ForInStatement') && a.left === n))) used.push(n);
    },
  });
  // Une liaison importée ne se réassigne pas (erreur à l'exécution) : passer par une fonction du module qui la possède
  const imported = new Set(); walk.simple(ast, { ImportSpecifier: (n) => imported.add(n.local.name), ImportDefaultSpecifier: (n) => imported.add(n.local.name) });
  const reassigned = [];
  walk.simple(ast, {
    AssignmentExpression: (n) => { if (n.left.type === 'Identifier' && imported.has(n.left.name)) reassigned.push(n.left); },
    UpdateExpression: (n) => { if (n.argument.type === 'Identifier' && imported.has(n.argument.name)) reassigned.push(n.argument); },
  });
  return [
    ...used.filter((n) => !declared.has(n.name) && !GLOBALS.has(n.name)).map((n) => `${file}:${n.loc.start.line} ${n.name}`),
    ...reassigned.map((n) => `${file}:${n.loc.start.line} ${n.name} (réassigne une variable importée d'un autre module)`),
  ];
}

// Entre les fichiers analysés : chaque nom importé (`import { a } from './x.js'`) doit être exporté par ce fichier,
// sinon le navigateur refuse de lancer l'application (erreur au chargement, que les tests unitaires ne voient pas).
const path = require('node:path');
function missingExports(files) {
  const parsed = new Map(files.map((f) => {
    const code = readFileSync(f, 'utf8');
    return [path.resolve(f), acorn.parse(code, { ecmaVersion: 'latest', sourceType: /import |export /.test(code) ? 'module' : 'script', locations: true })];
  }));
  const exportsOf = (ast) => {
    const out = new Set(); let star = false;
    for (const n of ast.body) {
      if (n.type === 'ExportAllDeclaration') star = true;
      if (n.type !== 'ExportNamedDeclaration') continue;
      if (n.declaration?.id) out.add(n.declaration.id.name);
      for (const d of n.declaration?.declarations || []) namesOf(d.id, out);
      for (const sp of n.specifiers || []) out.add(sp.exported.name);
    }
    return { out, star };
  };
  const problems = [];
  for (const [file, ast] of parsed) for (const n of ast.body) {
    if (n.type !== 'ImportDeclaration' || !n.source.value.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), n.source.value.split('?')[0]);
    if (!parsed.has(target)) continue;   // fichier non analysé (ex. Three.js)
    const { out, star } = exportsOf(parsed.get(target));
    if (star) continue;
    for (const sp of n.specifiers) if (sp.type === 'ImportSpecifier' && !out.has(sp.imported.name)) problems.push(`${path.relative(process.cwd(), file)}:${n.loc.start.line} ${sp.imported.name} n'est pas exporté par ${n.source.value}`);
  }
  return problems;
}

const problems = [...process.argv.slice(2).flatMap(undeclared), ...missingExports(process.argv.slice(2))];
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
