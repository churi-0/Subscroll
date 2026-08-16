"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   CONFIG — constants, helpers, DOM references
   ══════════════════════════════════════════════════════════════════════════ */

// Tunables
const CFG={
  PAGE_SIZE:      50,
  MAX_SUBS:       20,
  PREFETCH_SCREENS:3,
  RETRIES:         3,
  RETRY_BASE_MS:  400,
  TOKEN_SKEW_MS:  60000,
  CHROME_IDLE_MS:3500,
  SETTLE_MS:      60,
  WATCHDOG_MS:  2000,
  NUDGE_GAP_MS: 4000,
  AC_DEBOUNCE:   220,
  TOAST_MS:     2600
};

// Platform detection
const IOS = /iP(hone|ad|od)/.test(navigator.platform)
         || /iPhone|iPad|iPod/.test(navigator.userAgent)
         || (navigator.maxTouchPoints>1 && /Mac/.test(navigator.userAgent));
const IS_SAFARI = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
const LIVE_WINDOW = IOS ? 1 : 4;

// DOM shortcuts
const $=s=>document.querySelector(s);
const feed     = $('#feed'),
      countEl  = $('#count'),
      hdrEl    = $('#hdr'),
      clearXEl = $('#clearX'),
      feedIco  = $('#feedIco'),
      feedName = $('#feedName'),
      feedMeta = $('#feedMeta'),
      sortsEl  = $('#sorts');

const sheetEl=$('#sheet'), scrimEl=$('#scrim'), sheetBody=$('#sheetBody'),
      sheetTitle=$('#sheetTitle'), sheetBack=$('#sheetBack'),
      sheetAction=$('#sheetAction'), sheetFoot=$('#sheetFoot');

// HTML escaping
const esc=s=>String(s).replace(/[<>&\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

// Inline SVG icons (24px viewBox). Colour follows currentColor so one icon
// set works across the chrome, rail, sheets and gate.
const ICO={
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  chevD:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  chevU:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.3v13.4L19 12z"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.8l2.5 5 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z"/></svg>',
  starF:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.8l2.5 5 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z"/></svg>',
  snd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4.5V4.5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 8.5a5 5 0 010 7"/><path d="M18.5 6a9 9 0 010 12"/></svg>',
  sndOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4.5V4.5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  open:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5"/><path d="M19 5l-9 9"/><path d="M19 13.5V18a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h4.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5 4 20z"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
  dn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></svg>',
  chevR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a3.5 3.5 0 00.6-7A6 6 0 006 9.5 4.5 4.5 0 006.5 18z"/></svg>',
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M19 10h.01M7 14h.01M11 14h.01M15 14h.01M19 14h.01"/></svg>'
};
const icon=(n,s=20)=>`<span class="icn" style="width:${s}px;height:${s}px" aria-hidden="true">${ICO[n]||''}</span>`;

// OAuth constants
const AUTH_URL ='https://www.reddit.com/api/v1/access_token',
      API      ='https://oauth.reddit.com',
      TKEY     ='subscroll.token',
      CID_KEY  ='subscroll.client_id';

// Client ID lives in memory and is included in the cloud state snapshot.
// It is a public OAuth app identifier, not a Reddit account credential.
let CLIENT_ID='';
function getClientId(){ return CLIENT_ID; }
function setClientId(v,persist=true){
  const next=String(v||'').trim();
  if(next===CLIENT_ID) return;
  CLIENT_ID=next;
  if(typeof resetRedditToken==='function') resetRedditToken();
  if(persist&&typeof save==='function') save();
}

// Async helpers
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const backoff=n=>sleep(CFG.RETRY_BASE_MS*Math.pow(2,n)+Math.random()*250);
const NET_ERR='Reddit is temporarily blocking requests from your network. Wait a few seconds and retry.';

// Storage keys & magic ids
const LS='subscroll.v6', LS_OLD='subscroll.v5';
const FAV='__fav', TMP='__tmp';

// Group icons & sort options
const ICONS=['★','✦','◆','●','▲','♥','⚡','☾','✿','☀','⬢','⌘','✈','☕','⛰','♪'];
const SORTS=[['hot','Hot'],['new','New'],['top','Top'],['rising','Rising'],['controversial','Contro.']];
const TIMES=[['hour','Hour'],['day','Day'],['week','Week'],['month','Month'],['year','Year'],['all','All time']];

// Group helpers
const uid=()=>'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const mkGroup=(o={})=>({id:o.id||uid(),name:o.name||'Untitled',icon:o.icon||'◆',
  subs:Array.isArray(o.subs)?o.subs.slice(0,CFG.MAX_SUBS):[],
  sort:o.sort||'hot', time:o.time||'all'});

// Formatting helpers
const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(1)+'k':String(n);
const ago=ts=>{
  const s=Date.now()/1000-ts;
  for(const [k,l] of [[31536000,'y'],[2592000,'mo'],[604800,'w'],[86400,'d'],[3600,'h'],[60,'m']])
    if(s>=k) return Math.floor(s/k)+l;
  return 'now';
};
const plural=(n,w)=>n+' '+w+(n===1?'':'s');

// DOM builders (shared by panels)
function el(tag,cls,txt){
  const n=document.createElement(tag);
  if(cls) n.className=cls;
  if(txt!=null) n.textContent=txt;
  return n;
}
function label(box,text,actionLabel,actionRun){
  const l=el('div','slab');
  l.appendChild(el('span',null,text));
  l.appendChild(el('span','sp'));
  if(actionLabel){
    const b=el('button',null,actionLabel);
    b.onclick=e=>{ e.stopPropagation(); actionRun(); };
    l.appendChild(b);
  }
  box.appendChild(l);
}
function emptyNote(box,title,body){
  const d=el('div','empty');
  d.appendChild(el('b',null,title));
  d.appendChild(document.createTextNode(body));
  box.appendChild(d);
}

// Media regex & helpers
const IMG_RE=/\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)/i;
const dec=s=>(s||'').replace(/&amp;/g,'&');