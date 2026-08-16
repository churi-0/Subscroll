"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   APP — playback, feed loading, chrome, sheet system, navigation, boot
   ──────────────────────────────────────────────────────────────────────────
   This is the glue layer. It depends on everything defined in config.js,
   auth.js, state.js, view.js, and panels.js. Load this one last.
   ══════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════
// PLAYBACK
// ═══════════════════════════════════════════════════════════════════════════

let activeSec=null;

function curVideo(sec){
  if(!sec) return null;
  if(sec._videos) return sec._videos[sec._idx?sec._idx():0]||null;
  return sec._video||null;
}

function reapVideos(){
  const secs=[...feed.children];
  const cur=secs.indexOf(activeSec);
  if(cur<0) return;
  secs.forEach((s,i)=>{
    const near=Math.abs(i-cur)<=LIVE_WINDOW;
    const vids=s._videos||(s._video?[s._video]:[]);
    vids.forEach((v,slot)=>{
      if(!v||!v._attach) return;
      const slideNear = !s._videos || Math.abs(slot-(s._idx?s._idx():0))<=1;
      if(near&&slideNear) v._attach(); else v._detach();
    });
  });
}

function tryPlay(v){
  if(!v._wantPlay||!v.isConnected||!v.paused) return;
  const p=v.play();
  if(p&&p.catch) p.catch(err=>{
    const n=err&&err.name;
    if(n==='NotAllowedError'&&!v.muted){
      v.muted=true; if(v._audio) v._audio.muted=true;
      const p2=v.play(); if(p2&&p2.catch) p2.catch(()=>{});
    }
  });
}

function playVideo(v){
  if(!v||!v._attach) return;
  v._wantPlay=true;
  const wasAttached=v._attached;
  v._attach();
  if(!v._readyHooked){
    v._readyHooked=true;
    const onReady=()=>tryPlay(v);
    v.addEventListener('loadeddata',onReady);
    v.addEventListener('canplay',onReady);
  }
  if(wasAttached&&v.readyState>=2) tryPlay(v);
}

function pauseVideo(v){ if(v){ v._wantPlay=false; if(!v.paused) v.pause(); } }

// Watchdog — sneaks a nudge into stalled videos
setInterval(()=>{
  if(document.hidden) return;
  const v=curVideo(activeSec);
  if(!v||v.dataset.userPaused==='1') return;
  if(!v.paused) return;
  const now=Date.now();
  if(v._lastNudge&&now-v._lastNudge<CFG.NUDGE_GAP_MS) return;
  v._lastNudge=now;
  playVideo(v);
},CFG.WATCHDOG_MS);

function ensurePlaying(){
  const v=curVideo(activeSec);
  if(v&&v.paused&&v.dataset.userPaused!=='1') playVideo(v);
}

function setActive(sec){
  if(activeSec===sec){ ensurePlaying(); return; }
  const prev=activeSec;
  activeSec=sec;
  if(prev&&chromeOn&&!sheetOpen()) setChrome(false);
  if(prev) (prev._videos||(prev._video?[prev._video]:[])).forEach(pauseVideo);
  const post=sec._post;
  if(post){
    const n=S.posts.indexOf(post)+1;
    countEl.textContent=n+' / '+S.posts.length+(S.end?'':'+');
  }
  reapVideos();
  const v=curVideo(sec);
  if(v){ delete v.dataset.userPaused; v.muted=S.muted; playVideo(v); }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED LOADING
// ═══════════════════════════════════════════════════════════════════════════

let msgSec=null;

function message(html,cls){
  clearMessage();
  msgSec=document.createElement('section');
  msgSec.className='post';
  msgSec.innerHTML=`<div class="msg ${cls||''}">${html}</div>`;
  feed.appendChild(msgSec);
}

function clearMessage(){ if(msgSec){ msgSec.remove(); msgSec=null; } }

let toastT;
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),CFG.TOAST_MS); }
document.addEventListener('cloudsaveerror',()=>toast('Could not save to the cloud — retrying…'));

function subLabel(){
  const g=active();
  if(!g.subs.length) return g.name;
  return g.subs.length===1 ? 'r/'+g.subs[0] : g.name;
}

