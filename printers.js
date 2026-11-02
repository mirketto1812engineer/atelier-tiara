// Stampanti note: piatto e impostazioni che finiscono nel progetto PrusaSlicer (.3mf) come impostazioni dell'oggetto.
export const PRINTERS = {
  mk4s: {
    name: 'Prusa MK4S · ugello 0,4',
    bedW: 250, bedD: 210, nozzle: 0.4,
    profiles: {
      printer: 'Original Prusa MK4S 0.4 nozzle',
      print: '0.20mm STRUCTURAL @MK4S 0.4',
      filament: 'Prusament PETG',
    },
  },
  altra: { name: 'Altra stampante', bedW: null, bedD: null, nozzle: 0.4, profiles: null },
};

// Impostazioni per oggetto (PrusaSlicer le applica sopra i profili scelti, senza toccare stampante e filamento).
export function objectSettings(P, { fit = false } = {}) {
  const s = {
    perimeters: 3,
    brim_type: 'outer_only',
    brim_width: 5,
    brim_separation: 0.1,
    support_material: 0,
    support_material_auto: 0,
    seam_position: 'rear',          // la tiara è girata con la scritta verso di te: la cucitura finisce sul lato interno
    fill_density: '15%',
  };
  const withSup = !fit && P.model !== 'autoportante' && P.supports;
  if (withSup) s.layer_height = Math.min(0.3, Math.max(0.1, Math.round(P.supGap * 100) / 100));   // distanza Z supporti = 1 strato
  else s.layer_height = 0.2;
  return s;
}
