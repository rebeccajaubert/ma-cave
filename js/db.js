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

/**
 * Copies de sécurité prises avant une nouvelle version ou une restauration (base à part : la base des fiches
 * n'est jamais modifiée pour elles). Chaque copie a le format d'une sauvegarde (`config`, `bouteilles`, `date`…).
 * Un petit résumé de chaque copie (sans les fiches ni les photos) est rangé à côté, pour lister les copies
 * sans tout charger en mémoire.
 */
let copiesDb = null;   // connexion gardée : une seule ouverture par lancement
export async function openCopies() {
  copiesDb ||= new Promise((res, rej) => {
    if (!('indexedDB' in globalThis)) return rej(new Error('IndexedDB indisponible'));
    const r = indexedDB.open('cave-a-vin-copies', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('copies', { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore('resumes', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let db;
  try { db = await copiesDb; } catch (e) { copiesDb = null; throw e; }   // échec : on réessaiera à l'appel suivant
  const run = (mode, fn) => new Promise((res, rej) => {
    const tx = db.transaction(['copies', 'resumes'], mode);
    let out;
    fn(tx.objectStore('copies'), tx.objectStore('resumes'), (v) => { out = v; });
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
  return {
    /** Résumés des copies (sans les fiches). */
    summaries: () => run('readonly', (c, r, set) => { r.getAll().onsuccess = (e) => set(e.target.result); }),
    /** Une copie complète, ou undefined. */
    get: (id) => run('readonly', (c, r, set) => { c.get(id).onsuccess = (e) => set(e.target.result); }),
    /**
     * Ajoute une copie et son résumé, puis supprime les copies en trop, dans UNE transaction : la promesse ne se
     * résout qu'une fois la copie réellement écrite (sinon elle est rejetée et rien n'est supprimé).
     * @param {object} copy
     * @param {object} summary résumé (sans les fiches), complété par l'identifiant de la copie
     * @param {(ids: number[]) => number[]} drop identifiants à supprimer parmi ceux de toutes les copies
     */
    add: (copy, summary, drop) => run('readwrite', (c, r) => {
      c.add(copy).onsuccess = (e) => {
        r.put({ ...summary, id: e.target.result });
        c.getAllKeys().onsuccess = (k) => { for (const id of drop(k.target.result)) { c.delete(id); r.delete(id); } };
      };
    }),
    /**
     * Supprime des copies (et leurs résumés) pour faire de la place, par exemple si le téléphone est plein.
     * @param {(ids: number[]) => number[]} drop identifiants à supprimer parmi ceux de toutes les copies
     */
    trim: (drop) => run('readwrite', (c, r) => {
      c.getAllKeys().onsuccess = (k) => { for (const id of drop(k.target.result)) { c.delete(id); r.delete(id); } };
    }),
  };
}
