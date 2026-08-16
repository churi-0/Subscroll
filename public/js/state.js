"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   STATE — data model, persistence, media extraction
   ──────────────────────────────────────────────────────────────────────────
   Everything you look at is a GROUP. Favourites is the group with id '__fav',
   always first, never deletable. A one-off search parks in '__tmp' and is
   never persisted.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Data model ──────────────────────────────────────────────────────────

const S={
  groups : [],
  activeId: FAV,
  tmp    : mkGroup({id:TMP,name:'Search',icon:'⌕'}),
  after  : null, end:false, loading:false,
  posts  : [], seen:new Set(),
  mediaOnly:true, blur:true, info:true, muted:true,
  reqId  : 0
};

function active(){
  if(S.activeId===TMP) return S.tmp;
  return S.groups.find(g=>g.id===S.activeId)||S.groups[0];
}
const favGroup=()=>S.groups[0];
const isFav=name=>favGroup().subs.some(s=>s.toLowerCase()===String(name).toLowerCase());

function normalise(){
  S.groups=S.groups.filter(g=>g&&typeof g==='object').map(mkGroup);
  let i=S.groups.findIndex(g=>g.id===FAV);
  if(i<0){ S.groups.unshift(mkGroup({id:FAV,name:'Favourites',icon:'★',subs:[]})); }
  else if(i>0){ const [f]=S.groups.splice(i,1); S.groups.unshift(f); }
  S.groups[0].id=FAV; S.groups[0].icon='★';
  if(!S.groups[0].name) S.groups[0].name='Favourites';
  if(S.activeId!==TMP&&!S.groups.some(g=>g.id===S.activeId)) S.activeId=FAV;
}

function hydrate(raw){
  if(!raw||typeof raw!=='object') return false;
  let touched=false;
  ['mediaOnly','blur','info','muted'].forEach(k=>{ if(typeof raw[k]==='boolean'){S[k]=raw[k];touched=true;} });
  if(typeof raw.clientId==='string'){ setClientId(raw.clientId,false); touched=true; }
  if(Array.isArray(raw.groups)){ S.groups=raw.groups.map(mkGroup); touched=true; }
  else if(raw.groups&&typeof raw.groups==='object'){
    S.groups=Object.keys(raw.groups).map(n=>mkGroup({name:n,subs:raw.groups[n]}));
    touched=true;
  }
  if(Array.isArray(raw.fav)&&raw.fav.length){
    normalise(); S.groups[0].subs=raw.fav.slice(0,CFG.MAX_SUBS); touched=true;
  }else if(Array.isArray(raw.subs)&&raw.subs.length){
    normalise();
    if(!S.groups[0].subs.length){ S.groups[0].subs=raw.subs.slice(0,CFG.MAX_SUBS); touched=true; }
  }
  if(typeof raw.activeId==='string') S.activeId=raw.activeId;
  if(typeof raw.sort==='string'&&raw.sort){ normalise(); S.groups[0].sort=raw.sort; }
  if(typeof raw.time==='string'&&raw.time){ normalise(); S.groups[0].time=raw.time; }
  return touched;
}

// Start with a small first-use feed. Cloud state (or a one-time legacy
// migration) is applied by app.js before the UI is unlocked.
normalise();
if(!favGroup().subs.length) favGroup().subs=['pics','aww','earthporn'];

const snapshot=()=>({v:7,clientId:getClientId(),mediaOnly:S.mediaOnly,blur:S.blur,
  info:S.info,muted:S.muted,groups:S.groups,
  activeId:S.activeId===TMP?FAV:S.activeId});
const save=()=>Account.save(snapshot());
function applySettings(d,persist=true){
  if(hydrate(d)){
    normalise();
    if(persist) save();
  }
}

// ── Media extraction ────────────────────────────────────────────────────

