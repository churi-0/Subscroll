"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   VIEW — DOM rendering (media nodes, post sections, mute toggling)
   ──────────────────────────────────────────────────────────────────────────
   No side effects beyond DOM construction — these functions just build
   elements. The wiring (event handlers that reference app-level functions)
   is done here too, but the handlers themselves live in app.js.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Lazy-image observer ─────────────────────────────────────────────────

const lazyIO=new IntersectionObserver(es=>{
  for(const e of es){
    if(!e.isIntersecting) continue;
    lazyIO.unobserve(e.target);
    if(e.target.dataset.src){ e.target.src=e.target.dataset.src; delete e.target.dataset.src; }
  }
},{root:feed,rootMargin:'150% 0px'});

// ── Active-post observer ────────────────────────────────────────────────
// (callback references setActive/pauseVideo defined in app.js)

const activeIO=new IntersectionObserver(es=>{
  for(const e of es){
    const sec=e.target;
    if(e.isIntersecting&&e.intersectionRatio>.6){
      setActive(sec);
    }else if(sec!==activeSec){
      sec.querySelectorAll('video').forEach(v=>pauseVideo(v));
    }
  }
},{root:feed,threshold:[0,.6,.9]});

// ── Media node builder ──────────────────────────────────────────────────

function mediaNode(item,post,sec,slotIdx){
  const holder=document.createElement('div');
  holder.className='stage';

  if(item.kind==='img'){
    const img=document.createElement('img');
    img.alt=post.title||''; img.decoding='async';
    img.dataset.src=item.src;
    img.addEventListener('error',()=>{ if(item.full&&img.src!==item.full) img.src=item.full; });
    lazyIO.observe(img);
    holder.appendChild(img);

  }else if(item.kind==='video'){
    const v=document.createElement('video');
    v.playsInline=true; v.setAttribute('webkit-playsinline','');
    v.preload=IOS?'none':'metadata';
    v.controls=false;
    v.loop=!!item.loop; v.muted=S.muted;
    if(item.poster) v.poster=item.poster;

    const useHls = !!(item.hls && IS_SAFARI && v.canPlayType('application/vnd.apple.mpegurl'));
    v._url = useHls ? item.hls : item.src;
    v._attached = false;
    v._attach = () => {
      if(v._attached) return;
      v._attached = true;
      v.src = v._url;
      v.load();
    };
    v._detach = () => {
      if(!v._attached) return;
      v._attached = false;
      try{ v.pause(); }catch(_){}
      v.removeAttribute('src');
      try{ v.load(); }catch(_){}
    };
    holder.appendChild(v);
    const a=(item.audioBase&&!useHls)?attachAudio(v,item.audioBase):null;
    v._audio=a;
    (sec._videos||(sec._videos=[]))[slotIdx||0]=v;
    if(!slotIdx) sec._video=v;

    const pz=document.createElement('div');
    pz.className='paused'; pz.innerHTML='<i>'+iconHTML('play')+'</i>';
    v.addEventListener('play',()=>pz.classList.remove('show'));
    v.addEventListener('pause',()=>{ if(!document.hidden) pz.classList.add('show'); });
    holder.appendChild(pz);

  }else if(item.kind==='iframe'){
    const f=document.createElement('div');
    f.className='facade';
    if(item.poster){ const im=document.createElement('img'); im.src=item.poster; im.loading='lazy'; f.appendChild(im); }
    const t=document.createElement('div'); t.className='tri'; t.innerHTML=iconHTML('play');
    f.appendChild(t);
    f.addEventListener('click',e=>{
      e.stopPropagation();
      const fr=document.createElement('iframe');
      fr.className='frame'; fr.src=item.src; fr.allowFullscreen=true; fr.referrerPolicy='no-referrer';
      fr.allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen';
      f.replaceWith(fr);
    });
    holder.appendChild(f);
  }
  return holder;
}

// ── Post section builder ────────────────────────────────────────────────

