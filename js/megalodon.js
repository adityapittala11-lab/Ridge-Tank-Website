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
    '<g class="mg-rear"><path d="M124 27.5C108 30 96 34 88 38L80 31L82 40.5C72 44 64 47.5 56 50L56 60C66 62 76 65 86 68.5L83 77L94 71C102 74 108 76.5 112 78.5L106 92L122 82.5L124 83ZM91 48Q99 51.5 104 60Q97.5 53.1 91 48Z"/>' +
    '<g class="mg-tail"><path d="M60 49.5L6 5C12 17 16 25 19 30L15 32L23 37C27 43 31 49 34 54C28 68 21 86 16 103L60 60.5Z"/></g></g>' +
    '<g class="mg-front">' +
    '<path d="M252 52C244 44 224 33 196 28C184 26 172 25 160 25L131 3C131 12 127 21 121 27L117 28L116 83C130 85 146 85.5 160 84L141 117C160 111 176 99 184 82C192 80 199 76 204 71' +
    'L207 75.4L210 69.6L213.5 74.8L217 68.4L220.5 73.2L224 67L227.5 71.2L230.5 65L233 68.2L236 61.6C243 60 249 57 252 52Z' +
    'M221.2 49a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0ZM173 46.0Q176.4 56 172.4 67.0Q174.1 55.9 173 46.0ZM179.5 46.6Q182.9 56 178.9 66.6Q180.6 55.9 179.5 46.6ZM186 47.2Q189.4 56 185.4 66.2Q187.1 55.9 186 47.2ZM192.5 47.8Q195.9 56 191.9 65.8Q193.6 55.9 192.5 47.8ZM199 48.4Q202.4 56 198.4 65.4Q200.1 55.9 199 48.4ZM139 38Q149 43 157 55Q147.4 44.7 139 38ZM146 34.5Q157 40.5 164 52Q155.2 42.4 146 34.5ZM154 33.5Q163 38 169 47Q161.5 39.6 154 33.5ZM123 60Q137 61 151 70Q136.3 63.1 123 60Z"/>' +
    '<path class="mg-jaw" d="M195 78.5L204.5 71.5L207.5 76.4L211 71.8L214.5 77.2L218 72.8L221.5 77.8L225 73.8L228 78.4C220 84.6 207 84.4 195 78.5Z"/>' +
    '</g></g>';
  RT.megalodon = function (cls) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 258 120');
    el.setAttribute('class', 'megalodon ' + (cls || ''));
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    el.innerHTML = BODY;
    return el;
  };
})();