function listingPath(){
  const g=active();
  const sub=g.subs.join('+')||'all';
  const q=new URLSearchParams({limit:String(CFG.PAGE_SIZE),raw_json:'1'});
  if(S.after) q.set('after',S.after);
  if(g.sort==='top'||g.sort==='controversial') q.set('t',g.time);
  return `/r/${encodeURIComponent(sub)}/${g.sort}?${q}`;
}

async function load(reset){
  if(S.loading||(S.end&&!reset)) return;
  const g=active();
  const id=++S.reqId;
  if(reset){
    S.after=null; S.end=false; S.posts=[]; S.seen.clear();
    activeSec=null; feed.innerHTML=''; feed.scrollTop=0; syncHash();
  }
  if(!g.subs.length){
    feed.innerHTML=''; S.posts=[]; activeSec=null;
    message(`<h3>${esc(g.name)} is empty</h3>
      <div>Add a few subreddits and they'll all play here as one feed.</div>
      <button class="mbtn pri" id="retry">Add subreddits</button>`);
    const r=$('#retry'); if(r) r.onclick=()=>openGroupEditor(g.id);
    countEl.textContent='';
    return;
  }
  // Check for client ID before attempting any API calls
  if(!getClientId()){
    S.loading=false;
    message(`<h3>Welcome to SubScroll</h3>
      <div>Add your Reddit client ID to start browsing.</div>
      <button class="mbtn pri" id="setupBtn">Open Settings</button>`);
    const r=$('#setupBtn'); if(r) r.onclick=()=>openSheet('settings');
    countEl.textContent='';
    return;
  }
  S.loading=true;
  message('<div class="spinner"></div><div>'+(reset?'Loading '+esc(subLabel())+'…':'Loading more…')+'</div>');
  try{
    const data=await api(listingPath());
    if(id!==S.reqId) return;
    const kids=((data.data&&data.data.children)||[]).filter(c=>c.kind==='t3').map(c=>c.data);
    S.after=(data.data&&data.data.after)||null;
    if(!S.after) S.end=true;

    let added=0;
    const frag=document.createDocumentFragment();
    for(const p of kids){
      if(S.seen.has(p.id)) continue;
      S.seen.add(p.id);
      p._media=extract(p);
      if(S.mediaOnly&&!p._media.length) continue;
      S.posts.push(p); frag.appendChild(buildPost(p)); added++;
    }
    clearMessage();
    feed.appendChild(frag);
    if(reset&&feed.firstElementChild) setActive(feed.firstElementChild);

    if(!S.posts.length&&S.end){
      message(`<h3>Nothing to show</h3><div>${esc(subLabel())} returned no ${S.mediaOnly?'media ':''}posts.
        Try another sort, or turn off "Media only".</div>`);
    }else if(S.end){
      message('<h3>You\u2019re all caught up</h3><div>End of '+esc(subLabel())+'.</div>');
    }else if(!added){ S.loading=false; return load(false); }
  }catch(e){
    if(id!==S.reqId) return;
    message(`<h3>Couldn\u2019t load ${esc(subLabel())}</h3><div>${esc(e.message)}</div>
      <button class="mbtn pri" id="retry">Retry</button>
      <button class="mbtn" id="settingsBtn">Settings</button>`,'err');
    const r=$('#retry'); if(r) r.onclick=()=>{ S.loading=false; load(false); };
    const s=$('#settingsBtn'); if(s) s.onclick=()=>openSheet('settings');
  }finally{ if(id===S.reqId) S.loading=false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHROME — one tap up, self-dismissing
// ═══════════════════════════════════════════════════════════════════════════

let chromeOn=false, idleT=null;

function pokeChrome(){
  clearTimeout(idleT);
  if(!chromeOn) return;
  idleT=setTimeout(()=>{ if(chromeOn&&!sheetOpen()) setChrome(false); },CFG.CHROME_IDLE_MS);
}

function setChrome(on){
  on=!!on;
  clearTimeout(idleT);
  if(on===chromeOn) { if(on) pokeChrome(); return; }
  chromeOn=on;
  document.body.classList.toggle('chrome-on',on);
  if(on){ setClear(false); pokeChrome(); }
}

['pointerdown','pointermove','click','focusin'].forEach(ev=>
  hdrEl.addEventListener(ev,pokeChrome,{passive:true}));

function setClear(on){
  on=!!on;
  if(S.info===!on) { document.body.classList.toggle('clear',on); return; }
  S.info=!on; save();
  document.body.classList.toggle('clear',on);
  if(on) setChrome(false);
}
const isClear=()=>!S.info;
const toggleClear=()=>setClear(!isClear());
const toggleChrome=()=>setChrome(!chromeOn);

clearXEl.addEventListener('click',e=>{ e.stopPropagation(); setClear(false); });

function togglePlay(sec){
  const v=curVideo(sec||activeSec);
  if(!v) return false;
  if(v.paused){ delete v.dataset.userPaused; playVideo(v); }
  else { v.dataset.userPaused='1'; pauseVideo(v); }
  return true;
}

// Scroll-triggered prefetch
let ticking=false;
feed.addEventListener('scroll',()=>{
  if(ticking) return;
  ticking=true;
  requestAnimationFrame(()=>{
    ticking=false;
    const y=Math.max(0,feed.scrollTop);
    if(feed.scrollHeight-y-feed.clientHeight < feed.clientHeight*CFG.PREFETCH_SCREENS) load(false);
  });
},{passive:true});

// ═══════════════════════════════════════════════════════════════════════════
// PANE SYSTEM — panels are the shelf getting taller
// ───────────────────────────────────────────────────────────────────────────
// There is no separate sheet any more. #sheet is a region *inside* the header,
// so a panel opening is literally the same surface growing downward from the
// top of the screen. One element, one material, one direction of travel.
//
// The only animated property is that region's height, published as --ph so
// other chrome (the toast) can stay clear of it.
// ═══════════════════════════════════════════════════════════════════════════

const hdrHead = $('#hdrHead');
let stack=[], paneH=0;
const sheetOpen=()=>stack.length>0;

// How tall the pane is allowed to get: whatever the viewport has left once
// the shelf head, the safe area and the on-screen keyboard have taken theirs.
function paneRoom(){
  const vv=window.visualViewport;
  const vh=(vv?vv.height:window.innerHeight);
  const head=hdrHead.getBoundingClientRect().height;
  return Math.max(180, vh - head - 28);
}

// Measure the panel at its natural size, then clamp the scrollable body so
// the whole thing fits. Returns the height the pane should animate to.
let measuring=false;
function measurePane(){
  measuring=true;
  const room=paneRoom();
  sheetBody.style.maxHeight='none';
  const bodyNat=sheetBody.scrollHeight;
  const nonBody=Math.max(0, sheetCard.offsetHeight - sheetBody.offsetHeight)
              + parseFloat(getComputedStyle(sheetCard).paddingBottom||0)*0;
  const maxBody=Math.max(96, room - nonBody);
  sheetBody.style.maxHeight=maxBody+'px';
  measuring=false;
  return Math.round(Math.min(bodyNat, maxBody) + nonBody);
}

function setPaneH(px,publish){
  if(paneH===px&&publish!==false) return;
  paneH=px;
  sheetEl.style.setProperty('--ph',px+'px');
  if(publish!==false) document.documentElement.style.setProperty('--ph',px+'px');
}

// Re-measure and glide to the new height. Called after every render, and
// whenever the viewport or keyboard changes the room available.
function sizePane(){
  if(!stack.length) return;
  setPaneH(measurePane());
}

let sizeRaf=0;
function queueSize(){
  if(sizeRaf) return;
  sizeRaf=requestAnimationFrame(()=>{ sizeRaf=0; sizePane(); });
}

function renderTop(dir){
  const top=stack[stack.length-1];
  if(!top) return;
  const spec=PANELS[top.name](top.args||{});
  top.spec=spec;
  sheetTitle.textContent=spec.title;
  sheetBack.hidden=stack.length<2;

  if(spec.action){
    sheetAction.hidden=false;
    sheetAction.innerHTML='';
    if(spec.action.icon) sheetAction.appendChild(iconEl(spec.action.icon));
    sheetAction.appendChild(el('span',null,spec.action.label));
    sheetAction.className='sbtn'+(spec.action.pri?' pri':'');
    sheetAction.onclick=e=>{ e.stopPropagation(); spec.action.run(); };
  }else sheetAction.hidden=true;

  // Rebuild the body off-document so half-built panels never paint.
  const frag=document.createElement('div');
  spec.body(frag);
  sheetBody.replaceChildren(...frag.childNodes);

  sheetFoot.innerHTML='';
  if(spec.foot&&spec.foot.length){
    sheetFoot.hidden=false;
    spec.foot.forEach(b=>{
      const btn=document.createElement('button');
      btn.type='button';
      if(b.icon) btn.appendChild(iconEl(b.icon));
      if(b.label) btn.appendChild(el('span',null,b.label));
      if(b.danger){ btn.className='danger'; btn.setAttribute('aria-label',b.label); btn.querySelector('span').remove(); }
      else if(b.pri) btn.className='pri';
      if(b.disabled) btn.disabled=true;
      btn.onclick=e=>{ e.stopPropagation(); b.run(); };
      sheetFoot.appendChild(btn);
    });
  }else sheetFoot.hidden=true;

  // Directional slide only when the stack actually moved.
  sheetBody.classList.remove('slide-l','slide-r');
  if(dir){
    void sheetBody.offsetWidth;
    sheetBody.classList.add(dir>0?'slide-l':'slide-r');
  }
  sheetBody.scrollTop=dir?0:(top.scroll||0);

  // Name the open panel on <body> so chrome can react (chevron, etc).
  [...document.body.classList].forEach(c=>{ if(c.indexOf('pane-')===0) document.body.classList.remove(c); });
  document.body.classList.add('pane-'+top.name);

  sizePane();
}

function refresh(){ if(stack.length){ stack[stack.length-1].scroll=sheetBody.scrollTop; renderTop(0); } }

function pushPanel(name,args){
  const first=!stack.length;
  if(!first) stack[stack.length-1].scroll=sheetBody.scrollTop;
  stack.push({name,args});

  if(first){
    clearTimeout(closeT);
    setChrome(true);                      // the shelf must be down to grow
    sheetEl.classList.add('mounted');
    sheetEl.setAttribute('aria-hidden','false');
    document.body.classList.add('sheet-open');
    $('#feedPill').setAttribute('aria-expanded','true');
    setPaneH(0);                          // start flush with the shelf head
    renderTop(0);                         // measures and sets the target
    const target=paneH;
    setPaneH(0,false);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!stack.length) return;
      setPaneH(target);
      sheetEl.classList.add('up');
    }));
  }else{
    renderTop(1);
  }
}

