// Tests de la lecture d'étiquette (scan.js) avec un faux `fetch` : aucune requête réseau réelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanApiKey, buildRequest, parseLabelResponse, scanLabel, testApiKey, splitDataUrl, ScanError, scanErrorMessage, MODELS } from '../js/scan.js';

const PHOTO = 'data:image/jpeg;base64,AAAA';
const reply = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('splitDataUrl refuse ce qui n\'est pas une image', () => {
  assert.deepEqual(splitDataUrl(PHOTO), { mimeType: 'image/jpeg', data: 'AAAA' });
  assert.throws(() => splitDataUrl('data:text/html;base64,AAAA'), ScanError);
  assert.throws(() => splitDataUrl('http://exemple.fr/a.jpg'), ScanError);
});

test('buildRequest : photo, JSON demandé, schéma optionnel', () => {
  const r = buildRequest(PHOTO);
  assert.equal(r.contents[0].parts[1].inlineData.data, 'AAAA');
  assert.equal(r.generationConfig.responseMimeType, 'application/json');
  assert.ok(r.generationConfig.responseSchema);
  assert.equal(buildRequest(PHOTO, { withSchema: false }).generationConfig.responseSchema, undefined);
});

test('parseLabelResponse nettoie et valide', () => {
  const ok = parseLabelResponse(reply({ nom: ' Château   Margaux ', millesime: 'Récolte 2015', appellation: 'Margaux', region: 'Bordeaux', cepage: '', couleur: 'ROUGE' }));
  assert.deepEqual(ok, { nom: 'Château Margaux', millesime: '2015', appellation: 'Margaux', region: 'Bordeaux', cepage: '', couleur: 'rouge' });
  const odd = parseLabelResponse(reply({ nom: 'x'.repeat(500), millesime: '3015', couleur: 'violet', region: 42 }));
  assert.equal(odd.nom.length, 120);
  assert.equal(odd.millesime, '');
  assert.equal(odd.couleur, '');
  assert.equal(odd.region, '');
});

test('parseLabelResponse accepte un JSON entouré de ```', () => {
  assert.equal(parseLabelResponse(reply('```json\n{"nom":"A"}\n```')).nom, 'A');
});

test('parseLabelResponse rejette une réponse inexploitable', () => {
  for (const bad of [{}, reply('pas du json'), reply('[1,2]'), reply('null')]) {
    assert.throws(() => parseLabelResponse(bad), (e) => e instanceof ScanError && e.kind === 'format');
  }
});

test('scanLabel : succès, clé envoyée en en-tête et jamais dans l\'URL', async () => {
  let seen;
  const out = await scanLabel({ dataUrl: PHOTO, apiKey: 'SECRET', fetchFn: async (url, init) => { seen = { url, init }; return resp(200, reply({ nom: 'Clos', millesime: '1998' })); } });
  assert.equal(out.nom, 'Clos');
  assert.ok(!seen.url.includes('SECRET'));
  assert.equal(seen.init.headers['x-goog-api-key'], 'SECRET');
  assert.ok(seen.url.includes(MODELS[0]));
});

test('scanLabel : sans clé', async () => {
  await assert.rejects(scanLabel({ dataUrl: PHOTO, apiKey: '' }), (e) => e.kind === 'nokey');
});

test('scanLabel : modèle inconnu (404) -> essaie le suivant', async () => {
  const calls = [];
  const out = await scanLabel({ dataUrl: PHOTO, apiKey: 'k', fetchFn: async (url) => { calls.push(url); return calls.length === 1 ? resp(404, { error: { message: 'not found' } }) : resp(200, reply({ nom: 'B' })); } });
  assert.equal(out.nom, 'B');
  assert.ok(calls[1].includes(MODELS[1]));
});

