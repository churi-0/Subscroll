"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   ICONS — one inline SVG set, stroked, currentColor
   ──────────────────────────────────────────────────────────────────────────
   Every glyph in the app comes from here. All icons share a 24×24 box, a
   1.7 stroke and round joins, so they optically match at any size and take
   their colour from whatever element they sit in.

   iconEl(name, cls)  → SVGElement   (for DOM building)
   iconHTML(name)     → string       (for innerHTML templates)
   ══════════════════════════════════════════════════════════════════════════ */

const ICON_SVG = {

  /* ── UI ─────────────────────────────────────────────────────────────── */
  search:   '<circle cx="11" cy="11" r="6.6"/><path d="M16 16l4.5 4.5"/>',
  more:     '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
            '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
            '<circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  down:     '<path d="M6 9.5l6 6 6-6"/>',
  up:       '<path d="M6 14.5l6-6 6 6"/>',
  left:     '<path d="M14.5 5.5l-6.5 6.5 6.5 6.5"/>',
  right:    '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
  plus:     '<path d="M12 5.5v13M5.5 12h13"/>',
  close:    '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit:     '<path d="M14.8 4.7l4.5 4.5M4 20l.9-4.4L15.6 4.9a1.6 1.6 0 012.3 0l1.2 1.2a1.6 1.6 0 010 2.3L8.4 19.1 4 20z"/>',
  trash:    '<path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v1.5M6.5 6.5l.9 12.1A1.5 1.5 0 008.9 20h6.2a1.5 1.5 0 001.5-1.4l.9-12.1"/>',
  copy:     '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 5.5a2 2 0 00-2-2h-7a3 3 0 00-3 3v7a2 2 0 002 2"/>',
  soundOn:  '<path d="M4 9.5h3l4.5-3.6a.6.6 0 011 .5v11.2a.6.6 0 01-1 .5L7 14.5H4a.5.5 0 01-.5-.5v-4a.5.5 0 01.5-.5z"/><path d="M16 9.6a3.4 3.4 0 010 4.8M18.6 7a7 7 0 010 10"/>',
  soundOff: '<path d="M4 9.5h3l4.5-3.6a.6.6 0 011 .5v11.2a.6.6 0 01-1 .5L7 14.5H4a.5.5 0 01-.5-.5v-4a.5.5 0 01.5-.5z"/><path d="M16.5 9.8l4.5 4.4M21 9.8l-4.5 4.4"/>',
  open:     '<path d="M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10"/>',
  play:     '<path d="M8 5.4l11 6.6-11 6.6z" fill="currentColor" stroke-linejoin="round"/>',
  pause:    '<path d="M9.5 5.5v13M14.5 5.5v13" stroke-width="2.6"/>',
  cloud:    '<path d="M7.2 18.5a3.7 3.7 0 01-.2-7.4 5.3 5.3 0 0110.2-1.4 3.9 3.9 0 01.3 8.8z"/>',
  logout:   '<path d="M14.5 4.5h3a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-3M10 8.5L6 12l4 3.5M6 12h9"/>',
  keys:     '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M8.5 14.5h7" stroke-linecap="round"/><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01" stroke-width="2"/>',
  comment:  '<path d="M20 14.5a2.5 2.5 0 01-2.5 2.5H8.5L4 20.5V6A2.5 2.5 0 016.5 3.5h11A2.5 2.5 0 0120 6z"/>',
  score:    '<path d="M12 19.5v-15M5.5 11L12 4.5 18.5 11"/>',
  eye:      '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/>',
  info:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01" stroke-width="2"/>',
  images:   '<rect x="7" y="3.5" width="13.5" height="13.5" rx="2.5"/><path d="M16.5 20.5h-11A2 2 0 013.5 18.5v-11"/>',
  reload:   '<path d="M19.5 12a7.5 7.5 0 11-2.4-5.5M19.5 4v4.5H15"/>',

  /* ── Group icons ────────────────────────────────────────────────────── */
  star:     '<path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"/>',
  sparkle:  '<path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z"/>',
  diamond:  '<path d="M12 3.2l8.8 8.8-8.8 8.8L3.2 12z"/>',
  circle:   '<circle cx="12" cy="12" r="8.3"/>',
  triangle: '<path d="M12 4.2l8.5 15.3H3.5z"/>',
  heart:    '<path d="M12 20s-7.6-4.6-7.6-9.7A4.1 4.1 0 0112 7.7a4.1 4.1 0 017.6 2.6C19.6 15.4 12 20 12 20z"/>',
  bolt:     '<path d="M13.4 3.2L5.2 14h5.6l-.8 6.8 8.8-11.2h-6z"/>',
  moon:     '<path d="M20.2 14.6A8.6 8.6 0 019.4 3.8a8.6 8.6 0 1010.8 10.8z"/>',
  leaf:     '<path d="M20.5 3.5C10 3.5 3.5 9.5 3.5 20.5c11 0 17-6.5 17-17zM4 20l8-8"/>',
  sun:      '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  hexagon:  '<path d="M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z"/>',
  grid:     '<rect x="3.8" y="3.8" width="6.6" height="6.6" rx="1.8"/><rect x="13.6" y="3.8" width="6.6" height="6.6" rx="1.8"/><rect x="3.8" y="13.6" width="6.6" height="6.6" rx="1.8"/><rect x="13.6" y="13.6" width="6.6" height="6.6" rx="1.8"/>',
  plane:    '<path d="M21 3.5L2.8 12.2l7 2.6 2.6 7z"/>',
  coffee:   '<path d="M4.5 7.5h12v6a4.5 4.5 0 01-4.5 4.5H9a4.5 4.5 0 01-4.5-4.5zM16.5 9h1.8a2.8 2.8 0 010 5.6h-1.8M4.5 21h12"/>',
  mountain: '<path d="M2.5 19.5l6.4-10.7 3.7 6.2 2.2-3.3 6.7 7.8z"/>',
  music:    '<path d="M9 17.5V5.2l10.5-2.2v12.3"/><circle cx="6.5" cy="17.5" r="2.6"/><circle cx="17" cy="15.3" r="2.6"/>',
  camera:   '<path d="M3.5 8.5h3.2l1.5-2.6h7.6l1.5 2.6h3.2v10a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z"/><circle cx="12" cy="13.5" r="3.4"/>',
  globe:    '<circle cx="12" cy="12" r="8.5"/><path d="M3.6 12h16.8M12 3.5a13 13 0 010 17 13 13 0 010-17z"/>',
  book:     '<path d="M5 4.5A2 2 0 017 2.5h12v15H7a2 2 0 00-2 2zM5 19.5a2 2 0 002 2h12"/>',
  flame:    '<path d="M12 21a5.4 5.4 0 005.4-5.4c0-4.4-5.4-9-5.4-9s-5.4 4.6-5.4 9A5.4 5.4 0 0012 21z"/>'
};

