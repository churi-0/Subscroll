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