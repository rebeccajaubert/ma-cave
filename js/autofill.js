// Remplir une fiche automatiquement : lecture de l'étiquette (photo), saisie à la voix, réglages de la lecture automatique.
import { getApiKey, scanLabel, scanErrorMessage, readVoice, testApiKey, clearApiKey } from './scan.js';
import { esc, mergeVoice } from './lib.js';
import { bottleAt } from './data.js';
import { draftPhoto, newScanToken, openSheet, prefillFromKnown, scanToken, setChip } from './sheet.js';
import { $ } from './util.js';

// ---------- Lecture de l'étiquette par photo ----------
/** Range les champs lus sur l'étiquette dans le formulaire, sans écraser ce que l'utilisateur a déjà saisi. */
export function applyScan(form, out) {
  let n = 0;
  for (const k of ['nom', 'millesime', 'appellation', 'region', 'cepage']) {
    const el = form.elements[k]; if (out[k] && !el.value.trim()) { el.value = out[k]; n++; }
  }
  if (out.couleur && !form.dataset.colorTouched && !bottleAt(form.dataset.id)) { setChip(out.couleur); n++; }
  return n;
}
/** Envoie la photo du formulaire à Gemini puis remplit les champs. Sans clé enregistrée, ne fait rien. */
export async function runScan() {
  const form = $('form'), key = getApiKey();
  if (!form || !draftPhoto || !key) return;
  if (form.dataset.scanning) return;   // une lecture est déjà en cours pour ce formulaire
  form.dataset.scanning = '1';
  const scanBtn = form.querySelector('[data-act=scan]'); if (scanBtn) scanBtn.disabled = true;
  const token = newScanToken(), id = form.dataset.id, status = $('scanStatus');
  const say = (cls, text) => { status.className = 'scan ' + cls; status.textContent = text; };
  say('busy', 'Lecture de l\'étiquette…');
  try {
    const out = await scanLabel({ dataUrl: draftPhoto, apiKey: key });
    const f = $('form'); if (token !== scanToken || !f || f.dataset.id !== id) return;   // l'utilisateur est parti entre-temps
    const n = applyScan(f, out);
    if (!n) {
      const read = ['nom', 'millesime', 'appellation', 'region', 'cepage'].some((k) => out[k]);
      return read ? say('ok', 'Étiquette lue : vos saisies ont été conservées.') : say('err', 'Rien de lisible trouvé sur la photo : saisissez les informations à la main.');
    }
    prefillFromKnown(f);
    say('ok', 'Étiquette lue : vérifiez les champs avant d\'enregistrer.');
  } catch (e) {
    console.error(e);
    if (token === scanToken && $('form')) say('err', scanErrorMessage(e));
  } finally {
    delete form.dataset.scanning; if (scanBtn) scanBtn.disabled = false;
  }
}

// ---------- Saisie à la voix ----------
export let voice = null;              // enregistrement en cours : { rec, stream, chunks, timer, started, token, send }
export const VOICE_MAX_S = 60;        // au-delà, l'enregistrement s'arrête et part tout seul
// Boutons photo désactivés pendant l'écoute : une photo (ou sa lecture) redessinerait la fiche ou changerait le jeton,
// et l'enregistrement serait perdu
export const PHOTO_ACTS = '[data-act=photo], [data-act=scan], [data-act=nophoto]';
export const listOf = (s) => (s ? s.split(',').filter(Boolean) : []);
export function markHand(form, name) { const h = listOf(form.dataset.hand); if (!h.includes(name)) { h.push(name); form.dataset.hand = h.join(','); } }

