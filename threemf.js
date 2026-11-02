// Progetto 3MF in formato PrusaSlicer: un oggetto con una o più parti (tiara, supporti) e impostazioni per oggetto.
import { makeZip } from './zip.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function make3MF({ objectName, parts, settings, center = [125, 105], rotate180 = true }) {
  const vChunks = [], tChunks = [], ranges = [];
  let vOff = 0, tCount = 0;
  for (const p of parts) {
    if (!p || !p.mesh) continue;
    const v = p.mesh.vert, t = p.mesh.tri;
    const vs = new Array(v.length / 3);
    for (let i = 0, k = 0; i < v.length; i += 3, k++) vs[k] = `<vertex x="${v[i].toFixed(4)}" y="${v[i + 1].toFixed(4)}" z="${v[i + 2].toFixed(4)}"/>`;
    vChunks.push(vs.join(''));
    const ts = new Array(t.length / 3);
    for (let i = 0, k = 0; i < t.length; i += 3, k++) ts[k] = `<triangle v1="${t[i] + vOff}" v2="${t[i + 1] + vOff}" v3="${t[i + 2] + vOff}"/>`;
    tChunks.push(ts.join(''));
    ranges.push({ name: p.name, first: tCount, last: tCount + t.length / 3 - 1 });
    vOff += v.length / 3; tCount += t.length / 3;
  }
  const r = rotate180 ? -1 : 1;
  const transform = `${r} 0 0 0 ${r} 0 0 0 1 ${center[0]} ${center[1]} 0`;
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n'
    + '<metadata name="slic3rpe:Version3mf">1</metadata>\n<metadata name="Application">Atelier Tiara</metadata>\n'
    + `<metadata name="Title">${esc(objectName)}</metadata>\n`
    + '<resources>\n<object id="1" type="model"><mesh><vertices>' + vChunks.join('') + '</vertices><triangles>' + tChunks.join('') + '</triangles></mesh></object>\n</resources>\n'
    + `<build><item objectid="1" transform="${transform}" printable="1"/></build>\n</model>\n`;
  const meta = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>', ' <object id="1" instances_count="1">',
    `  <metadata type="object" key="name" value="${esc(objectName)}"/>`,
    ...Object.entries(settings).map(([k, v]) => `  <metadata type="object" key="${esc(k)}" value="${esc(v)}"/>`),
    ...ranges.map((g) => [
      `  <volume firstid="${g.first}" lastid="${g.last}">`,
      `   <metadata type="volume" key="name" value="${esc(g.name)}"/>`,
      '   <metadata type="volume" key="volume_type" value="ModelPart"/>',
      '   <metadata type="volume" key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
      '  </volume>'].join('\n')),
    ' </object>', '</config>', ''].join('\n');
  const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    + '<Default Extension="config" ContentType="text/plain"/></Types>\n';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n';
  return makeZip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: '3D/3dmodel.model', data: model },
    { name: 'Metadata/Slic3r_PE_model.config', data: meta },
  ]);
}
