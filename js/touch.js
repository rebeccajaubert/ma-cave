// Gestes sur la scène : tourner, faire défiler, zoomer, et trouver l'emplacement ou la bouteille touchée.
import { parseId, caseIdOf, clamp, lastAtMost, BOTTLE_D, pileOf, slotId, RACK_ORDER } from './lib.js';
import { allBottles } from './data.js';
import { BASE, TAN_V, adjust, bottleLocal, camera, canvas, clampView, dragSeparator, ndc, paintSeps, rackPoint, racks, raycaster, sepAt, sizesOf, tmpV, view } from './scene.js';
import { onTap } from './sheet.js';
import { $ } from './util.js';

// ---------- Toucher : tourner, faire défiler, sélectionner ----------
const pointers = new Map(); let tapStart = null, pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  else { tapStart = null; const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  $('search').blur();
  if (adjust) {   // un doigt sur une séparation : elle s'allume et suit le doigt ; ailleurs : on fait défiler
    adjust.drag = null;
    const l = pointers.size === 1 && rackPoint(adjust.k, e.clientX, e.clientY), sep = l && sepAt(adjust.k, l);
    if (sep) {
      // Nombre de bouteilles par case, compté une fois au début du geste (et non à chaque mouvement du doigt)
      const counts = new Map(); for (const b of allBottles()) if (parseId(b.id).u) counts.set(caseIdOf(b.id), (counts.get(caseIdOf(b.id)) || 0) + 1);
      adjust.sel = sep; adjust.drag = { from: l, sizes: [...sizesOf(adjust.k, sep.axis)], counts }; tapStart = null; paintSeps(racks[adjust.k]);
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1 && adjust?.drag) { const l = rackPoint(adjust.k, e.clientX, e.clientY); if (l) dragSeparator(l); return; }
  if (pointers.size === 1) {
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8) return;
    tapStart = null;
    if (view.mode === 'overview') { view.az -= dx * 0.007; view.el += dy * 0.005; }
    else { const m = 2 * view.d * TAN_V / window.innerHeight; view.u -= dx * m; view.v += dy * m; }
    clampView();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomBy(pinchDist / Math.max(d, 1)); pinchDist = d;
  }
});
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (adjust) { adjust.drag = null; tapStart = null; return; }   // en réglage, un toucher n'ouvre rien
  if (had && tapStart && pointers.size === 0 && e.type === 'pointerup' && performance.now() - tapStart.t < 500) onTap(e.clientX, e.clientY);
  tapStart = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
function zoomBy(f) { if (view.mode === 'overview') view.zoom *= f; else view.d *= f; clampView(); }
export function pick(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (view.mode === 'rack') {
    const rack = racks[view.key], h = raycaster.intersectObject(rack.plane, false)[0]; if (!h) return null;
    const l = rack.group.worldToLocal(tmpV.copy(h.point));
    // Colonne et rangée touchées (tailles éventuellement inégales), mesurées depuis l'entrée et depuis le bas
    const fromEntry = rack.flip ? rack.W / 2 - l.x : l.x + rack.W / 2, { colX, rowY } = rack.grid;
    const c = clamp(lastAtMost(colX, fromEntry), 0, rack.cols - 1), r = clamp(lastAtMost(rowY, l.y - BASE), 0, rack.rows - 1);
    const hit = { type: 'slot', key: rack.key, c, r };
    if (rack.isCases) {   // la bouteille la plus proche du doigt dans cette case, s'il y en a une sous le doigt
      let best = null, bd = BOTTLE_D / 2;
      for (const b of pileOf(allBottles(), slotId(rack.key, c, r))) {
        const p = bottleLocal(b); if (!p) continue;
        const d = Math.hypot(p[0] - l.x, p[1] - l.y); if (d <= bd) { bd = d; best = b.id; }
      }
      if (best) hit.id = best;
    }
    return hit;
  }
  const targets = []; for (const k of RACK_ORDER) { const r = racks[k]; targets.push(r.plane); if (r.body) targets.push(r.body); }
  const labelHit = raycaster.intersectObjects(RACK_ORDER.map((k) => racks[k].label), false)[0];
  const h = labelHit || raycaster.intersectObjects(targets, false)[0]; if (!h) return null;
  if (h.object.userData.rack) return { type: 'rack', key: h.object.userData.rack };
  return null;
}
