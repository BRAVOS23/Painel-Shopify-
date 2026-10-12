import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {exportEmulators} from './export-emulators.mjs';
await mkdir('.local',{recursive:true});
const environment={...process.env,USE_FIREBASE_EMULATORS:'true',FIREBASE_PROJECT_ID:'demo-painel',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',CI:'true',FIREBASE_EMULATORS_PATH:`${process.cwd()}/.local/emulators`,XDG_CONFIG_HOME:`${process.cwd()}/.local/config`,XDG_CACHE_HOME:`${process.cwd()}/.local/cache`};
const emulator=spawn('node',['node_modules/firebase-tools/lib/bin/firebase.js','emulators:start','--project','demo-painel','--only','auth,firestore','--import','.emulator-data'],{env:environment,stdio:'inherit'});
let server,stopping=false;
async function stop(){
 if(stopping)return;stopping=true;
 if(server && server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exited;}
 try{await exportEmulators();}catch{console.error('Exportação local falhou. O snapshot anterior foi preservado.');}
 emulator.kill('SIGINT');
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
emulator.on('exit',code=>{server?.kill('SIGINT');if(!stopping)process.exit(code || 1);});
for(let attempt=0;attempt<120 && !stopping;attempt++) {
 try {
  const [auth,firestore]=await Promise.all([fetch('http://127.0.0.1:9099/'),fetch('http://127.0.0.1:8080/')]);
  if(auth.status<500 && firestore.status<500) {server=spawn(process.execPath,['server/index.mjs'],{env:environment,stdio:'inherit'});break;}
 } catch {}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!server && !stopping){stop();throw new Error('Os emuladores não ficaram disponíveis em 120 segundos.');}
server?.on('exit',code=>{if(!stopping){process.exitCode=code || 1;void stop();}});
