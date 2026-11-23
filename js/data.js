// Données : réglage de la cave (dimensions), couleurs de vin, fiches en mémoire et leur enregistrement sur l'appareil.
import { normalizeConfig, DEFAULT_CONFIG, isDevMode, colNumber } from './lib.js';
import { toast } from './util.js';

// ---------- Configuration (dimensions de la cave, gardées sur l'appareil) ----------
export const CONFIG_KEY = 'cave-config-v4';   // les anciennes clés (v3, v2) sont relues et converties par normalizeConfig

function loadConfig() {
  try { return normalizeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem('cave-config-v3') || localStorage.getItem('cave-config-v2') || 'null')); }
  catch { return { ...DEFAULT_CONFIG }; }
}
export const config = loadConfig();
/** Numéro de colonne montré à l'utilisateur (1 = la plus proche de l'entrée, qui peut être devant ou au fond). */
export const colNo = (k, c) => colNumber(c, config.racks[k]?.cols ?? c + 1, config.entree);

// ---------- Couleurs de vin ----------
export const TYPES = {
  rouge: { nom: 'Rouge', verre: 0x14220e, capsule: 0x6e1020, css: '#8e1b2e' },
  blanc: { nom: 'Blanc', verre: 0x7f8f30, capsule: 0xc9a94a, css: '#c9b23a' },
  rose: { nom: 'Rosé', verre: 0xe0998f, capsule: 0xe9c2bc, css: '#e79a94' },
  bulles: { nom: 'Champagne', verre: 0x2a4a1e, capsule: 0xc8a23a, css: '#4f7a3a' },
  liquoreux: { nom: 'Liquoreux', verre: 0xb37c1c, capsule: 0xb8862b, css: '#c98a22' },
  autre: { nom: 'Autre', verre: 0x3a2716, capsule: 0x2a2a2a, css: '#5a4030' },
};
export const typeOf = (b) => TYPES[b?.couleur] || TYPES.rouge;
export const UNKNOWN_GLASS = 0x14220e;

// ---------- Fiches : en mémoire, et enregistrées sur l'appareil à chaque modification ----------
export let store = null;                // accès à la base locale (null si le stockage est indisponible)
/** Accès à la base locale, ouvert au démarrage (null si le stockage est indisponible). */
export function setStore(s) { store = s; }
// Mode développement (serveur local ou ?debug) : seul mode où existent les bouteilles d'exemple
export const DEV = isDevMode(location.hostname, location.search);
export const records = new Map();       // identifiant d'emplacement -> fiche
export const bottleAt = (id) => { const b = records.get(id); return b && !b.vide ? b : null; };
export const allBottles = () => [...records.values()].filter((b) => !b.vide);

/**
 * Exécute une écriture sur la base locale. Renvoie true si on peut poursuivre (écriture réussie,
 * ou stockage indisponible : la modification vit alors le temps de la séance, l'utilisateur est prévenu).
 * Renvoie false si l'écriture a échoué : l'appelant ne doit alors RIEN changer à l'écran ni en mémoire.
 */
export async function persist(op) {
  if (!store) { toast('Stockage indisponible : cette modification ne sera pas conservée à la fermeture'); return true; }
  try { await op(store); return true; }
  catch (e) { console.error(e); toast('Enregistrement impossible (espace plein ou stockage bloqué)'); return false; }
}
/** Message de succès ; sans stockage, dit honnêtement que la modification ne sera pas conservée. */
export const saved = (msg) => toast(store ? msg : 'Gardé jusqu\'à la fermeture de l\'app seulement (stockage indisponible)');
/** Enregistre une fiche : d'abord sur l'appareil, puis en mémoire (jamais l'inverse). */
export async function saveRecord(b) { const ok = await persist((s) => s.put(b)); if (ok) records.set(b.id, b); return ok; }
/** Supprime une fiche : d'abord sur l'appareil, puis en mémoire. */
export async function deleteRecord(id) { const ok = await persist((s) => s.remove(id)); if (ok) records.delete(id); return ok; }
/** Écrit et supprime plusieurs fiches dans UNE transaction, puis met la mémoire à jour (tout ou rien). */
export async function persistBatch(puts, removes) {
  const ok = await persist((s) => s.batch(puts, removes));
  if (ok) { for (const id of removes) records.delete(id); for (const b of puts) records.set(b.id, b); }
  return ok;
}