/** Zone « J'ai compris » : texte modifiable (secours : dictée du clavier ou saisie) et « Remplir la fiche ». */
export function showVoiceZone(text, hint = '') {
  const zone = $('voiceZone'); if (!zone) return;
  zone.innerHTML = `${hint ? `<p class="help">${esc(hint)}</p>` : ''}
    <label class="field">J'ai compris :<textarea id="voiceText" rows="3" placeholder="Château Talbot 2016, Saint-Julien, j'en ai six…"></textarea></label>
    <div class="btns"><button type="button" class="btn primary" data-act="voice-text">Remplir la fiche</button></div>`;
  $('voiceText').value = text;   // posé comme valeur, jamais comme HTML
  const lbl = $('voiceBtn')?.querySelector('.lbl'); if (lbl && text) lbl.textContent = 'Reparler';
}
/** Libellé du bouton pendant l'enregistrement, et arrêt automatique au bout d'une minute. */
export function tickVoice() {
  if (!voice) return;
  const s = Math.floor((Date.now() - voice.started) / 1000), btn = $('voiceBtn');
  if (s >= VOICE_MAX_S) { stopVoice(true); return; }
  $('form')?.querySelectorAll(PHOTO_ACTS).forEach((b) => { b.disabled = true; });
  if (btn) { btn.classList.add('rec'); btn.querySelector('.ico').textContent = '■'; btn.querySelector('.lbl').textContent = `J'ai fini (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`; }
}
/** Commence l'écoute. Sans micro (refusé, ou impossible sur cet appareil) : le champ texte prend le relais. */
export async function startVoice() {
  const form = $('form'); if (!form || voice || form.dataset.scanning) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return showVoiceZone($('voiceText')?.value || '', 'Touchez le champ ci-dessous puis le micro du clavier pour dicter, ou écrivez.');
  }
  const token = scanToken, id = form.dataset.id;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
    return showVoiceZone($('voiceText')?.value || '', e?.name === 'NotAllowedError'
      ? 'Le micro n\'est pas autorisé : touchez « Autoriser » quand l\'iPhone le demande, ou dictez avec le micro du clavier ci-dessous.'
      : 'Micro indisponible : touchez le champ ci-dessous puis le micro du clavier pour dicter, ou écrivez.');
  }
  // Fiche quittée pendant la demande d'autorisation : on libère le micro tout de suite
  if (token !== scanToken || $('form')?.dataset.id !== id || voice) { stream.getTracks().forEach((t) => t.stop()); return; }
  const type = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t));
  let rec;
  try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) {
    console.error(e); stream.getTracks().forEach((t) => t.stop());
    return showVoiceZone($('voiceText')?.value || '', 'Enregistrement impossible : touchez le champ ci-dessous puis le micro du clavier pour dicter.');
  }
  const v = { rec, stream, chunks: [], started: Date.now(), token, send: false };
  rec.ondataavailable = (e) => { if (e.data?.size) v.chunks.push(e.data); };
  rec.onstop = () => {
    v.stream.getTracks().forEach((t) => t.stop());
    if (voice === v) {   // arrêté par l'iPhone lui-même (appel, écran verrouillé) : on remet le bouton et on propose d'écrire
      voice = null; clearInterval(v.timer); resetVoiceBtn();
      if (v.token === scanToken && $('form')) voiceError('L\'enregistrement a été interrompu : touchez « Parler » pour recommencer, ou écrivez ci-dessous.');
      return;
    }
    if (!v.send) return;
    const blob = new Blob(v.chunks, { type: rec.mimeType || type || 'audio/mp4' });
    if (!blob.size) { if (v.token === scanToken && $('form')) voiceError(scanErrorMessage({ kind: 'empty' })); return; }
    const fr = new FileReader();
    fr.onerror = () => { if (v.token === scanToken && $('form')) voiceError('L\'enregistrement n\'a pas pu être lu : réessayez, ou écrivez ci-dessous.'); };
    fr.onload = () => {
      const m = /^data:([^;,]+)[^,]*;base64,(.*)$/.exec(String(fr.result));
      if (m && v.token === scanToken) runVoice({ audio: { mimeType: m[1], data: m[2] } });
    };
    fr.readAsDataURL(blob);
  };
  voice = v; rec.start(); v.timer = setInterval(tickVoice, 1000); tickVoice();
  const st = $('scanStatus'); if (st) { st.className = 'scan busy'; st.textContent = 'Je vous écoute… touchez « J\'ai fini » quand c\'est dit.'; }
}
/** Arrête l'écoute ; `send` : envoyer ce qui a été dit (sinon on jette, et le micro est libéré). */
export function stopVoice(send) {
  if (!voice) return;
  const v = voice; voice = null; clearInterval(v.timer); v.send = send;
  try { if (v.rec.state !== 'inactive') v.rec.stop(); else v.stream.getTracks().forEach((t) => t.stop()); } catch { v.stream.getTracks().forEach((t) => t.stop()); }
  if (!send) v.stream.getTracks().forEach((t) => t.stop());
  resetVoiceBtn();
  const st = $('scanStatus'); if (send && st) { st.className = 'scan busy'; st.textContent = 'Envoi de ce que vous avez dit…'; }
}
export function resetVoiceBtn() {
  $('form')?.querySelectorAll(PHOTO_ACTS).forEach((b) => { b.disabled = false; });
  const btn = $('voiceBtn');
  if (btn) { btn.classList.remove('rec'); btn.querySelector('.ico').textContent = '🎤'; btn.querySelector('.lbl').textContent = $('voiceText')?.value ? 'Reparler' : 'Parler'; }
}
/** Message d'erreur de la voix, avec le champ texte pour écrire ou dicter à la place. */
export function voiceError(msg) {
  const st = $('scanStatus'); if (st) { st.className = 'scan err'; st.textContent = msg; }
  if (!$('voiceText')) showVoiceZone('');
}
/**
 * Fait comprendre ce qui a été dit (audio) ou écrit (texte) puis remplit la fiche. Le texte affiché fait foi : en texte,
 * il est renvoyé tel quel ; en audio, la nouvelle phrase s'ajoute à ce qui avait déjà été compris (« Reparler »).
 */
