import {json} from './http.js';

const COOKIE='subscroll_session';
const SESSION_SECONDS=60*60*24*30;
const enc=new TextEncoder();

function toHex(bytes){
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function hmac(secret,message){
  const key=await crypto.subtle.importKey(
    'raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC',key,enc.encode(message)));
}

function same(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function cookies(request){
  const out={};
  for(const part of (request.headers.get('Cookie')||'').split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;
    out[part.slice(0,i).trim()]=part.slice(i+1).trim();
  }
  return out;
}

export function configured(env){
  return !!(env&&env.SUBSCROLL_DB&&typeof env.AUTH_SECRET==='string'&&env.AUTH_SECRET.length>=32);
}

export function configError(){
  return json({error:'Cloudflare is not configured. Add the SUBSCROLL_DB binding and an AUTH_SECRET of at least 32 characters.'},500);
}

export async function accountIdForPassword(password,env){
  return hmac(env.AUTH_SECRET,'subscroll-account\0'+password);
}

export async function makeSession(accountId,env){
  const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS;
  const payload=`v1.${accountId}.${expires}`;
  const signature=await hmac(env.AUTH_SECRET,'subscroll-session\0'+payload);
  const value=`${payload}.${signature}`;
  const cookie=`${COOKIE}=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
  return {cookie,expires};
}

export function clearSessionCookie(){
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function sessionAccount(request,env){
  if(!configured(env)) return null;
  const raw=cookies(request)[COOKIE];
  if(!raw) return null;
  const parts=raw.split('.');
  if(parts.length!==4||parts[0]!=='v1') return null;
  const [,accountId,expiresRaw,signature]=parts;
  if(!/^[a-f0-9]{64}$/.test(accountId)||!/^\d{10,12}$/.test(expiresRaw)) return null;
  const expires=Number(expiresRaw);
  if(!Number.isSafeInteger(expires)||expires<=Math.floor(Date.now()/1000)) return null;
  const expected=await hmac(env.AUTH_SECRET,'subscroll-session\0'+`v1.${accountId}.${expiresRaw}`);
  return same(signature,expected) ? accountId : null;
}

export async function requireAccount(request,env){
  const accountId=await sessionAccount(request,env);
  return accountId||null;
}