function popPanel(){
  if(stack.length<=1) return closeSheet();
  stack.pop(); renderTop(-1);
}

let closeT=null;
function closeSheet(){
  if(!stack.length) return;
  stack=[];
  sheetEl.classList.remove('up','drag');
  sheetEl.setAttribute('aria-hidden','true');
  document.body.classList.remove('sheet-open');
  [...document.body.classList].forEach(c=>{ if(c.indexOf('pane-')===0) document.body.classList.remove(c); });
  $('#feedPill').setAttribute('aria-expanded','false');
  setPaneH(0);
  const a=document.activeElement;
  if(a&&sheetEl.contains(a)) a.blur();
  pokeChrome();
  clearTimeout(closeT);
  closeT=setTimeout(()=>{
    if(stack.length) return;
    sheetEl.classList.remove('mounted');
    sheetBody.replaceChildren();      // don't keep a stale panel alive
    sheetBody.style.maxHeight='';
    sheetFoot.replaceChildren();
    sheetFoot.hidden=true;
  },460);
}

function openSheet(name,args){
  clearTimeout(closeT);
  if(stack.length){
    stack=[];
    sheetBody.classList.remove('slide-l','slide-r');
  }
  pushPanel(name,args);
}

// Kept for compatibility with anything that still nudges the pane directly.
function setSheetY(px){ if(!px) sizePane(); }

