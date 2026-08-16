"use strict";

/* ══════════════════════════════════════════════════════════════════════════
   AUTH — anonymous OAuth token management + Reddit API fetch
   ──────────────────────────────────────────────────────────────────────────
   Uses Reddit's "installed_client" grant (no account, no secret). Both
   endpoints send Access-Control-Allow-Origin: *, which is what makes a
   static-site app possible at all.
   ══════════════════════════════════════════════════════════════════════════ */

// Reddit access tokens are short-lived and stay in memory only. The durable
// client ID and app settings are part of the authenticated D1 state instead.
let tokenPromise=null, tokenCache=null;

function cachedToken(){
  return tokenCache&&tokenCache.token&&tokenCache.exp>Date.now()+CFG.TOKEN_SKEW_MS
    ? tokenCache.token : null;
}

function resetRedditToken(){
  tokenCache=null;
  tokenPromise=null;
}

async function fetchToken(){
  const cid=getClientId();
  if(!cid) throw new Error('No Reddit client ID configured. Open Settings \u203a API to set one up.');
  const body=new URLSearchParams({
    grant_type:'https://oauth.reddit.com/grants/installed_client',
    device_id :'DO_NOT_TRACK_THIS_DEVICE'
  });
  let r;
  for(let attempt=0;;attempt++){
    try{
      r=await fetch(AUTH_URL,{method:'POST',
        headers:{'Authorization':'Basic '+btoa(cid+':')},body});
      break;
    }catch(e){
      if(attempt>=CFG.RETRIES) throw new Error(NET_ERR);
      await backoff(attempt);
    }
  }
  if(!r.ok) throw new Error('auth failed (HTTP '+r.status+')');
  const j=await r.json();
  if(!j.access_token) throw new Error('auth failed (no token)');
  tokenCache={token:j.access_token,exp:Date.now()+(j.expires_in||86400)*1000};
  return j.access_token;
}

function getToken(force){
  if(force) resetRedditToken();
  const c=!force&&cachedToken();
  if(c) return Promise.resolve(c);
  if(!tokenPromise) tokenPromise=fetchToken().finally(()=>{ tokenPromise=null; });
  return tokenPromise;
}

/**
 * GET a Reddit API path and return parsed JSON.
 * Retries on network errors, 401s (expired token), 429s/503s (rate-limited),
 * and the opaque "blocked by network security" 403 that carries no CORS header.
 */
async function api(path,attempt=0){
  const token=await getToken(false);
  let r;
  try{
    r=await fetch(API+path,{headers:{'Authorization':'Bearer '+token},cache:'no-store'});
  }catch(e){
    if(attempt<CFG.RETRIES){ await backoff(attempt); return api(path,attempt+1); }
    throw new Error(NET_ERR);
  }
  if(r.status===401&&attempt<CFG.RETRIES){ await getToken(true); return api(path,attempt+1); }
  if(r.status===429||r.status===503){
    if(attempt<CFG.RETRIES){ await backoff(attempt+1); return api(path,attempt+1); }
    throw new Error('Rate limited by Reddit — wait a moment and retry.');
  }
  if(r.status===403) throw new Error('Forbidden (private, quarantined, or banned subreddit).');
  if(r.status===404) throw new Error('That subreddit does not exist.');
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}