import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),get=key=>args.includes(key)?args[args.indexOf(key)+1]:null;
const root=new URL(get('--url') || 'http://127.0.0.1:8787');if(root.protocol!=='https:' && !['localhost','127.0.0.1'].includes(root.hostname))throw new Error('Usa HTTPS para um servidor remoto.');if(!['localhost','127.0.0.1'].includes(root.hostname) && !args.includes('--production'))throw new Error('Confirma --production para ler uma conta publicada.');
const token=process.env.PAINEL_ID_TOKEN;if(!token)throw new Error('Configura PAINEL_ID_TOKEN de forma segura; não o passes nos argumentos.');
async function api(path){const response=await fetch(new URL('/api'+path,root),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error || 'Exportação recusada.'),{status:response.status});return body;}
let backup;
for(let attempt=0;attempt<3;attempt++){
 try{const manifest=await api('/state?manifest=1'),records={};for(const name of manifest.collections){records[name]=[];let after=null;do{const page=await api('/state/'+name+'?'+new URLSearchParams({version:String(manifest.version),...(after?{after}:{})}));records[name].push(...page.records.map(({_revision,...record})=>record));after=page.after;}while(after);}
  const end=await api('/state?manifest=1');if(end.ownerId!==manifest.ownerId || end.version!==manifest.version)continue;backup={...await api('/account/export'),records};break;
 }catch(error){if(error.status!==409 || attempt===2)throw error;}
}
if(!backup)throw new Error('Os dados mudaram durante a exportação. Tenta novamente.');
const file=resolve(get('--out') || 'backups/account-'+backup.profile.uid+'-'+Date.now()+'.painel-backup.json'),content=JSON.stringify(backup,null,2);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,content,{flag:'wx',mode:0o600});console.log('Backup privado guardado: '+file);console.log('SHA-256: '+createHash('sha256').update(content).digest('hex'));console.log('Sem tokens de integração. Confirma a recuperação num ambiente de teste.');
