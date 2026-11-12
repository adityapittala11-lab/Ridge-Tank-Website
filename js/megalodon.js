// The Megalodon: the boss shark. A head-on lunging maw, one slate color with tonal shading,
// scarred and battle-worn. Reused by the Tiers section and the high-level Academy cinematic.
// RT.megalodon('extra classes') -> a <div class="megalodon"> wrapping the SVG.
(function () {
  const RT = window.RT;
  if (!RT) return;
  let uid = 0;
  RT.megalodon = function (cls) {
    const id = 'mg' + (uid++);
    const wrap = document.createElement('div');
    wrap.className = 'megalodon ' + (cls || '');
    wrap.innerHTML =
      '<svg viewBox="0 0 320 300" role="img" aria-label="Megalodon" preserveAspectRatio="xMidYMid meet">' +
      '<defs>' +
      '<radialGradient id="' + id + 't" cx="50%" cy="48%" r="62%"><stop offset="0%" stop-color="#3a1320"/><stop offset="55%" stop-color="#160810"/><stop offset="100%" stop-color="#040103"/></radialGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#637884"/><stop offset="12%" stop-color="#5d7280"/><stop offset="60%" stop-color="#3a4c57"/><stop offset="100%" stop-color="#222f38"/></linearGradient>' +
      '<linearGradient id="' + id + 'j" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a4c57"/><stop offset="100%" stop-color="#1b2830"/></linearGradient>' +
      '</defs>' +
      // broad flat head
      '<path d="M160 24 C96 24 34 52 30 116 C28 140 40 160 64 176 L256 176 C280 160 292 140 290 116 C286 52 224 24 160 24 Z" fill="url(#' + id + 's)"/>' +
      '<path d="M160 26 C104 26 48 50 40 104 C66 74 108 60 160 60 C212 60 254 74 280 104 C272 50 216 26 160 26 Z" fill="#6f8794" opacity="0.5"/>' +
      '<path d="M44 112 C70 96 110 90 160 90 C210 90 250 96 276 112 C250 120 212 122 160 122 C108 122 70 120 44 112 Z" fill="#1f2c34" opacity="0.7"/>' +
      '<g fill="#1a252c"><path d="M132 70 q4 4 0 8"/><path d="M188 70 q-4 4 0 8"/></g>' +
      '<path d="M66 108 L104 96 L112 112 Z" fill="#26343d"/><path d="M254 108 L216 96 L208 112 Z" fill="#26343d"/>' +
      '<g class="meg-eyes"><circle cx="94" cy="112" r="7.5" fill="#050b0e"/><circle cx="96.5" cy="109" r="2.2" fill="#9fc4cf"/>' +
      '<circle cx="226" cy="112" r="7.5" fill="#050b0e"/><circle cx="223.5" cy="109" r="2.2" fill="#9fc4cf"/></g>' +
      '<g stroke="#8aa4b0" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.9"><path d="M140 44 l22 13"/><path d="M176 40 l18 12"/></g>' +
      '<g stroke="#7a95a1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"><path d="M58 138 l18 5"/></g>' +
      // maw
      '<ellipse cx="160" cy="196" rx="116" ry="82" fill="#7c1b36"/>' +
      '<ellipse cx="160" cy="190" rx="116" ry="78" fill="#9c2745" opacity="0.5"/>' +
      '<ellipse cx="160" cy="200" rx="86" ry="62" fill="url(#' + id + 't)"/>' +
      '<path d="M46 196 C72 268 126 296 160 296 C194 296 248 268 274 196 C248 236 206 254 160 254 C114 254 72 236 46 196 Z" fill="url(#' + id + 'j)"/>' +
      // teeth
      '<g class="meg-teeth" fill="#eef4f5"><path d="M58 150 l11 40 8 -40 z"/><path d="M84 170 l9 34 8 -34 z"/><path d="M110 184 l9 30 8 -30 z"/><path d="M138 192 l9 28 8 -28 z"/><path d="M166 192 l8 28 9 -28 z"/><path d="M194 184 l8 30 9 -30 z"/><path d="M222 170 l8 34 9 -34 z"/><path d="M248 150 l8 40 11 -40 z"/></g>' +
      '<g fill="#cfdbe0"><path d="M74 164 l7 24 6 -24 z"/><path d="M100 178 l7 22 6 -22 z"/><path d="M127 186 l7 22 6 -22 z"/><path d="M181 186 l6 22 7 -22 z"/><path d="M208 178 l6 22 7 -22 z"/><path d="M235 164 l6 24 7 -24 z"/></g>' +
      '<g class="meg-teeth lo" fill="#e6eef1"><path d="M80 254 l10 -28 8 28 z"/><path d="M110 266 l9 -26 8 26 z"/><path d="M140 271 l9 -25 8 25 z"/><path d="M170 271 l8 -25 9 25 z"/><path d="M200 266 l8 -26 9 26 z"/><path d="M230 254 l8 -28 10 28 z"/></g>' +
      '</svg>';
    return wrap;
  };
})();