// With --kb driving the layout, the field only needs to be scrolled into
// view inside the already-resized body.
function keepFieldVisible(inp){
  if(!inp) return;
  const run=()=>{
    if(!inp.isConnected) return;
    sizePane();
    const r=inp.getBoundingClientRect(), b=sheetBody.getBoundingClientRect();
    const over=r.bottom+12-b.bottom;
    if(over>0) sheetBody.scrollBy({top:over,behavior:'smooth'});
    else if(r.top<b.top+8) sheetBody.scrollBy({top:r.top-b.top-8,behavior:'smooth'});
  };
  requestAnimationFrame(run);
  setTimeout(run,320);
}

// Panels grow and shrink as their own content changes (autocomplete results,
// chips wrapping to a new line). Watch, don't guess.
if(window.ResizeObserver){
  const ro=new ResizeObserver(()=>{
    if(measuring||!stack.length||sheetEl.classList.contains('drag')) return;
    queueSize();
  });
  ro.observe(sheetCard);
}
if(window.visualViewport){
  visualViewport.addEventListener('resize',queueSize);
}
addEventListener('resize',queueSize,{passive:true});

// Dismissal
sheetBack.onclick=e=>{ e.stopPropagation(); popPanel(); };
scrimEl.onclick=()=>closeSheet();
sheetEl.addEventListener('click',e=>e.stopPropagation());