export async function runVoice({ audio, text }) {
  const form = $('form'), key = getApiKey();
  if (!form || !key) return;
  if (form.dataset.scanning) {   // une lecture (photo ou voix) est en cours : on attend qu'elle finisse, sans perdre ce qui a été dit
    for (let i = 0; i < 120 && $('form') === form && form.dataset.scanning; i++) await new Promise((r) => setTimeout(r, 250));
    if ($('form') !== form || form.dataset.scanning) return;   // fiche quittée, ou lecture toujours bloquée après 30 s
  }
  const before = audio ? ($('voiceText')?.value || '').trim() : '';
  if (!audio && !String(text).trim()) { showVoiceZone('', 'Écrivez ou dictez quelques mots sur la bouteille, puis touchez « Remplir la fiche ».'); return; }
  form.dataset.scanning = '1';
  const btns = form.querySelectorAll('[data-act=voice], [data-act=voice-text], [data-act=scan]'); btns.forEach((b) => { b.disabled = true; });
  const token = newScanToken(), id = form.dataset.id, status = $('scanStatus');
  const say = (cls, msg) => { status.className = 'scan ' + cls; status.textContent = msg; };
  say('busy', 'Je remplis la fiche…');
  try {
    const out = await readVoice({ audio, text, before, apiKey: key, year: new Date().getFullYear() });
    const f = $('form'); if (token !== scanToken || !f || f.dataset.id !== id) return;   // l'utilisateur est parti entre-temps
    showVoiceZone(audio ? [before, out.transcription].filter(Boolean).join(' ') : String(text));
    const fields = [...f.elements].filter((el) => el.name && el.type !== 'hidden' && el.type !== 'submit').map((el) => el.name).concat('couleur');
    const { set, auto } = mergeVoice(out, { hand: listOf(f.dataset.hand), auto: listOf(f.dataset.auto), fields });
    for (const [k, val] of Object.entries(set)) {
      if (k === 'couleur') { setChip(val); continue; }
      const el = f.elements[k]; if (!el) continue;
      el.value = val; el.classList.add('filled'); setTimeout(() => el.classList.remove('filled'), 1500);
    }
    f.dataset.auto = auto.join(',');
    prefillFromKnown(f);
    say('ok', auto.length ? 'Fiche remplie : vérifiez les champs avant d\'enregistrer.' : 'Compris, mais rien de nouveau à mettre dans la fiche.');
  } catch (e) {
    console.error(e);
    if (token === scanToken && $('form')) {
      say('err', scanErrorMessage(e, 'voix'));
      if (!$('voiceText')) showVoiceZone(text || '', 'Vous pouvez aussi dicter avec le micro du clavier ou écrire ci-dessous.');
    }
  } finally {
    // Pendant une écoute (texte envoyé en parallèle), les boutons photo restent désactivés : voir PHOTO_ACTS
    delete form.dataset.scanning; btns.forEach((b) => { if (!(voice && b.matches(PHOTO_ACTS))) b.disabled = false; });
  }
}

