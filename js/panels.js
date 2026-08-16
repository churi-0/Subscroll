"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   PANELS — bottom-sheet panel definitions
   ──────────────────────────────────────────────────────────────────────────
   Each panel is a function on PANELS[name] that returns {title, action?,
   body(box), foot?}. Panels reference app-level functions (switchTo,
   openSingle, etc.) only in user-initiated callbacks, so load order doesn't
   matter — they'll all be defined by the time the user taps anything.
   ══════════════════════════════════════════════════════════════════════════ */

const PANELS={};

// ── Feed switcher ────────────────────────────────────────────────────────

PANELS.feeds=()=>({
  title:'Feeds',
  action:{label:'+ New',run:()=>newGroup()},
  body(box){
    S.groups.forEach((g,i)=>{
      if(i===0) label(box,'Default');
      if(i===1) label(box,plural(S.groups.length-1,'group'));
      const row=el('button','row'+(g.id===S.activeId?' on':''));
      row.type='button';
      const ico=el('span','rico',g.icon); row.appendChild(ico);
      const mid=el('span','rmid');
      mid.appendChild(el('span','rname',g.name));
      mid.appendChild(el('span','rsub',
        g.subs.length?g.subs.map(s=>'r/'+s).join('  ·  '):'Empty — tap the pencil to add subreddits'));
      row.appendChild(mid);
      const ed=el('span','redit','✎');
      ed.setAttribute('role','button');
      ed.setAttribute('aria-label','Edit '+g.name);
      ed.onclick=e=>{ e.stopPropagation(); pushPanel('group',{id:g.id}); };
      row.appendChild(ed);
      row.onclick=()=>{ switchTo(g.id); closeSheet(); };
      box.appendChild(row);
    });
    if(S.groups.length===1){
      emptyNote(box,'No groups yet',
        'A group is a named set of subreddits that plays as one feed. Tap "+ New" to make one.');
    }
  }
});

// ── Group editor ─────────────────────────────────────────────────────────

function commit(g,reload=true){
  save(); paintHeader(); refresh(); repaintStars();
  if(reload&&S.activeId===g.id) load(true);
}

