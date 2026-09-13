let csrfToken='';
export function setCsrf(v){csrfToken=v||'';}
export async function api(path,options={}){
 const res=await fetch('/api'+path,{credentials:'include',...options,headers:{'Content-Type':'application/json','x-csrf-token':csrfToken,...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const data=await res.json().catch(()=>({error:'Server is unavailable. Please retry.'}));
 if(!res.ok){if(res.status===401&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('session-expired'));throw new Error(data.error||'Request failed');}return data;
}
export const post=(path,body={})=>api(path,{method:'POST',body});
export const put=(path,body)=>api(path,{method:'PUT',body});