/** Réglages de la lecture automatique (photo et voix) : clé Google, test, désactivation. */
export function showScanSettings(msg = '') {
  const has = !!getApiKey();
  openSheet('Lecture automatique (photo et voix)', `
    <p class="help">Quand vous photographiez une étiquette, ou quand vous décrivez la bouteille à voix haute (« 🎤 Parler »), l'application peut remplir la fiche toute seule : nom, millésime, appellation, nombre de bouteilles… Vous vérifiez, puis vous enregistrez. Elle utilise pour cela l'IA gratuite de Google (Gemini).</p>
    <p class="scan ${has ? 'ok' : ''}" role="status">${esc(msg || (has ? 'Lecture automatique activée.' : 'Lecture automatique non activée.'))}</p>
    <h3>Activer en 3 étapes</h3>
    <p class="help">1. Ouvrez <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> et connectez-vous avec un compte Google.<br>2. Touchez « Create API key » (gratuit, sans carte bancaire).<br>3. Copiez la clé et collez-la ci-dessous.</p>
    <label class="field">Clé Google AI Studio<input id="scanKey" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="${has ? 'Une clé est déjà enregistrée' : 'AIza…'}"></label>
    <div class="btns"><button class="btn primary block" data-act="scan-save">Enregistrer la clé</button><button class="btn" data-act="scan-test">Tester</button>${has ? '<button class="btn danger" data-act="scan-clear">Désactiver</button>' : ''}</div>
    <p class="help"><b>À savoir :</b> la photo, ou ce que vous dites, est envoyé à Google pour être compris. Avec l'offre gratuite, Google peut réutiliser ces contenus pour améliorer ses produits : ne photographiez que des étiquettes, et ne dites que ce qui concerne la bouteille. La clé reste uniquement sur cet appareil et n'apparaît dans aucune sauvegarde.</p>
    <div class="btns"><button class="btn block" data-act="settings">Retour</button></div>`, true);
}
/** Teste la clé (saisie ou enregistrée) et affiche le résultat dans l'écran de réglages. */
export async function checkScanKey(key, { keep }) {
  const status = $('sheetBody').querySelector('.scan');
  if (status) { status.className = 'scan busy'; status.textContent = 'Test de la clé en cours…'; }
  $('sheetBody').querySelectorAll('[data-act^="scan-"]').forEach((b) => { b.disabled = true; });   // évite les appels multipliés
  try { await testApiKey(key); showScanSettings('Clé acceptée par Google : la lecture automatique fonctionne.'); }
  catch (e) {
    if (e.kind === 'key' && keep) clearApiKey();   // une clé refusée n'est pas conservée
    showScanSettings(e.kind === 'format' ? 'Réponse inattendue de Google : réessayez plus tard.' : scanErrorMessage(e));
  }
}
