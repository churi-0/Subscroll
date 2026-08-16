"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   ACCOUNT — password-only Cloudflare session + cloud state sync
   ──────────────────────────────────────────────────────────────────────────
   The password is the account identifier. The server turns it into an opaque
   HMAC account id and returns an HttpOnly session cookie. App data is stored
   in D1; nothing is persisted in localStorage after the one-time migration.
   ══════════════════════════════════════════════════════════════════════════ */

const Account=(()=>{
  const gate=$('#accountGate'), form=$('#loginForm'), input=$('#accountPassword'),
        submit=$('#loginSubmit'), copy=$('#accountCopy'), status=$('#accountStatus'),
        retry=$('#accountRetry');

  let authenticated=false, onReady=null, saveTimer=null, pending=null,
      saving=false, saveRetry=null, inFlight=null;

  async function request(url,options={}){
    const opts=Object.assign({credentials:'same-origin',cache:'no-store'},options);
    const r=await fetch(url,opts);
    let body=null;
    try{ body=await r.json(); }catch(_){}
    if(!r.ok){
      const e=new Error(body&&body.error ? body.error : 'Cloud request failed (HTTP '+r.status+').');
      e.status=r.status;
      throw e;
    }
    return body;
  }

  function showOpening(text='Opening your space…'){
    gate.hidden=false;
    document.body.classList.add('account-locked');
    copy.textContent=text;
    form.hidden=true; retry.hidden=true; status.textContent='';
  }

  function showLogin(message=''){
    gate.hidden=false;
    document.body.classList.add('account-locked');
    copy.textContent='Your password is your account. Use the same password on another device to open the same space.';
    form.hidden=false; retry.hidden=true;
    submit.disabled=false; submit.textContent='Continue';
    status.textContent=message;
    status.classList.toggle('err',!!message);
    setTimeout(()=>input.focus(),50);
  }

  function showRetry(message){
    gate.hidden=false;
    document.body.classList.add('account-locked');
    copy.textContent='SubScroll could not open your saved data.';
    form.hidden=true; retry.hidden=false;
    status.textContent=message||'Check the Cloudflare setup and try again.';
    status.classList.add('err');
  }

  function unlock(){
    gate.hidden=true;
    document.body.classList.remove('account-locked');
  }

  async function open(){
    showOpening('Loading your saved feeds…');
    try{
      await onReady();
      unlock();
    }catch(e){
      console.error(e);
      if(e.status===401){
        authenticated=false;
        showLogin(e.message);
      }else showRetry(e.message);
    }
  }

  async function init(ready){
    onReady=ready;
    showOpening();
    try{
      const s=await request('/api/session');
      authenticated=!!(s&&s.authenticated);
      if(authenticated) return open();
      showLogin();
    }catch(e){
      showRetry(e.message);
    }
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const password=input.value;
    if(password.length<8){
      status.textContent='Use at least 8 characters.';
      status.classList.add('err');
      return;
    }
    submit.disabled=true; submit.textContent='Opening…';
    status.textContent='';
    try{
      await request('/api/session',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({password})
      });
      input.value='';
      authenticated=true;
      await open();
    }catch(err){
      submit.disabled=false; submit.textContent='Continue';
      status.textContent=err.message;
      status.classList.add('err');
    }
  });

  retry.addEventListener('click',()=>{
    if(authenticated) open(); else init(onReady);
  });

  async function loadState(){
    const data=await request('/api/state');
    return data ? data.state : null;
  }

  async function putState(state,keepalive=false){
    return request('/api/state',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(state),
      keepalive
    });
  }

  function reportSaveError(err){
    console.error('Cloud save failed:',err);
    document.dispatchEvent(new CustomEvent('cloudsaveerror',{detail:err}));
  }

  async function flush(keepalive=false){
    clearTimeout(saveTimer); saveTimer=null;
    if(saving){
      await inFlight;
      if(pending&&!saveRetry) return flush(keepalive);
      return;
    }
    if(!pending||!authenticated) return;
    const state=pending;
    pending=null;
    saving=true;
    inFlight=(async()=>{
      try{
        await putState(state,keepalive);
        clearTimeout(saveRetry); saveRetry=null;
      }catch(e){
        // Keep only the newest snapshot and retry. A later user action may
        // already have replaced pending with something newer than `state`.
        if(!pending) pending=state;
        reportSaveError(e);
        clearTimeout(saveRetry);
        saveRetry=setTimeout(()=>flush(false),3000);
      }finally{
        saving=false;
      }
    })();
    await inFlight;
    inFlight=null;
    if(pending&&!saveRetry) return flush(keepalive);
  }

  function save(state){
    if(!authenticated) return;
    pending=state;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>flush(false),450);
  }

  async function saveNow(state){
    if(!authenticated) throw new Error('Not signed in.');
    clearTimeout(saveTimer); saveTimer=null;
    pending=null;
    await putState(state,false);
  }

  async function logout(){
    clearTimeout(saveTimer); saveTimer=null;
    clearTimeout(saveRetry); saveRetry=null;
    if(saving) await flush(false);
    if(pending){
      const last=pending;
      pending=null;
      await putState(last,false);
    }
    await request('/api/session',{method:'DELETE'});
    authenticated=false;
    location.reload();
  }

  // Existing users get a one-time, best-effort migration. The old keys are
  // removed only after cloud data has loaded or the migrated snapshot saved.
  function readLegacy(){
    try{
      let raw=JSON.parse(localStorage.getItem(LS)||'null');
      if(!raw) raw=JSON.parse(localStorage.getItem(LS_OLD)||'null');
      const cid=localStorage.getItem(CID_KEY)||'';
      if(!raw&&!cid) return null;
      raw=raw&&typeof raw==='object' ? raw : {};
      if(cid) raw.clientId=cid;
      return raw;
    }catch(_){ return null; }
  }

  function clearLegacy(){
    try{ [LS,LS_OLD,CID_KEY,TKEY].forEach(k=>localStorage.removeItem(k)); }catch(_){}
  }

  addEventListener('visibilitychange',()=>{
    if(document.hidden&&pending) flush(true);
  });

  return {init,loadState,save,saveNow,logout,readLegacy,clearLegacy,
          flush,isAuthenticated:()=>authenticated};
})();