/* ── Drag to retract ───────────────────────────────────────────────────────
   The pane hangs from the top, so it is dismissed by pushing it back up.
   Grab the bar at its bottom edge (or the panel's title row) and drag: the
   pane tracks 1:1 upward, rubber-bands downward, and on release decides with
   velocity first and distance second — a quick flick retracts even a tall
   panel, a slow drag has to clear a third of it. */
(()=>{
  const grip=$('#sheetHandle');
  let id=null,y0=0,dy=0,live=false,h0=0,lastY=0,lastT=0,vel=0;

  const start=e=>{
    if(e.pointerType==='mouse'&&e.button!==0) return;
    if(id!==null||!stack.length) return;
    if(e.target.closest('button,input,select,textarea,a')) return;
    const inBody=sheetBody.contains(e.target);
    // The body owns vertical drags whenever it can actually scroll.
    if(inBody&&sheetBody.scrollHeight>sheetBody.clientHeight+2) return;
    id=e.pointerId; y0=lastY=e.clientY; dy=0; vel=0; lastT=e.timeStamp;
    h0=paneH; live=false;
  };

  const move=e=>{
    if(e.pointerId!==id) return;
    const raw=e.clientY-y0;
    if(!live){
      if(Math.abs(raw)<4) return;
      live=true; y0=e.clientY;
      sheetEl.classList.add('drag');
      try{ sheetEl.setPointerCapture(id); }catch(_){}
    }
    const d=e.clientY-y0;
    const dt=e.timeStamp-lastT;
    if(dt>0){ vel=(e.clientY-lastY)/dt; lastY=e.clientY; lastT=e.timeStamp; }
    dy = d<0 ? d : Math.pow(d,.55)*1.6;     // resist pulling further down
    if(e.cancelable) e.preventDefault();
    setPaneH(Math.max(0,h0+dy));
  };

  const end=e=>{
    if(e.pointerId!==id) return;
    try{ sheetEl.releasePointerCapture(id); }catch(_){}
    const wasLive=live;
    id=null; live=false;
    if(!wasLive) return;
    sheetEl.classList.remove('drag');
    const flick = vel < -0.55;
    const far   = dy < -h0*0.33;
    if(flick||far) closeSheet();
    else sizePane();
    dy=0; vel=0;
  };

  sheetEl.addEventListener('pointerdown',start);
  sheetEl.addEventListener('pointermove',move,{passive:false});
  sheetEl.addEventListener('pointerup',end);
  sheetEl.addEventListener('pointercancel',end);
  grip.addEventListener('dragstart',e=>e.preventDefault());
  grip.addEventListener('click',()=>{ if(!sheetEl.classList.contains('drag')) closeSheet(); });
})();

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

function paintHeader(){
  const g=active();
  setIcon(feedIco,iconName(g.icon));
  feedName.textContent=g.name;
  const n=g.subs.length;
  feedMeta.textContent = n===0 ? 'empty'
    : n===1 ? 'r/'+g.subs[0]
    : n<=3  ? g.subs.map(s=>'r/'+s).join(' \u00B7 ')
    : 'r/'+g.subs[0]+' \u00B7 r/'+g.subs[1]+' +'+(n-2)+' more';
  paintSorts();
}

