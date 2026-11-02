// Calcolo in background: anteprima veloce e pacchetto finale in qualità piena.
import Module from './lib/manifold.js';
import * as ot0 from './lib/opentype.module.js';
import { makeEngine, FONTS, stlBinary, DEFAULTS } from './engine.js';
import { makeZip } from './zip.js';
import { make3MF } from './threemf.js';
import { PRINTERS, objectSettings } from './printers.js';
import { tr, LANGS } from './i18n.js';

const base = self.location.href;
const ready = (async () => {
  const wasm = await Module({ locateFile: (f) => new URL('lib/' + f, base).href });
  wasm.setup();
  return makeEngine(wasm, ot0.default || ot0);
})();
const fontBufs = {};
async function fontBuf(key) {
  if (!FONTS[key]) key = DEFAULTS.font;
  if (!fontBufs[key]) {
    const r = await fetch(new URL('fonts/' + FONTS[key].file, base).href);
    if (!r.ok) throw new Error('Font not loaded: ' + FONTS[key].name);
    fontBufs[key] = await r.arrayBuffer();
  }
  return { [key]: fontBufs[key] };
}

function slug(s) {
  const t = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return t.slice(0, 32) || 'tiara';
}

function mk4sLines(P, fit, t) {
  if (P.printer !== 'mk4s') return [];
  const pr = PRINTERS.mk4s.profiles, os = objectSettings(P, { fit });
  return [
    t('rd.mk4s'),
    t('rd.mk4sOpen', { pr: pr.printer, ps: pr.print, fi: pr.filament }),
    t('rd.mk4sSet', { lh: os.layer_height }),
    t(fit ? 'rd.mk4sPosFit' : 'rd.mk4sPos'),
    t('rd.mk4sBed'),
    t('rd.mk4sBg'),
    '',
  ];
}

function names(P, t) {
  const nm = slug(P.text);
  return {
    tiara: `${t('fn.tiara')}_${nm}.stl`, withSup: `${t('fn.withSup')}_${nm}.stl`, sup: `${t('fn.sup')}_${nm}.stl`,
    fit: `${t('fn.fit')}.stl`, tmf: `${t('fn.tiara')}_${nm}_MK4S.3mf`, fitTmf: `${t('fn.fit')}_MK4S.3mf`,
    params: `${t('fn.params')}.json`, readme: `${t('fn.readme')}.txt`,
  };
}

function readme(P, st, withSup, t) {
  const N = names(P, t);
  const soft = t('o.fit.morbido'), firm = t('o.fit.forte');
  const lines = [
    t('rd.title', { text: P.text, kind: t('rd.kind.' + (P.model === 'autoportante' ? 'autoportante' : 'decorata')) }),
    '',
    t('rd.files'),
    t('rd.fTiara', { f: N.tiara }),
    withSup ? t('rd.fTiaraSup', { f: N.withSup }) : null,
    withSup ? t('rd.fSup', { f: N.sup }) : null,
    t('rd.fFit', { f: N.fit }),
    P.printer === 'mk4s' ? t('rd.f3mf', { f: N.tmf }) : null,
    t('rd.fParams', { f: N.params }),
    '',
    t('rd.data'),
    t('rd.size', { x: st.sizeAll[0], y: st.sizeAll[1], z: st.sizeAll[2] }),
    t('rd.mass', { mat: P.material, m: st.mass }) + (withSup ? t('rd.massSup', { m: st.supMass }) : ''),
    t('rd.band', { i: st.band.inner, o: st.band.opening, c: P.headCirc }),
    t('rd.spring', { f: st.spring.force, e: st.spring.strainOn * 100 }),
    '',
    ...mk4sLines(P, false, t),
    t('rd.slicer'),
    P.model === 'autoportante' ? t('rd.selfNoSup') : withSup ? t('rd.supIn') : t('rd.supSlicer', { a: P.supAngle, g: P.supGap }),
    withSup ? t('rd.zgap', { g: P.supGap }) : null,
    withSup ? t('rd.twoStl') : null,
    t('rd.brim'),
    t('rd.mat') + (P.material === 'PLA' ? t('rd.matPla') : ''),
    t('rd.bridges'),
    '',
    t('rd.fit'),
    t('rd.fitTxt', { f: N.fit, soft, firm }),
    '',
    t('rd.gen'),
  ];
  return lines.filter((l) => l !== null).join('\r\n');
}

