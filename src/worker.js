import {
  onRequestGet as getSession,
  onRequestPost as postSession,
  onRequestDelete as deleteSession
} from './api/session.js';
import {
  onRequestGet as getState,
  onRequestPut as putState
} from './api/state.js';
import {json,methodNotAllowed,serverError} from './lib/http.js';

const ROUTES={
  '/api/session':{
    GET:getSession,
    POST:postSession,
    DELETE:deleteSession
  },
  '/api/state':{
    GET:getState,
    PUT:putState
  }
};

export default {
  async fetch(request,env,ctx){
    try{
      const url=new URL(request.url);
      const path=url.pathname.length>1
        ? url.pathname.replace(/\/+$/,'')
        : url.pathname;
      const methods=ROUTES[path];

      if(methods){
        const handler=methods[request.method];
        if(!handler) return methodNotAllowed(Object.keys(methods));
        return handler({request,env,ctx});
      }

      if(path==='/api'||path.startsWith('/api/')){
        return json({error:'API route not found.'},404);
      }

      return env.ASSETS.fetch(request);
    }catch(error){
      return serverError(error);
    }
  }
};