function paintSorts(){
  const g=active();
  sortsEl.innerHTML='';
  SORTS.forEach(([v,l])=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='schip'+(g.sort===v?' on':'');
    b.textContent=l;
    b.setAttribute('aria-pressed',String(g.sort===v));
    b.onclick=()=>{ if(g.sort===v) return; g.sort=v; save(); paintSorts(); load(true); };
    sortsEl.appendChild(b);
  });
  if(g.sort==='top'||g.sort==='controversial'){
    sortsEl.appendChild(el('span','sep'));
    TIMES.forEach(([v,l])=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='schip t'+(g.time===v?' on':'');
      b.textContent=l;
      b.setAttribute('aria-pressed',String(g.time===v));
      b.onclick=()=>{ if(g.time===v) return; g.time=v; save(); paintSorts(); load(true); };
      sortsEl.appendChild(b);
    });
  }
}

const repaintStars=()=>feed.querySelectorAll('section').forEach(s=>s._paintStar&&s._paintStar());

function switchTo(id){
  if(S.activeId===id&&!S.end&&S.posts.length) { paintHeader(); return; }
  S.activeId=id;
  save();
  paintHeader(); load(true);
}

function openSingle(name){
  S.tmp=mkGroup({id:TMP,name:'r/'+name,icon:'search',subs:[name],
    sort:active().sort,time:active().time});
  S.activeId=TMP;
  paintHeader(); load(true);
  toast(isFav(name)?('r/'+name):('r/'+name+' \u2014 tap \u2606 to favourite'));
}

function openMulti(list){
  list=list.slice(0,CFG.MAX_SUBS);
  S.tmp=mkGroup({id:TMP,name:list.length===1?('r/'+list[0]):'Search',icon:'search',
    subs:list,sort:active().sort,time:active().time});
  S.activeId=TMP;
  paintHeader(); load(true);
}

function openGroupEditor(id){
  if(sheetOpen()) pushPanel('group',{id}); else openSheet('group',{id});
}

function newGroup(){
  const g=mkGroup({name:'New group',icon:ICONS[1+(S.groups.length%(ICONS.length-1))]});
  S.groups.push(g); save();
  pushPanel('group',{id:g.id});
}

function toggleFav(name){
  const fav=favGroup();
  const i=fav.subs.findIndex(s=>s.toLowerCase()===String(name).toLowerCase());
  if(i>=0){
    fav.subs.splice(i,1);
    toast('Removed r/'+name+' from Favourites');
  }else{
    if(fav.subs.length>=CFG.MAX_SUBS) return toast('Favourites is full ('+CFG.MAX_SUBS+')');
    fav.subs.push(name);
    toast('r/'+name+' added to Favourites');
  }
  save();
  repaintStars();
  paintHeader();
}

// Static chrome icons
setIcon($('#feedChev'),'down');
setIcon($('#btnSearch'),'search');
setIcon($('#btnMore'),'more');
setIcon($('#sheetBack'),'left');
setIcon($('#clearX'),'up');
setIcon($('.account-mark'),'sparkle');

// Publish the shelf head's real height so the gallery dots can duck under it
(()=>{
  const sync=()=>{
    const h=hdrHead.getBoundingClientRect().height;
    if(h) document.documentElement.style.setProperty('--chrome-h',Math.round(h+8)+'px');
  };
  if(window.ResizeObserver) new ResizeObserver(sync).observe(hdrHead);
  sync();
})();

// Header buttons — each one toggles its own panel, so the control that
// opened the shelf is also the control that puts it away.
function togglePanel(name,args){
  if(stack.length===1&&stack[0].name===name) return closeSheet();
  openSheet(name,args);
}
$('#feedPill').onclick =()=>togglePanel('feeds');
$('#btnSearch').onclick=()=>togglePanel('search',{});
$('#btnMore').onclick  =()=>togglePanel('settings');

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD & WINDOW EVENTS
// ═══════════════════════════════════════════════════════════════════════════

function step(d){
  const secs=[...feed.children];
  const i=secs.indexOf(activeSec);
  const n=Math.max(0,Math.min(secs.length-1,(i<0?0:i)+d));
  secs[n]&&secs[n].scrollIntoView({behavior:'smooth',block:'start'});
}

