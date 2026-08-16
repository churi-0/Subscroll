const BASE_HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};

export function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...BASE_HEADERS,...headers}
  });
}

export function methodNotAllowed(allowed){
  return json({error:'Method not allowed.'},405,{Allow:allowed.join(', ')});
}

export function serverError(error){
  console.error(error);
  return json({error:'The account service is temporarily unavailable.'},500);
}