self.onmessage = async (e) => {
  const { id, kind } = e.data;
  const params = { ...DEFAULTS, ...(e.data.params || {}) };
  const lang = LANGS[e.data.lang] ? e.data.lang : 'it';
  const t = (k, p) => tr(lang, k, p);
  try {
    const eng = await ready;
    const fonts = await fontBuf(params.font);
    if (kind === 'preview') {
      const P = { ...params, meshEdge: Math.max(params.meshEdge || 4, 8), _prev: true, _noFit: true };
      const r = eng.generate(P, fonts);
      const tr = [];
      for (const k of ['tiara', 'supports']) if (r[k]) tr.push(r[k].vert.buffer, r[k].tri.buffer);
      self.postMessage({ id, kind, result: r }, tr);
    } else if (kind === 'export') {
      const r = eng.generate({ ...params }, fonts);
      if (!r.ok) { self.postMessage({ id, kind, result: r }); return; }
      const nm = slug(params.text);
      const N = names(params, t);
      const withSup = !!r.supports;
      const files = [{ name: N.tiara, data: stlBinary([r.tiara], 'tiara ' + nm) }];
      if (withSup) {
        files.unshift({ name: N.withSup, data: stlBinary([r.tiara, r.supports], 'tiara+supports ' + nm) });
        files.push({ name: N.sup, data: stlBinary([r.supports], 'supports ' + nm) });
      }
      files.push({ name: N.fit, data: stlBinary([r.fit], 'fit band') });
      if (params.printer === 'mk4s') {
        const parts = [{ name: t('fn.tiara'), mesh: r.tiara }];
        if (withSup) parts.push({ name: t('fn.supPart'), mesh: r.supports });
        const tmf = await make3MF({ objectName: `Tiara ${params.text || ''}`.trim(), parts, settings: objectSettings(params) });
        files.splice(1, 0, { name: N.tmf, data: await tmf.arrayBuffer() });
      }
      const clean = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('_')));
      files.push({ name: N.params, data: JSON.stringify({ app: 'Atelier Tiara', versione: 1, parametri: clean }, null, 2) });
      files.push({ name: N.readme, data: readme(params, r.stats, withSup, t) });
      const blob = await makeZip(files);
      self.postMessage({ id, kind, zip: blob, filename: `tiara-${nm}-${t('fn.' + (params.model === 'autoportante' ? 'autoportante' : 'decorata'))}.zip`, stats: r.stats, warnings: r.warnings, ok: true });
    } else if (kind === 'fit') {
      const r = eng.generate({ ...params, _prev: true }, fonts);
      if (!r.ok) { self.postMessage({ id, kind, result: r }); return; }
      const N = names(params, t);
      const files = [{ name: N.fit, data: stlBinary([r.fit], 'fit band') }];
      if (params.printer === 'mk4s') {
        const tmf = await make3MF({ objectName: t('btn.fit'), parts: [{ name: t('btn.fit'), mesh: r.fit }], settings: objectSettings(params, { fit: true }) });
        files.push({ name: N.fitTmf, data: await tmf.arrayBuffer() });
      }
      const st = r.stats;
      files.push({ name: N.readme, data: [
        t('rf.title'),
        '',
        t('rf.circ', { c: params.headCirc, fit: t('o.fit.' + params.fit) }),
        t('rf.band', { i: st.band.inner, o: st.band.opening }),
        t('rf.wear'),
        t('rf.adjust', { soft: t('o.fit.morbido'), firm: t('o.fit.forte') }),
        t('rf.then'),
        '',
        ...mk4sLines(params, true, t),
      ].join('\r\n') });
      const blob = await makeZip(files);
      self.postMessage({ id, kind, zip: blob, filename: `${t('fn.zipFit')}-${String(params.headCirc).replace('.', lang === 'en' ? '.' : ',')}cm.zip`, ok: true });
    }
  } catch (err) {
    self.postMessage({ id, kind, result: { ok: false, error: String(err && err.stack || err) } });
  }
};