addEventListener('keydown',e=>{
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)){
    if(e.key==='Escape') e.target.blur();
    return;
  }
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  if(sheetOpen()&&e.key!=='Escape') return;
  switch(e.key){
    case 'ArrowDown': case 'j': case ' ': e.preventDefault(); step(1); break;
    case 'ArrowUp':   case 'k':           e.preventDefault(); step(-1); break;
    case 'ArrowRight': case 'ArrowLeft':
      if(activeSec&&activeSec._show){ e.preventDefault(); activeSec._show(activeSec._idx()+(e.key==='ArrowRight'?1:-1)); }
      break;
    case 'i': case 'c': toggleClear(); break;
    case 'h': toggleChrome(); break;
    case 'g': togglePanel('feeds'); break;
    case '/': e.preventDefault(); togglePanel('search',{}); break;
    case 'f': if(activeSec&&activeSec._post) toggleFav(activeSec._post.subreddit); break;
    case 'm': S.muted=!S.muted; save(); applyMute(); toast(S.muted?'Muted':'Sound on'); break;
    case 'p': togglePlay(); break;
    case 'r': load(true); break;
    case 'Escape':
      if(sheetOpen()) closeSheet();
      else if(chromeOn) setChrome(false);
      else if(isClear()) setClear(false);
      break;
  }
});

addEventListener('visibilitychange',()=>{
  if(document.hidden) document.querySelectorAll('video').forEach(v=>{ if(!v.paused) v.pause(); });
  else ensurePlaying();
});

let rzT;
addEventListener('resize',()=>{
  clearTimeout(rzT);
  rzT=setTimeout(()=>{ if(activeSec) activeSec.scrollIntoView({block:'start'}); },160);
},{passive:true});

// ═══════════════════════════════════════════════════════════════════════════
// DEEP LINKS & BOOT
// ═══════════════════════════════════════════════════════════════════════════

function syncHash(){
  const g=active();
  if(!g.subs.length) return;
  const t=(g.sort==='top'||g.sort==='controversial')?'?t='+g.time:'';
  const h=`#/r/${g.subs.join('+')}/${g.sort}${t}`;
  if(location.protocol==='data:'||location.protocol==='file:') return;
  try{ if(location.hash!==h) history.replaceState(null,'',h); }catch(_){}
}

function readHash(){
  const m=location.hash.match(/^#\/r\/([^/?]+)(?:\/(\w+))?(?:\?t=(\w+))?/);
  if(!m) return false;
  const subs=decodeURIComponent(m[1]).split('+').filter(Boolean).slice(0,CFG.MAX_SUBS);
  if(!subs.length) return false;
  S.tmp=mkGroup({id:TMP,name:subs.length===1?('r/'+subs[0]):'Linked feed',icon:'search',
    subs,sort:m[2]||'hot',time:m[3]||'all'});
  S.activeId=TMP;
  return true;
}

// ── Boot ────────────────────────────────────────────────────────────────

let appBooted=false;
async function boot(){
  if(appBooted) return;

  const cloud=await Account.loadState();
  const legacy=Account.readLegacy();

  if(cloud&&typeof cloud==='object'){
    applySettings(cloud,false);
    Account.clearLegacy();
  }else if(legacy){
    applySettings(legacy,false);
    await Account.saveNow(snapshot());
    Account.clearLegacy();
  }else{
    // Give a first-use account a durable initial snapshot straight away.
    await Account.saveNow(snapshot());
  }

  appBooted=true;
  readHash();
  document.body.classList.toggle('clear',isClear());
  // Keep Settings reachable until a Reddit client ID has been entered.
  setChrome(!getClientId());
  paintHeader();
  load(true);
}

Account.init(boot);

// ── iOS URL bar collapse ────────────────────────────────────────────────

(()=>{
  const standalone = navigator.standalone===true ||
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if(!IOS || standalone) return;

  const nudge=()=>{
    const de=document.documentElement;
    de.classList.add('urlnudge');
    void de.offsetHeight;
    window.scrollTo(0,1);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      setTimeout(()=>{
        de.classList.remove('urlnudge');
        window.scrollTo(0,0);
      },60);
    }));
  };

  if(document.readyState==='complete') setTimeout(nudge,120);
  else addEventListener('load',()=>setTimeout(nudge,120),{once:true});
  addEventListener('orientationchange',()=>setTimeout(nudge,320));
})();