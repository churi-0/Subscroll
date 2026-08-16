import {json,serverError} from '../lib/http.js';
import {
  configured,configError,accountIdForPassword,makeSession,
  clearSessionCookie,sessionAccount
} from '../lib/auth.js';

export async function onRequestGet({request,env}){
  if(!configured(env)) return configError();
  try{
    const accountId=await sessionAccount(request,env);
    return json({authenticated:!!accountId});
  }catch(e){ return serverError(e); }
}

export async function onRequestPost({request,env}){
  if(!configured(env)) return configError();
  try{
    let body;
    try{ body=await request.json(); }
    catch(_){ return json({error:'Send a JSON password.'},400); }

    const password=body&&body.password;
    if(typeof password!=='string'||password.length<4)
      return json({error:'Use a password of at least 4 characters.'},400);
    if(password.length>256)
      return json({error:'Password is too long.'},400);

    const accountId=await accountIdForPassword(password,env);
    const now=Date.now();
    const result=await env.SUBSCROLL_DB.prepare(
      `INSERT INTO accounts (account_id,state_json,created_at,updated_at)
       VALUES (?,NULL,?,?) ON CONFLICT(account_id) DO NOTHING`
    ).bind(accountId,now,now).run();

    const session=await makeSession(accountId,env);
    return json(
      {authenticated:true,created:!!(result.meta&&result.meta.changes),expires:session.expires},
      200,
      {'Set-Cookie':session.cookie}
    );
  }catch(e){ return serverError(e); }
}

export async function onRequestDelete(){
  return json({authenticated:false},200,{'Set-Cookie':clearSessionCookie()});
}
