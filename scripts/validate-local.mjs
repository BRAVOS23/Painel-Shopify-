// Requer emuladores demo-painel já iniciados; não inicia serviços de produção.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',()=>reject(new Error('A porta 8787 já está ocupada. Para primeiro a tua sessão local.')));probe.listen(8787,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(command+' terminou com '+code)));});
for(const script of ['test:integration','test:commercial','test:recovery','test:browser'])await run('npm',['run',script]);
const worker=spawn(process.execPath,['scripts/wrangler.mjs','dev','--env','local','--port','8787','--test-scheduled'],{stdio:'inherit',detached:true});
try{let ready=false;for(let index=0;index<60;index++){if(worker.exitCode!==null)throw new Error('O Worker terminou antes de iniciar.');try{const response=await fetch('http://127.0.0.1:8787/api/health',{signal:AbortSignal.timeout(1000)});if(response.ok && (await response.json()).mode==='emulator'){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}if(!ready)throw new Error('Worker local não ficou disponível.');await run('npm',['run','test:worker']);await run('npm',['run','test:worker:crypto']);}finally{try{process.kill(-worker.pid,'SIGTERM');}catch{}}
