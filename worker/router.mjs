import {Buffer} from 'node:buffer';
// Adaptador mínimo de Request/Response para reutilizar as rotas, sem servidor HTTP ou Express.
export function framework(){
 const layers=[];
 const app={disable(){},use(...args){const path=typeof args[0]==='string'?args.shift():'';for(const fn of args)layers.push({path,fn});}};
 for(const method of ['get','post','delete'])app[method]=(path,...handlers)=>{for(const fn of handlers)layers.push({path,method:method.toUpperCase(),fn});};
 app.fetch=async request=>{
  const url=new URL(request.url);let response;
  const headers=new Headers();
  const req={request,originalUrl:url.pathname+url.search,path:url.pathname,method:request.method,query:Object.fromEntries(url.searchParams),params:{},get:name=>request.headers.get(name)};
  let status=200;
  const res={set(name,value){headers.set(name,value);return res;},status(code){status=code;return res;},
   json(value){headers.set('Content-Type','application/json; charset=utf-8');response=new Response(JSON.stringify(value),{status,headers});return res;},
   send(value){response=new Response(String(value),{status,headers});return res;},
   sendStatus(code){status=code;response=new Response(String(code),{status,headers});return res;},
   redirect(path){status=302;headers.set('Location',new URL(path,url.origin).href);response=new Response(null,{status,headers});return res;},
   end(){response=new Response(null,{status,headers});return res;}};
  async function dispatch(start,error){
   for(let index=start;index<layers.length && !response;index++){
    const layer=layers[index];if(Boolean(error)!==(layer.fn.length===4))continue;
    if(layer.method && layer.method!==request.method)continue;
    if(layer.method){
     const keys=[];const pattern=layer.path.split('/').map(segment=>segment.startsWith(':')?(keys.push(segment.slice(1)),'([^/]+)'):segment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');
     const match=url.pathname.match(new RegExp('^'+pattern+'$'));if(!match)continue;
     try{req.params=Object.fromEntries(keys.map((key,i)=>[key,decodeURIComponent(match[i+1])]));}catch{res.status(400).json({error:'URL inválida.'});return;}
    }else if(layer.path && !(url.pathname===layer.path || url.pathname.startsWith(layer.path+'/')))continue;
    let nextTask,called=false;
    const next=nextError=>{called=true;nextTask=dispatch(index+1,nextError);};
    try{await (error?layer.fn(error,req,res,next):layer.fn(req,res,next));if(called)await nextTask;}
    catch(failure){await dispatch(index+1,failure);}
    return;
   }
   if(error && !response)res.status(error.status || 500).json({error:'Não foi possível concluir a operação.'});
  }
  await dispatch(0);
  return response || new Response('Not found',{status:404,headers});
 };
 return app;
}
async function body(request,maxBytes){
 if(Number(request.headers.get('Content-Length'))>maxBytes)throw Object.assign(new Error('Pedido demasiado grande.'),{status:413});
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0;const pieces=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Object.assign(new Error('Pedido demasiado grande.'),{status:413});}pieces.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}return bytes;
}
const bytesLimit=value=>Number.parseFloat(value)*(value.endsWith('mb')?1024*1024:1);
framework.raw=({limit})=>async(req,_res,next)=>{req.body=Buffer.from(await body(req.request,bytesLimit(limit)));next();};
framework.json=({limit})=>async(req,_res,next)=>{
 if(['GET','HEAD'].includes(req.method)){req.body={};next();return;}
 const bytes=await body(req.request,bytesLimit(limit));
 try{req.body=bytes.length?JSON.parse(new TextDecoder().decode(bytes)):{};}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
 next();
};
