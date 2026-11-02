// Calcolo in background: anteprima veloce e pacchetto finale in qualità piena.
import Module from './lib/manifold.js';
import * as ot0 from './lib/opentype.module.js';
import { makeEngine, FONTS, stlBinary, DEFAULTS } from './engine.js';
import { makeZip } from './zip.js';
import { make3MF } from './threemf.js';
import { PRINTERS, objectSettings } from './printers.js';

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
    if (!r.ok) throw new Error('Font non caricato: ' + FONTS[key].name);
    fontBufs[key] = await r.arrayBuffer();
  }
  return { [key]: fontBufs[key] };
}

function slug(s) {
  const t = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return t.slice(0, 32) || 'tiara';
}

function mk4sLines(P, fit) {
  if (P.printer !== 'mk4s') return [];
  const pr = PRINTERS.mk4s.profiles, os = objectSettings(P, { fit });
  return [
    'PRUSA MK4S, UGELLO 0,4 (consigliato)',
    `- Trascina il file .3mf in PrusaSlicer. In alto scegli: Stampante "${pr.printer}", Stampa "${pr.print}" (oppure SPEED se hai fretta), Filamento "${pr.filament}" o il tuo PETG.`,
    `- Sul pezzo sono già impostati: strato ${String(os.layer_height).replace('.', ',')} mm, 3 perimetri, brim esterno 5 mm, supporti dello slicer spenti, cucitura sul lato interno. Li vedi con l'icona accanto al nome dell'oggetto.`,
    fit ? '- Il pezzo è già centrato sul piatto (250 × 210 mm).' : '- La tiara è già girata con la scritta verso di te e centrata sul piatto (250 × 210 mm).',
    '- Piano: satinato o testurizzato. Sul PEI liscio con il PETG metti la colla stick come distaccante.',
    '- PrusaSlicer salva in .bgcode: va bene, la MK4S lo legge direttamente.',
    '',
  ];
}

function readme(P, st, withSup) {
  const f = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
  const lines = [
    `TIARA "${P.text}" (${P.model === 'autoportante' ? 'autoportante, senza supporti' : 'decorata'}) — istruzioni di stampa`,
    '',
    'FILE',
    `- tiara_${slug(P.text)}.stl: la tiara, già orientata in piedi sul piatto.`,
    withSup ? `- tiara_con_supporti_${slug(P.text)}.stl: tiara + supporti ad albero in un file solo (consigliato).` : null,
    withSup ? `- supporti_${slug(P.text)}.stl: solo i supporti, nella stessa posizione (se vuoi importarli come parte separata).` : null,
    '- fascia_prova.stl: solo la fascia, per provare la calzata (circa 30 minuti).',
    P.printer === 'mk4s' ? `- tiara_${slug(P.text)}_MK4S.3mf: progetto PrusaSlicer per la MK4S, con le impostazioni già sul pezzo (vedi sotto).` : null,
    '- parametri.json: le impostazioni usate, da ricaricare nella pagina.',
    '',
    'DATI',
    `- Ingombro: ${f(st.sizeAll[0], 0)} x ${f(st.sizeAll[1], 0)} x ${f(st.sizeAll[2], 0)} mm`,
    `- Peso stimato (${P.material}): tiara ${f(st.mass)} g${withSup ? `, supporti ${f(st.supMass)} g` : ''}`,
    `- Fascia: larghezza interna ${f(st.band.inner, 0)} mm, apertura punte ${f(st.band.opening, 0)} mm, testa ${f(P.headCirc)} cm`,
    `- Serraggio stimato: ${f(st.spring.force)} N per lato; deformazione infilandola ${f(st.spring.strainOn * 100, 2)}%`,
    '',
    ...mk4sLines(P, false),
    'SLICER',
    P.model === 'autoportante'
      ? '- Modello AUTOPORTANTE: non servono supporti. Lascia i supporti dello slicer disattivati.'
      : withSup
        ? '- I supporti ad albero sono GIÀ nel file: nello slicer DISATTIVA i supporti automatici.'
        : `- Attiva supporti ad albero (Tree/Organic), solo dal piatto, soglia ${P.supAngle}°, distanza Z ${f(P.supGap, 2)} mm.`,
    withSup ? `- Distanza Z tra supporti e pezzo: ${f(P.supGap, 2)} mm, pensata per strati da 0,16-0,2 mm. Con strati più alti aumentala nella pagina.` : null,
    '- Se importi i due STL separati: caricali insieme e rispondi "Sì" a "oggetto unico con più parti".',
    '- Brim 5-8 mm. Layer 0,16-0,2 mm, ugello 0,4. Ventola moderata (PETG).',
    `- Materiale consigliato: PETG (flessibile, la fascia lavora a molla).${P.material === 'PLA' ? ' Con il PLA la fascia può spezzarsi se la apri troppo.' : ''}`,
    '- Gli archetti chiusi dentro i riccioli si stampano a ponte: è normale, non servono supporti lì.',
    '',
    'CALZATA',
    '- Stampa prima fascia_prova.stl. Se stringe troppo: rigenera con circonferenza +1 cm o serraggio "morbido". Se scivola: -1 cm o "forte".',
    '',
    'Generato con Atelier Tiara.',
  ];
  return lines.filter((l) => l !== null).join('\r\n');
}

