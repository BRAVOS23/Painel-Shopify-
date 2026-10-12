import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['scripts/wrangler.mjs','dev','--config','tests/fixtures/crypto-worker.jsonc','--port','8792'],{stdio:['pipe','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-8000);});
try{
 let response;for(let i=0;i<60;i++){
  if(child.exitCode!==null)throw new Error('Runtime encerrou antes do teste. '+output);
  try{response=await fetch('http://127.0.0.1:8792/',{signal:AbortSignal.timeout(1000)});break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}
 }
 assert(response,'Runtime não ficou disponível.');assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{roundTrip:true,tamperRejected:true,secretHidden:true});
 console.log('PASS: AES-GCM cifra e decifra texto UTF-8 no Workerd, rejeita alterações e oculta o token.');
}finally{child.kill('SIGTERM');}
