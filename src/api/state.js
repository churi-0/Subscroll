import {json,serverError} from '../lib/http.js';
import {configured,configError,requireAccount,clearSessionCookie} from '../lib/auth.js';

const MAX_BYTES=128*1024;
const SORTS=new Set(['hot','new','top','rising','controversial']);
const TIMES=new Set(['hour','day','week','month','year','all']);

function text(value,max,fallback=''){
  return typeof value==='string' ? value.slice(0,max) : fallback;
}

function cleanState(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) return null;
  const seen=new Set();
  const groups=(Array.isArray(input.groups)?input.groups:[]).slice(0,100).map((g,i)=>{
    g=g&&typeof g==='object' ? g : {};
    let id=text(g.id,128,'g'+i);
    if(!id||seen.has(id)) id='g'+i+'-'+crypto.randomUUID().slice(0,8);
    seen.add(id);
    return {
      id,
      name:text(g.name,100,'Untitled')||'Untitled',
      icon:text(g.icon,16,'◆')||'◆',
      subs:(Array.isArray(g.subs)?g.subs:[]).slice(0,20)
        .filter(s=>typeof s==='string').map(s=>s.slice(0,64)),
      sort:SORTS.has(g.sort)?g.sort:'hot',
      time:TIMES.has(g.time)?g.time:'all'
    };
  });

  return {
    v:7,
    clientId:text(input.clientId,256),
    mediaOnly:typeof input.mediaOnly==='boolean'?input.mediaOnly:true,
    blur:typeof input.blur==='boolean'?input.blur:true,
    info:typeof input.info==='boolean'?input.info:true,
    muted:typeof input.muted==='boolean'?input.muted:true,
    groups,
    activeId:text(input.activeId,128,'__fav')||'__fav'
  };
}

async function getAccount(request,env){
  if(!configured(env)) return {response:configError()};
  const accountId=await requireAccount(request,env);
  if(!accountId){
    return {response:json({error:'Your session has expired. Sign in again.'},401,
      {'Set-Cookie':clearSessionCookie()})};
  }
  return {accountId};
}

export async function onRequestGet({request,env}){
  try{
    const auth=await getAccount(request,env);
    if(auth.response) return auth.response;
    const row=await env.SUBSCROLL_DB.prepare(
      'SELECT state_json,updated_at FROM accounts WHERE account_id=?'
    ).bind(auth.accountId).first();
    if(!row) return json({error:'Account not found. Sign in again.'},401);
    let state=null;
    if(row.state_json){
      try{ state=JSON.parse(row.state_json); }
      catch(_){ return json({error:'Saved account data is unreadable.'},500); }
    }
    return json({state,updatedAt:row.updated_at||null});
  }catch(e){ return serverError(e); }
}

export async function onRequestPut({request,env}){
  try{
    const auth=await getAccount(request,env);
    if(auth.response) return auth.response;

    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)
      return json({error:'Saved data is too large.'},413);

    let parsed;
    try{ parsed=JSON.parse(raw); }
    catch(_){ return json({error:'Saved data must be valid JSON.'},400); }
    const state=cleanState(parsed);
    if(!state) return json({error:'Saved data has the wrong shape.'},400);

    const now=Date.now();
    await env.SUBSCROLL_DB.prepare(
      `INSERT INTO accounts (account_id,state_json,created_at,updated_at)
       VALUES (?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         state_json=excluded.state_json, updated_at=excluded.updated_at`
    ).bind(auth.accountId,JSON.stringify(state),now,now).run();
    return json({saved:true,updatedAt:now});
  }catch(e){ return serverError(e); }
}
