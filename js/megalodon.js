// The Megalodon: the boss shark. Same flat one-colour silhouette style as the other sharks (it takes its colour
// from the text colour), but heavier, with an open jaw of jagged teeth, a slit eye, gill cuts, battle scars,
// a notched dorsal fin and a torn tail. Scars, eye and gills are holes, so the page shows through them.
// It is cut into four pieces (front, jaw, rear, tail) so the body can swim as a travelling wave and the jaw can work.
// RT.megalodon('extra classes') -> an <svg class="megalodon">.
(function () {
  const RT = window.RT;
  if (!RT) return;
  const BODY =
    '<g fill="currentColor" fill-rule="evenodd">' +
    '<g class="mg-rear"><path d="M117 29C102 31.5 92 34.5 84 37L72 28L76 40C66 42.5 60 44 54 46L54 55C68 58.5 82 63 96 66L91 78L108 69C111 69.6 114 70 117 70.3Z' +
    'M87 45L90 44.4L98 56L95.4 56.8Z"/>' +
    '<g class="mg-tail"><path d="M58 45L4 2C9 12 12 18 14 21L9 22L18 28C22 36 27 44 30 50C25 60 21 70 18 82L58 56Z"/></g></g>' +
    '<g class="mg-front">' +
    '<path d="M236 46C224 34 196 24 164 21L132 2C131 9 130 14 128 18L121 16L125 24C122 27 119 28.5 116 29L110 30L109 70C122 72.5 136 74 150 74L130 103C148 97 164 87 174 74C180 73.6 185 72.4 188 70L196 60' +
    'L200 65L204 59.4L208 65L212 58.6L216 64.4L220 57.6L224 63L228 56.2L231 60.4L233.4 52.6Z' +
    'M204 43L217 39.4L214.6 44.2Z' +
    'M184 43.4L186.2 43.4L184 59L181.8 59Z M176.6 42.8L178.8 42.8L176.6 59.6L174.4 59.6Z M169.2 42.6L171.4 42.6L169.2 60L167 60Z' +
    'M138 34L142.4 33L156 53.4L152.4 54.6Z M150 32L153.4 31.4L164 48L161 49Z M120 40L123 39.4L131 52L128.4 52.8Z"/>' +
    '<path class="mg-jaw" d="M186 70.6L195 62.4L198.6 67L202 62L206 67.8L210 62.6L214 68.6L218 63.6L222 69.4L225.4 65.4L229 70.4C221 77 204 78 186 70.6Z"/>' +
    '</g></g>';
  RT.megalodon = function (cls) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 240 106');
    el.setAttribute('class', 'megalodon ' + (cls || ''));
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    el.innerHTML = BODY;
    return el;
  };
})();