self.onmessage = async (e) => {
  const { id, kind } = e.data;
  const params = { ...DEFAULTS, ...(e.data.params || {}) };
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
      const withSup = !!r.supports;
      const files = [{ name: `tiara_${nm}.stl`, data: stlBinary([r.tiara], 'tiara ' + nm) }];
      if (withSup) {
        files.unshift({ name: `tiara_con_supporti_${nm}.stl`, data: stlBinary([r.tiara, r.supports], 'tiara+supporti ' + nm) });
        files.push({ name: `supporti_${nm}.stl`, data: stlBinary([r.supports], 'supporti ' + nm) });
      }
      files.push({ name: 'fascia_prova.stl', data: stlBinary([r.fit], 'fascia prova') });
      if (params.printer === 'mk4s') {
        const parts = [{ name: 'tiara', mesh: r.tiara }];
        if (withSup) parts.push({ name: 'supporti ad albero', mesh: r.supports });
        const tmf = await make3MF({ objectName: `Tiara ${params.text || ''}`.trim(), parts, settings: objectSettings(params) });
        files.splice(withSup ? 1 : 1, 0, { name: `tiara_${nm}_MK4S.3mf`, data: await tmf.arrayBuffer() });
      }
      const clean = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('_')));
      files.push({ name: 'parametri.json', data: JSON.stringify({ app: 'Atelier Tiara', versione: 1, parametri: clean }, null, 2) });
      files.push({ name: 'LEGGIMI.txt', data: readme(params, r.stats, withSup) });
      const blob = await makeZip(files);
      self.postMessage({ id, kind, zip: blob, filename: `tiara-${nm}-${params.model === 'autoportante' ? 'autoportante' : 'decorata'}.zip`, stats: r.stats, warnings: r.warnings, ok: true });
    } else if (kind === 'fit') {
      const r = eng.generate({ ...params, _prev: true }, fonts);
      if (!r.ok) { self.postMessage({ id, kind, result: r }); return; }
      const files = [{ name: 'fascia_prova.stl', data: stlBinary([r.fit], 'fascia prova') }];
      if (params.printer === 'mk4s') {
        const tmf = await make3MF({ objectName: 'Fascia di prova', parts: [{ name: 'fascia di prova', mesh: r.fit }], settings: objectSettings(params, { fit: true }) });
        files.push({ name: 'fascia_prova_MK4S.3mf', data: await tmf.arrayBuffer() });
      }
      const st = r.stats, f = (v, d = 0) => Number(v).toFixed(d).replace('.', ',');
      files.push({ name: 'LEGGIMI.txt', data: [
        'FASCIA DI PROVA — serve a controllare la calzata prima di stampare la tiara (circa 20-30 minuti, 9 g).',
        '',
        `- Circonferenza testa impostata: ${f(params.headCirc, 1)} cm, serraggio ${params.fit}.`,
        `- Larghezza interna ${f(st.band.inner)} mm, apertura delle punte ${f(st.band.opening)} mm.`,
        '- Indossala come un cerchietto, un po\' dietro l\'attaccatura dei capelli, con le punte dietro le orecchie.',
        '- Stringe troppo: aumenta la circonferenza di 1 cm o scegli serraggio "morbido". Scivola: -1 cm o "forte".',
        '- Poi stampa la tiara con gli stessi valori: la fascia è identica.',
        '',
        ...mk4sLines(params, true),
      ].join('\r\n') });
      const blob = await makeZip(files);
      self.postMessage({ id, kind, zip: blob, filename: `fascia-prova-${String(params.headCirc).replace('.', ',')}cm.zip`, ok: true });
    }
  } catch (err) {
    self.postMessage({ id, kind, result: { ok: false, error: String(err && err.stack || err) } });
  }
};
