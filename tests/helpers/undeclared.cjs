// Détecte les identifiants utilisés mais jamais déclarés ni importés (ex. une déclaration
// supprimée par erreur : `highlighted` en 0.2.0 et 0.3.0). Analyse sans tenir compte des portées :
// elle rate un nom déclaré ailleurs dans le fichier, mais repère tout nom déclaré nulle part.
// Utilise l'analyseur JavaScript fourni avec Node (lancer avec --expose-internals).
'use strict';
const { readFileSync } = require('node:fs');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');

// Variables globales du navigateur, du service worker et de JavaScript utilisées par l'app.
const GLOBALS = new Set(`window self globalThis document location navigator localStorage sessionStorage indexedDB fetch
Response Request Headers URL URLSearchParams Image File Blob DataTransfer FormData Event CustomEvent AbortController
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
  return used.filter((n) => !declared.has(n.name) && !GLOBALS.has(n.name)).map((n) => `${file}:${n.loc.start.line} ${n.name}`);
}

const problems = process.argv.slice(2).flatMap(undeclared);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