function applyMute(){
  feed.querySelectorAll('video').forEach(v=>{
    v.muted=S.muted;
    if(v._audio){ v._audio.muted=S.muted; v._audio.volume=1; }
  });
  feed.querySelectorAll('.ract.mute').forEach(b=>{
    b.innerHTML=iconHTML(S.muted?'soundOff':'soundOn')+'<small>Sound</small>';
    b.setAttribute('aria-label',S.muted?'Unmute':'Mute');
  });
}

function buildPost(post){
  const sec=document.createElement('section');
  sec.className='post'; sec._post=post; post._sec=sec;
  const media=post._media;
  let idx=0;

  if(media.length>1){
    const rail=document.createElement('div');
    rail.className='rail';
    media.forEach((it,n)=>{
      const sl=document.createElement('div');
      sl.className='slide';
      const node=mediaNode(it,post,sec,n);
      if(S.blur&&post.over_18&&!post._revealed) node.classList.add('blurred');
      sl.appendChild(node);
      rail.appendChild(sl);
    });
    sec.appendChild(rail);
    sec._rail=rail;
    [0,1].forEach(k=>{
      const sl=rail.children[k];
      if(sl) sl.querySelectorAll('[data-src]').forEach(m=>{ m.src=m.dataset.src; delete m.dataset.src; });
    });
  }else if(media.length){
    const stage=mediaNode(media[0],post,sec,0);
    if(S.blur&&post.over_18&&!post._revealed) stage.classList.add('blurred');
    sec.appendChild(stage);
  }else{
    const stage=document.createElement('div');
    stage.className='noimg';
    stage.innerHTML=iconHTML(post.is_self?'book':'open')+
      '<span>'+esc(post.is_self?'Text post':(post.domain||'Link'))+'</span>';
    sec.appendChild(stage);
  }

  // Info overlay
  const ui=document.createElement('div');
  ui.className='ui';
  const shade=document.createElement('div'); shade.className='shade';
  const info=document.createElement('div'); info.className='info';

  const who=document.createElement('div');
  who.className='who';
  who.innerHTML=`<span class="sub">r/${esc(post.subreddit)}</span><span class="dot">·</span>`+
    `<span class="au">u/${esc(post.author)}</span><span class="dot">·</span>`+
    `<span>${ago(post.created_utc)}</span>`+
    (post.over_18?'<span class="nsfw">18+</span>':'');
  const subLink=who.querySelector('.sub');
  subLink.style.pointerEvents='auto';
  subLink.addEventListener('click',e=>{ e.stopPropagation(); openSingle(post.subreddit); });

  const ttl=document.createElement('div');
  ttl.className='ttl'; ttl.textContent=post.title;
  ttl.addEventListener('click',e=>{ e.stopPropagation(); ttl.classList.toggle('open'); });

  const stats=document.createElement('div');
  stats.className='stats';
  stats.innerHTML=`<span>${iconHTML('score')}<b>${fmt(post.score)}</b></span>`+
    `<a href="https://reddit.com${post.permalink}" target="_blank" rel="noopener">`+
      `${iconHTML('comment')}<span>${fmt(post.num_comments)}</span></a>`+
    (media.length>1?`<span>${iconHTML('images')}<span>${media.length}</span></span>`:'');
  const cl=stats.querySelector('a');
  if(cl) cl.addEventListener('click',e=>e.stopPropagation());

  // Tray chevron
  const trayDn=document.createElement('button');
  trayDn.className='tray-ch tray-dn'; trayDn.type='button';
  trayDn.innerHTML=iconHTML('down');
  trayDn.setAttribute('aria-label','Hide post info');
  trayDn.addEventListener('click',e=>{ e.stopPropagation(); setClear(true); });

  const ttlrow=document.createElement('div');
  ttlrow.className='ttlrow';
  ttlrow.append(ttl,trayDn);

  info.append(who,ttlrow,stats);
  ui.append(shade,info);
  sec.appendChild(ui);

  // Right action rail
  const rail=document.createElement('div');
  rail.className='rail-a';

  const star=document.createElement('button');
  star.className='ract star'; star.type='button';
  const paintStar=()=>{
    const on=isFav(post.subreddit);
    star.classList.toggle('on',on);
    star.innerHTML=iconHTML('star')+'<small>'+(on?'Saved':'Fav')+'</small>';
    star.setAttribute('aria-label',(on?'Remove r/':'Add r/')+post.subreddit+' to favourites');
  };
  paintStar();
  star.addEventListener('click',e=>{ e.stopPropagation(); toggleFav(post.subreddit); });
  sec._paintStar=paintStar;
  rail.appendChild(star);

  const anyVideo=media.some(m=>m.kind==='video');
  const hasAudio=media.some(m=>m.kind==='video'&&(m.audioBase||m.hls));
  if(hasAudio){
    const mb=document.createElement('button');
    mb.className='ract mute'; mb.type='button';
    mb.innerHTML=iconHTML(S.muted?'soundOff':'soundOn')+'<small>Sound</small>';
    mb.setAttribute('aria-label',S.muted?'Unmute':'Mute');
    mb.addEventListener('click',e=>{ e.stopPropagation(); S.muted=!S.muted; save(); applyMute(); });
    rail.appendChild(mb);
  }

  const share=document.createElement('button');
  share.className='ract'; share.type='button';
  share.innerHTML=iconHTML('open')+'<small>Open</small>';
  share.setAttribute('aria-label','Open on Reddit');
  share.addEventListener('click',e=>{
    e.stopPropagation();
    window.open('https://reddit.com'+post.permalink,'_blank','noopener');
  });
  rail.appendChild(share);

  ui.appendChild(rail);

  // Video progress
  if(anyVideo){
    const prog=document.createElement('div');
    prog.className='prog';
    const track=document.createElement('div'); track.className='track';
    const fill=document.createElement('div'); fill.className='fill';
    track.appendChild(fill); prog.appendChild(track);
    sec._tick=()=>{
      const v=curVideo(sec);
      prog.style.display=v?'flex':'none';
      if(v&&v.duration) fill.style.width=(v.currentTime/v.duration*100)+'%';
    };
    media.forEach((_,n)=>{
      const v=(sec._videos||[])[n]; if(!v) return;
      v.addEventListener('timeupdate',sec._tick);
    });
    const seek=clientX=>{
      const v=curVideo(sec); if(!v||!v.duration) return;
      const r=prog.getBoundingClientRect();
      const frac=Math.max(0,Math.min(1,(clientX-r.left)/r.width));
      v.currentTime=Math.min(frac*v.duration,Math.max(0,v.duration-0.05));
      fill.style.width=(frac*100)+'%';
    };
    let scrub=false, scrubWasPlaying=false, scrubX=0, scrubRaf=0;
    const scrubFrame=()=>{ scrubRaf=0; if(scrub) seek(scrubX); };
    prog.addEventListener('pointerdown',e=>{
      e.stopPropagation(); scrub=true; prog.classList.add('grab');
      try{ prog.setPointerCapture(e.pointerId); }catch(_){}
      const v=curVideo(sec);
      scrubWasPlaying=!!(v&&!v.paused);
      scrubX=e.clientX; seek(e.clientX);
    });
    prog.addEventListener('pointermove',e=>{
      if(!scrub) return;
      e.stopPropagation(); scrubX=e.clientX;
      if(!scrubRaf) scrubRaf=requestAnimationFrame(scrubFrame);
    });
    const endScrub=e=>{
      if(!scrub) return; scrub=false; prog.classList.remove('grab');
      if(scrubRaf){ cancelAnimationFrame(scrubRaf); scrubRaf=0; }
      try{ prog.releasePointerCapture(e.pointerId); }catch(_){}
      const v=curVideo(sec); if(!v) return;
      seek(scrubX);
      if(scrubWasPlaying){
        delete v.dataset.userPaused;
        playVideo(v);
        const onSeeked=()=>{ v.removeEventListener('seeked',onSeeked);
          if(v.paused&&!document.hidden) tryPlay(v); };
        if(v.seeking) v.addEventListener('seeked',onSeeked);
      }else{
        v.dataset.userPaused='1';
      }
    };
    prog.addEventListener('pointerup',endScrub);
    prog.addEventListener('pointercancel',endScrub);
    prog.addEventListener('click',e=>e.stopPropagation());
    sec.appendChild(prog);
    sec._tick();
  }

  // Gallery dots
  if(media.length>1){
    const rl=sec._rail;
    const dots=document.createElement('div');
    dots.className='dots';
    media.forEach(()=>dots.appendChild(document.createElement('i')));
    const paint=()=>[...dots.children].forEach((d,n)=>d.classList.toggle('on',n===idx));
    const show=n=>{
      const t=Math.max(0,Math.min(media.length-1,n));
      rl.scrollTo({left:t*rl.clientWidth,behavior:'smooth'});
    };
    sec.appendChild(dots);
    paint();
    sec._show=show; sec._idx=()=>idx;

    const settle=()=>{
      const w=rl.clientWidth||1;
      const n=Math.round(rl.scrollLeft/w);
      if(n===idx) return;
      idx=n; paint();
      reapVideos();
      (sec._videos||[]).forEach((v,i)=>{
        if(!v) return;
        if(i===idx&&sec===activeSec){ v.muted=S.muted; playVideo(v); }
        else pauseVideo(v);
      });
    };
    let sT;
    rl.addEventListener('scroll',()=>{
      clearTimeout(sT); sT=setTimeout(settle,CFG.SETTLE_MS);
      const w=rl.clientWidth||1, n=Math.round(rl.scrollLeft/w);
      [n-1,n,n+1].forEach(k=>{
        const sl=rl.children[k];
        if(!sl) return;
        sl.querySelectorAll('[data-src]').forEach(m=>{ m.src=m.dataset.src; delete m.dataset.src; });
      });
    },{passive:true});

    let sx=0,sy=0;
    rl.addEventListener('pointerdown',e=>{ sx=e.clientX; sy=e.clientY; });
    rl.addEventListener('click',e=>{
      if(Math.abs(e.clientX-sx)>8||Math.abs(e.clientY-sy)>8){ e.stopPropagation(); }
    },true);
  }

  // NSFW reveal
  if(S.blur&&post.over_18){
    const r=document.createElement('div');
    r.className='reveal'; r.innerHTML='<b>'+iconHTML('eye')+'18+ — tap to view</b>';
    r.addEventListener('click',e=>{
      e.stopPropagation();
      sec.querySelectorAll('.blurred').forEach(x=>x.classList.remove('blurred'));
      post._revealed=true; r.remove();
    });
    sec.appendChild(r);
  }

  // Main tap handler
  sec.addEventListener('click',e=>{
    if(e.target.closest('.ract,.prog,.reveal,.facade,a,button,iframe')) return;
    if(sheetOpen()) return;

    if(isClear()){ togglePlay(sec); return; }

    const v=curVideo(sec);

    // Paused media always resumes on the next tap, whatever the shelf is
    // doing — and resuming never summons the shelf. This covers media the
    // user paused as well as media stopped by a stall, an ended clip or a
    // refused autoplay, all of which show the same play badge.
    if(v&&v.paused){
      togglePlay(sec);
      if(chromeOn) setChrome(false);
      return;
    }

    // Shelf hidden: the first tap only reveals it, it never pauses.
    if(!chromeOn){ setChrome(true); return; }

    // Shelf visible: tap pauses and dismisses the shelf.
    setChrome(false);
    togglePlay(sec);
  });

  activeIO.observe(sec);
  return sec;
}