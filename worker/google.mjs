import {Buffer} from 'node:buffer';
import {createSign} from 'node:crypto';
let cached;
const base64url=value=>Buffer.from(value).toString('base64url');
export function createGoogle(env,fetcher=fetch){
 const emulator=env.USE_FIREBASE_EMULATORS==='true';
 const project=env.FIREBASE_PROJECT_ID;
 function serviceAccount(){
  let account;
  try{account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '');}catch{throw Object.assign(new Error('Falta configurar a ligação segura ao Firebase no servidor.'),{status:503});}
  if(account.project_id!==project || !account.client_email || !account.private_key || account.type!=='service_account')throw Object.assign(new Error('A conta de serviço não pertence ao projeto configurado.'),{status:503});
  return account;
 }
 async function accessToken(){
  if(emulator)return 'owner';
  const account=serviceAccount(),key=account.client_email+account.private_key_id;
  if(cached?.key===key && cached.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000);
  const unsigned=base64url(JSON.stringify({alg:'RS256',typ:'JWT',...(account.private_key_id?{kid:account.private_key_id}:{})}))+'.'+base64url(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const signature=createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok || !result.access_token)throw Object.assign(new Error('O Firebase recusou a identidade do servidor. Verifique a conta de serviço.'),{status:503});
  cached={key,token:result.access_token,expires:Date.now()+Number(result.expires_in)*1000};return cached.token;
 }
 const authOrigin=emulator?'http://127.0.0.1:9099/identitytoolkit.googleapis.com':'https://identitytoolkit.googleapis.com';
 async function verifyIdToken(token){
  // A API oficial verifica o token. Não aceitamos o conteúdo JWT sem validação Google.
  if(typeof token!=='string' || token.length>10000)throw new Error('Sessão inválida.');
  const response=await fetcher(`${authOrigin}/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(20000)});
  const result=await response.json(),user=result.users?.[0];
  if(!response.ok || !user || user.disabled)throw new Error('Sessão inválida ou desativada.');
  let payload;try{payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{throw new Error('Sessão inválida.');}
  const now=Date.now()/1000;
  if(payload.aud!==project || payload.iss!==`https://securetoken.google.com/${project}` || payload.sub!==user.localId || !payload.exp || payload.exp<=now || !payload.auth_time || payload.auth_time>now || payload.auth_time<Number(user.validSince || 0) || user.localId.includes('/'))throw new Error('Sessão inválida ou revogada.');
  return {...payload,uid:user.localId,email:user.email,email_verified:Boolean(user.emailVerified)};
 }
 return {accessToken,verifyIdToken,emulator};
}
