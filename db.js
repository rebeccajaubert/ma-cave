/**
 * Stockage des fiches sur l'appareil (IndexedDB).
 * Chaque écriture est validée par le navigateur avant que la promesse ne se résolve :
 * une fiche « enregistrée » l'est donc réellement, même si l'app est fermée juste après.
 * Aucune donnée ne quitte l'appareil.
 */

const DB_NAME = 'cave-a-vin';
const STORE = 'bouteilles';

/** Ouvre la base et renvoie l'accès aux fiches. Rejette si IndexedDB est indisponible. */
export async function openStore() {
  const db = await new Promise((res, rej) => {
    if (!('indexedDB' in globalThis)) return rej(new Error('IndexedDB indisponible'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  /** Exécute `fn(store)` dans une transaction et attend sa validation complète. */
  const run = (mode, fn) => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(out?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

  return {
    /** Toutes les fiches. */
    getAll: () => run('readonly', (s) => s.getAll()),
    /** Ajoute ou remplace une fiche. */
    put: (rec) => run('readwrite', (s) => s.put(rec)),
    /** Ajoute ou remplace plusieurs fiches en une seule transaction. */
    putMany: (list) => run('readwrite', (s) => { for (const b of list) s.put(b); }),
    /** Supprime une fiche. */
    remove: (id) => run('readwrite', (s) => s.delete(id)),
    /** Supprime plusieurs fiches en une seule transaction. */
    removeMany: (ids) => run('readwrite', (s) => { for (const id of ids) s.delete(id); }),
    /**
     * Supprime et écrit plusieurs fiches dans UNE transaction : tout est enregistré, ou rien.
     * Sert au retrait d'une bouteille de case : sa suppression et la descente de celles du dessus ne doivent
     * jamais être écrites à moitié (sinon un trou ou deux bouteilles au même rang dans la pile).
     */
    batch: (puts, removeIds) => run('readwrite', (s) => { for (const id of removeIds) s.delete(id); for (const b of puts) s.put(b); }),
    /** Remplace tout le contenu (restauration d'une sauvegarde). */
    replaceAll: (list) => run('readwrite', (s) => { s.clear(); for (const b of list) s.put(b); }),
  };
}