PANELS.group=({id})=>{
  const g=S.groups.find(x=>x.id===id)||S.tmp;
  const fav=g.id===FAV;
  return {
    title:fav?'Favourites':'Edit group',
    action:{label:'Open',pri:true,run:()=>{ switchTo(g.id); closeSheet(); }},
    body(box){
      const wrap=el('div','fld');
      wrap.appendChild(el('span',null,'Name'));
      const rowf=el('div');
      rowf.style.cssText='display:flex;gap:8px';
      const ib=el('button','ic',g.icon);
      ib.style.cssText='width:46px;height:46px;font-size:19px;border-radius:14px';
      ib.setAttribute('aria-label','Change icon');
      ib.onclick=e=>{ e.stopPropagation(); pushPanel('icon',{id:g.id}); };
      const inp=el('input','inp');
      inp.value=g.name; inp.placeholder='Group name'; inp.spellcheck=false;
      inp.oninput=()=>{ g.name=inp.value.trim()||'Untitled'; save(); paintHeader(); };
      inp.addEventListener('focus',()=>keepFieldVisible(inp));
      rowf.append(ib,inp);
      wrap.appendChild(rowf);
      box.appendChild(wrap);

      label(box,plural(g.subs.length,'subreddit'),'+ Add',()=>pushPanel('search',{into:g.id}));
      if(!g.subs.length){
        emptyNote(box,'No subreddits yet','Tap "+ Add" to search Reddit and build this feed.');
      }
      g.subs.forEach((name,i)=>{
        const row=el('div','row');
        row.appendChild(el('span','rico','r/'));
        const mid=el('span','rmid');
        mid.appendChild(el('span','rname','r/'+name));
        row.appendChild(mid);
        const ord=el('span','rord');
        const up=el('button',null,'▲'), dn=el('button',null,'▼');
        up.disabled=i===0; dn.disabled=i===g.subs.length-1;
        up.setAttribute('aria-label','Move up'); dn.setAttribute('aria-label','Move down');
        up.onclick=e=>{ e.stopPropagation(); g.subs.splice(i-1,0,g.subs.splice(i,1)[0]); commit(g,false); };
        dn.onclick=e=>{ e.stopPropagation(); g.subs.splice(i+1,0,g.subs.splice(i,1)[0]); commit(g,false); };
        ord.append(up,dn); row.appendChild(ord);
        const x=el('button','redit','✕');
        x.setAttribute('aria-label','Remove r/'+name);
        x.onclick=e=>{ e.stopPropagation(); g.subs.splice(i,1); commit(g); };
        row.appendChild(x);
        box.appendChild(row);
      });

      label(box,'Sort for this group');
      const sr=el('div','chips');
      SORTS.forEach(([v,l])=>{
        const c=el('button','schip'+(g.sort===v?' on':''),l);
        c.onclick=e=>{ e.stopPropagation(); g.sort=v; commit(g); };
        sr.appendChild(c);
      });
      box.appendChild(sr);
      if(g.sort==='top'||g.sort==='controversial'){
        const tr=el('div','chips');
        TIMES.forEach(([v,l])=>{
          const c=el('button','schip t'+(g.time===v?' on':''),l);
          c.onclick=e=>{ e.stopPropagation(); g.time=v; commit(g); };
          tr.appendChild(c);
        });
        box.appendChild(tr);
      }
      if(fav){
        const n=el('div','note');
        n.textContent='Favourites is your default feed — it loads on launch and can\'t be deleted. '+
                      'Tap ☆ on any post to add that subreddit here.';
        box.appendChild(n);
      }
    },
    foot: fav ? null : [
      {label:'Duplicate',run(){
        const copy=mkGroup({name:g.name+' copy',icon:g.icon,subs:g.subs.slice(),sort:g.sort,time:g.time});
        S.groups.push(copy); save();
        stack[stack.length-1].args={id:copy.id}; refresh(); toast('Duplicated');
      }},
      {label:'Delete',danger:true,run(){
        if(!confirm('Delete "'+g.name+'"?')) return;
        const wasActive=S.activeId===g.id;
        S.groups=S.groups.filter(x=>x.id!==g.id);
        normalise(); save();
        if(wasActive){ S.activeId=FAV; paintHeader(); load(true); }
        popPanel(); toast('Deleted');
      }}
    ]
  };
};

// ── Icon picker ──────────────────────────────────────────────────────────