function preview(p){
  const im=p.preview&&p.preview.images&&p.preview.images[0];
  if(!im) return null;
  const src=im.source||{}, res=(im.resolutions||[]).slice().sort((a,b)=>a.width-b.width);
  const pick=res.find(r=>r.width>=1200)||res[res.length-1]||src;
  return {url:dec(pick.url||src.url),full:dec(src.url),w:src.width,h:src.height};
}
function ytId(u){const m=u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i);return m?m[1]:null;}
function iframeSrc(h){const m=dec(h||'').match(/src=[\"']([^\"']+)[\"']/i);return m?m[1]:null;}

function extract(post){
  let p=post;
  if(p.crosspost_parent_list&&p.crosspost_parent_list[0]){
    const c=p.crosspost_parent_list[0];
    p=Object.assign({},c,{title:post.title,permalink:post.permalink,over_18:post.over_18||c.over_18});
  }
  const url=dec(p.url_overridden_by_dest||p.url||''), pv=preview(p), poster=pv?pv.url:null;

  if(p.is_gallery&&p.media_metadata){
    const out=[], order=(p.gallery_data&&p.gallery_data.items)||Object.keys(p.media_metadata).map(id=>({media_id:id}));
    for(const it of order){
      const m=p.media_metadata[it.media_id];
      if(!m||m.status!=='valid') continue;
      const s=m.s||{};
      if(s.mp4){ out.push({kind:'video',src:dec(s.mp4),loop:true,w:s.x,h:s.y}); continue; }
      const res=(m.p||[]).slice().sort((a,b)=>a.x-b.x);
      const small=res.find(r=>r.x>=1200)||res[res.length-1];
      out.push({kind:'img',src:dec((small&&small.u)||s.u||s.gif),full:dec(s.u||s.gif||(small&&small.u)),w:s.x,h:s.y});
    }
    if(out.length) return out;
  }
  const rv=(p.media&&p.media.reddit_video)||(p.secure_media&&p.secure_media.reddit_video);
  if(p.is_video&&rv&&rv.fallback_url){
    const src=dec(rv.fallback_url), base=src.split('?')[0].replace(/\/(CMAF|DASH)_.*$/,'');
    const hls=rv.hls_url?dec(rv.hls_url):null;
    return [{kind:'video',src,hls,
             audioBase:(rv.is_gif||(IOS&&hls))?null:base,
             poster,w:rv.width,h:rv.height,loop:!!rv.is_gif}];
  }
  if(IMG_RE.test(url)&&!/\.gifv/i.test(url)){
    const isGif=/\.gif(\?|#|$)/i.test(url);
    const mp4=p.preview&&p.preview.reddit_video_preview&&p.preview.reddit_video_preview.fallback_url;
    if(isGif&&mp4) return [{kind:'video',src:dec(mp4),poster,loop:true}];
    return [{kind:'img',src:(isGif?url:(poster||url)),full:url,w:pv&&pv.w,h:pv&&pv.h}];
  }
  if(/\.gifv$/i.test(url)) return [{kind:'video',src:url.replace(/\.gifv$/i,'.mp4'),poster,loop:true}];
  if(/\.mp4(\?|#|$)/i.test(url)) return [{kind:'video',src:url,poster,loop:true}];
  const rvp=p.preview&&p.preview.reddit_video_preview;
  if(rvp&&rvp.fallback_url&&!/youtu/.test(url))
    return [{kind:'video',src:dec(rvp.fallback_url),poster,loop:!rvp.duration||rvp.duration<60,w:rvp.width,h:rvp.height}];

  const yt=ytId(url);
  if(yt) return [{kind:'iframe',src:`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`,poster,label:'YouTube'}];
  let m;
  if((m=url.match(/redgifs\.com\/(?:watch|ifr)\/([A-Za-z0-9]+)/i)))
    return [{kind:'iframe',src:`https://www.redgifs.com/ifr/${m[1].toLowerCase()}`,poster,label:'RedGIFs'}];
  if((m=url.match(/streamable\.com\/(?:e\/)?([A-Za-z0-9]+)/i)))
    return [{kind:'iframe',src:`https://streamable.com/e/${m[1]}?autoplay=1`,poster,label:'Streamable'}];
  if((m=url.match(/vimeo\.com\/(\d+)/i)))
    return [{kind:'iframe',src:`https://player.vimeo.com/video/${m[1]}?autoplay=1`,poster,label:'Vimeo'}];
  if((m=url.match(/(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([A-Za-z0-9_-]+)/i)))
    return [{kind:'iframe',src:`https://clips.twitch.tv/embed?clip=${m[1]}&parent=${location.hostname}&autoplay=true`,poster,label:'Twitch'}];
  const oe=(p.media&&p.media.oembed)||(p.secure_media&&p.secure_media.oembed);
  const src=oe&&iframeSrc(oe.html);
  if(src) return [{kind:'iframe',src,poster,label:oe.provider_name||'Embed'}];
  if(p.post_hint==='image'&&poster) return [{kind:'img',src:poster,full:pv.full,w:pv.w,h:pv.h}];
  return [];
}

function attachAudio(video,base){
  const cands=['/CMAF_AUDIO_128.mp4','/CMAF_AUDIO_64.mp4','/DASH_AUDIO_128.mp4','/DASH_AUDIO_64.mp4','/DASH_audio.mp4'];
  let i=0, ok=false;
  const a=document.createElement('audio');
  a.preload='none'; a.style.display='none';
  const next=()=>{ if(i>=cands.length){a.remove();return;} a.src=base+cands[i++]; a.load(); };
  a.addEventListener('error',next);
  a.addEventListener('loadedmetadata',()=>{ok=true;});
  next();
  video.after(a);
  const sync=()=>{ if(Math.abs(a.currentTime-video.currentTime)>.3) a.currentTime=video.currentTime; };
  video.addEventListener('play',()=>{ if(ok){sync(); a.play().catch(()=>{});} });
  video.addEventListener('pause',()=>a.pause());
  video.addEventListener('seeking',sync);
  video.addEventListener('timeupdate',sync);
  const vol=()=>{ a.muted=video.muted; a.volume=video.volume; };
  video.addEventListener('volumechange',vol); vol();
  return a;
}