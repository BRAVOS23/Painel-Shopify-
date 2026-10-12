import {mkdir,mkdtemp,writeFile,rename,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Exportação pelos endpoints locais oficiais, no formato importável pela CLI Firebase.
// Mantém o snapshot anterior; não usa o proxy de Internet para os endpoints loopback.
export async function exportEmulators(){
 const project='demo-painel';await mkdir('.local',{recursive:true});
 const directory=await mkdtemp(resolve('.local/emulator-export-'));await mkdir(directory+'/auth_export');
 const response=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}:export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({database:`projects/${project}/databases/(default)`,export_directory:directory,export_name:'firestore_export'}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Não foi possível exportar o Firestore local.');
 for(const [name,path] of [['accounts.json',`/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=-1`],['config.json',`/emulator/v1/projects/${project}/config`]]){
  const response=await fetch('http://127.0.0.1:9099'+path,{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Não foi possível exportar a autenticação local.');
  await writeFile(`${directory}/auth_export/${name}`,await response.text(),{mode:0o600});
 }
 await writeFile(directory+'/firebase-export-metadata.json',JSON.stringify({version:'15.33.0',firestore:{version:'1.22.0',path:'firestore_export',metadata_file:'firestore_export/firestore_export.overall_export_metadata'},auth:{version:'15.33.0',path:'auth_export'}}));
 try{await access('.emulator-data');await rename('.emulator-data',resolve(`.local/emulator-previous-${Date.now()}`));}catch(error){if(error.code!=='ENOENT')throw error;}
 await rename(directory,'.emulator-data');console.log('Dados dos emuladores guardados em .emulator-data/.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await exportEmulators();