/* Icons that read better filled than stroked when "active". */
const ICON_FILLED = new Set(['star', 'heart', 'sparkle', 'diamond', 'triangle', 'circle', 'flame', 'bolt']);

const SVG_NS = 'http://www.w3.org/2000/svg';

function iconHTML(name, cls) {
  const body = ICON_SVG[name] || ICON_SVG.circle;
  return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    body + '</svg>';
}

function iconEl(name, cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.innerHTML = ICON_SVG[name] || ICON_SVG.circle;
  return s;
}

/* Fill a host element with an icon (clears whatever was there). */
function setIcon(host, name, cls) {
  if (!host) return host;
  host.textContent = '';
  host.appendChild(iconEl(name, cls));
  return host;
}

/* ── Legacy glyph → icon-name migration ───────────────────────────────── */

const ICON_LEGACY = {
  '★': 'star', '☆': 'star', '✦': 'sparkle', '◆': 'diamond', '●': 'circle',
  '▲': 'triangle', '♥': 'heart', '❤': 'heart', '⚡': 'bolt', '☾': 'moon',
  '✿': 'leaf', '☀': 'sun', '⬢': 'hexagon', '⌘': 'grid', '✈': 'plane',
  '☕': 'coffee', '⛰': 'mountain', '♪': 'music', '⌕': 'search', '☁': 'cloud'
};

/* Accepts a stored icon value of any vintage and returns a valid icon name. */
function iconName(v) {
  const s = String(v || '');
  if (ICON_SVG[s]) return s;
  if (ICON_LEGACY[s]) return ICON_LEGACY[s];
  return 'diamond';
}