PANELS.icon=({id})=>({
  title:'Pick an icon',
  body(box){
    const grid=el('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:8px;padding:8px';
    const g=S.groups.find(x=>x.id===id);
    ICONS.forEach(ic=>{
      const b=el('button','ic',ic);
      b.style.cssText='width:100%;height:58px;font-size:22px;border-radius:14px';
      if(g&&g.icon===ic) b.style.cssText+=';border-color:var(--acc);color:var(--acc)';
      b.onclick=e=>{ e.stopPropagation(); if(g){ g.icon=ic; save(); paintHeader(); } popPanel(); };
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }
});

// ── Subreddit search ─────────────────────────────────────────────────────

PANELS.search=({into})=>{
  const target=into?S.groups.find(g=>g.id===into):null;
  return {
    title:target?('Add to '+target.name):'Search',
    body(box){
      const wrap=el('div','acfld');
      const inp=el('input','inp');
      inp.type='search'; inp.placeholder='Search subreddits\u2026';
      inp.spellcheck=false; inp.autocapitalize='off'; inp.autocorrect='off';
      inp.enterKeyHint='search';
      wrap.appendChild(inp); box.appendChild(wrap);

      const acBox=el('div','ac'); box.appendChild(acBox);
      const hint=el('div','note');
      hint.textContent=target
        ? 'Pick a result to add it. You can add several in a row.'
        : 'Pick a result to start watching it straight away.';
      box.appendChild(hint);

      if(target){
        label(box,'In this group');
        const chips=el('div','chips');
        const paintChips=()=>{
          chips.innerHTML='';
          if(!target.subs.length){ chips.appendChild(el('span','chip ghost','nothing yet')); return; }
          target.subs.forEach((n,i)=>{
            const c=el('span','chip');
            c.appendChild(el('span',null,'r/'+n));
            const x=el('button',null,'✕');
            x.onclick=e=>{ e.stopPropagation(); target.subs.splice(i,1);
              save(); paintChips(); paintHeader(); repaintStars();
              if(S.activeId===target.id) load(true); };
            c.appendChild(x);
            chips.appendChild(c);
          });
        };
        paintChips(); box.appendChild(chips);
        box._paintChips=paintChips;
      }

      let t=null, items=[], sel=-1;
      const choose=s=>{
        const name=s.display_name;
        if(target){
          if(target.subs.some(x=>x.toLowerCase()===name.toLowerCase())) return toast('Already in '+target.name);
          if(target.subs.length>=CFG.MAX_SUBS) return toast('Group is full ('+CFG.MAX_SUBS+')');
          target.subs.push(name); save(); paintHeader(); repaintStars();
          if(box._paintChips) box._paintChips();
          if(S.activeId===target.id) load(true);
          toast('Added r/'+name);
          inp.value=''; acBox.innerHTML=''; inp.focus();
        }else{
          openSingle(name); closeSheet();
        }
      };
      const paint=subs=>{
        acBox.innerHTML=''; items=subs; sel=-1;
        if(sheetBody) sheetBody.scrollTop=0;
        subs.forEach((s,n)=>{
          const r=el('button','acr'); r.type='button';
          const nm=el('span','an','r/'+s.display_name);
          r.appendChild(nm);
          if(s.over18||s.over_18) r.appendChild(el('span','a18','18+'));
          r.appendChild(el('span','am',fmt(s.subscribers||0)));
          r.onclick=e=>{ e.stopPropagation(); choose(s); };
          acBox.appendChild(r);
        });
      };
      const run=async q=>{
        if(!q||q.length<2){ acBox.innerHTML=''; return; }
        try{
          const d=await api('/api/subreddit_autocomplete_v2?limit=10&raw_json=1&include_over_18=1&query='+encodeURIComponent(q));
          const subs=((d.data&&d.data.children)||[]).map(c=>c.data).filter(s=>s.display_name);
          paint(subs);
        }catch(e){ acBox.innerHTML=''; }
      };
      inp.addEventListener('input',()=>{ clearTimeout(t); const v=inp.value.trim(); t=setTimeout(()=>run(v),CFG.AC_DEBOUNCE); });
      inp.addEventListener('keydown',e=>{
        const rows=[...acBox.children];
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){
          if(!rows.length) return;
          e.preventDefault();
          sel=(sel+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
          rows.forEach((r,i)=>r.classList.toggle('sel',i===sel));
        }else if(e.key==='Enter'){
          e.preventDefault();
          if(sel>=0&&items[sel]) return choose(items[sel]);
          const raw=inp.value.trim().replace(/^\/?(r\/)?/i,'').replace(/\/$/,'');
          const list=raw.split(/[+,\s]+/).map(x=>x.trim()).filter(Boolean);
          if(!list.length) return;
          if(target){ list.forEach(n=>choose({display_name:n})); }
          else{ openMulti(list); closeSheet(); }
        }
      });
      setTimeout(()=>{
        inp.focus();
        keepFieldVisible(inp);
      },330);
    }
  };
};

// ── Settings ─────────────────────────────────────────────────────────────

function toggleRow(box,name,sub,get,set){
  const b=el('button','tg'); b.type='button';
  b.setAttribute('role','switch');
  b.setAttribute('aria-checked',String(get()));
  const mid=el('span','tmid');
  mid.appendChild(el('span','tname',name));
  if(sub) mid.appendChild(el('span','tsub',sub));
  b.appendChild(mid);
  b.appendChild(el('i'));
  b.onclick=e=>{ e.stopPropagation(); set(!get()); b.setAttribute('aria-checked',String(get())); };
  box.appendChild(b);
  return b;
}

PANELS.settings=()=>({
  title:'Settings',
  body(box){
    label(box,'Feed');
    toggleRow(box,'Media only','Hide text and link posts with nothing to show.',
      ()=>S.mediaOnly,v=>{ S.mediaOnly=v; save(); load(true); });
    toggleRow(box,'Blur 18+','Blur NSFW media until you tap to reveal it.',
      ()=>S.blur,v=>{ S.blur=v; save(); load(true); });
    toggleRow(box,'Start muted','Whether video sound is off when a post starts.',
      ()=>S.muted,v=>{ S.muted=v; save(); applyMute(); });

    label(box,'API');
    const cw=el('div','fld');
    cw.appendChild(el('span',null,'Reddit client ID'));
    const cr=el('div');
    cr.style.cssText='display:flex;gap:8px';
    const ci=el('input','inp');
    ci.type='text'; ci.spellcheck=false; ci.autocomplete='off'; ci.autocapitalize='off';
    ci.placeholder='Paste your client ID\u2026';
    ci.value=getClientId();
    ci.oninput=()=>{ setClientId(ci.value.trim()); };
    ci.addEventListener('focus',()=>keepFieldVisible(ci));
    cr.appendChild(ci);
    cw.appendChild(cr);
    box.appendChild(cw);
    const cn=el('div','note');
    cn.textContent='Go to reddit.com/prefs/apps \u2192 create another app \u2192 choose "installed app". Copy the string under "personal use script" (it\u2019s public and only used to fetch Reddit data).';
    box.appendChild(cn);

    label(box,'Data');
    const hs=el('button','row'); hs.type='button';
    hs.appendChild(el('span','rico','⌨'));
    const m2=el('span','rmid');
    m2.appendChild(el('span','rname','Controls & shortcuts'));
    hs.appendChild(m2); hs.appendChild(el('span','redit','\u203A'));
    hs.onclick=e=>{ e.stopPropagation(); pushPanel('help',{}); };
    box.appendChild(hs);
  }
});

// ── Help ─────────────────────────────────────────────────────────────────

PANELS.help=()=>({
  title:'Controls & shortcuts',
  body(box){
    const add=(k,v)=>{
      const r=el('div','row');
      const a=el('span','rmid');
      a.appendChild(el('span','rname',k));
      a.appendChild(el('span','rsub',v));
      r.appendChild(a); box.appendChild(r);
    };
    label(box,'Touch');
    add('Swipe up / down','Next or previous post');
    add('Tap \u2014 controls hidden','Show the controls. Never pauses a playing video.');
    add('Tap \u2014 a video you paused','Resume playback right away');
    add('Tap \u2014 controls showing','Play / pause, and put the controls away');
    add('Wait a moment','The controls hide themselves again');
    add('Tap \u25BE (by the title)','Slide the info tray away \u2014 media only');
    add('Tap \u25B4 (bottom right)','Bring the info tray back');
    add('Tap with the tray shut','Play / pause');
    add('Swipe sideways','Move through a gallery');
    add('Tap r/name','Jump to that subreddit alone');
    add('Tap \u2606','Add the subreddit to Favourites');
    label(box,'Keyboard');
    add('j / k  \u00B7  \u2193 / \u2191','Next / previous post');
    add('\u2190 / \u2192','Previous / next image in a gallery');
    add('f','Favourite this post\u2019s subreddit');
    add('g','Open the feed switcher');
    add('/','Search subreddits');
    add('i / c','Open or shut the info tray');
    add('h','Toggle the controls');
    add('m / p','Mute \u00B7 play/pause');
    add('r','Reload the feed');
    add('Esc','Close the sheet, hide the controls, or reopen the tray');
    const n=el('div','note');
    n.textContent='Data comes from Reddit\u2019s OAuth API using an anonymous app token '+
      'fetched in your browser. Nothing is sent anywhere else.';
    box.appendChild(n);
  }
});