test('scanLabel : 400 de schéma -> réessaie sans schéma', async () => {
  const bodies = [];
  const out = await scanLabel({ dataUrl: PHOTO, apiKey: 'k', fetchFn: async (_u, init) => { bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? resp(400, { error: { message: 'schema invalid' } }) : resp(200, reply({ nom: 'C' })); } });
  assert.equal(out.nom, 'C');
  assert.ok(bodies[0].generationConfig.responseSchema);
  assert.equal(bodies[1].generationConfig.responseSchema, undefined);
});

test('scanLabel : classement des erreurs', async () => {
  const kind = async (res) => { try { await scanLabel({ dataUrl: PHOTO, apiKey: 'k', fetchFn: async () => res }); } catch (e) { return e.kind; } };
  assert.equal(await kind(resp(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })), 'key');
  assert.equal(await kind(resp(403, { error: { message: 'forbidden' } })), 'key');
  assert.equal(await kind(resp(429, { error: { message: 'quota' } })), 'quota');
  assert.equal(await kind(resp(503, { error: { message: 'down' } })), 'server');
  const net = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(scanLabel({ dataUrl: PHOTO, apiKey: 'k', fetchFn: net }), (e) => e.kind === 'network');
});

test('testApiKey', async () => {
  assert.equal(await testApiKey('k', async () => resp(200, {})), true);
  await assert.rejects(testApiKey('k', async () => resp(400, { error: { message: 'API key not valid' } })), (e) => e.kind === 'key');
});

test('chaque type d\'erreur a un message en français', () => {
  for (const kind of ['nokey', 'key', 'quota', 'network', 'timeout', 'server', 'format', 'model']) assert.ok(scanErrorMessage(new ScanError(kind)).length > 20, kind);
});

test('modèles tous inconnus (404) -> erreur « model » (l\'app est périmée), pas « illisible »', async () => {
  const all404 = async () => resp(404, { error: { message: 'models/x is not found' } });
  await assert.rejects(scanLabel({ dataUrl: PHOTO, apiKey: 'k', fetchFn: all404 }), (e) => e.kind === 'model');
  await assert.rejects(testApiKey('k', all404), (e) => e.kind === 'model');
});

test('testApiKey : délai dépassé -> timeout', async () => {
  const aborted = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  await assert.rejects(testApiKey('k', aborted), (e) => e.kind === 'timeout');
});

test('cleanApiKey : tolérant sur le format, strict sur les espaces et la longueur', () => {
  assert.equal(cleanApiKey('  AIzaSyA1234567890abcdefghijklmnopqrstu  '), 'AIzaSyA1234567890abcdefghijklmnopqrstu');
  assert.equal(cleanApiKey('AQ.Ab8RN6Kx_y-z.1234567890abcdef'), 'AQ.Ab8RN6Kx_y-z.1234567890abcdef');   // format avec des points
  assert.equal(cleanApiKey('"AIzaSyA1234567890abcdefghijk"'), 'AIzaSyA1234567890abcdefghijk');        // guillemets retirés
  assert.equal(cleanApiKey('AIzaSyA12345\n67890abcdefghijk'), 'AIzaSyA1234567890abcdefghijk');       // coupée sur deux lignes
  assert.equal(cleanApiKey('trop court'), '');
  assert.equal(cleanApiKey(''), '');
  assert.equal(cleanApiKey('clé avec é accent qui est assez longue'), '');
});

// Clé Gemini sur l'appareil : nettoyée à l'enregistrement, effaçable, et jamais d'erreur si le stockage est bloqué
import { getApiKey, setApiKey, clearApiKey } from '../js/scan.js';
test('clé : enregistrée nettoyée, relue, effacée ; stockage bloqué -> chaîne vide', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map(), fake = (o) => Object.defineProperty(globalThis, 'localStorage', { value: o, configurable: true, writable: true });
  try {
    fake({ getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
    const key = 'AIzaSy' + 'x'.repeat(30);
    setApiKey(`  « ${key} »\n`); assert.equal(getApiKey(), key);
    clearApiKey(); assert.equal(getApiKey(), '');
    fake({ getItem() { throw new Error('bloqué'); } }); assert.equal(getApiKey(), '');
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before); else delete globalThis.localStorage;
  }
});
